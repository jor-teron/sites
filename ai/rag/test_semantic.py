"""Persistence and semantic retrieval tests using a deterministic test provider."""
import os
import tempfile
import unittest

from rag import EmbeddingProvider, RAGStore, ingest_document
from storage import Database, StorageError


class TinyProvider(EmbeddingProvider):
    def __init__(self, model="tiny-v1"):
        self._model = model

    @property
    def provider_id(self):
        return "test"

    @property
    def model_id(self):
        return self._model

    def embed(self, texts):
        output = []
        for text in texts:
            lowered = text.lower()
            if "garden" in lowered or "plants" in lowered:
                output.append([0.0, 1.0, 0.0])
            elif "database" in lowered:
                output.append([0.8, 0.2, 0.0])
            else:
                output.append([1.0, 0.0, 0.0])
        return output


class BadProvider(TinyProvider):
    def embed(self, texts):
        return []


class SemanticRetrievalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = Database(os.path.join(self.temp.name, "rag.sqlite3")).initialize()
        self.store = RAGStore(self.database)
        self.provider = TinyProvider()

    def _save(self, source, text, chunk_size=500):
        document = ingest_document(source, text, chunk_size=chunk_size, overlap=0)
        self.store.save(document)
        return document

    def test_index_and_semantic_search_rank_by_cosine_similarity(self):
        network = self._save("network.txt", "Network systems and routing")
        garden = self._save("garden.txt", "Garden plants need water and sunlight")
        self.store.index_embeddings(network.document_id, self.provider)
        self.store.index_embeddings(garden.document_id, self.provider)
        results = self.store.search_semantic("connectivity", self.provider)
        self.assertEqual([item["source"] for item in results], ["network.txt", "garden.txt"])
        self.assertGreater(results[0]["score"], results[1]["score"])
        self.assertAlmostEqual(results[0]["score"], 1.0)
        self.assertIn("snippet", results[0])
        self.assertEqual(results[0]["similarity"], results[0]["score"])

    def test_embedding_status_reports_missing_and_current_coverage(self):
        network = self._save("network.txt", "Network database")
        garden = self._save("garden.txt", "Garden plants")
        status = self.store.embedding_status(self.provider)
        self.assertEqual(status["document_count"], 2)
        self.assertEqual(status["indexed_documents"], 0)
        self.assertEqual(status["unindexed_documents"], 2)
        self.assertEqual(status["coverage"], 0.0)
        self.assertEqual({item["status"] for item in status["documents"]}, {"missing"})
        self.store.index_embeddings(network.document_id, self.provider)
        status = self.store.embedding_status(self.provider)
        self.assertEqual(status["indexed_documents"], 1)
        self.assertEqual(status["unindexed_documents"], 1)
        self.assertEqual(status["coverage"], 0.5)

    def test_index_all_indexes_missing_and_skips_current_documents(self):
        first = self._save("first.txt", "Network systems")
        second = self._save("second.txt", "Database storage")
        result = self.store.index_all_embeddings(self.provider)
        self.assertEqual(result["indexed_count"], 2)
        self.assertEqual(result["skipped_count"], 0)
        self.assertEqual(result["status"]["indexed_documents"], 2)
        again = self.store.index_all_embeddings(self.provider)
        self.assertEqual(again["indexed_count"], 0)
        self.assertEqual(again["skipped_count"], 2)
        self.assertEqual(len(self.store.search_semantic("network", self.provider)), 2)

    def test_index_all_reindexes_changed_documents_and_can_force_rebuild(self):
        first = self._save("first.txt", "Network systems")
        second = self._save("second.txt", "Database storage")
        self.store.index_all_embeddings(self.provider)
        self._save("second.txt", "Garden plants")
        updated = self.store.index_all_embeddings(self.provider)
        self.assertEqual(updated["indexed_count"], 1)
        self.assertEqual(updated["skipped_count"], 1)
        forced = self.store.index_all_embeddings(self.provider, force=True)
        self.assertEqual(forced["indexed_count"], 2)
        self.assertEqual(forced["skipped_count"], 0)
        self.assertEqual(forced["status"]["coverage"], 1.0)

    def test_hybrid_search_combines_keyword_and_semantic_rankings(self):
        network = self._save("network.txt", "Network systems and routing")
        garden = self._save("garden.txt", "Garden plants need water")
        database = self._save("database.txt", "Database systems and storage")
        self.store.index_all_embeddings(self.provider)
        results = self.store.search_hybrid("network", self.provider, limit=10)
        self.assertTrue(results)
        self.assertTrue(all(item["search_type"] == "hybrid" for item in results))
        self.assertTrue(all("keyword_rank" in item and "semantic_rank" in item
                            for item in results))
        self.assertTrue(all(item["score"] == item["hybrid_score"] for item in results))
        self.assertEqual(results[0]["document_id"], network.document_id)
        self.assertGreater(results[0]["hybrid_score"], results[-1]["hybrid_score"])

    def test_hybrid_weights_can_select_one_search_channel(self):
        first = self._save("first.txt", "needle alpha")
        second = self._save("second.txt", "needle database")
        self.store.index_all_embeddings(self.provider)
        keyword_only = self.store.search_hybrid(
            "needle", self.provider, keyword_weight=1.0, semantic_weight=0.0
        )
        semantic_only = self.store.search_hybrid(
            "needle", self.provider, keyword_weight=0.0, semantic_weight=1.0
        )
        self.assertTrue(keyword_only)
        self.assertTrue(semantic_only)
        self.assertEqual(keyword_only[0]["search_type"], "keyword_fallback")
        self.assertEqual(semantic_only[0]["search_type"], "hybrid")
        self.assertIsNone(semantic_only[0]["keyword_rank"])

    def test_hybrid_search_falls_back_to_keyword_without_provider(self):
        self._save("guide.txt", "Network routing and connectivity")
        results = self.store.search_hybrid("network", provider=None)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["search_type"], "keyword_fallback")
        self.assertIsNone(results[0]["semantic_rank"])

    def test_hybrid_search_supports_filters_and_document_deduplication(self):
        first = self._save("first.txt", "Network systems. " * 40, chunk_size=80)
        self._save("second.txt", "Network routing")
        self.store.index_all_embeddings(self.provider)
        results = self.store.search_hybrid(
            "network", self.provider, source="first.txt", deduplicate=True
        )
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["document_id"], first.document_id)

    def test_hybrid_search_validates_weights_and_fusion_constant(self):
        self._save("guide.txt", "Network systems")
        for kwargs in ({"keyword_weight": -1}, {"semantic_weight": float("nan")},
                       {"keyword_weight": 0, "semantic_weight": 0}, {"rrf_k": 0}):
            with self.assertRaises(ValueError):
                self.store.search_hybrid("network", self.provider, **kwargs)
        with self.assertRaises(ValueError):
            self.store.search_hybrid("network", None, keyword_weight=0)

    def test_embedding_status_is_model_specific(self):
        document = self._save("network.txt", "Network systems")
        self.store.index_embeddings(document.document_id, self.provider)
        other_model = TinyProvider(model="tiny-v2")
        status = self.store.embedding_status(other_model)
        self.assertEqual(status["indexed_documents"], 0)
        self.assertEqual(status["documents"][0]["status"], "missing")

    def test_partial_or_stale_vectors_are_reported_for_reindexing(self):
        document = self._save("partial.txt", "Network systems. " * 30, chunk_size=80)
        self.store.index_embeddings(document.document_id, self.provider)
        with self.database.transaction() as conn:
            conn.execute(
                "DELETE FROM records WHERE namespace='rag.embeddings' AND key=?",
                ("%s:%08d" % (document.document_id, 0),),
            )
        status = self.store.embedding_status(self.provider)
        self.assertEqual(status["stale_documents"], 1)
        self.assertEqual(status["documents"][0]["status"], "stale")
        rebuilt = self.store.index_all_embeddings(self.provider)
        self.assertEqual(rebuilt["indexed_count"], 1)
        self.assertEqual(rebuilt["status"]["indexed_documents"], 1)

    def test_index_all_rejects_non_boolean_force(self):
        with self.assertRaises(TypeError):
            self.store.index_all_embeddings(self.provider, force=1)

    def test_semantic_search_supports_source_document_and_dedup_filters(self):
        network = self._save("network.txt", "Network systems. " * 50, chunk_size=80)
        garden = self._save("garden.txt", "Garden plants and soil")
        self.store.index_embeddings(network.document_id, self.provider)
        self.store.index_embeddings(garden.document_id, self.provider)
        by_source = self.store.search_semantic("network", self.provider,
                                               source="garden.txt")
        self.assertEqual([item["source"] for item in by_source], ["garden.txt"])
        by_id = self.store.search_semantic("network", self.provider,
                                           document_id=network.document_id,
                                           deduplicate=True)
        self.assertEqual(len(by_id), 1)
        self.assertEqual(by_id[0]["document_id"], network.document_id)

    def test_semantic_search_uses_only_matching_model_identity(self):
        document = self._save("network.txt", "Network database")
        self.store.index_embeddings(document.document_id, self.provider)
        self.assertEqual(self.store.search_semantic(
            "network", TinyProvider(model="other-v2")
        ), [])

    def test_reindexing_with_another_model_replaces_old_model_vectors(self):
        document = self._save("network.txt", "Network database")
        self.store.index_embeddings(document.document_id, self.provider)
        alternate = TinyProvider(model="tiny-v2")
        self.store.index_embeddings(document.document_id, alternate)
        self.assertEqual(self.store.search_semantic("network", self.provider), [])
        self.assertEqual(len(self.store.search_semantic("network", alternate)), 1)

    def test_reindex_replaces_previous_vectors(self):
        document = self._save("network.txt", "Network database")
        self.store.index_embeddings(document.document_id, self.provider)
        result = self.store.index_embeddings(document.document_id, self.provider)
        self.assertEqual(result["chunk_count"], 1)
        with self.database.connection() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM records WHERE namespace='rag.embeddings'"
            ).fetchone()[0]
        self.assertEqual(count, 1)

    def test_unchanged_save_preserves_embeddings(self):
        document = self._save("network.txt", "Network database")
        self.store.index_embeddings(document.document_id, self.provider)
        self.store.save(ingest_document("network.txt", "Network database"))
        self.assertEqual(len(self.store.search_semantic("network", self.provider)), 1)

    def test_changed_document_invalidates_old_embeddings(self):
        document = self._save("network.txt", "Network database")
        self.store.index_embeddings(document.document_id, self.provider)
        updated = self._save("network.txt", "Garden plants")
        self.assertEqual(document.document_id, updated.document_id)
        self.assertEqual(self.store.search_semantic("network", self.provider), [])

    def test_rechunking_same_text_invalidates_vectors(self):
        document = self._save("network.txt", "Network systems. " * 20, chunk_size=500)
        self.store.index_embeddings(document.document_id, self.provider)
        rechunked = ingest_document("network.txt", "Network systems. " * 20,
                                    chunk_size=40, overlap=0)
        self.store.save(rechunked)
        self.assertEqual(self.store.search_semantic("network", self.provider), [])

    def test_backup_restore_preserves_embeddings(self):
        document = self._save("network.txt", "Network database")
        self.store.index_embeddings(document.document_id, self.provider)
        backup = os.path.join(self.temp.name, "semantic-backup.sqlite3")
        restored_path = os.path.join(self.temp.name, "semantic-restored.sqlite3")
        self.database.backup(backup)
        restored_db = Database(restored_path).restore(backup)
        restored_store = RAGStore(restored_db)
        results = restored_store.search_semantic("network", self.provider)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["document_id"], document.document_id)

    def test_delete_removes_embeddings(self):
        document = self._save("network.txt", "Network database")
        self.store.index_embeddings(document.document_id, self.provider)
        self.assertTrue(self.store.delete(document.document_id))
        self.assertEqual(self.store.search_semantic("network", self.provider), [])

    def test_invalid_provider_output_does_not_write_vectors(self):
        document = self._save("network.txt", "Network database")
        with self.assertRaises(ValueError):
            self.store.index_embeddings(document.document_id, BadProvider())
        with self.database.connection() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM records WHERE namespace='rag.embeddings'"
            ).fetchone()[0]
        self.assertEqual(count, 0)

    def test_index_requires_existing_document(self):
        with self.assertRaises(KeyError):
            self.store.index_embeddings("0" * 64, self.provider)

    def test_index_detects_document_change_during_embedding(self):
        original = self._save("network.txt", "Network database")
        store = self.store

        class MutatingProvider(TinyProvider):
            def embed(self, texts):
                store.save(ingest_document("network.txt", "Garden plants"))
                return super().embed(texts)

        with self.assertRaises(StorageError):
            self.store.index_embeddings(original.document_id, MutatingProvider())
        self.assertEqual(self.store.search_semantic("network", self.provider), [])

    def test_semantic_search_validates_options(self):
        with self.assertRaises(ValueError):
            self.store.search_semantic("  ", self.provider)
        with self.assertRaises(ValueError):
            self.store.search_semantic("query", self.provider, limit=0)
        with self.assertRaises(ValueError):
            self.store.search_semantic("query", self.provider, source=" ")


if __name__ == "__main__":
    unittest.main()
