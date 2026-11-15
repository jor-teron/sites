# v4 Phase 0 — v3.3 Baseline Audit

**Status:** Complete
**Audit date:** 2026-11-13
**Baseline release:** v3.3
**Baseline commit:** d0a90f3 (`v3.3: add verbose startup diagnostics`)

## Purpose

Record the existing implementation, compatibility constraints, validation baseline,
and proposed refactoring boundaries before changing the v3.3 code. This phase is
audit and documentation only: no production code, runtime behavior, version,
or release metadata is changed.

## Repository snapshot

- Language: Python 3.8+
- Runtime dependencies: Python standard library (per project README)
- MCP entry point: `python3 -m mcp.server`
- Control script: `mcp.sh`
- Installer: `install.sh`
- Release source of truth: root `VERSION` (currently `3.3`)
- Tests: `mcp/tests/`
- Existing API note: `README-api.md` describes a parked API overlay, not an
  implemented independent API server.

### Existing source layout

| Area | Current files | Responsibility |
|---|---|---|
| Startup / lifecycle | `mcp/server.py`, `mcp.sh` | Load config, initialise runtime, start/stop/report server |
| HTTP transport | `mcp/http.py` | HTTP handler, request framing, health route, CORS, auth integration |
| MCP protocol | `mcp/protocol.py` | JSON-RPC dispatch, initialize, tools/list, tools/call |
| Tool operations | `mcp/tools.py` | File operations, command execution, path/cwd resolution, tool registry |
| Authentication | `mcp/auth.py` | PIN extraction/matching, URL redaction, rate limiting |
| Filesystem safety | `mcp/safepath.py` | Descriptor-relative, no-follow filesystem operations |
| Workspace | `mcp/workspace.py` | Workspace layout, git init, mount and disk-limit checks |
| Isolation | `mcp/jail.py`, `mcp/sandbox.py`, `mcp/nscompat.py` | Jail construction, namespaces, resource limits, syscall helpers |
| Audit logging | `mcp/log.py` | Audit event formatting, append/rotation, tool audit |
| Configuration | `mcp/config/` | Constants, config parsing/loading, client-facing descriptions |
| Diagnostics | `mcp/selftest.py` | Offline/live health and security checks |
| Tests | `mcp/tests/` | Unit, integration, security, shell-script and style tests |

## Baseline validation

Executed from `/workspace/ai`:

| Check | Result |
|---|---|
| `python3 -m py_compile mcp/*.py mcp/config/*.py mcp/tests/*.py` | Passed |
| `sh -n mcp.sh && bash -n mcp.sh` | Passed |
| `sh -n install.sh && bash -n install.sh` | Passed |
| `git diff --check` | Passed |
| `python3 -m unittest discover -s mcp/tests -v` | 162 tests run; OK; 45 skipped |

The 45 skips are environment-related: the Laptop MCP command environment blocks
local TCP loopback connections, so network/server and several jail integration
tests self-skip. These are **not** counted as passed. Run the complete live suite
on the Debian host before a release or after transport/isolation refactoring.

## Refactoring observations

1. **The existing code is already split by responsibility.** Preserve these
   boundaries and improve them incrementally; do not replace the implementation
   with a new framework or rewrite it in JavaScript.
2. **Large modules need careful decomposition.** Current notable sizes include
   `mcp/jail.py` (735 lines), `mcp/sandbox.py` (683), `mcp/selftest.py` (789),
   `mcp/config/client_text.py` (748), `mcp/http.py` (504),
   `mcp/config/load.py` (509), and `mcp/tools.py` (450).
   File size alone is not a reason to split: Phase 1 should identify cohesive
   responsibilities and preserve import/API compatibility.
3. **Configuration has a package boundary already.** Its wildcard re-exports
   and shared client-text/config concerns should be mapped before changing
   imports; avoid a broad import cleanup mixed into a structural refactor.
4. **Tool dispatch is a useful seam.** `protocol.py` currently imports tool
   handlers from `tools.py`; a registry can be formalised later without
   changing MCP tool names or schemas.
5. **Security-sensitive code must stay isolated and test-led.** Do not casually
   merge or move `safepath.py`, `jail.py`, `sandbox.py`, or `nscompat.py`.
   Any later change must preserve path containment, no-follow behavior,
   namespace setup, read-only mounts, resource limits and fail-closed behavior.
6. **API architecture needs an explicit correction before implementation.**
   `README-api.md` currently sketches an overlay sharing one service, while the
   user's requirement is two independent servers (MCP and API) using shared
   internal modules. Keep API parked until a separate-server design is agreed.
7. **RAG, memory, database/storage, and context management do not exist yet.**
   They should be additive modules, not dependencies pushed into the current
   MCP transport/protocol layer.

## Proposed target boundaries (not implemented)

Keep Python and the current package style:

- `mcp/`: MCP-specific entry point, transport, protocol and MCP tool adapters.
- `api/`: independent API entry point, routes and API-specific adapters (future).
- `core/`: shared configuration, logging, permissions and common errors, only
  where a real shared responsibility exists.
- `rag/`: ingestion, chunking, keyword search, optional semantic search, sources.
- `memory/`: memory storage and retrieval, separate from indexed project documents.
- `storage/`: shared persistence and schema/migrations if a database is adopted.
- `docs/`: architecture decisions, operational documentation and release notes.

The MCP and API processes should be independently startable and should call
shared internal modules. Neither server should import the other's entry point.
Do not create empty directories before the relevant phase needs them.

## Compatibility constraints for Phase 1

- Keep the current MCP endpoint and JSON-RPC behavior unchanged.
- Keep all existing tool names, argument schemas and result shapes unchanged.
- Keep PIN authentication, rate limiting, URL redaction and current config keys.
- Keep `mcp.sh`, `install.sh`, systemd service assumptions and install layout
  working; do not require a new runtime dependency.
- Keep `VERSION` as the single version source.
- Preserve the existing v3.3 baseline and user's uncommitted documentation work.
- No API server, RAG, embeddings, database or memory feature is part of Phase 1.

## Working tree at audit time

The following pre-existing changes were present and were not modified by Phase 0:

- `README.md` — modified (includes the previously documented future host
  hardware telemetry note).
- `README-api.md` — untracked.

No commit, version bump, tag, or production-code edit was made for this audit.
