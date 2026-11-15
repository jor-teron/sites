# Parked: /ai/api/ overlay

Status: parked (not in current release).

## Goal

Add a simple HTTP API in front of the existing MCP server.
Same tools, different entry point. No second service.

## Path

`/ai/api/`

## Endpoints (v1 sketch)

| Method | Path | What |
|--------|------|------|
| GET | `/ai/api/health` | Returns ok |
| POST | `/ai/api/run` | Run a shell command |
| GET | `/ai/api/read?path=` | Read a file |
| POST | `/ai/api/write` | Write a file |
| POST | `/ai/api/list` | List a directory |

## Auth

Uses the same `AUTH` flag as the MCP server.
When `AUTH=0`, no PIN is required (for testing).
When `AUTH=1`, PIN is required.

## Notes

- Reuse existing tool and auth code
- Keep the current `/mcp` JSON-RPC path unchanged
- Parked until the sandbox escape is understood and fixed
