# Phase 3.1 — API client end-to-end verification

**Status:** verification tooling and checklist prepared; live Debian-host checks
remain pending because the host is currently unavailable. No release bump or
commit has been made.

## Goal

Verify the standalone API server and CLI client together, including public
health, PIN authentication, tool discovery, a harmless read-only tool call,
and failure handling.

## Host verification

Run these commands on the Debian laptop after the API server is started as its
own process. Keep the API bound to loopback; do not expose port 10002 through
Tailscale Funnel for this test.

```sh
# Terminal 1: start the independent API process
cd /workspace/ai
API_HOST=127.0.0.1 API_PORT=10002 python3 -m api.server

# Terminal 2: public health check
cd /workspace/ai
python3 -m api.client health

# Authenticated discovery and harmless read-only call
export API_PIN='the-configured-api-pin'
python3 -m api.client tools
python3 -m api.client call list_dir --arguments '{"path":"."}'

# Confirm a wrong PIN is rejected (must return non-zero)
API_PIN='deliberately-wrong' python3 -m api.client tools
```

Expected outcomes:

- Health returns JSON identifying service `api`.
- Authenticated tool discovery returns the registered tool list.
- `list_dir` returns entries for the configured workspace root.
- Wrong PIN returns a readable HTTP 401 error and non-zero exit status.
- Ctrl-C stops only the API process; the MCP process on port 10001 remains
  independent and unaffected.

Do not use write/delete/command tools as part of this smoke test.

## Automated validation completed in the isolated environment

- API service/client unit tests run locally.
- Client URL, bearer PIN, CLI environment, PIN-file failure, timeout,
  connection failure and invalid-JSON handling are covered without network I/O.
- HTTP transport integration tests are retained for a real loopback-capable
  environment. They are expected to be skipped in the current isolated jail,
  which blocks local TCP loopback.

## Pending on the Debian host

- Start API server and run the commands above.
- Verify real HTTP health, authenticated tool listing and read-only tool call.
- Verify wrong-PIN rejection.
- Confirm MCP port 10001 remains available and unchanged.
- Record actual output and date here; do not mark these checks passed before
  they are run.

## Safety boundaries

- API default bind remains `127.0.0.1:10002`.
- MCP remains a separate process on its existing port 10001.
- Tailscale Funnel configuration is unchanged.
- No new host permissions, dependencies, or public API exposure are introduced.
