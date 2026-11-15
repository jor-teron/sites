"""Tests for opt-in server startup wiring of the RAG runtime."""
import os
import tempfile
import unittest

from rag.application import initialize_application_runtime
from rag import RAGDisabledError


class RAGApplicationTests(unittest.TestCase):
    def test_default_startup_keeps_rag_disabled_without_creating_storage(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "not-created.sqlite3")
            runtime, database = initialize_application_runtime({
                "AI_STORAGE_PATH": path,
            })
            self.assertFalse(runtime.enabled)
            self.assertIsNone(database)
            self.assertFalse(os.path.exists(path))
            with self.assertRaises(RAGDisabledError):
                runtime.search("test")

    def test_rag_enabled_requires_explicit_storage_path(self):
        with self.assertRaisesRegex(ValueError, "requires AI_STORAGE_PATH"):
            initialize_application_runtime({"AI_RAG_ENABLED": "true"})

    def test_enabled_rag_initializes_only_explicit_database(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "rag.sqlite3")
            runtime, database = initialize_application_runtime({
                "AI_RAG_ENABLED": "true",
                "AI_STORAGE_PATH": path,
                "AI_RAG_EMBEDDINGS_ENABLED": "false",
            })
            self.assertTrue(runtime.enabled)
            self.assertFalse(runtime.embeddings_enabled)
            self.assertTrue(database.initialized)
            self.assertTrue(os.path.isfile(path))
            self.assertTrue(os.stat(path).st_mode & 0o077 == 0)

    def test_embeddings_can_be_enabled_without_choosing_a_provider(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime, database = initialize_application_runtime({
                "AI_RAG_ENABLED": "true",
                "AI_RAG_EMBEDDINGS_ENABLED": "true",
                "AI_STORAGE_PATH": os.path.join(directory, "rag.sqlite3"),
            })
            self.assertTrue(runtime.embeddings_enabled)
            self.assertIsNotNone(database)


if __name__ == "__main__":
    unittest.main()
