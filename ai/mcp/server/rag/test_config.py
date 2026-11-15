"""Tests for optional RAG/embedding switches and their lifecycle boundary."""
import os
import tempfile
import unittest

from rag import (
    EmbeddingProvider, RAGConfig, RAGDisabledError, RAGRuntime,
    ingest_document,
)
from storage import Database, StorageError


class TinyProvider(EmbeddingProvider):
    @property
    def provider_id(self):
        return "test"

    @property
    def model_id(self):
        return "tiny-v1"

    def embed(self, texts):
        return [[1.0, 0.0] for _ in texts]


class RAGConfigTests(unittest.TestCase):
    def test_defaults_disable_both_modules(self):
        config = RAGConfig.from_env({})
        self.assertFalse(config.enabled)
        self.assertFalse(config.embeddings_enabled)

    def test_environment_switches_accept_common_boolean_values(self):
        config = RAGConfig.from_env({
            "AI_RAG_ENABLED": "yes",
            "AI_RAG_EMBEDDINGS_ENABLED": "1",
        })
        self.assertTrue(config.enabled)
        self.assertTrue(config.embeddings_enabled)
        self.assertFalse(RAGConfig.from_env({"AI_RAG_ENABLED": "off"}).enabled)

    def test_invalid_boolean_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "AI_RAG_ENABLED"):
            RAGConfig.from_env({"AI_RAG_ENABLED": "sometimes"})

    def test_provider_and_model_configuration_must_be_paired(self):
        with self.assertRaisesRegex(ValueError, "must be set together"):
            RAGConfig.from_env({"AI_RAG_EMBEDDING_PROVIDER": "local"})
        with self.assertRaisesRegex(ValueError, "must be set together"):
            RAGConfig.from_env({"AI_RAG_EMBEDDING_MODEL": "tiny-v1"})

    def test_provider_selection_requires_embeddings_enabled(self):
        with self.assertRaisesRegex(ValueError, "requires AI_RAG_EMBEDDINGS_ENABLED"):
            RAGConfig.from_env({
                "AI_RAG_ENABLED": "true",
                "AI_RAG_EMBEDDING_PROVIDER": "local",
                "AI_RAG_EMBEDDING_MODEL": "tiny-v1",
            })

    def test_provider_selection_is_optional_and_normalized(self):
        config = RAGConfig.from_env({
            "AI_RAG_ENABLED": "true",
            "AI_RAG_EMBEDDINGS_ENABLED": "true",
            "AI_RAG_EMBEDDING_PROVIDER": " local ",
            "AI_RAG_EMBEDDING_MODEL": " tiny-v1 ",
        })
        self.assertEqual(config.embedding_provider, "local")
        self.assertEqual(config.embedding_model, "tiny-v1")

    def test_embeddings_require_rag(self):
        with self.assertRaisesRegex(ValueError, "requires AI_RAG_ENABLED"):
            RAGConfig(embeddings_enabled=True)

    def test_disabled_runtime_does_not_touch_supplied_database(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "must-not-exist.sqlite3")
            database = Database(path)
            runtime = RAGRuntime.create(RAGConfig(), database)
            self.assertFalse(runtime.enabled)
            self.assertFalse(database.initialized)
            self.assertFalse(os.path.exists(path))
            with self.assertRaises(RAGDisabledError):
                runtime.search("anything")
            with self.assertRaises(RAGDisabledError):
                runtime.ingest("disabled.txt", "must not be ingested")

    def test_enabled_runtime_requires_explicit_initialized_database(self):
        with self.assertRaises(TypeError):
            RAGRuntime.create(RAGConfig(enabled=True))
        with tempfile.TemporaryDirectory() as directory:
            database = Database(os.path.join(directory, "rag.sqlite3"))
            with self.assertRaises(StorageError):
                RAGRuntime.create(RAGConfig(enabled=True), database)
            self.assertFalse(os.path.exists(database.path))

    def test_keyword_rag_works_without_embeddings(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Database(os.path.join(directory, "rag.sqlite3")).initialize()
            runtime = RAGRuntime.create(RAGConfig(enabled=True), database)
            document = runtime.ingest("guide.txt", "Network security and routing")
            self.assertIsNotNone(runtime.get(document.document_id))
            with self.assertRaises(RAGDisabledError):
                runtime.index_embeddings(document.document_id, TinyProvider())

    def test_runtime_constructs_only_explicitly_registered_provider(self):
        from rag.providers import EmbeddingProviderRegistry

        with tempfile.TemporaryDirectory() as directory:
            database = Database(os.path.join(directory, "rag.sqlite3")).initialize()
            runtime = RAGRuntime.create(RAGConfig(
                enabled=True, embeddings_enabled=True,
                embedding_provider="test", embedding_model="tiny-v1",
            ), database)
            registry = EmbeddingProviderRegistry()
            registry.register("test", "tiny-v1", TinyProvider)
            provider = runtime.create_embedding_provider(registry)
            self.assertEqual((provider.provider_id, provider.model_id),
                             ("test", "tiny-v1"))

    def test_hybrid_search_uses_keyword_fallback_when_embeddings_disabled(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Database(os.path.join(directory, "rag.sqlite3")).initialize()
            runtime = RAGRuntime.create(RAGConfig(enabled=True), database)
            runtime.ingest("guide.txt", "Network routing and connectivity")
            results = runtime.search_hybrid("network", TinyProvider())
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0]["search_type"], "keyword_fallback")

    def test_runtime_exposes_embedding_status_and_bulk_indexing(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Database(os.path.join(directory, "rag.sqlite3")).initialize()
            runtime = RAGRuntime.create(
                RAGConfig(enabled=True, embeddings_enabled=True), database
            )
            first = runtime.ingest("one.txt", "Network systems")
            second = runtime.ingest("two.txt", "Database storage")
            initial = runtime.embedding_status(TinyProvider())
            self.assertEqual(initial["unindexed_documents"], 2)
            indexed = runtime.index_all_embeddings(TinyProvider())
            self.assertEqual(indexed["indexed_count"], 2)
            self.assertEqual(indexed["status"]["indexed_documents"], 2)
            again = runtime.index_all_embeddings(TinyProvider())
            self.assertEqual(again["indexed_count"], 0)
            self.assertEqual(again["skipped_count"], 2)

    def test_embedding_switch_allows_explicit_provider_only(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Database(os.path.join(directory, "rag.sqlite3")).initialize()
            runtime = RAGRuntime.create(
                RAGConfig(enabled=True, embeddings_enabled=True), database
            )
            document = ingest_document("guide.txt", "Network security and routing")
            runtime.save(document)
            result = runtime.index_embeddings(document.document_id, TinyProvider())
            self.assertEqual(result["chunk_count"], 1)
            self.assertEqual(len(runtime.search_semantic("network", TinyProvider())), 1)

    def test_toggle_off_does_not_delete_existing_database_data(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "rag.sqlite3")
            database = Database(path).initialize()
            enabled = RAGRuntime.create(RAGConfig(enabled=True), database)
            document = ingest_document("guide.txt", "Persistent content")
            enabled.save(document)
            disabled = RAGRuntime.create(RAGConfig())
            with self.assertRaises(RAGDisabledError):
                disabled.get(document.document_id)
            self.assertTrue(os.path.exists(path))
            self.assertIsNotNone(enabled.get(document.document_id))


if __name__ == "__main__":
    unittest.main()
