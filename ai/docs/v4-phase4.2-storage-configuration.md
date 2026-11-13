# Phase 4.2 — Storage configuration and access policy

**Status:** Implemented as an opt-in configuration layer; not connected to MCP/API startup.

## Configuration

`storage.StorageConfig.from_env()` reads these variables only when explicitly
called:

| Variable | Required | Meaning |
| --- | --- | --- |
| `AI_STORAGE_PATH` | To enable storage | Explicit SQLite database file path. Empty/unset means disabled. |
| `AI_STORAGE_BACKUP_DIR` | No | Optional directory intended for backup files; requires `AI_STORAGE_PATH`. |
| `AI_STORAGE_TIMEOUT` | No | SQLite busy timeout in seconds; default `5`, allowed range `0`–`60`. |

Example for a future application service:

```python
from storage import StorageConfig

config = StorageConfig.from_env()
if config.enabled:
    db = config.database()  # creates no files and does not initialize schema
    db.initialize()         # explicit opt-in at the call site
```

The configuration object does not create directories, databases or backups.
It does not read `mcp.conf`, mutate MCP/API `Config`, or change either server's
startup. A caller must explicitly create the config, obtain the database and
initialize it.

Recommended deployment locations are outside the writable MCP workspace,
for example `/home/ai/data/ai-mcp.sqlite3` and `/home/ai/backups/`. The parent
folder should be owned by the server account and not writable by unrelated
users. The database and backup files contain application data and should be
protected accordingly.

## Access policy

| Component | Storage access |
| --- | --- |
| `storage/` | Owns SQLite mechanics, schema versioning and path/config validation. |
| Future `memory/` service | Allowed through an application-level service boundary and its own namespace/schema. |
| Future `rag/` service | Allowed through an application-level service boundary and its own namespace/schema. |
| MCP HTTP/protocol/tool handlers | No direct database access. |
| API HTTP handlers | No direct database access or storage endpoints. |
| Generic command execution / workspace tools | No database path or storage capability granted. |

Future services should receive a configured `Database` dependency rather than
reading environment variables or opening SQLite directly throughout the code.
Use distinct namespaces and domain-specific validation. Do not expose generic
`get/set/delete` operations directly as public MCP tools or API routes.

## Backup and retention policy

- Backups are explicit operations using `Database.backup()`; there is no
  scheduler or automatic backup on server startup.
- Keep backup files outside the workspace and protect them like the database.
- Suggested small-deployment baseline: retain the latest **7 daily** backups
  and **4 weekly** backups. Keep a pre-upgrade backup before schema changes.
- No automatic pruning is implemented. An operator must review and remove old
  copies deliberately; never delete the only known-good backup.
- Off-device copies are recommended for important data, but transport,
  encryption-at-rest and remote retention are deployment responsibilities.

This release defines the boundary and configuration only. It does not implement
memory, RAG ingestion, embeddings, vector search, backup scheduling, or server
integration.

## Validation

`python3 -m unittest storage.test_config storage.test_database -v` covers
configuration defaults, opt-in behavior, path/timeout validation and the
existing SQLite reliability behavior.
