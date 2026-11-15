# Phase 4.1 — Storage reliability

**Status:** Included in release v3.7.

## Added

- `Database.integrity_check()` runs SQLite `PRAGMA integrity_check` and returns
  `ok` or the reported integrity errors.
- `Database.backup(destination)` uses SQLite's online backup API to create a
  consistent snapshot, including while other connections are writing.
- `Database.restore(source)` validates the source database, builds a temporary
  database beside the destination and atomically replaces the active file only
  after the copy succeeds. Invalid backups leave the current database intact.
- Backup files receive mode `0600`; symbolic-link paths are rejected.
- Concurrent writer and transaction rollback tests.

## Recovery example

```python
from storage import Database

db = Database("/path/to/state.sqlite3").initialize()
db.backup("/path/to/backups/state-backup.sqlite3")

# Restore only after choosing the intended backup explicitly.
db.restore("/path/to/backups/state-backup.sqlite3")
assert db.integrity_check() == "ok"
```

Backups contain the database's stored data and should be protected like the
original database. The package does not schedule backups, retain generations,
or copy backups off-device; those are deployment/operations decisions.

## Validation

`python3 -m unittest storage.test_database -v` covers backup/restore,
corrupt-source rejection, integrity checks, rollback and concurrent writers.
