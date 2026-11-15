"""SQLite persistence for ingested RAG documents and their chunks.

This repository is intentionally separate from MCP/API handlers. Callers must
supply an explicitly initialized storage.Database instance.
"""
from __future__ import annotations

import hashlib
import json
import math
import re

from storage import Database, StorageError
from .embeddings import cosine_similarity, validate_identity, validate_vectors

DOCUMENTS_NAMESPACE = "rag.documents"
CHUNKS_NAMESPACE = "rag.chunks"
FTS_TABLE = "rag_chunk_search"
EMBEDDINGS_NAMESPACE = "rag.embeddings"


class RAGStore:
    """Persist and retrieve ingestion results using the shared SQLite store."""

    def __init__(self, database):
        if not isinstance(database, Database):
            raise TypeError("database must be a storage.Database instance")
        self.database = database

    def _require_ready(self):
        if not self.database.initialized:
            raise StorageError("storage is not initialized; call initialize()")

    @staticmethod
    def _validate_digest(value, field):
        if (not isinstance(value, str) or len(value) != 64
                or any(char not in "0123456789abcdef" for char in value)):
            raise ValueError("%s must be a lowercase SHA-256 hex digest" % field)

    @staticmethod
    def _chunk_key(document_id, index):
        return "%s:%08d" % (document_id, index)

    def save(self, document):
        """Atomically insert/update a document and replace all its chunks.

        The document ID is stable for a source label, so changed content from
        that source updates one row. A content hash shared by another source
        is deduplicated to the first stored document.
        """
        self._require_ready()
        required = ("document_id", "source", "title", "content_type", "text",
                    "content_sha256", "ingested_at", "chunks")
        if any(not hasattr(document, field) for field in required):
            raise TypeError("document must be an IngestedDocument-like object")
        document_id = document.document_id
        self._validate_digest(document_id, "document_id")
        metadata = {
            "document_id": document_id,
            "source": document.source,
            "title": document.title,
            "content_type": document.content_type,
            "content_sha256": document.content_sha256,
            "character_count": len(document.text),
            "chunk_count": len(document.chunks),
            "ingested_at": document.ingested_at,
        }
        self._validate_digest(document.content_sha256, "content_sha256")
        payload = dict(metadata, text=document.text)
        encoded_document = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        encoded_chunks = []
        for chunk in document.chunks:
            if (not isinstance(chunk.index, int) or isinstance(chunk.index, bool)
                    or chunk.index < 0):
                raise ValueError("chunk index must be a non-negative integer")
            if (not isinstance(chunk.start_char, int) or isinstance(chunk.start_char, bool)
                    or not isinstance(chunk.end_char, int) or isinstance(chunk.end_char, bool)
                    or chunk.start_char < 0 or chunk.end_char < chunk.start_char
                    or not isinstance(chunk.text, str)):
                raise ValueError("chunk offsets/text are invalid")
            key = self._chunk_key(document_id, chunk.index)
            encoded_chunks.append((key, json.dumps({
                "document_id": document_id,
                "index": chunk.index,
                "text": chunk.text,
                "start_char": chunk.start_char,
                "end_char": chunk.end_char,
            }, ensure_ascii=False, separators=(",", ":"))))

        with self.database.transaction() as conn:
            existing_row = conn.execute(
                "SELECT value FROM records WHERE namespace=? AND key=?",
                (DOCUMENTS_NAMESPACE, document_id),
            ).fetchone()
            existing_chunks = conn.execute(
                "SELECT key,value FROM records WHERE namespace=? AND key LIKE ? ORDER BY key",
                (CHUNKS_NAMESPACE, document_id + ":%"),
            ).fetchall()
            unchanged_chunks = (
                existing_row is not None
                and json.loads(existing_row["value"]).get("content_sha256") == document.content_sha256
                and [(row["key"], row["value"]) for row in existing_chunks] == encoded_chunks
            )
            duplicate_row = None
            rows = conn.execute(
                "SELECT key,value FROM records WHERE namespace=? AND key<>? ORDER BY key",
                (DOCUMENTS_NAMESPACE, document_id),
            ).fetchall()
            for row in rows:
                try:
                    stored = json.loads(row["value"])
                except (TypeError, ValueError):
                    raise StorageError("stored RAG document metadata is invalid")
                if stored.get("content_sha256") == document.content_sha256:
                    duplicate_row = row
                    break
            if duplicate_row is not None:
                return {"document_id": duplicate_row["key"], "created": False,
                        "duplicate": True, "chunk_count": 0}
            existing = existing_row is not None
            if existing and not unchanged_chunks:
                conn.execute(
                    "DELETE FROM records WHERE namespace=? AND key LIKE ?",
                    (EMBEDDINGS_NAMESPACE, document_id + ":%"),
                )
            conn.execute(
                "INSERT INTO records(namespace,key,value,updated_at) "
                "VALUES(?,?,?,CURRENT_TIMESTAMP) "
                "ON CONFLICT(namespace,key) DO UPDATE SET "
                "value=excluded.value, updated_at=CURRENT_TIMESTAMP",
                (DOCUMENTS_NAMESPACE, document_id, encoded_document),
            )
            conn.execute(
                "DELETE FROM records WHERE namespace=? AND key LIKE ?",
                (CHUNKS_NAMESPACE, document_id + ":%"),
            )
            if self._search_index_exists(conn):
                conn.execute("DELETE FROM %s WHERE document_id=?" % FTS_TABLE,
                             (document_id,))
                conn.executemany(
                    "INSERT INTO %s(document_id, chunk_index, text) VALUES(?,?,?)" % FTS_TABLE,
                    [(document_id, chunk.index, chunk.text) for chunk in document.chunks],
                )
            conn.executemany(
                "INSERT INTO records(namespace,key,value,updated_at) "
                "VALUES(?,?,?,CURRENT_TIMESTAMP)",
                [(CHUNKS_NAMESPACE, key, value) for key, value in encoded_chunks],
            )
        return {"document_id": document_id, "created": not existing,
                "duplicate": False, "chunk_count": len(encoded_chunks)}

    def get(self, document_id):
        """Return a stored document and ordered chunks, or None."""
        self._require_ready()
        self._validate_digest(document_id, "document_id")
        with self.database.connection() as conn:
            row = conn.execute(
                "SELECT value FROM records WHERE namespace=? AND key=?",
                (DOCUMENTS_NAMESPACE, document_id),
            ).fetchone()
            if row is None:
                return None
            chunk_rows = conn.execute(
                "SELECT value FROM records WHERE namespace=? AND key LIKE ? ORDER BY key",
                (CHUNKS_NAMESPACE, document_id + ":%"),
            ).fetchall()
        try:
            document = json.loads(row["value"])
            if not isinstance(document, dict):
                raise ValueError("document record must be an object")
            document["chunks"] = [json.loads(item["value"]) for item in chunk_rows]
        except (TypeError, ValueError, KeyError) as exc:
            raise StorageError("stored RAG document is invalid: %s" % exc) from exc
        return document

    def count_documents(self):
        """Return the number of stored document records."""
        self._require_ready()
        with self.database.connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS total FROM records WHERE namespace=?",
                (DOCUMENTS_NAMESPACE,),
            ).fetchone()
        return int(row["total"])

    def list_documents(self, limit=None, offset=0):
        """Return ordered document metadata, optionally using SQL pagination."""
        self._require_ready()
        if limit is not None and (
                not isinstance(limit, int) or isinstance(limit, bool)
                or not 1 <= limit <= 100):
            raise ValueError("limit must be an integer between 1 and 100")
        if not isinstance(offset, int) or isinstance(offset, bool) or not 0 <= offset <= 100000:
            raise ValueError("offset must be an integer between 0 and 100000")
        sql = (
            "SELECT value FROM records WHERE namespace=? "
            "ORDER BY json_extract(value, '$.source'), key"
        )
        values = [DOCUMENTS_NAMESPACE]
        if limit is not None:
            sql += " LIMIT ? OFFSET ?"
            values.extend((limit, offset))
        elif offset:
            sql += " LIMIT -1 OFFSET ?"
            values.append(offset)
        with self.database.connection() as conn:
            rows = conn.execute(sql, values).fetchall()
        documents = []
        for row in rows:
            try:
                item = json.loads(row["value"])
                if not isinstance(item, dict):
                    raise ValueError("document metadata must be an object")
            except (TypeError, ValueError) as exc:
                raise StorageError("stored RAG document metadata is invalid") from exc
            item.pop("text", None)
            documents.append(item)
        return sorted(documents, key=lambda item: (item.get("source", ""),
                                                    item.get("document_id", "")))

    def find_by_content_hash(self, content_sha256):
        """Find documents with an exact normalized-content SHA-256 digest."""
        self._validate_digest(content_sha256, "content_sha256")
        return [item for item in self.list_documents()
                if item.get("content_sha256") == content_sha256]

    def delete(self, document_id):
        """Atomically delete a document and all associated chunks."""
        self._require_ready()
        self._validate_digest(document_id, "document_id")
        with self.database.transaction() as conn:
            cursor = conn.execute(
                "DELETE FROM records WHERE namespace=? AND key=?",
                (DOCUMENTS_NAMESPACE, document_id),
            )
            conn.execute(
                "DELETE FROM records WHERE namespace=? AND key LIKE ?",
                (CHUNKS_NAMESPACE, document_id + ":%"),
            )
            conn.execute(
                "DELETE FROM records WHERE namespace=? AND key LIKE ?",
                (EMBEDDINGS_NAMESPACE, document_id + ":%"),
            )
            if self._search_index_exists(conn):
                conn.execute("DELETE FROM %s WHERE document_id=?" % FTS_TABLE,
                             (document_id,))
        return cursor.rowcount > 0

    def index_embeddings(self, document_id, provider):
        """Embed and persist all chunks for one document using an explicit provider.

        Provider calls happen outside the SQLite transaction. Before committing,
        the document content hash is rechecked so stale vectors cannot overwrite
        vectors for a concurrently updated document. Re-indexing replaces the
        previous vector set for this document.
        """
        self._require_ready()
        self._validate_digest(document_id, "document_id")
        provider_id, model_id = validate_identity(provider)
        document = self.get(document_id)
        if document is None:
            raise KeyError("document does not exist")
        chunks = document["chunks"]
        if not chunks:
            raise ValueError("document has no chunks to embed")
        chunk_fingerprint = hashlib.sha256(json.dumps(
            chunks, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")).hexdigest()
        vectors = validate_vectors(provider.embed([item["text"] for item in chunks]),
                                   expected_count=len(chunks))
        dimension = len(vectors[0])
        encoded = []
        for chunk, vector in zip(chunks, vectors):
            key = self._chunk_key(document_id, chunk["index"])
            payload = {
                "document_id": document_id,
                "chunk_index": chunk["index"],
                "provider_id": provider_id,
                "model_id": model_id,
                "content_sha256": document["content_sha256"],
                "dimension": dimension,
                "vector": vector,
            }
            encoded.append((key, json.dumps(payload, separators=(",", ":"))))
        with self.database.transaction() as conn:
            current = conn.execute(
                "SELECT value FROM records WHERE namespace=? AND key=?",
                (DOCUMENTS_NAMESPACE, document_id),
            ).fetchone()
            if current is None:
                raise StorageError("document was deleted while embeddings were being generated")
            current_document = json.loads(current["value"])
            current_chunks = conn.execute(
                "SELECT value FROM records WHERE namespace=? AND key LIKE ? ORDER BY key",
                (CHUNKS_NAMESPACE, document_id + ":%"),
            ).fetchall()
            current_fingerprint = hashlib.sha256(json.dumps(
                [json.loads(row["value"]) for row in current_chunks],
                sort_keys=True, separators=(",", ":")
            ).encode("utf-8")).hexdigest()
            if (current_document.get("content_sha256") != document["content_sha256"]
                    or current_fingerprint != chunk_fingerprint):
                raise StorageError("document changed while embeddings were being generated; retry indexing")
            conn.execute(
                "DELETE FROM records WHERE namespace=? AND key LIKE ?",
                (EMBEDDINGS_NAMESPACE, document_id + ":%"),
            )
            conn.executemany(
                "INSERT INTO records(namespace,key,value,updated_at) "
                "VALUES(?,?,?,CURRENT_TIMESTAMP)",
                [(EMBEDDINGS_NAMESPACE, key, value) for key, value in encoded],
            )
        return {"document_id": document_id, "provider_id": provider_id,
                "model_id": model_id, "dimension": dimension,
                "chunk_count": len(encoded)}

    def embedding_status(self, provider):
        """Report current, missing and stale vectors for one provider/model."""
        self._require_ready()
        provider_id, model_id = validate_identity(provider)
        documents = self.list_documents()
        with self.database.connection() as conn:
            rows = conn.execute(
                "SELECT key,value FROM records WHERE namespace=? ORDER BY key",
                (EMBEDDINGS_NAMESPACE,),
            ).fetchall()
        by_document = {}
        for row in rows:
            try:
                item = json.loads(row["value"])
                if item.get("provider_id") != provider_id or item.get("model_id") != model_id:
                    continue
                document_id = item.get("document_id")
                if not isinstance(document_id, str):
                    continue
                by_document.setdefault(document_id, []).append(item)
            except (TypeError, ValueError):
                continue

        states = []
        total_chunks = 0
        indexed_chunks = 0
        indexed_documents = 0
        stale_documents = 0
        for document in documents:
            document_id = document["document_id"]
            chunk_count = document["chunk_count"]
            total_chunks += chunk_count
            vectors = by_document.get(document_id, [])
            expected_hash = document["content_sha256"]
            valid = [item for item in vectors
                     if item.get("content_sha256") == expected_hash
                     and isinstance(item.get("chunk_index"), int)
                     and not isinstance(item.get("chunk_index"), bool)]
            indexes = {item["chunk_index"] for item in valid}
            current = len(indexes) == chunk_count and indexes == set(range(chunk_count))
            if current:
                indexed_documents += 1
                indexed_chunks += chunk_count
                state = "current"
            elif vectors:
                stale_documents += 1
                state = "stale"
            else:
                state = "missing"
            states.append({"document_id": document_id, "source": document["source"],
                           "chunk_count": chunk_count, "indexed_chunk_count": len(indexes),
                           "status": state})
        return {
            "provider_id": provider_id, "model_id": model_id,
            "document_count": len(documents), "total_chunks": total_chunks,
            "indexed_documents": indexed_documents,
            "unindexed_documents": len(documents) - indexed_documents,
            "indexed_chunks": indexed_chunks,
            "missing_or_stale_documents": len(documents) - indexed_documents,
            "stale_documents": stale_documents,
            "coverage": (indexed_chunks / total_chunks) if total_chunks else 1.0,
            "documents": states,
        }

    def index_all_embeddings(self, provider, *, force=False):
        """Index missing/stale documents for a provider; optionally rebuild all."""
        self._require_ready()
        if not isinstance(force, bool):
            raise TypeError("force must be a boolean")
        status = self.embedding_status(provider)
        indexed = []
        skipped = []
        for document in status["documents"]:
            if document["status"] == "current" and not force:
                skipped.append(document["document_id"])
                continue
            indexed.append(self.index_embeddings(document["document_id"], provider))
        return {
            "provider_id": status["provider_id"], "model_id": status["model_id"],
            "indexed_count": len(indexed), "skipped_count": len(skipped),
            "indexed": indexed, "skipped": skipped,
            "status": self.embedding_status(provider),
        }

    def search_hybrid(self, query, provider=None, limit=10, *,
                      keyword_weight=0.5, semantic_weight=0.5, source=None,
                      document_id=None, snippet_chars=240, deduplicate=False,
                      rrf_k=60, offset=0):
        """Combine keyword and semantic rankings with weighted RRF.

        Reciprocal-rank fusion avoids mixing incomparable BM25 and cosine
        scores. When no provider is supplied, keyword search is returned as an
        explicit fallback. Candidate retrieval is bounded to 5x the result
        limit (maximum 50 per search channel).
        """
        self._require_ready()
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 50:
            raise ValueError("limit must be an integer between 1 and 50")
        if not isinstance(offset, int) or isinstance(offset, bool) or not 0 <= offset <= 49:
            raise ValueError("offset must be an integer between 0 and 49")
        if limit + offset > 50:
            raise ValueError("limit plus offset must not exceed 50")
        for name, value in (("keyword_weight", keyword_weight),
                            ("semantic_weight", semantic_weight)):
            if (not isinstance(value, (int, float)) or isinstance(value, bool)
                    or not math.isfinite(value) or value < 0):
                raise ValueError("%s must be a finite non-negative number" % name)
        if keyword_weight + semantic_weight <= 0:
            raise ValueError("at least one search weight must be greater than zero")
        if (not isinstance(rrf_k, int) or isinstance(rrf_k, bool)
                or not 1 <= rrf_k <= 1000):
            raise ValueError("rrf_k must be an integer between 1 and 1000")
        self._validate_search_filters(source, document_id, None,
                                      snippet_chars, deduplicate)
        page_size = limit + offset
        candidate_limit = min(50, max(page_size, page_size * 5))
        if provider is None or semantic_weight == 0:
            if keyword_weight <= 0:
                raise ValueError("keyword_weight must be greater than zero without semantic search")
            results = self.search(
                query, limit=candidate_limit, source=source, document_id=document_id,
                snippet_chars=snippet_chars, deduplicate=deduplicate,
            )
            for rank, item in enumerate(results, 1):
                item["keyword_rank"] = rank
                item["semantic_rank"] = None
                item["keyword_score"] = item.get("score")
                item["semantic_score"] = None
                item["hybrid_score"] = keyword_weight / (rrf_k + rank)
                item["score"] = item["hybrid_score"]
                item["search_type"] = "keyword_fallback"
            return results[offset:offset + limit]

        keyword_results = self.search(
            query, limit=candidate_limit, source=source, document_id=document_id,
            snippet_chars=snippet_chars, deduplicate=False,
        ) if keyword_weight > 0 else []
        semantic_results = self.search_semantic(
            query, provider, limit=candidate_limit, source=source,
            document_id=document_id, snippet_chars=snippet_chars,
            deduplicate=False,
        ) if semantic_weight > 0 else []
        keyword_ranks = {
            (item["document_id"], item["chunk_index"]): (rank, item)
            for rank, item in enumerate(keyword_results, 1)
        }
        semantic_ranks = {
            (item["document_id"], item["chunk_index"]): (rank, item)
            for rank, item in enumerate(semantic_results, 1)
        }
        active_weight = ((keyword_weight if keyword_results else 0.0)
                         + (semantic_weight if semantic_results else 0.0))
        if active_weight == 0:
            return []
        combined = []
        keys = set(keyword_ranks) | set(semantic_ranks)
        for key in keys:
            keyword_entry = keyword_ranks.get(key)
            semantic_entry = semantic_ranks.get(key)
            base = (keyword_entry or semantic_entry)[1]
            keyword_rank = keyword_entry[0] if keyword_entry else None
            semantic_rank = semantic_entry[0] if semantic_entry else None
            fused = 0.0
            if keyword_rank is not None:
                fused += (keyword_weight / active_weight) / (rrf_k + keyword_rank)
            if semantic_rank is not None:
                fused += (semantic_weight / active_weight) / (rrf_k + semantic_rank)
            item = dict(base)
            item.update({
                "keyword_rank": keyword_rank,
                "semantic_rank": semantic_rank,
                "keyword_score": keyword_entry[1].get("score") if keyword_entry else None,
                "semantic_score": semantic_entry[1].get("score") if semantic_entry else None,
                "hybrid_score": fused,
                "score": fused,
                "search_type": "hybrid",
            })
            combined.append(item)
        combined.sort(key=lambda item: (
            -item["hybrid_score"], item["document_id"], item["chunk_index"]
        ))
        if deduplicate:
            unique = {}
            for item in combined:
                unique.setdefault(item["document_id"], item)
            combined = list(unique.values())
        return combined[offset:offset + limit]

    def search_semantic(self, query, provider, limit=10, *, source=None,
                        document_id=None, snippet_chars=240, deduplicate=False):
        """Search indexed chunks by cosine similarity using an explicit provider.

        This is an exact in-process scan of stored vectors, not an approximate
        vector index. Similarity scores are higher-is-better and range [-1, 1].
        Only vectors created by the same provider/model identity are compared.
        """
        self._require_ready()
        if not isinstance(query, str) or not query.strip():
            raise ValueError("query must be a non-empty string")
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 50:
            raise ValueError("limit must be an integer between 1 and 50")
        self._validate_search_filters(source, document_id, None,
                                      snippet_chars, deduplicate)
        provider_id, model_id = validate_identity(provider)
        query_vectors = validate_vectors(provider.embed([query]), expected_count=1)
        query_vector = query_vectors[0]
        filters = []
        filter_values = []
        if source is not None:
            filters.append("json_extract(d.value, '$.source') = ?")
            filter_values.append(source)
        if document_id is not None:
            filters.append("d.key = ?")
            filter_values.append(document_id)
        filter_sql = (" AND " + " AND ".join(filters)) if filters else ""
        with self.database.connection() as conn:
            rows = conn.execute(
                "SELECT e.value AS embedding_value, d.value AS document_value, "
                "c.value AS chunk_value FROM records AS e "
                "JOIN records AS d ON d.namespace=? AND d.key=substr(e.key,1,64) "
                "JOIN records AS c ON c.namespace=? AND c.key=e.key "
                "WHERE e.namespace=? AND json_extract(e.value, '$.provider_id')=? "
                "AND json_extract(e.value, '$.model_id')=?" + filter_sql +
                " ORDER BY e.key",
                [DOCUMENTS_NAMESPACE, CHUNKS_NAMESPACE, EMBEDDINGS_NAMESPACE,
                 provider_id, model_id] + filter_values,
            ).fetchall()
        results = []
        for row in rows:
            try:
                embedding = json.loads(row["embedding_value"])
                document = json.loads(row["document_value"])
                chunk = json.loads(row["chunk_value"])
                if embedding.get("content_sha256") != document.get("content_sha256"):
                    continue
                vector = validate_vectors([embedding.get("vector")], expected_count=1)[0]
                if embedding.get("dimension") != len(vector):
                    raise StorageError("stored RAG embedding dimension metadata is invalid")
                if len(vector) != len(query_vector):
                    raise StorageError("stored RAG embedding dimension does not match query vector")
                score = cosine_similarity(query_vector, vector)
                results.append({
                    "document_id": chunk["document_id"],
                    "chunk_index": chunk["index"],
                    "text": chunk["text"],
                    "start_char": chunk.get("start_char"),
                    "end_char": chunk.get("end_char"),
                    "source": document.get("source"),
                    "title": document.get("title"),
                    "content_type": document.get("content_type"),
                    "score": score,
                    "similarity": score,
                })
            except (TypeError, ValueError, KeyError) as exc:
                raise StorageError("stored RAG embedding is invalid: %s" % exc) from exc
        results.sort(key=lambda item: (-item["score"], item["document_id"], item["chunk_index"]))
        if deduplicate:
            unique = {}
            for result in results:
                unique.setdefault(result["document_id"], result)
            results = list(unique.values())
        for result in results:
            result["snippet"] = self._make_snippet(result["text"], [], snippet_chars)
        return results[:limit]

    @staticmethod
    def _search_index_exists(conn):
        return conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (FTS_TABLE,),
        ).fetchone() is not None

    def initialize_search(self):
        """Create/rebuild the optional FTS5 index; return False if unavailable.

        This is an explicit operation so merely constructing RAGStore never
        changes the database schema.
        """
        self._require_ready()
        try:
            with self.database.transaction() as conn:
                conn.execute(
                    "CREATE VIRTUAL TABLE IF NOT EXISTS %s USING fts5("
                    "document_id UNINDEXED, chunk_index UNINDEXED, text, "
                    "tokenize='unicode61')" % FTS_TABLE
                )
                conn.execute("DELETE FROM %s" % FTS_TABLE)
                rows = conn.execute(
                    "SELECT key,value FROM records WHERE namespace=? ORDER BY key",
                    (CHUNKS_NAMESPACE,),
                ).fetchall()
                indexed = []
                for row in rows:
                    try:
                        chunk = json.loads(row["value"])
                        indexed.append((chunk["document_id"], chunk["index"], chunk["text"]))
                    except (TypeError, ValueError, KeyError) as exc:
                        raise StorageError("stored RAG chunk is invalid: %s" % exc) from exc
                conn.executemany(
                    "INSERT INTO %s(document_id, chunk_index, text) VALUES(?,?,?)" % FTS_TABLE,
                    indexed,
                )
            return True
        except StorageError as exc:
            if "no such module: fts5" in str(exc).lower():
                return False
            raise

    @staticmethod
    def _query_terms(query):
        if not isinstance(query, str):
            raise TypeError("query must be a string")
        terms = re.findall(r"[^\W_]+", query, flags=re.UNICODE)
        if not terms:
            raise ValueError("query must contain at least one searchable term")
        return terms

    @staticmethod
    def _validate_search_filters(source, document_id, max_score, snippet_chars, deduplicate):
        if source is not None and (not isinstance(source, str) or not source.strip()):
            raise ValueError("source must be a non-empty string when supplied")
        if document_id is not None:
            RAGStore._validate_digest(document_id, "document_id")
        if max_score is not None:
            if (not isinstance(max_score, (int, float)) or isinstance(max_score, bool)
                    or not math.isfinite(max_score)):
                raise ValueError("max_score must be a finite number")
        if (not isinstance(snippet_chars, int) or isinstance(snippet_chars, bool)
                or not 40 <= snippet_chars <= 1000):
            raise ValueError("snippet_chars must be an integer between 40 and 1000")
        if not isinstance(deduplicate, bool):
            raise TypeError("deduplicate must be a boolean")

    @staticmethod
    def _make_snippet(text, terms, max_chars):
        """Return a bounded excerpt centered on the earliest query-term match."""
        if len(text) <= max_chars:
            return text
        lowered = text.casefold()
        positions = [lowered.find(term.casefold()) for term in terms]
        positions = [position for position in positions if position >= 0]
        center = min(positions) if positions else 0
        start = max(0, center - max_chars // 3)
        end = min(len(text), start + max_chars)
        start = max(0, end - max_chars)
        excerpt = text[start:end].strip()
        if start:
            excerpt = "…" + excerpt
        if end < len(text):
            excerpt += "…"
        return excerpt

    def search(self, query, limit=10, *, source=None, document_id=None,
               max_score=None, snippet_chars=240, deduplicate=False, offset=0):
        """Search chunks with optional filters, excerpts and result collapsing.

        FTS5 uses BM25 (lower scores are better). ``max_score`` is an inclusive
        BM25 ceiling and therefore requires an initialized FTS5 index. Without
        FTS5, a parameterized LIKE search is used and scores are unavailable.
        ``deduplicate`` keeps the first result per document in backend order
        (best BM25 match with FTS5). At most 500 candidates are examined before
        the final result limit when deduplication is enabled.
        """
        self._require_ready()
        terms = self._query_terms(query)
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 51:
            raise ValueError("limit must be an integer between 1 and 51")
        if not isinstance(offset, int) or isinstance(offset, bool) or not 0 <= offset <= 100000:
            raise ValueError("offset must be an integer between 0 and 100000")
        if deduplicate and offset > 449:
            raise ValueError("offset must be between 0 and 449 when deduplicate is enabled")
        self._validate_search_filters(source, document_id, max_score,
                                      snippet_chars, deduplicate)
        with self.database.connection() as conn:
            has_fts = self._search_index_exists(conn)
            if max_score is not None and not has_fts:
                raise ValueError("max_score requires an initialized FTS5 search index")
            candidate_limit = min(500, max(limit + offset, (limit + offset) * 10)) if deduplicate else limit
            filters = []
            filter_values = []
            if source is not None:
                filters.append("json_extract(d.value, '$.source') = ?")
                filter_values.append(source)
            if document_id is not None:
                filters.append("d.key = ?")
                filter_values.append(document_id)
            filter_sql = (" AND " + " AND ".join(filters)) if filters else ""

            if has_fts:
                expression = " AND ".join('"%s"' % term for term in terms)
                score_filter = " AND bm25(%s) <= ?" % FTS_TABLE if max_score is not None else ""
                score_values = [max_score] if max_score is not None else []
                sql = (
                    "SELECT f.document_id, f.chunk_index, f.text, bm25(%s) AS score, "
                    "d.value AS document_value, c.value AS chunk_value "
                    "FROM %s AS f "
                    "JOIN records AS d ON d.namespace=? AND d.key=f.document_id "
                    "JOIN records AS c ON c.namespace=? AND "
                    "c.key=f.document_id || ':' || printf('%%08d', f.chunk_index) "
                    "WHERE %s MATCH ?%s%s "
                    "ORDER BY score, f.document_id, f.chunk_index LIMIT ?"
                ) % (FTS_TABLE, FTS_TABLE, FTS_TABLE, filter_sql, score_filter)
                if not deduplicate:
                    sql += " OFFSET ?"
                rows = conn.execute(
                    sql,
                    [DOCUMENTS_NAMESPACE, CHUNKS_NAMESPACE, expression] +
                    filter_values + score_values + [candidate_limit] +
                    ([] if deduplicate else [offset]),
                ).fetchall()
                results = [self._search_result_fts(row) for row in rows]
            else:
                clauses = " AND ".join(
                    "json_extract(c.value, '$.text') LIKE ?" for _ in terms
                )
                rows = conn.execute(
                    "SELECT c.value AS chunk_value, d.value AS document_value "
                    "FROM records AS c JOIN records AS d ON d.namespace=? "
                    "AND d.key=substr(c.key,1,64) "
                    "WHERE c.namespace=? AND " + clauses + filter_sql +
                    " ORDER BY c.key LIMIT ?" + ("" if deduplicate else " OFFSET ?"),
                    [DOCUMENTS_NAMESPACE, CHUNKS_NAMESPACE] +
                    ["%%%s%%" % term for term in terms] + filter_values +
                    [candidate_limit] + ([] if deduplicate else [offset]),
                ).fetchall()
                results = [self._search_result_like(row) for row in rows]

        for result in results:
            result["snippet"] = self._make_snippet(result["text"], terms, snippet_chars)
        if deduplicate:
            unique = {}
            for result in results:
                unique.setdefault(result["document_id"], result)
            results = list(unique.values())
            results = results[offset:offset + limit]
        elif offset:
            # SQL has already applied the offset for non-deduplicated searches.
            results = results[:limit]
        else:
            results = results[:limit]
        return results

    @staticmethod
    def _search_result_fts(row):
        try:
            document = json.loads(row["document_value"])
            chunk = json.loads(row["chunk_value"])
            return {
                "document_id": row["document_id"],
                "chunk_index": row["chunk_index"],
                "text": row["text"],
                "start_char": chunk.get("start_char"),
                "end_char": chunk.get("end_char"),
                "source": document.get("source"),
                "title": document.get("title"),
                "content_type": document.get("content_type"),
                "score": float(row["score"]),
            }
        except (TypeError, ValueError, KeyError) as exc:
            raise StorageError("stored RAG search result is invalid: %s" % exc) from exc

    @staticmethod
    def _search_result_like(row):
        try:
            chunk = json.loads(row["chunk_value"])
            document = json.loads(row["document_value"])
            return {
                "document_id": chunk["document_id"],
                "chunk_index": chunk["index"],
                "text": chunk["text"],
                "start_char": chunk.get("start_char"),
                "end_char": chunk.get("end_char"),
                "source": document.get("source"),
                "title": document.get("title"),
                "content_type": document.get("content_type"),
                "score": None,
            }
        except (TypeError, ValueError, KeyError) as exc:
            raise StorageError("stored RAG search result is invalid: %s" % exc) from exc
