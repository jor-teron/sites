# Project Progress — MCP, API and RAG

**Progress snapshot:** 13 November 2026  
**Latest software feature release:** v3.32

**Latest documentation snapshot:** v3.34
**Status:** Planned feature roadmap complete; host verification remains.

This document records the work completed during the development session, the
architecture now in place, the tests run, and the small amount of work still
needed on the Debian host. It is intended as a handover and a record of the
long build-out—not a new feature roadmap.

---

## 1. Where we finished

The project now has three distinct but cooperating parts:

1. **MCP server** — the original tool server, kept modular, listening on port
   `10001`.
2. **HTTP API server** — a separate process and listener on port `10002`, with
   its own client-facing API and authenticated RAG endpoints.
3. **RAG subsystem** — a reusable retrieval runtime used by the API and MCP
   application startup, with ingestion, SQLite persistence, keyword search,
   optional embeddings, semantic retrieval, hybrid search, CLI and browser UI.

The Phase 8 feature work is finished. The final feature release is **v3.32**.
No Phase 9 is currently planned. The next meaningful activity is verification
on the actual Debian machine, not another round of feature development.

## 2. Release and phase history

### Foundation and MCP/API work — Phases 0–4.2

These phases established the project structure and the independent API before
RAG was started. The detailed phase notes live under `docs/v4-phase*.md`.

#### Phase 0 — baseline audit (v3.3 baseline)

- Audited the existing Python 3.8+ MCP implementation, its entry points,
  configuration, tests, security boundaries and deployment assumptions.
- Recorded the original responsibilities of startup, HTTP transport, JSON-RPC,
  tool operations, authentication, safe filesystem access, workspace isolation,
  audit logging, configuration and diagnostics.
- Established compatibility requirements: preserve MCP endpoints, tool names,
  schemas, result shapes, PIN behavior, rate limiting, URL redaction, installer
  behavior and the single `VERSION` source.
- Identified the need for an independently startable API process; the existing
  `README-api.md` was only a parked design note at that point.
- Set architectural boundaries for future `api/`, `storage/`, `rag/` and
  `memory/` packages without prematurely creating empty subsystems.
- Audit-only phase: no production code, version, release metadata or commit was
  changed. Baseline MCP suite: 162 tests run, 45 environment-dependent skips.

#### Phase 1 — MCP modularisation (1.0–1.3)

- **1.0, tool layer:** decomposed the former mixed-responsibility
  `mcp/tools.py` into `mcp/tool_modules/common.py`, `command.py` and `files.py`.
  Kept `mcp.tools` as the public facade and preserved all seven tool names,
  schemas, result shapes, descriptor-relative filesystem operations and the
  existing command sandbox.
- **1.1, configuration:** reorganised configuration into focused modules for
  constants, loading, helpers, client settings/text and domain-specific limits
  (`mcp/config/limits/`). Preserved `mcp.config` and legacy
  `mcp.config.client_text` imports. Verified all 130 operational constant
  expressions remained unchanged.
- **1.2, HTTP transport:** split request handling, CORS, routing/framing and
  connection management into `mcp/http_modules/`; retained `mcp.http` as the
  compatibility facade. Preserved routes, status/header behavior, auth order,
  body limits, JSON-RPC dispatch and bounded concurrency.
- **1.3, logging:** split event generation, formatting, storage/rotation and
  command audit policy into `mcp/log_modules/`; retained `mcp.log` imports.
  Preserved JSON-lines audit format, redaction, 0600 permissions, rotation,
  locking and best-effort error handling.
- Security-sensitive jail, sandbox and safe-path implementations were not
  casually rewritten. The refactor was deliberately incremental and
  compatibility-led.
- Phase 1 validation progressed from 165 to 168 tests; 45 loopback-dependent
  tests remained skipped in the isolated runner. No version bump was made for
  these modularisation commits; v3.3 remained the baseline.

#### Phase 2 — standalone HTTP API (2.0–2.2)

- Added a separately startable API package and process:
  `python3 -m api.server`, defaulting to `127.0.0.1:10002`; MCP remained its
  own process on port `10001`.
- Added `/api/health` (public), `/api/tools` (PIN-authenticated) and
  `/api/tools/call` (PIN-authenticated). API tool calls reuse the existing MCP
  tool execution path rather than duplicating tool implementations, preserving
  sandboxing, argument checks and audit behavior.
- Kept API and MCP listeners/lifecycles separate. Added independent listener
  coexistence tests and real HTTP handler/integration coverage.
- Hardened API transport with consistent JSON errors and stable error codes;
  strict method handling (`405`/`Allow`, bodyless `HEAD`); required JSON media
  type and bounded, valid content length; rejected unsupported transfer
  encodings, incomplete bodies, duplicate JSON keys, non-standard constants,
  unknown envelope fields and invalid tool-call shapes.
- Added `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and
  restricted CORS methods to those implemented. Default bind stayed loopback;
  no public proxy or Funnel exposure was introduced.
- API service/listener tests passed. Live HTTP integration tests were retained
  but skipped in the isolated environment because local TCP loopback is blocked;
  those require Debian-host verification.
- Phase 2 was an incremental foundation on v3.3; no release version bump was
  made during these steps.

#### Phase 3 — API client (3.0–3.1)

- **3.0, v3.4:** added reusable `APIClient` and dependency-free
  `python3 -m api.client` commands: `health`, authenticated `tools`, and
  authenticated `call TOOL --arguments '{...}'`.
- Client configuration supports `--url`/`API_URL`, `API_PIN` or a protected
  PIN file, and a configurable timeout. Uses standard-library `urllib`; emits
  JSON to stdout, errors to stderr, and non-zero status on failure. It does not
  start, stop or reconfigure either server.
- **3.1, verification preparation:** added an explicit end-to-end Debian-host
  checklist for API health, authenticated discovery, a harmless read-only tool
  call, wrong-PIN rejection and confirmation that MCP remains independent.
  Automated client tests cover URL/PIN handling, PIN-file failure, timeout,
  connection failure and invalid JSON without requiring live networking.
- The actual live Debian-host client/server verification remains pending; the
  checklist is preparation, not a claim that host tests passed.

#### Phase 4 — SQLite storage foundation (4.0–4.2)

- **4.0, v3.6:** introduced `storage/`, a standalone SQLite library using the
  Python standard library. It requires an explicit database path and is not
  automatically initialized by MCP/API startup. Added schema migration
  tracking and an initial generic `records` table keyed by namespace and key.
- Storage connections enable foreign keys, disable trusted schema, use a
  bounded busy timeout and perform writes in `BEGIN IMMEDIATE` transactions.
  Database files use mode 0600; owner-only parent directories are created as
  needed. Symlink/non-regular database paths and unsafe namespace/key
  identifiers are rejected.
- **4.1, v3.7:** added SQLite `integrity_check()`, online consistent backup,
  validated restore through a temporary database and atomic replacement,
  corrupt-backup rejection, protected backup files, rollback and concurrent
  writer coverage.
- **4.2, v3.8:** added opt-in `StorageConfig.from_env()` with `AI_STORAGE_PATH`,
  optional `AI_STORAGE_BACKUP_DIR` and bounded `AI_STORAGE_TIMEOUT`. Merely
  reading config or obtaining a database object creates no files; initialization
  remains an explicit caller action.
- Defined access boundaries: storage mechanics belong in `storage/`; future
  memory/RAG services should receive a configured database dependency; MCP/API
  transport handlers and generic workspace/command tools do not get direct
  database access. Backups are explicit, not scheduled automatically.
- These phases created the reusable storage foundation but did not yet connect
  it to server startup or implement memory/RAG. Those integrations came later.

### RAG foundation — Phase 5

| Release | Work completed |
|---|---|
| 5.0 · v3.11 | TXT, Markdown and HTML ingestion and chunking. |
| 5.1 · v3.12 | Persistent document and chunk storage in SQLite. |
| 5.2 · v3.13 | FTS5 keyword search with a LIKE fallback. |
| 5.3 · v3.14 | Source/document filters, snippets, deduplication and score handling. |
| 5.4 · v3.15 | Embedding interface, cosine similarity, vector storage and semantic-search foundation. |
| 5.5 · v3.16 | Optional RAG and embedding feature switches. |
| 5.6 · v3.17 | Application-startup integration for MCP and API, with separate runtime instances and explicit storage path. |
| 5.7 · v3.18 | Local RAG CLI: `./rag.sh status`, `ingest`, `list`, `search`, `show` and `delete`. |
| 5.8 · v3.19 | Authenticated RAG HTTP API for status, ingest, documents, search and delete. |
| 5.9 · v3.20 | API pagination and search controls. |
| 5.10 · v3.21 | API client CLI: `python3 -m api.client rag ...`. |

### Provider and retrieval work — Phase 6

| Release | Work completed |
|---|---|
| 6.0 · v3.22 | Embedding-provider registry architecture. |
| 6.1 · v3.23 | Optional local Sentence Transformers provider using `sentence-transformers/all-MiniLM-L6-v2`; lazy loading and optional dependencies. |
| 6.2 · v3.24 | Vector indexing and coverage tracking, including indexing missing or stale embeddings. |
| 6.3 · v3.25 | Weighted hybrid keyword/semantic retrieval using Reciprocal Rank Fusion (RRF), with keyword fallback when semantic retrieval is unavailable. |

### Browser interface — Phase 7

| Release | Work completed |
|---|---|
| 7.0 · v3.26 | Browser dashboard at `/rag`, using the authenticated API. |
| 7.1 · v3.27 | TXT/Markdown/HTML upload, document listing, document/chunk inspection and confirmed deletion. Upload limit: 5 MiB. |
| 7.2 · v3.29 | Keyword/hybrid search UI, source filter, deduplication, snippets, scores, pagination and links to document inspection. |

### Final configuration work — Phase 8

| Release | Work completed |
|---|---|
| 8.0 · v3.30 | Persistent, validated RAG settings; atomic writes; owner-only permissions; authenticated settings API. |
| 8.1 · v3.31 | Dashboard controls for RAG, embeddings, and the existing local provider/model. |
| 8.2 · v3.32 | Safe API runtime apply, saved-versus-active status, failure handling and explicit separate MCP restart guidance. |

## 3. Final Phase 8 behavior

### Persistent configuration

Default settings file:

```text
~/.config/ai-mcp/rag.json
```

Optional override:

```text
AI_RAG_CONFIG_PATH=/path/to/rag.json
```

The file stores only these existing configuration values:

- `enabled`
- `embeddings_enabled`
- `embedding_provider`
- `embedding_model`

The settings directory is created with owner-only permissions (`0700`) and the
settings file is written atomically with owner-only permissions (`0600`). The
settings file does not contain the API PIN or other credentials. Invalid or
corrupt persisted settings fail closed instead of silently resetting.

If no settings file exists, the existing environment configuration remains
the source of defaults.

### Authenticated settings API

- `GET /api/rag/settings` reads saved settings and reports the active API
  settings and whether an apply is pending.
- `POST /api/rag/settings` validates and persists settings. Saving alone does
  not change the running runtime.
- `POST /api/rag/apply` builds a candidate API RAG runtime and swaps it into
  service only after successful initialization.

If initialization fails, the previous API runtime remains active. The apply
endpoint does not execute shell commands, kill processes, or control a service
manager.

### Dashboard

The `/rag` dashboard can:

- Enable or disable RAG.
- Enable or disable embeddings (the UI prevents embeddings being enabled while
  RAG is disabled).
- Select the existing `local` provider and its supported model.
- Save settings and apply them to the API runtime.
- Show whether saved settings differ from the active API runtime.

The browser uses the authenticated API. It does not read SQLite or server
configuration files directly. The API PIN remains in page memory only.

### Important process distinction

The MCP server and API server are separate processes. Applying settings through
the dashboard updates the API process only. **The MCP process must be
restarted separately** to load the same persisted settings. No remote MCP
restart control was added deliberately.

If RAG is enabled, `AI_STORAGE_PATH` must be configured for both services so
they use the intended storage location.

## 4. Architecture and ownership

The duplication audit found no second RAG engine, database, embedding pipeline
or search implementation. The browser and API are interfaces over the existing
RAG runtime and storage layer.

| Area | Main location | Responsibility |
|---|---|---|
| MCP server | `mcp.server` | MCP protocol and tools; port `10001`. |
| API server | `api.server` / `api.http` | Separate authenticated HTTP API; default port `10002`. |
| API RAG adapter | `api/rag_service.py` | HTTP-facing operations over the shared RAG components. |
| RAG configuration/runtime | `rag/config.py`, `rag/application.py`, `rag/settings.py` | Runtime configuration, startup and persistent settings. |
| RAG store | `rag/store.py` | Document, chunk and retrieval storage. |
| Embeddings/providers | `rag/providers.py`, `rag/embeddings.py`, `rag/local_embeddings.py` | Provider interface and optional local embedding implementation. |
| SQLite storage | `storage/database.py` | Database lifecycle and storage primitives. |
| Local RAG CLI | `rag/cli.py` | Local command-line operations. |
| API client | `api/client.py` | Remote API access from a client/CLI. |
| Browser dashboard | `api/static/rag.html` | Browser UI through the API; no direct database access. |

The MCP and API servers intentionally remain separate processes and ports.
The local CLI and remote API client also intentionally serve different access
paths; they are not duplicate RAG engines.

## 5. Regression and checks

Latest full regression run before the v3.32 commit:

| Test group | Run | Passed | Skipped |
|---|---:|---:|---:|
| RAG, storage and API | 209 | 182 | 27 |
| MCP | 173 | 128 | 45 |
| **Total** | **382** | **310** | **72** |

Also passed:

- Python compilation for `rag`, `api`, `mcp` and `storage`.
- Shell syntax checks for `install.sh` and `mcp.sh`.
- `git diff --check`.

Skipped tests are environment-dependent; they are not counted as passed.

## 6. Still to verify on the Debian host

The coding sandbox has restrictions that prevent several real-host checks.
These are verification tasks, not additional feature phases:

1. Install the optional local embedding dependencies if semantic search is
   wanted:
   `python3 -m pip install -r rag/requirements-embeddings.txt`
2. Configure `AI_STORAGE_PATH` consistently for the MCP and API processes.
3. Set the intended RAG/embedding environment defaults, or save the settings
   through `/rag`.
4. Start/restart the API and MCP processes separately.
5. Open `/rag` in a real browser and verify settings load, save, apply, search,
   upload and document inspection.
6. If local embeddings are enabled, verify the first model load/download and
   a real embedding/index/search cycle on the Debian machine.
7. Confirm the API and MCP processes report the expected runtime settings.

Not verified in the coding sandbox:

- Real browser JavaScript execution.
- Live loopback HTTP integration; local TCP connections are blocked there.
- Actual Debian process/service restart behavior.
- Actual Sentence Transformers model inference and model download.

## 7. Repository and commit record

The final three feature commits are:

```text
d19d552 release: v3.32 RAG apply and runtime status
fa9db55 release: v3.31 RAG settings GUI
1151bf5 release: v3.30 persistent RAG settings
```

The preceding search GUI release was:

```text
687970c release: v3.29 RAG search GUI integration
```

The progress document was expanded and committed as a documentation-only
update after the initial snapshot. The latest documentation commit is recorded
in Git history; it does not change the v3.32 feature finish line.

The only pre-existing untracked repository file is `README-api.md`; it remains
intentionally untouched.

## 8. Finish line

**Feature roadmap: complete through Phase 8.2.**

No Phase 9 is planned. Do not add another provider, another RAG engine, a new
search implementation, a second database, or an automatic process manager as
part of this completed scope. First verify the existing system on the Debian
host. Only a concrete problem discovered during that verification should
justify further code changes.

Take a break. This is a substantial amount of work, and the project now has a
clear finish line.
