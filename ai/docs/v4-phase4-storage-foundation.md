# Phase 4 — Storage foundation

**Status:** Implemented as an opt-in library; not wired into either server.
**Introduced:** v3.6. Reliability improvements are included in v3.7 (Phase 4.1).

## Goal

Introduce a small persistent storage layer that can later support application
state, memory and RAG metadata without coupling persistence to the MCP or API
HTTP transports.

## Implementation

- The `storage/` package is a standalone Python package using the standard
  library `sqlite3` module.
- `Database` accepts an explicit database path; there is no hidden default
  path and no database is created during MCP/API startup.
- Schema migrations are tracked in `schema_migrations`.
- Initial schema contains a generic `records` table keyed by namespace and key.
- Values are strings; callers decide whether/how to encode structured data.
- Short-lived connections enable foreign keys, disable trusted schema, and use
  a bounded busy timeout.
- Writes use `BEGIN IMMEDIATE` transactions.
- Database files are set to mode 0600; newly created parent directories are
  created with owner-only permissions.
- Symlink database paths and non-regular existing paths are rejected.
- Namespaces and keys are constrained to a conservative identifier alphabet.

## Deliberately out of scope

- No MCP tools or API endpoints expose database operations.
- No automatic database initialization on server startup.
- No changes to audit log storage or its rotation behavior.
- No migration of existing files, logs, settings or user data into SQLite.
- No RAG ingestion, document chunks, embeddings, vector index or semantic
  search.
- No database path added to `mcp.conf`; deployment policy remains a separate
  decision. Backup/restore helpers are added in Phase 4.1.

## Validation

Run:

```sh
python3 -m unittest storage.test_database -v
python3 -m compileall -q storage
python3 -m unittest api.tests api.test_client -q
python3 -m unittest discover -s mcp/tests -q
```

The Laptop MCP environment blocks local TCP loopback. Network-dependent tests
must be run on the Debian host; this storage package itself requires no socket.
