# Changelog

## v4.6 — Per-user UID in the catalog; fix multi-user jail root
- UserCfg no longer replaces the jail root with the user's home.
- Jail `/` stays the real sandbox/rootfs; cwd and file tools use `home/<user>`.
- CSV gains a required `uid` column (integer, must be >= 10000).
- Stored on `User.uid`. Not yet used by the jail drop (next step).
- CSV gains a required `uid` column (integer, must be >= 10000).
- Stored on `User.uid`. Not yet used by the jail drop (next step).

## v4.5 — Demo user and multi-user docs
- Added `users.csv.example` with the `demo` user (`read|write|run|share`).
- README notes the CSV format, URL auth, private homes, and `home/share/`.
- Existing tests already cover catalog load, auth, permission checks, and directory creation.

## v4.4 — Auto-create private homes and share
- `home/share/` is created (mode 0777) at startup if missing.
- On first successful multi-user login, `home/<username>/` is created (mode 0700) if missing.

## v4.3 — Per-user home and permission checks
- When a multi-user login succeeds, file tools and `run_command` use that user's home (`<root>/<user.home>`) as root/cwd.
- Tool calls are checked against the user's `perms` flags (`read`, `write`, `run`). Missing flag returns a permission-denied tool error.
- Single-PIN requests are unchanged.

## v4.2 — URL auth for multi-user
- Accept `/ai/mcp/<username>/<password>` (also `/mcp/<username>/<password>`).
- On success the `User` is attached to the request handler as `mcp_user`.
- Unknown, disabled, or wrong-password paths are rejected; the original single-PIN path still works.

## v4.1 — User catalog (CSV)
- Added `mcp/users.py`: load `/home/ai/users.csv` (override with `MCP_USERS` / `USERS`).
- Columns: `username,password,home,enabled,perms`. `perms` is pipe-separated (`read|write|run|share`).
- `get_user()` rejects unknown or disabled users.
- Catalog is loaded in `Config.validate()`. No URL routing or tool permission checks yet (v4.2+).

## v3.35 — Fix install_dir path, harden ROOT, and add host-path escape regression
- Added `./mcp.sh --prepare`: one-time debootstrap of Debian minbase into `MCP_ROOT` (default `sandbox/`). Writes `.ai-mcp-rootfs` so later runs and server restarts skip it. Regular start/stop/status commands are unchanged.
- Fixed `install_dir()` in `mcp/config/helpers.py`. After the config modularisation the function was one level too deep, so the default sandbox became `<install>/mcp/sandbox` instead of `<install>/sandbox`.
- Added `root_is_unsafe()`: startup now refuses if MCP_ROOT contains the install directory or has fewer than 3 path components (e.g. `/`, `/home`, `/home/www`).
- Added a regression test that `cd /home/www/ai` and other host paths are unreachable from a namespaced command.
- Jail isolation (namespaces + pivot_root + uid drop) was verified to hold on this host; the earlier escape report is not reproducible with the corrected default root.

## v3.34 — Complete project history documentation (no runtime changes)
- Expanded `README-PROGRESS.md` with the full Phase 0–4.2 history: baseline audit, MCP modularisation, standalone API, API client and SQLite storage foundation.
- Recorded concrete module boundaries, compatibility guarantees, security behavior, release milestones and host-verification limitations.
- Preserved the Phase 5–8 history and final feature finish line; no runtime changes.


## v3.33 — Progress documentation snapshot (no runtime changes)
- Added `README-PROGRESS.md`, a consolidated record of the MCP/API/RAG work, architecture, Phase 0–8 history, final test results and remaining Debian host checks.
- Documentation-only update; the final feature implementation remains v3.32.


## v3.32 — RAG apply and runtime status (Phase 8.2)
- Added authenticated API apply that builds a candidate RAG runtime and swaps it only after successful initialization.
- Failed apply preserves the previous active API runtime and returns a clear error.
- Added active-versus-saved settings reporting and dashboard Apply-to-API control.
- Explicitly reports that the separate MCP process must be restarted independently; no remote process-control endpoint was added.
- Added apply success/failure tests and dashboard contract coverage.


## v3.31 — RAG settings GUI (Phase 8.1)
- Added dashboard controls for RAG and embedding enablement.
- Added selection of the existing local embedding provider and its supported model.
- Loaded/saved settings only through authenticated API endpoints; no browser-side file, database or secret access.
- Added dependent-control behavior and clear restart-required messaging.
- Added static dashboard contract tests; no new provider, model, endpoint or runtime.


## v3.30 — Persistent RAG settings (Phase 8.0)
- Added validated, atomic persistence for the existing RAG and embedding switches/provider selection.
- Added authenticated settings read/save API routes; saved settings take effect on the next server start.
- Used owner-only config directory/file permissions and excluded credentials/secrets.
- Preserved environment configuration as fallback when no settings file exists; corrupt persisted settings fail closed.
- Added persistence, validation, permissions and secret-exclusion tests.


## v3.29 — RAG search GUI integration (Phase 7.2)
- Added keyword/hybrid search controls to the existing browser dashboard using the existing authenticated search API.
- Added source filtering, per-document deduplication, snippets, scores, result pagination and document-detail navigation.
- Displayed keyword-only fallback explicitly when semantic search is unavailable.
- Clarified that upload ingests/chunks documents but does not automatically generate semantic embeddings.
- Added dashboard contract coverage; no new search engine, endpoint, database schema, provider or dependency.


## v3.28 — Architecture and duplication audit
- Audited repository implementation and phase history from Phase 0 through Phase 7.1.
- Documented canonical ownership of MCP, API, storage, RAG runtime, retrieval, providers and user interfaces.
- Confirmed existing API search and retrieval capabilities; Phase 7.2 is limited to GUI integration, not another search implementation.
- Recorded naming/readiness caveats and rules to prevent duplicate engines, stores, providers or configuration systems.


## v3.27 — RAG document management GUI (Phase 7.1)
- Added browser-based ingestion for TXT, Markdown and HTML files (up to 5 MB), with strict UTF-8 validation.
- Added paginated document listing, full document/chunk inspection and confirmed deletion.
- Reused the existing PIN-authenticated API and atomic storage operations; the browser does not access SQLite.
- Added document-management service tests and installer coverage for the dashboard asset.

## v3.26 — RAG dashboard foundation (Phase 7.0)
- Added a responsive browser dashboard at `/rag`, served by the standalone API process.
- Added PIN-authenticated RAG status and document overview using existing API endpoints.
- Kept the dashboard shell static and data access behind the existing authenticated API; the PIN is held only in page memory.
- Added HTTP route tests; document ingestion and search controls remain scheduled for later phases.


## v3.25 — Hybrid keyword and semantic search (Phase 6.3)
- Added weighted reciprocal-rank fusion to combine keyword and semantic retrieval without mixing BM25 and cosine score scales.
- Added configurable keyword/semantic weights, bounded candidate retrieval, filters and document deduplication.
- Added keyword-only fallback when embeddings are disabled, no provider is configured, or semantic weight is zero.
- Exposed hybrid mode and weights through the authenticated RAG API and API CLI client.
- Added regression tests for ranking, weights, fallback, filters, pagination and API selection.

## v3.24 — Bulk vector indexing and coverage (Phase 6.2)
- Added model-specific embedding coverage/status reporting for indexed, missing and stale documents/chunks.
- Added bulk indexing that indexes missing/stale documents, skips current documents, and supports explicit forced rebuilds.
- Exposed status and bulk indexing through the RAG runtime while retaining the embeddings feature gate.
- Added regression coverage for partial indexes, changed documents, model identity, skip behavior and forced re-indexing.

## v3.23 — Local embedding provider (Phase 6.1)
- Added an optional local Sentence Transformers provider using `sentence-transformers/all-MiniLM-L6-v2`.
- Added lazy model loading, normalized batch inference, actionable missing-dependency/model errors and a separate optional requirements file.
- Registered the local model in the default provider registry without importing the SDK or loading model weights at startup.
- Kept the base MCP/API install dependency-free; model weights are fetched only when embedding is first requested.

## v3.22 — Embedding provider architecture (Phase 6.0)
- Added an explicit provider/model registry with lazy factory construction and identity validation.
- Added optional provider/model selection configuration; both identifiers must be supplied together and embeddings must be enabled.
- Kept the default registry empty: no model, SDK, network access, credentials, dynamic imports or new dependency.
- Added provider-registry and configuration tests; no actual embedding provider is included yet.

## v3.21 — RAG API client CLI
- Added `python3 -m api.client rag` commands for status, file ingestion, paginated listing, keyword search, document retrieval and deletion.
- Reused the existing authenticated API endpoints and PIN configuration.
- Added local file safety checks, bounded CLI options and explicit deletion confirmation.
- Kept the API/MCP separation and keyword-only RAG architecture; no model or provider added.

## v3.20 — RAG pagination and result controls
- Added SQL-backed document pagination and total counts to the RAG API.
- Added keyword search offsets, `has_more` metadata, source filtering, per-document deduplication and configurable snippet length.
- Extended the Python API client with matching page and result controls.
- Preserved bounded deduplication and explicit offset validation.

## v3.19 — RAG HTTP API
- Added authenticated RAG status, text ingestion, document list/retrieval, keyword search and deletion endpoints to the separate API server.
- Added RAG methods to the Python API client and an HTTP contract document.
- Reused the existing RAG runtime and SQLite store; no model, embedding provider, MCP tool or network dependency added.
- RAG remains disabled by default and data routes return HTTP 503 while disabled.

## v3.18 — Local RAG command line
- Added `./rag.sh` and `python3 -m rag` entry points for local RAG management.
- Added status, single-file ingestion, document listing/showing, keyword search and confirmed deletion.
- Kept the CLI keyword-only and offline; no embedding provider, second model or listener is needed.
- Required explicit RAG enablement and storage path for data operations.
- Updated installer packaging to include the RAG and storage modules and CLI wrapper.


## v3.17 — Optional RAG application startup
- Connected the optional RAG runtime to both independent MCP and API startup paths.
- Both services keep RAG disabled by default and create no storage files in that mode.
- Enabling RAG requires an explicit `AI_STORAGE_PATH`; startup initializes only that configured database.
- Embeddings remain independently switchable and require an explicitly supplied provider at use time.
- Exposed the runtime on each server instance for future application integration; added no RAG MCP tools or API endpoints.


## v3.16 — Optional RAG modules
- Added default-off `AI_RAG_ENABLED` and `AI_RAG_EMBEDDINGS_ENABLED` switches.
- Added an explicit RAG runtime gate; keyword retrieval works without an embedding model.
- Require an initialized database and explicit embedding provider; no model, API key, SDK or second LLM is bundled.
- Disabled modules do not initialize/access storage or delete existing RAG data.
- Kept RAG disconnected from MCP/API startup and added no public tools or endpoints.


## v3.15 — Semantic retrieval foundation
- Added a provider-neutral `EmbeddingProvider` contract with no bundled SDK or default network calls.
- Added strict vector validation and stable cosine-similarity calculation.
- Added explicit per-document embedding generation and transactional SQLite vector persistence.
- Added exact semantic chunk search with provider/model isolation, filters and deterministic ranking.
- Invalidate vectors when document chunks change; preserve vectors for unchanged chunks.
- Kept semantic indexing opt-in and disconnected from MCP/API startup.


## v3.14 — RAG retrieval improvements
- Added exact source and document-ID search filters.
- Added bounded query-centred snippets while retaining complete chunk text.
- Added optional best-match-per-document deduplication.
- Added an inclusive BM25 score ceiling for FTS5 searches and deterministic tie-breaking.


## v3.13 — RAG retrieval foundation
- Added optional FTS5 index creation/rebuild and ranked chunk search.
- Added SQLite LIKE fallback when FTS5 is unavailable or not initialized.
- Kept index maintenance transactional with document updates and deletion.
- Search results include chunk text, offsets, document title and source metadata.


## v3.12 — RAG persistence
- Added transactional SQLite persistence for RAG documents and chunks.
- Added stable source-based document identity, same-source updates and content-hash deduplication.
- Added retrieval, metadata listing, content-hash lookup and atomic deletion.
- Kept persistence opt-in and disconnected from MCP/API startup.


## v3.11 — RAG ingestion foundation
- Added in-memory TXT, Markdown and HTML document extraction and normalization.
- Added bounded, overlapping character chunks with source offsets.
- Added deterministic document IDs, SHA-256 content hashes and ingestion metadata.
- Kept ingestion independent from filesystem access, SQLite, MCP and API startup.


## v3.8 — Storage configuration and access policy
- Added explicit `AI_STORAGE_*` configuration; storage remains disabled unless a database path is supplied.
- Added a configuration factory that returns an uninitialized database without creating files.
- Defined storage access boundaries and a manual backup-retention policy for future memory/RAG services.


## v3.7 — Storage reliability
- Added SQLite integrity checks and online backup support.
- Added validated restore with temporary-file staging and atomic replacement.
- Added tests for backup/restore safety, concurrent writers and transaction rollback.


## v3.6 — Storage foundation
- Added an opt-in SQLite package with schema versioning, namespaced records and transactional writes.
- Added database path safety checks and restrictive file permissions.
- Kept storage independent from MCP/API startup; no data migration or RAG ingestion.


Notable changes by release. See `docs/releases/` for release details.

## v3.5 — API integration verification preparation
- Expanded API client tests for connection failures, invalid responses, environment configuration and PIN-file errors.
- Added a Debian-host end-to-end verification checklist for health, authentication, tool discovery and a read-only tool call.
- Documented the host/network checks that remain pending; no public API exposure or server lifecycle changes.

## v3.4 — Standalone API client
- Added a dependency-free Python API client and CLI for health checks, tool listing and tool calls.
- Added configurable API URL, PIN environment/file support, timeouts and readable JSON/HTTP errors.
- Kept the API as a separate loopback-only service; MCP listener and Funnel configuration are unchanged.

## v3.3 — Verbose startup diagnostics
- Added six clearly numbered startup stages with configuration, workspace and sandbox checks.
- Added port-conflict detection, background process/health reporting, and clearer startup failures.
- Added `--quiet` to suppress progress details while retaining final status and errors.

## v3.2 — Release management
- Added a single `VERSION` source of truth for Python and shell version reporting.
- Added release notes, project documentation and a repeatable release checklist.
- Installer now copies the version and documentation files.

## v3.1 — Security and Debian validation
- Bounded authentication failure tracking to 4,096 IP records with LRU eviction.
- Used monotonic time for authentication lockout timing.
- Completed Debian 13 integration validation; 160 tests passed in Phase 5 and 162 passed after Phase 6.

## v3.0 — Filesystem hardening
- Added descriptor-relative filesystem operations for file tools.
- Hardened symlink handling for reads, writes, moves, listings and recursive deletion.
- Added FIFO/non-regular-file protections and pinned-parent atomic writes.

## v2.9 — HTTP and sandbox hardening
- Failed closed when required read-only bind remounts, resource limits or `no_new_privs` could not be applied.
- Added strict HTTP request framing validation and a request read timeout.
- Added trusted-proxy IP/CIDR allowlisting and bounded HTTP handler concurrency.

## v2.8 — Authentication toggle
- Added `MCP_AUTH=0` to disable PIN authentication for controlled testing; authentication remains enabled by default.
