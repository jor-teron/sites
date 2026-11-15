# Architecture and duplication audit

**Audit release:** v3.28  
**Repository baseline:** v3.27, commit `5d76f34`  
**Scope:** Phases 0 through 7.1, including current MCP, API, storage, RAG, CLI and browser GUI code.

## Executive finding

The implementation is primarily layered rather than duplicated. The RAG engine, SQLite store, embedding provider interface and search algorithms are shared by the available entry points. The browser, HTTP API and API CLI are adapters/clients; they do not implement independent RAG engines.

No second database, second search engine, second embedding pipeline or duplicate server process was found in this review.

There are, however, a few naming and boundary issues worth keeping visible. This document is the guardrail for future phases.

## Phase-by-phase inventory

| Phase | Responsibility added | Reuse / duplication finding |
|---|---|---|
| 0 | Baseline audit and target architecture | Planning only; no duplicate implementation |
| 1 | MCP tool modularisation | Compatibility facade preserves old imports; intentional |
| 1.1 | MCP configuration modularisation | Compatibility exports; intentional |
| 1.2 | MCP HTTP transport modularisation | `mcp/http.py` facade delegates to `mcp/http_modules/`; intentional |
| 1.3 | MCP logging/audit modularisation | `mcp/log.py` facade delegates to `mcp/log_modules/`; intentional |
| 2 | Independent HTTP API | Separate API listener/process; shares MCP tool execution path |
| 2.1 | API integration tests | Test coverage, no duplicate runtime |
| 2.2 | API transport hardening | Hardens existing API |
| 3.0 | Python API client and CLI | Client of existing API; no new server logic |
| 3.1 | API host verification procedure | Verification documentation, no duplicate implementation |
| 4 | SQLite storage foundation | One reusable storage package |
| 4.1 | Storage reliability | Extends same database implementation |
| 4.2 | Storage configuration/access policy | Configures same storage package |
| 5.0 | Text extraction and chunking | Shared ingestion foundation |
| 5.1 | RAG document/chunk persistence | One RAG store on the shared SQLite database |
| 5.2 | Keyword retrieval | First retrieval implementation |
| 5.3 | Retrieval filters/snippets/deduplication | Extends the existing keyword retrieval |
| 5.4 | Embedding interface and vector persistence | Adds a second retrieval modality, not a second store |
| 5.5 | Optional RAG/embedding switches | Gates existing runtime components |
| 5.6 | MCP/API startup integration | Each process owns a runtime instance; code and configured DB are shared |
| 5.7 | Local RAG CLI | Local adapter over RAG runtime/store |
| 5.8 | RAG HTTP API | HTTP adapter over the same RAG runtime |
| 5.9 | Pagination and search controls | Extends existing store/API/client contracts |
| 5.10 | API-client RAG CLI | Remote client of the same API; overlaps in user-facing commands with local CLI by design |
| 6.0 | Embedding provider registry | Registry/factory for the existing provider contract |
| 6.1 | Local Sentence Transformers provider | One implementation of that provider contract |
| 6.2 | Bulk vector indexing and coverage | Extends existing vector persistence/indexing |
| 6.3 | Hybrid retrieval | Combines existing keyword and semantic retrieval; no third search engine |
| 7.0 | Browser dashboard | Static UI over existing authenticated API |
| 7.1 | Browser document management | Reuses existing ingest/list/get/delete API operations |

## Current ownership map

- **MCP server (`mcp.server`, port 10001):** MCP protocol and tool access.
- **API server (`api.server`, default port 10002):** independent HTTP listener, authentication and API routes.
- **API RAG adapter (`api/rag_service.py`):** translates HTTP/client requests into runtime calls; it should not own retrieval algorithms or database access.
- **RAG runtime (`rag/config.py`, `rag/application.py`):** feature gates and application-facing RAG operations.
- **RAG store (`rag/store.py`):** document/chunk/vector persistence and keyword, semantic and hybrid retrieval.
- **Embedding provider layer (`rag/providers.py`, `rag/embeddings.py`, `rag/local_embeddings.py`):** provider contract, registration and actual embedding implementation.
- **Storage (`storage/database.py`):** SQLite connection, transactions, schema and backup/recovery.
- **Interfaces:** `rag/cli.py` is local; `api/client.py` is an API client; `api/static/rag.html` is a browser client.

MCP and API are separate processes/listeners intentionally. They may each initialize their own in-process RAG runtime against the explicitly configured storage path. This is not a second RAG implementation.

## Confirmed existing capabilities — do not rebuild

The API already provides:

- `GET /api/rag/status`
- `POST /api/rag/ingest`
- `GET /api/rag/documents` with pagination
- `GET /api/rag/documents/{document_id}`
- `GET /api/rag/search` with keyword/hybrid mode, weights, filters, snippets and pagination
- `DELETE /api/rag/documents/{document_id}`

The RAG store/runtime already provide:

- TXT/Markdown/HTML extraction and chunking
- document and chunk persistence
- FTS5 keyword search with LIKE fallback
- semantic vector indexing and search
- embedding coverage and bulk indexing
- weighted hybrid keyword/semantic retrieval

The Python API client already has matching RAG methods and CLI commands. Therefore Phase 7.2 is only a browser integration task: call the existing search endpoint and render its response. It must not add another endpoint, query implementation, ranking algorithm, index or database table unless a concrete missing requirement is demonstrated first.

## Findings and small corrections to track

1. **Two CLI entry points have overlapping commands.** `rag.cli` operates locally against the configured runtime; `api.client rag` sends requests to the separate API server. This is a deliberate local-vs-remote distinction, but documentation should keep it explicit so they are not mistaken for two RAG engines.
2. **The GUI button label is imprecise.** Phase 7.1 labels the action “Upload and index”. Upload performs ingestion/chunking and updates the existing keyword index; it does not automatically generate semantic embeddings. The UI should say “Upload document” or explain that semantic embedding indexing is a separate explicit operation.
3. **Status fields are capability indicators, not full readiness checks.** For example, a hybrid route can fall back to keyword search when no provider is configured or embeddings are unavailable. Future GUI status should distinguish enabled/configured/indexed/ready rather than imply a model is loaded and every document has vectors.
4. **Phase 7.2 is not a search-engine phase.** It should add only a search form, existing API request parameters, result rendering, and navigation to the existing document detail view. Do not duplicate search logic in JavaScript.
5. **Phase 8 controls must modify the existing configuration/runtime lifecycle.** Do not introduce a parallel settings store, second runtime, or GUI-side direct SQLite access. Settings must be validated and applied with explicit restart/reinitialization semantics.

## Rules for future changes

- One canonical implementation per capability; interfaces call it.
- No direct SQLite access from the browser or HTTP handler.
- No search ranking, chunking, embedding or ingestion algorithms in UI/client code.
- Reuse existing authenticated endpoints and client methods before adding routes.
- Add a new API endpoint only when the existing contract cannot express a real use case.
- Do not create another provider registry, embedding store, RAG runtime or database.
- Keep MCP and API as separate processes; share modules/contracts, not listeners.
- Preserve optional/off-by-default RAG and embeddings behavior.
- When a feature already exists, expose it through an interface instead of reimplementing it.

## Audit limits

This was a source and documentation review of the repository at v3.27. It establishes code ownership and reuse boundaries, not full runtime correctness. It does not prove browser behavior, real Debian-host HTTP behavior, or local Sentence Transformers inference. Those still require host/runtime verification.


## Phase 7.2 addendum (v3.29)

Phase 7.2 has now connected the existing dashboard to the existing authenticated
`GET /api/rag/search` endpoint. The browser renders the API's keyword/hybrid
results and delegates ranking, fallback behavior, filtering and pagination to
the existing backend. It introduces no second search implementation or API
route. The dashboard's document action reuses the Phase 7.1 document detail
view. Static dashboard contract tests cover these integration boundaries.
