# Phase 5.1 — RAG document persistence

**Release:** v3.12  
**Status:** Implemented as an explicit repository over the existing SQLite package; not connected to MCP/API startup.

## Storage model

`rag/store.py` provides `RAGStore`, which requires an explicitly initialized
`storage.Database`. It uses two records namespaces:

- `rag.documents`: one JSON record per document, including normalized source
  text and metadata.
- `rag.chunks`: one JSON record per chunk, keyed by document ID and zero-padded
  chunk index.

Saving a document writes its document record and all chunks in one SQLite
transaction. Re-saving the same source updates the existing document and
replaces its previous chunks atomically. If another source already contains
identical normalized text (same SHA-256), the store returns the existing
record instead of storing duplicate content. The source label is the stable
document identity; the content SHA-256 is the content identity.

## Usage

```python
from storage import StorageConfig
from rag import RAGStore, ingest_document

config = StorageConfig.from_env()
if not config.enabled:
    raise RuntimeError("Set AI_STORAGE_PATH to enable storage")

database = config.database().initialize()
store = RAGStore(database)

document = ingest_document("notes/guide.md", "# Guide\n\nDocument text")
result = store.save(document)
loaded = store.get(result["document_id"])
metadata = store.list_documents()
store.delete(result["document_id"])
```

`RAGStore` does not initialize the database, read environment variables, open
source paths or expose a public endpoint. Callers own configuration and the
explicit `initialize()` step.

## Operations

- `save(document)`: atomic insert/update, returns document ID, created/duplicate
  status and chunk count.
- `get(document_id)`: full stored document plus ordered chunks, or `None`.
- `list_documents()`: metadata only; does not return full source text.
- `find_by_content_hash(sha256)`: locate an exact normalized-content digest.
- `delete(document_id)`: atomically remove document and all its chunks.

Document IDs are SHA-256 hashes of the caller-supplied source label. Keep that
label stable across updates. Content hashes are SHA-256 of normalized text.
Two different source labels with identical content are deduplicated; the first
stored source remains the canonical record. This phase does not track aliases
for duplicate source labels.

## Boundaries

Persistence is opt-in and local SQLite only. No automatic DB creation, server
startup integration, MCP tools, API endpoints, filesystem crawling, embeddings,
vector index, semantic retrieval or background jobs are added. Database backup
and retention follow the Phase 4.1/4.2 policies.

## Validation

`python3 -m unittest rag.test_ingest rag.test_store -v` tests ingestion plus
save/load, idempotent updates, chunk replacement, content deduplication,
listing, hash lookup, deletion, transaction rollback, backup/restore
round-tripping and uninitialized-database rejection.
