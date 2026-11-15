# Phase 2 — standalone HTTP API foundation

**Status:** implemented as an incremental v4 foundation; release version remains v3.3.

## Service layout

- MCP: existing `python3 -m mcp.server`, configured by `mcp.conf`, currently bound to `127.0.0.1:10001` in this deployment.
- API: independent `python3 -m api.server` process, default bind `127.0.0.1:10002`.
- API path prefix: `/api`; no versioned prefix for now.
- Both services use the same validated workspace/security configuration, PIN authentication setting, MCP tool implementations, and audit path. The API has its own HTTP listener and per-process authentication rate limiter.

## Endpoints

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | API process health |
| GET | `/api/tools` | PIN | List available tools and schemas |
| POST | `/api/tools/call` | PIN | Execute one tool |

Example request:

```sh
curl -s http://127.0.0.1:10002/api/tools/call \
  -H 'Authorization: Bearer YOUR_PIN' \
  -H 'Content-Type: application/json' \
  -d '{"name":"list_dir","arguments":{"path":"."}}'
```

## Boundaries and safeguards

- The API is not mounted inside the MCP HTTP handler and does not share its listener or process lifecycle.
- The API calls the existing MCP `handle_tools_call` path. This preserves registered tool names, argument checks, sandboxed command execution, descriptor-relative file operations, and audit logging.
- PIN checks use the shared constant-time comparison and per-IP lockout implementation. API authentication accepts headers; it does not accept PINs in URL paths.
- Request bodies use the existing configured maximum size; worker concurrency is bounded using the shared HTTP limits.
- CORS allows only configured `CORS_ORIGINS`; health remains public for process monitoring.
- Default API bind is loopback. Do not expose it through Funnel or a public proxy until deployment security is reviewed.
- API authentication currently follows the shared `AUTH` / `MCP_AUTH` setting. API-specific credentials and rate-limit state are future work only if needed.

## Start

```sh
API_HOST=127.0.0.1 API_PORT=10002 python3 -m api.server
```

The existing `mcp.sh` and MCP port are unchanged. Stop the API by sending SIGINT/SIGTERM to its process.

## Validation

- API service tests: **3 passed** (shared registry discovery, write/read through the shared tool path, and unknown-tool handling).
- Existing MCP suite: **173 passed, 45 skipped**. All skips are HTTP tests requiring local TCP loopback, which this isolated environment blocks.
- `compileall`, shell syntax checks (`mcp.sh`, `install.sh`), and `git diff --check`: passed.
- HTTP-level live integration testing remains to be repeated on the Debian host where loopback networking is available.
