# Phase 5.6 — RAG application startup integration

**Release:** v3.17

## Scope

Connect the Phase 5.5 optional RAG runtime to the two independent server process
entry points. This phase adds lifecycle wiring only; it does not expose RAG as
an MCP tool or API endpoint.

## Startup behavior

Both `mcp.server` and `api.server` call
`rag.application.initialize_application_runtime()` before opening their HTTP
listener.

- Default: `AI_RAG_ENABLED=false`. Startup returns an inactive runtime and no
  database. It does not consult storage settings or create a database file.
- Enabled: `AI_RAG_ENABLED=true` requires `AI_STORAGE_PATH`. The configured
  SQLite database is initialized explicitly during startup.
- Embeddings: `AI_RAG_EMBEDDINGS_ENABLED` remains independent but requires RAG.
  Enabling it does not choose a provider, download a model, or make a network
  request. A provider must still be supplied explicitly when semantic
  indexing/search is requested.
- Startup errors caused by invalid feature/storage configuration are reported
  and the affected server exits with status 1 rather than silently disabling
  a requested feature.

Each server retains its own `rag_runtime` and `rag_database` references. The
MCP and API processes do not share a process singleton and remain independently
startable/stoppable. They may use the same explicitly configured SQLite path;
SQLite coordinates concurrent database access.

## Security and compatibility

- No storage path means no storage initialization when RAG is disabled.
- Existing records are not deleted when RAG is disabled.
- No public MCP tools, API routes, or new listener are added.
- No second LLM, sub-agent, embedding API key, SDK, or model is required.
- Existing MCP and API routes, authentication and tool execution are unchanged.
- API bind defaults and MCP Funnel configuration are unchanged.

## Configuration

```sh
# Normal operation: no RAG database created
AI_RAG_ENABLED=false
AI_RAG_EMBEDDINGS_ENABLED=false

# Explicitly enable keyword RAG
AI_RAG_ENABLED=true
AI_RAG_EMBEDDINGS_ENABLED=false
AI_STORAGE_PATH=/path/to/private/rag.sqlite3
```

All environment settings are read by the explicit startup helper, not at
module import time.

## Tests

`rag.test_application` verifies default-off startup, no file creation, required
storage path, explicit database initialization and embedding switch behavior.
Server startup retains the runtime without changing HTTP route surfaces.
Real host process/network startup remains a deployment verification task.
