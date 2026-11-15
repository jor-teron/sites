"""Explicit configuration for opt-in application storage.

This module reads configuration only when ``StorageConfig.from_env()`` is
called. Importing it never reads environment variables or creates files.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping, Optional

from .database import Database, StorageError

DEFAULT_TIMEOUT = 5.0
MIN_TIMEOUT = 0.0
MAX_TIMEOUT = 60.0


def _optional_path(value, name):
    if value is None or not str(value).strip():
        return None
    path = os.path.abspath(os.path.expanduser(os.fspath(value).strip()))
    if path == os.path.abspath(os.sep):
        raise ValueError("%s must not be the filesystem root" % name)
    return path


@dataclass(frozen=True)
class StorageConfig:
    """Validated storage settings; constructing a Database remains explicit."""

    database_path: Optional[str] = None
    backup_dir: Optional[str] = None
    timeout: float = DEFAULT_TIMEOUT

    def __post_init__(self):
        database_path = _optional_path(self.database_path, "AI_STORAGE_PATH")
        backup_dir = _optional_path(self.backup_dir, "AI_STORAGE_BACKUP_DIR")
        try:
            timeout = float(self.timeout)
        except (TypeError, ValueError):
            raise ValueError("storage timeout must be a number")
        if timeout < MIN_TIMEOUT or timeout > MAX_TIMEOUT:
            raise ValueError("storage timeout must be between 0 and 60 seconds")
        if backup_dir and not database_path:
            raise ValueError("AI_STORAGE_BACKUP_DIR requires AI_STORAGE_PATH")
        if database_path and backup_dir == database_path:
            raise ValueError("backup directory must differ from database path")
        object.__setattr__(self, "database_path", database_path)
        object.__setattr__(self, "backup_dir", backup_dir)
        object.__setattr__(self, "timeout", timeout)

    @property
    def enabled(self):
        """True only when a database path was explicitly configured."""
        return self.database_path is not None

    @classmethod
    def from_env(cls, environ=None):
        """Read AI_STORAGE_* variables; an empty path leaves storage disabled."""
        env = os.environ if environ is None else environ
        raw_timeout = env.get("AI_STORAGE_TIMEOUT", str(DEFAULT_TIMEOUT))
        try:
            timeout = float(raw_timeout)
        except (TypeError, ValueError):
            raise ValueError("AI_STORAGE_TIMEOUT must be a number")
        return cls(
            database_path=env.get("AI_STORAGE_PATH"),
            backup_dir=env.get("AI_STORAGE_BACKUP_DIR"),
            timeout=timeout,
        )

    def database(self):
        """Return an uninitialized Database; callers must explicitly initialize."""
        if not self.enabled:
            raise StorageError(
                "storage is disabled; set AI_STORAGE_PATH to enable it explicitly"
            )
        return Database(self.database_path, timeout=self.timeout)
