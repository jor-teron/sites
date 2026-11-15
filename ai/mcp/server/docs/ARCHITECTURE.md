# Architecture

The project is a small Python standard-library MCP server. The main boundaries are:

- `mcp/server.py`: process startup and server lifecycle.
- `mcp/http.py`: stable HTTP transport facade; implementation lives in `mcp/http_modules/` (`request.py` for HTTP methods/auth/JSON-RPC dispatch, `cors.py` for origin policy and headers, `routing.py` for path/framing helpers, and `connections.py` for threaded server lifecycle and concurrency bounds).
- `mcp/protocol.py`: JSON-RPC and MCP message handling.
- `mcp/auth.py`: PIN authentication and per-client rate limiting.
- `mcp/log.py`: stable logging interface; implementation lives in `mcp/log_modules/` (`events.py` for JSON event records, `formatting.py` for safe audit-line formatting, `storage.py` for locked append/rotation, and `commands.py` for tool-call audit policy).
- `mcp/tools.py`: stable public tool interface and registry. Implementations live in `mcp/tool_modules/`: `common.py` (path and workspace helpers), `command.py` (command execution), and `files.py` (file operations).
- `mcp/safepath.py`: descriptor-relative filesystem operations used by file tools.
- `mcp/jail.py`, `mcp/sandbox.py`, `mcp/nscompat.py`: isolation, resource limits and compatibility helpers.
- `mcp/config/`: compatibility export surface; `constants.py` holds core defaults, `load.py` builds runtime config, `helpers.py` contains parsers/path helpers, `client.py` builds client settings/tool schemas, and `limits/` groups operational constants by domain.


### Configuration module boundary

`mcp.config` remains the stable public import surface for existing server
modules and tests. Its implementation is split into core constants, runtime
loading, helpers, client-facing templates, and domain-specific operational
limits under `mcp/config/limits/` (files, command, jail, workspace, runtime,
audit, self-test and miscellaneous user-namespace guidance). The compatibility
exports preserve existing names such as `from mcp.config import DEFAULT_TIMEOUT`.
`client_text.py` also re-exports the old operational constants for callers that
imported them directly from that module.

### Tool module boundary

`mcp/protocol.py` imports the public registry from `mcp.tools`. Keep that
interface stable while implementation is split into focused modules under
`mcp/tool_modules/`. The compatibility facade re-exports the historical
function names, `tool_handlers`, and `tool_defs`; MCP tool names and schemas
remain unchanged.

The tool implementation modules must continue using `mcp.safepath` for
descriptor-relative filesystem access. Do not replace those operations with
plain path-based file access during refactoring.

`VERSION` at the repository/install root is the single release-version source.

### HTTP transport module boundary

`mcp.http` remains the compatibility import surface for `make_server`,
`MCPHTTPServer`, `MCPHandler`, and the existing path/body-framing helpers.
Implementation responsibilities are separated under `mcp/http_modules/`:
request handling, CORS policy, routing/framing, and threaded connection
management. Keep HTTP status codes, headers, endpoint aliases, authentication
order, body limits, and concurrency behavior stable across this boundary.

### Logging and audit module boundary

`mcp.log` remains the compatibility import surface for event logging and
command-audit helpers. Implementation is split into event records, safe text
formatting, audit-file storage/rotation, and tool-call audit policy under
`mcp/log_modules/`. Preserve the existing redaction rules, file mode, rotation
behavior, lock protection, and best-effort logging semantics. Logging failures
must not turn a successful tool call into a failed call.


### Standalone API boundary (Phase 2)

`api/server.py` is a separate process entry point and `api/http.py` owns an
independent HTTP listener. The `/api` service uses `api/service.py` to call
the existing `mcp.protocol.handle_tools_call` path, preserving the MCP tool
registry, argument validation, sandbox, safe filesystem operations and audit
behavior. It shares the validated workspace/security configuration but has
its own HTTP server and authentication rate limiter. The default API bind is
`127.0.0.1:10002`; MCP remains independently configured. Do not publish the
API through Funnel by default. See `docs/v4-phase2-api.md`.

### Storage boundary (Phase 4)

`storage/` is an opt-in persistence package backed by the Python standard
library's SQLite implementation. It owns schema versioning, short-lived
connections, namespaced records and the `StorageConfig` environment boundary.
`AI_STORAGE_PATH` must be explicitly set before a caller can obtain a database;
`Database.initialize()` is a separate explicit step. Importing the package or
starting the MCP/API server does not read storage configuration or create a
database. Only future application-level memory/RAG services may receive a
configured database dependency. MCP tools, API handlers and generic workspace
commands have no direct storage access. Backup retention is an operator policy,
not an automatic background job. See `docs/v4-phase4.2-storage-configuration.md`.

### RAG ingestion boundary (Phase 5.0)

`rag/` extracts UTF-8 text from TXT, Markdown and HTML inputs, normalizes
content, creates source/content identifiers and chunks text with source offsets
and metadata. `RAGStore` persists documents and chunks in dedicated SQLite
namespaces through an explicitly initialized `storage.Database`. Saving and
chunk replacement are transactional; same-source updates retain a stable ID,
and identical content hashes from another source are deduplicated.
`RAGStore.initialize_search()` explicitly builds an optional FTS5 index;
`search()` returns ranked matching chunks with document/source metadata and
uses a parameterized SQLite LIKE fallback when the index is not initialized or
FTS5 is unavailable. Search supports exact source/document filters, bounded
query-centred snippets, optional best-match-per-document deduplication and an
inclusive BM25 score ceiling when FTS5 is active. The result contract keeps the
full chunk text and exposes an optional score. `EmbeddingProvider` defines an
explicit provider/model identity and batch embedding method without bundling a
vendor SDK or default network client. `index_embeddings()` validates vectors
and persists one vector per chunk in the `rag.embeddings` namespace;
`search_semantic()` embeds a query and performs exact cosine-similarity ranking
against matching provider/model vectors. Scores are higher-is-better in [-1, 1].
Embedding generation is called only by explicit application code, outside the
SQLite transaction; a content/chunk fingerprint check prevents stale vectors
from being committed after a concurrent document change. Changed or re-chunked
documents invalidate their old vectors, while unchanged chunks preserve them.
The current implementation scans stored vectors in process and is intended for
small corpora, not large-scale approximate-nearest-neighbour search. Index
updates and deletes remain transactional. The caller supplies content and a
source label; ingestion does not read paths or access the network. This package
is not connected to MCP/API startup and exposes no public tools or endpoints.
See `docs/v4-phase5.0-rag-ingestion.md`, `docs/v4-phase5.1-rag-persistence.md`,
`docs/v4-phase5.2-rag-retrieval.md`,
`docs/v4-phase5.3-rag-retrieval-improvements.md` and
`docs/v4-phase5.4-semantic-retrieval-foundation.md`.


### Optional RAG module switches (Phase 5.5)

`rag/config.py` provides explicit `RAGConfig` and `RAGRuntime` application
boundaries. `RAGRuntime.ingest()` gates ingestion and persistence together. `AI_RAG_ENABLED` and `AI_RAG_EMBEDDINGS_ENABLED` are read only
when a caller explicitly invokes `RAGConfig.from_env()`; both default to false.
Embeddings cannot be enabled unless RAG is enabled. A disabled runtime does
not construct a `RAGStore`, touch a supplied database, initialize storage,
delete existing data or make network/model calls. Enabling RAG requires a
caller-supplied, already initialized `storage.Database`. Keyword retrieval
works with RAG enabled and embeddings disabled. Semantic indexing/search also
require the embedding switch and an explicitly supplied `EmbeddingProvider`.
These switches are an application-level gate, not MCP protocol capabilities;
the RAG package remains disconnected from MCP/API startup and exposes no new
MCP tools or API endpoints. See `docs/v4-phase5.5-optional-rag-modules.md`.


### Phase 5.6 — server startup integration

Both `mcp.server` and `api.server` explicitly call
`rag.application.initialize_application_runtime()` before binding their HTTP
listeners. With the default-off `AI_RAG_ENABLED=false`, this returns an inactive
runtime and no database; storage configuration is not consulted and no file is
created. When RAG is enabled, `AI_STORAGE_PATH` is mandatory and the selected
SQLite database is initialized during that server's startup.
`AI_RAG_EMBEDDINGS_ENABLED` remains an independent switch; enabling it does
not select, download, or contact a model. Each server retains its runtime and
database references on its own HTTP server instance. This is lifecycle wiring
only: no RAG MCP tools, API routes, cross-server singleton, or network service
was introduced.


### RAG browser dashboard (Phase 7.0)

`api/static/rag.html` is a dependency-free browser dashboard served by the
standalone API at `/rag`. It is a static shell: all RAG status and document data
are fetched from the existing PIN-authenticated `/api/rag/status` and
`/api/rag/documents` routes. The PIN is kept only in JavaScript memory for the
page lifetime; it is not written to local/session storage or sent to a third
party. Serving the shell without authentication does not expose RAG data.
The dashboard does not access SQLite directly, change server configuration,
control model/provider settings, ingest files or run searches. Those are later
GUI phases. Keep the API loopback-bound by default.


### RAG document management GUI (Phase 7.1)

The `/rag` page now supports browser-side TXT/Markdown/HTML ingestion, paginated
listing, document/chunk inspection and confirmed deletion. Uploads are decoded
as strict UTF-8 in the browser and sent to the existing authenticated ingest
route as JSON text; no server-side file path is accepted. The browser renders
all returned document content as text, not markup. Delete uses the existing
atomic store operation, which removes associated chunks, embeddings and FTS
rows. The GUI still does not access SQLite or change runtime configuration.
