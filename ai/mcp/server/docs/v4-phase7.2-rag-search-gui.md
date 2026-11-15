# Phase 7.2 — RAG search GUI integration

**Release:** v3.29

## Added

- Added a browser search form to the existing `/rag` dashboard.
- Supports keyword and hybrid modes by calling the existing authenticated `GET /api/rag/search` endpoint.
- Supports an exact source filter and one-result-per-document option.
- Renders source/title, chunk number, existing score fields, snippets and explicit keyword-fallback status.
- Opens the existing document detail view from a search result; no second detail implementation.
- Adds pagination using the endpoint's existing metadata. Hybrid pagination respects the backend's bounded 50-candidate window.
- Uses the existing page-memory API PIN and existing `api()` request helper. No new endpoint, storage, ranking logic, embedding provider or dependency was added.
- Corrected the upload label and status text: ingestion creates document chunks and keyword-searchable content; semantic embedding indexing remains a separate operation.

## Search behavior

- Keyword is the default mode.
- Hybrid uses the existing backend defaults (keyword weight 0.5, semantic weight 0.5).
- When semantic search is not available, the existing backend can return `search_type=keyword_fallback`; the UI labels this rather than implying semantic search ran.
- Result text is rendered with DOM `textContent`, not HTML injection.

## Validation

- Dashboard HTTP test checks that the served page includes the search UI and existing search endpoint reference.
- API, RAG, storage and MCP regression suites run as recorded in the release report.
- The browser was not executed in a real browser in this sandbox; host-side browser and live HTTP verification remain required.
