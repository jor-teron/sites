"""Tests for the standalone SQLite storage foundation."""
from __future__ import annotations

import os
import tempfile
import unittest

from storage import Database, SCHEMA_VERSION, StorageError


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.temp.name, "private", "state.sqlite3")
        self.db = Database(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def test_requires_explicit_initialization(self):
        with self.assertRaises(StorageError):
            self.db.get("app", "key")

    def test_initializes_schema_idempotently(self):
        self.assertEqual(self.db.schema_version(), 0)
        self.db.initialize()
        self.db.initialize()
        self.assertEqual(self.db.schema_version(), SCHEMA_VERSION)

    def test_round_trip_and_upsert(self):
        self.db.initialize()
        self.db.set("settings", "theme", "dark")
        self.assertEqual(self.db.get("settings", "theme"), "dark")
        self.db.set("settings", "theme", "light")
        self.assertEqual(self.db.get("settings", "theme"), "light")

    def test_missing_value_returns_default(self):
        self.db.initialize()
        self.assertEqual(self.db.get("settings", "missing", "fallback"), "fallback")

    def test_delete_and_list_keys(self):
        self.db.initialize()
        self.db.set("cache", "b", "2")
        self.db.set("cache", "a", "1")
        self.assertEqual(self.db.list_keys("cache"), ["a", "b"])
        self.assertTrue(self.db.delete("cache", "a"))
        self.assertFalse(self.db.delete("cache", "a"))

    def test_values_must_be_strings(self):
        self.db.initialize()
        with self.assertRaises(TypeError):
            self.db.set("settings", "count", 3)

    def test_names_are_validated(self):
        self.db.initialize()
        for bad in ("", "../escape", "has space", "x" * 129):
            with self.subTest(value=bad):
                with self.assertRaises(ValueError):
                    self.db.set("settings", bad, "value")

    def test_database_file_permissions(self):
        self.db.initialize()
        self.db.set("app", "ready", "yes")
        self.assertEqual(os.stat(self.path).st_mode & 0o777, 0o600)

    def test_symlink_database_path_is_rejected(self):
        self.db.initialize()
        link = os.path.join(self.temp.name, "linked.sqlite3")
        os.symlink(self.path, link)
        with self.assertRaises(StorageError):
            Database(link).initialize()

    def test_transaction_rolls_back_on_exception(self):
        self.db.initialize()
        with self.assertRaises(RuntimeError):
            with self.db.transaction() as conn:
                conn.execute(
                    "INSERT INTO records(namespace, key, value) VALUES (?, ?, ?)",
                    ("settings", "partial", "no"),
                )
                raise RuntimeError("force rollback")
        self.assertIsNone(self.db.get("settings", "partial"))

    def test_integrity_check_reports_ok(self):
        self.db.initialize()
        self.db.set("app", "status", "healthy")
        self.assertEqual(self.db.integrity_check(), "ok")

    def test_backup_and_restore_round_trip(self):
        self.db.initialize()
        self.db.set("settings", "mode", "before")
        backup = os.path.join(self.temp.name, "backup.sqlite3")
        self.assertEqual(self.db.backup(backup), backup)
        self.db.set("settings", "mode", "after")
        self.db.restore(backup)
        self.assertEqual(self.db.get("settings", "mode"), "before")
        self.assertEqual(os.stat(backup).st_mode & 0o777, 0o600)

    def test_backup_rejects_same_path_and_symlink(self):
        self.db.initialize()
        with self.assertRaises(ValueError):
            self.db.backup(self.path)
        link = os.path.join(self.temp.name, "backup-link")
        os.symlink(self.path, link)
        with self.assertRaises(StorageError):
            self.db.backup(link)

    def test_restore_rejects_invalid_source_without_changing_database(self):
        self.db.initialize()
        self.db.set("settings", "mode", "safe")
        invalid = os.path.join(self.temp.name, "invalid.sqlite3")
        with open(invalid, "wb") as stream:
            stream.write(b"not a sqlite database")
        with self.assertRaises(StorageError):
            self.db.restore(invalid)
        self.assertEqual(self.db.get("settings", "mode"), "safe")

    def test_concurrent_writers_preserve_all_records(self):
        import threading
        self.db.initialize()
        databases = [Database(self.path, timeout=10).initialize() for _ in range(5)]
        errors = []

        def writer(index):
            try:
                for item in range(20):
                    databases[index].set("workers", "w%d-%d" % (index, item), "ok")
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=writer, args=(i,)) for i in range(5)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
        self.assertEqual(len(self.db.list_keys("workers")), 100)
        self.assertEqual(self.db.integrity_check(), "ok")

    def test_future_schema_is_rejected(self):
        self.db.initialize()
        with self.db.transaction() as conn:
            conn.execute(
                "INSERT INTO schema_migrations(version) VALUES (?)",
                (SCHEMA_VERSION + 1,),
            )
        with self.assertRaises(StorageError):
            self.db.initialize()


if __name__ == "__main__":
    unittest.main()
