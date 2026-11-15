# Phase 5.5 — Optional RAG and embedding modules

**Release:** v3.16

**Status:** Implemented as an explicit application-level feature gate; not connected to MCP/API startup.

## Feature switches

`rag.RAGConfig` exposes two independent switches:

- `AI_RAG_ENABLED` — enables document ingestion, persistence and keyword retrieval.
- `AI_RAG_EMBEDDINGS_ENABLED` — enables semantic indexing and semantic search; requires RAG to be enabled.

Both default to `false`. Boolean values accept `1/0`, `true/false`, `yes/no`,
`on/off` and `enabled/disabled` (case-insensitive). Invalid values fail
configuration rather than silently selecting a mode. Configuration reads the
environment only when the caller explicitly invokes `RAGConfig.from_env()`.

Example:

```sh
AI_RAG_ENABLED=false
AI_RAG_EMBEDDINGS_ENABLED=false
```

For keyword RAG only:

```sh
AI_RAG_ENABLED=true
AI_RAG_EMBEDDINGS_ENABLED=false
```

For semantic retrieval, both switches must be true and the application must
explicitly supply an implementation of `EmbeddingProvider`.

## Lifecycle and safety

`RAGRuntime.create(config, database=None)` is the application-level gate:

- With RAG disabled, it returns an inactive runtime without constructing a
  `RAGStore`, accessing a supplied database, initializing storage or deleting
  existing records.
- With RAG enabled, the caller must supply an already initialized
  `storage.Database`. The runtime never creates or initializes the database.
- Keyword RAG operations require only the RAG switch.
- Embedding operations additionally require the embedding switch and an
  explicitly supplied provider. No model, API key, SDK or network client is
  bundled or selected by this release.
- Calling a disabled feature raises `RAGDisabledError` with the switch needed
  to enable it.

The runtime provides the supported application boundary. Lower-level
`RAGStore` and ingestion primitives remain directly importable for existing
library callers and tests; callers integrating the modules should use
`RAGRuntime` so the switches are enforced.

## MCP boundary

These are application/library feature switches, not MCP protocol features.
No second LLM, sub-agent, external embedding service, MCP capability, MCP tool,
API endpoint, startup integration or background worker is required. MCP and
API server startup remain unchanged. Turning a module off does not remove or
migrate its existing SQLite data.

## Validation

The tests cover default-off behavior, environment parsing, invalid values,
embedding/RAG dependency validation, no database access while disabled,
explicit database initialization requirements, keyword-only operation,
explicit provider use and preservation of stored data when disabled.
