# Phase 5.9 — RAG pagination and result controls

**Release:** v3.20

## Document listing

`GET /api/rag/documents` accepts:

- `limit`: 1–100, default 50
- `offset`: 0–100000, default 0

The response retains the `documents` array and adds `pagination` with
`limit`, `offset`, `total`, `returned`, and `has_more`. The database applies
ordering and LIMIT/OFFSET before loading document metadata.

## Keyword search

`GET /api/rag/search` accepts:

- `q`: required query
- `limit`: 1–50, default 10
- `offset`: 0–100000, default 0
- `source`: optional exact source filter
- `deduplicate`: `true` or `false`, default false; keeps the best-ranked
  result per document
- `snippet_chars`: 40–1000, default 240

The response retains the `results` array and adds `pagination` with `limit`,
`offset`, `returned`, and `has_more`. One extra result is fetched internally
to determine `has_more`. With deduplication enabled, the existing bounded
500-candidate scan means offset is limited to 449; larger deduplicated offsets
are rejected instead of silently returning incomplete pages. For heavily
chunked documents, the 500-candidate safety bound can yield a short page; in
that case `has_more` only reflects additional unique results found in the
scanned candidate window.

The Python API client exposes the same controls through `rag_documents()` and
`rag_search()`. Existing positional `source` argument ordering for
`rag_search(query, limit, source)` is preserved.

## Implementation boundaries

- Pagination is performed by the SQLite-backed RAG store, not by fetching the
  entire document list into the API layer.
- Keyword search still uses the existing FTS5 or LIKE fallback.
- No embedding provider, model, MCP route, or external dependency is added.
- All routes retain the existing API authentication and request validation.
