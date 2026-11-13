"""SQLite-backed namespaced key/value storage.

This is an additive persistence primitive. It does not alter MCP/API startup,
tool execution, audit logging, or workspace permissions.
"""
from __future__ import annotations

import os
import re
import sqlite3
import threading
from urllib.parse import quote
from contextlib import contextmanager

SCHEMA_VERSION = 1
_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")


class StorageError(RuntimeError):
    """Raised when storage cannot be safely initialized or accessed."""


class Database:
    """Explicit SQLite database with a small versioned schema."""

    def __init__(self, path, timeout=5.0):
        if not path:
            raise ValueError("database path is required")
        self.path = os.path.abspath(os.path.expanduser(os.fspath(path)))
        self.timeout = float(timeout)
        if self.timeout < 0 or self.timeout > 60:
            raise ValueError("timeout must be between 0 and 60 seconds")
        self._lock = threading.RLock()
        self._initialized = False

    def _prepare_path(self):
        parent = os.path.dirname(self.path)
        os.makedirs(parent, mode=0o700, exist_ok=True)
        if os.path.islink(self.path):
            raise StorageError("database path must not be a symbolic link")
        if os.path.exists(self.path) and not os.path.isfile(self.path):
            raise StorageError("database path is not a regular file")

    @contextmanager
    def connection(self):
        """Yield a short-lived SQLite connection with safe defaults."""
        self._prepare_path()
        conn = None
        try:
            conn = sqlite3.connect(
                self.path, timeout=self.timeout, isolation_level=None
            )
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute("PRAGMA trusted_schema = OFF")
            conn.execute("PRAGMA busy_timeout = %d" % int(self.timeout * 1000))
            yield conn
        except sqlite3.Error as exc:
            raise StorageError("database operation failed: %s" % exc) from exc
        finally:
            if conn is not None:
                conn.close()
            if os.path.exists(self.path):
                try:
                    os.chmod(self.path, 0o600)
                except OSError:
                    pass

    @contextmanager
    def transaction(self):
        """Yield a connection inside an immediate, atomic transaction."""
        with self.connection() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE")
                yield conn
                conn.execute("COMMIT")
            except Exception:
                if conn.in_transaction:
                    conn.execute("ROLLBACK")
                raise

    def initialize(self):
        """Create or upgrade the schema. Safe to call repeatedly."""
        with self._lock:
            with self.transaction() as conn:
                conn.execute(
                    "CREATE TABLE IF NOT EXISTS schema_migrations ("
                    "version INTEGER PRIMARY KEY, "
                    "applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
                )
                row = conn.execute(
                    "SELECT COALESCE(MAX(version), 0) AS version "
                    "FROM schema_migrations"
                ).fetchone()
                current = int(row["version"])
                if current > SCHEMA_VERSION:
                    raise StorageError(
                        "database schema %d is newer than supported schema %d"
                        % (current, SCHEMA_VERSION)
                    )
                if current < 1:
                    conn.execute(
                        "CREATE TABLE records ("
                        "namespace TEXT NOT NULL, key TEXT NOT NULL, "
                        "value TEXT NOT NULL, "
                        "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                        "PRIMARY KEY(namespace, key))"
                    )
                    conn.execute(
                        "INSERT INTO schema_migrations(version) VALUES (1)"
                    )
            self._initialized = True
        return self

    @property
    def initialized(self):
        """Whether this Database instance has explicitly initialized its schema."""
        return self._initialized

    def _require_initialized(self):
        if not self.initialized:
            raise StorageError("storage is not initialized; call initialize()")

    @staticmethod
    def _validate_name(value, field):
        if not isinstance(value, str) or not _NAME_RE.fullmatch(value):
            raise ValueError(
                "%s must be 1-128 characters: letters, digits, dot, underscore or hyphen"
                % field
            )

    def set(self, namespace, key, value):
        """Insert or replace a string value in a namespace."""
        self._require_initialized()
        self._validate_name(namespace, "namespace")
        self._validate_name(key, "key")
        if not isinstance(value, str):
            raise TypeError("value must be a string")
        with self.transaction() as conn:
            conn.execute(
                "INSERT INTO records(namespace, key, value, updated_at) "
                "VALUES (?, ?, ?, CURRENT_TIMESTAMP) "
                "ON CONFLICT(namespace, key) DO UPDATE SET "
                "value=excluded.value, updated_at=CURRENT_TIMESTAMP",
                (namespace, key, value),
            )

    def get(self, namespace, key, default=None):
        """Return a string value, or default when the key does not exist."""
        self._require_initialized()
        self._validate_name(namespace, "namespace")
        self._validate_name(key, "key")
        with self.connection() as conn:
            row = conn.execute(
                "SELECT value FROM records WHERE namespace=? AND key=?",
                (namespace, key),
            ).fetchone()
        return row["value"] if row else default

    def delete(self, namespace, key):
        """Delete one record; return True if a record existed."""
        self._require_initialized()
        self._validate_name(namespace, "namespace")
        self._validate_name(key, "key")
        with self.transaction() as conn:
            cursor = conn.execute(
                "DELETE FROM records WHERE namespace=? AND key=?",
                (namespace, key),
            )
            return cursor.rowcount > 0

    def list_keys(self, namespace):
        """Return sorted keys in one namespace."""
        self._require_initialized()
        self._validate_name(namespace, "namespace")
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT key FROM records WHERE namespace=? ORDER BY key",
                (namespace,),
            ).fetchall()
        return [row["key"] for row in rows]

    def integrity_check(self):
        """Return ``ok`` when SQLite integrity passes, otherwise error rows."""
        with self.connection() as conn:
            rows = conn.execute("PRAGMA integrity_check").fetchall()
        messages = [row[0] for row in rows]
        return "ok" if messages == ["ok"] else messages

    def backup(self, destination):
        """Create a consistent SQLite backup at an explicit destination.

        SQLite's backup API safely snapshots a live database, including when
        writers are active. The destination must differ from the source.
        """
        self._require_initialized()
        target = os.path.abspath(os.path.expanduser(os.fspath(destination)))
        if target == self.path:
            raise ValueError("backup destination must differ from database path")
        parent = os.path.dirname(target)
        os.makedirs(parent, mode=0o700, exist_ok=True)
        if os.path.islink(target):
            raise StorageError("backup destination must not be a symbolic link")
        if os.path.exists(target) and not os.path.isfile(target):
            raise StorageError("backup destination is not a regular file")
        source_conn = target_conn = None
        try:
            source_conn = sqlite3.connect(self.path, timeout=self.timeout)
            target_conn = sqlite3.connect(target, timeout=self.timeout)
            source_conn.backup(target_conn)
        except sqlite3.Error as exc:
            raise StorageError("database backup failed: %s" % exc) from exc
        finally:
            if target_conn is not None:
                target_conn.close()
            if source_conn is not None:
                source_conn.close()
        os.chmod(target, 0o600)
        return target

    def restore(self, source):
        """Atomically replace this database with a validated backup.

        The source is opened read-only and must pass SQLite integrity_check.
        A temporary database is built beside the destination and atomically
        renamed only after the backup operation succeeds.
        """
        source_path = os.path.abspath(os.path.expanduser(os.fspath(source)))
        if source_path == self.path:
            raise ValueError("restore source must differ from database path")
        if os.path.islink(source_path) or not os.path.isfile(source_path):
            raise StorageError("restore source must be a regular, non-symlink file")
        self._prepare_path()
        import tempfile
        fd, temporary = tempfile.mkstemp(
            prefix=".sqlite-restore-", suffix=".tmp", dir=os.path.dirname(self.path)
        )
        os.close(fd)
        source_conn = target_conn = None
        try:
            source_conn = sqlite3.connect(
                "file:%s?mode=ro" % quote(source_path, safe="/"),
                uri=True, timeout=self.timeout,
            )
            check = [row[0] for row in source_conn.execute("PRAGMA integrity_check")]
            if check != ["ok"]:
                raise StorageError("restore source failed integrity check")
            target_conn = sqlite3.connect(temporary, timeout=self.timeout)
            source_conn.backup(target_conn)
            target_conn.close()
            target_conn = None
            source_conn.close()
            source_conn = None
            os.chmod(temporary, 0o600)
            os.replace(temporary, self.path)
            self._initialized = False
        except sqlite3.Error as exc:
            raise StorageError("database restore failed: %s" % exc) from exc
        finally:
            if target_conn is not None:
                target_conn.close()
            if source_conn is not None:
                source_conn.close()
            if os.path.exists(temporary):
                os.unlink(temporary)
        return self.initialize()

    def schema_version(self):
        """Return the applied schema version, or zero for a fresh database."""
        with self.connection() as conn:
            row = conn.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name='schema_migrations'"
            ).fetchone()
            if not row:
                return 0
            version = conn.execute(
                "SELECT COALESCE(MAX(version), 0) AS version "
                "FROM schema_migrations"
            ).fetchone()
        return int(version["version"])
