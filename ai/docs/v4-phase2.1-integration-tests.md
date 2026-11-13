# Phase 2.1 — API integration test coverage

**Status:** test coverage added; live socket execution is pending validation on the Debian host.

## Coverage added

- `api/test_http.py` exercises the real API HTTP handler and listener:
  - public health response and unknown routes
  - authentication required for tool discovery
  - authenticated tool listing
  - write/read tool calls through the shared MCP execution path
  - malformed JSON and invalid request shapes
  - unknown tool response
  - allowed and rejected CORS origins
- `api/tests.py` verifies that MCP and API can bind separate listeners at the same time, without requiring a client TCP connection.

## Validation in the isolated Laptop environment

- API service and listener tests: **4 passed**.
- API live HTTP integration tests: **11 skipped** because this environment blocks local TCP loopback connections. The tests are present and automatically run where loopback is available.
- Existing MCP suite: **173 passed, 45 skipped**. The skipped tests also require local TCP loopback or live jail networking.
- Python compilation: passed.
- Shell syntax (`mcp.sh`, `install.sh`): passed.
- `python3 -m api.server --help`: passed.
- `git diff --check`: passed.

## Debian host verification still required

Run from the project root on the Debian host:

```sh
python3 -m unittest api.tests api.test_http -v
python3 -m unittest discover -s mcp/tests -p 'test_*.py' -v
```

The 11 API HTTP integration tests should run rather than skip on a host that permits IPv4 loopback. Confirm the existing MCP HTTP tests also run there.

## Scope

No API routes, authentication policy, bind address, MCP listener, process lifecycle, or release version changed. No public exposure or Funnel routing was added. Version remains **v3.3**.
