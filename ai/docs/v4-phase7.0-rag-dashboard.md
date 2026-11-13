# Phase 7.0 — RAG dashboard foundation

**Release:** v3.26

## What was added

- A dependency-free responsive dashboard at `/rag`, served by the standalone
  API process.
- PIN entry and in-memory API authentication; the PIN is not persisted to
  local or session storage and is not sent to a third party.
- RAG enabled/disabled state, embedding state, total document count and a
  compact first page of indexed document metadata.
- Refresh support and a useful disabled-RAG state.
- A static HTML page served independently of data access. All RAG data remains
  behind the existing authenticated `/api/rag/status` and
  `/api/rag/documents` endpoints.

## Boundaries

The GUI does not access SQLite directly, change runtime settings, ingest files,
search content, delete documents or select embedding providers. Those are
intentionally deferred to Phases 7.1, 7.2 and 8.x. The API remains a separate
process on port 10002; MCP remains separate on port 10001. The API default bind
is loopback and should remain so unless a secure access path is deliberately
configured.

## Open it

Start the API server and browse to `http://127.0.0.1:10002/rag`. Enter the same
PIN used by the API client. RAG must be enabled in the server environment for
document metadata to be listed; the dashboard explains when RAG is disabled.

## Validation

- RAG: 112 passed.
- Storage: 24 passed.
- API: 22 passed, 27 skipped (loopback HTTP tests are blocked in this sandbox).
- MCP: 128 passed, 45 skipped (loopback-dependent tests are blocked in this
  sandbox).
- Python compilation, shell syntax and `git diff --check` passed.
