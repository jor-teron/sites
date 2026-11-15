"""Tests for persistent, validated RAG settings."""
import json
import os
import tempfile
import unittest

from rag.config import RAGConfig
from rag.settings import config_from_dict, config_to_dict, default_settings_path, load_effective_settings, load_settings, save_settings


class RAGSettingsTests(unittest.TestCase):
    def test_round_trip_and_restrictive_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "config", "rag.json")
            config = RAGConfig(True, True, "local", "sentence-transformers/all-MiniLM-L6-v2")
            save_settings(path, config)
            self.assertEqual(load_settings(path), config)
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            self.assertEqual(os.stat(os.path.dirname(path)).st_mode & 0o777, 0o700)

    def test_missing_file_returns_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            fallback = RAGConfig(True, False)
            self.assertEqual(load_settings(os.path.join(directory, "missing"), fallback), fallback)

    def test_invalid_combinations_and_unknown_keys_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "requires AI_RAG_ENABLED"):
            config_from_dict({"embeddings_enabled": True})
        with self.assertRaisesRegex(ValueError, "unknown RAG setting"):
            config_from_dict({"enabled": False, "pin": "secret"})

    def test_persisted_settings_override_environment_defaults(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "rag.json")
            save_settings(path, RAGConfig(enabled=True))
            effective = load_effective_settings({
                "HOME": directory, "AI_RAG_CONFIG_PATH": path,
                "AI_RAG_ENABLED": "not-a-boolean",
            })
            self.assertTrue(effective.enabled)

    def test_corrupt_json_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "rag.json")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("{")
            with self.assertRaisesRegex(ValueError, "could not read"):
                load_settings(path)

    def test_path_can_be_overridden(self):
        self.assertEqual(default_settings_path({"AI_RAG_CONFIG_PATH": "~/rag.json"}),
                         os.path.expanduser("~/rag.json"))


if __name__ == "__main__":
    unittest.main()
