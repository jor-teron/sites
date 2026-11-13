"""Unit tests for RAG HTTP service search-mode selection."""
import os
import tempfile
import unittest

from api import rag_service
from rag.config import RAGConfig, RAGRuntime
from rag.embeddings import EmbeddingProvider
from storage import Database


class TinyProvider(EmbeddingProvider):
    @property
    def provider_id(self):
        return "test"

    @property
    def model_id(self):
        return "tiny-v1"

    def embed(self, texts):
        return [[1.0, 0.0] for _ in texts]


class RAGServiceSearchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        database = Database(os.path.join(self.temp.name, "rag.sqlite3")).initialize()
        self.runtime = RAGRuntime.create(RAGConfig(enabled=True), database)
        self.runtime.ingest("guide.txt", "Network routing and connectivity")

    def test_hybrid_mode_falls_back_to_keyword_when_embeddings_are_off(self):
        result = rag_service.search(self.runtime, "network", mode="hybrid")
        self.assertEqual(result["results"][0]["search_type"], "keyword_fallback")
        self.assertFalse(result["pagination"]["has_more"])

    def test_keyword_mode_preserves_existing_result_shape(self):
        result = rag_service.search(self.runtime, "network")
        self.assertNotIn("search_type", result["results"][0])

    def test_unknown_mode_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "mode must be"):
            rag_service.search(self.runtime, "network", mode="semantic")

    def test_document_management_round_trip(self):
        metadata = rag_service.ingest(
            self.runtime, "notes.md", "# Notes\n\nA second document for management.",
            content_type="text/markdown", title="Notes",
        )
        self.assertEqual(metadata["title"], "Notes")
        page = rag_service.list_documents(self.runtime, limit=1, offset=0)
        self.assertEqual(page["pagination"]["total"], 2)
        self.assertEqual(len(page["documents"]), 1)
        document = rag_service.get_document(self.runtime, metadata["document_id"])
        self.assertIn("second document", document["text"])
        self.assertTrue(document["chunks"])
        self.assertTrue(rag_service.delete_document(self.runtime, metadata["document_id"]))
        with self.assertRaisesRegex(KeyError, "document not found"):
            rag_service.get_document(self.runtime, metadata["document_id"])

    def test_document_management_requires_enabled_runtime(self):
        disabled = RAGRuntime.create(RAGConfig(enabled=False), None)
        with self.assertRaises(rag_service.RAGDisabledError):
            rag_service.list_documents(disabled)
        with self.assertRaises(rag_service.RAGDisabledError):
            rag_service.ingest(disabled, "x.txt", "text")
        with self.assertRaises(rag_service.RAGDisabledError):
            rag_service.delete_document(disabled, "0" * 64)



if __name__ == "__main__":
    unittest.main()

class RAGSettingsServiceTests(unittest.TestCase):
    def test_settings_are_persisted_without_secrets(self):
        import json
        import os
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            env = {"HOME": directory, "AI_RAG_CONFIG_PATH": os.path.join(directory, "settings.json")}
            with patch.dict(os.environ, env, clear=False):
                result = rag_service.put_settings({"enabled": True, "embeddings_enabled": False})
                self.assertTrue(result["restart_required"])
                loaded = rag_service.get_settings()
                self.assertTrue(loaded["persisted"])
                self.assertTrue(loaded["settings"]["enabled"])
                self.assertTrue(loaded["api_restart_required"])
                with open(env["AI_RAG_CONFIG_PATH"], encoding="utf-8") as handle:
                    self.assertNotIn("pin", json.load(handle))

    def test_invalid_settings_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "requires AI_RAG_ENABLED"):
            rag_service.put_settings({"enabled": False, "embeddings_enabled": True})

class RAGApplySettingsTests(unittest.TestCase):
    def test_apply_swaps_runtime_only_after_success(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        from rag.config import RAGConfig, RAGRuntime
        previous = RAGRuntime.create(RAGConfig(enabled=False))
        replacement = RAGRuntime.create(RAGConfig(enabled=False, embeddings_enabled=False))
        server = SimpleNamespace(rag_runtime=previous, rag_database="old-db")
        with patch("api.rag_service.initialize_application_runtime", return_value=(replacement, "new-db")):
            result = rag_service.apply_settings(server)
        self.assertIs(server.rag_runtime, replacement)
        self.assertEqual(server.rag_database, "new-db")
        self.assertTrue(result["applied"])
        self.assertTrue(result["mcp_restart_required"])

    def test_failed_apply_keeps_previous_runtime(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        previous = object()
        server = SimpleNamespace(rag_runtime=previous, rag_database="old-db")
        with patch("api.rag_service.initialize_application_runtime", side_effect=ValueError("missing storage path")):
            with self.assertRaisesRegex(ValueError, "missing storage path"):
                rag_service.apply_settings(server)
        self.assertIs(server.rag_runtime, previous)
        self.assertEqual(server.rag_database, "old-db")
