"""Tests for opt-in storage configuration."""
import os
import tempfile
import unittest

from storage import StorageConfig, StorageError


class StorageConfigTests(unittest.TestCase):
    def test_empty_environment_keeps_storage_disabled(self):
        config = StorageConfig.from_env({})
        self.assertFalse(config.enabled)
        self.assertIsNone(config.database_path)
        with self.assertRaises(StorageError):
            config.database()

    def test_empty_path_is_treated_as_disabled(self):
        config = StorageConfig.from_env({"AI_STORAGE_PATH": "  "})
        self.assertFalse(config.enabled)

    def test_explicit_path_creates_uninitialized_database_object(self):
        with tempfile.TemporaryDirectory() as temp:
            path = os.path.join(temp, "private", "state.sqlite3")
            config = StorageConfig.from_env({"AI_STORAGE_PATH": path})
            database = config.database()
            self.assertTrue(config.enabled)
            self.assertEqual(database.path, path)
            self.assertFalse(os.path.exists(path))
            self.assertFalse(database._initialized)

    def test_paths_are_expanded_and_absolute(self):
        config = StorageConfig(database_path="./state.sqlite3")
        self.assertTrue(os.path.isabs(config.database_path))

    def test_backup_directory_requires_database_path(self):
        with self.assertRaises(ValueError):
            StorageConfig(backup_dir="./backups")

    def test_backup_directory_must_differ_from_database_path(self):
        with tempfile.TemporaryDirectory() as temp:
            path = os.path.join(temp, "state.sqlite3")
            with self.assertRaises(ValueError):
                StorageConfig(database_path=path, backup_dir=path)

    def test_timeout_is_bounded(self):
        for value in (-0.1, 60.1, "not-a-number"):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    StorageConfig(timeout=value)

    def test_environment_timeout_and_backup_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            config = StorageConfig.from_env({
                "AI_STORAGE_PATH": os.path.join(temp, "state.sqlite3"),
                "AI_STORAGE_BACKUP_DIR": os.path.join(temp, "backups"),
                "AI_STORAGE_TIMEOUT": "12.5",
            })
            self.assertEqual(config.timeout, 12.5)
            self.assertEqual(config.backup_dir, os.path.join(temp, "backups"))


if __name__ == "__main__":
    unittest.main()
