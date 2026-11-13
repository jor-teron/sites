"""Small, explicit SQLite persistence foundation.

The package is intentionally not initialized by either server process.
Callers opt in by constructing and initializing a Database instance.
"""
from .database import Database, StorageError, SCHEMA_VERSION
from .config import StorageConfig

__all__ = ["Database", "StorageError", "SCHEMA_VERSION", "StorageConfig"]
