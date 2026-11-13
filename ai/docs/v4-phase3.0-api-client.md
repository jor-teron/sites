# Phase 3.0 — minimal API command-line client

**Status:** implemented and included in release v3.4.

## Goal

Provide a small client that lets a user or script call the independent HTTP API
without writing HTTP requests by hand. Keep it manageable and dependency-free.

## Files

- `api/client.py` — reusable `APIClient` plus `python3 -m api.client` CLI.
- `api/test_client.py` — client request and CLI tests.

## Commands

```sh
python3 -m api.client health
API_PIN='your-pin' python3 -m api.client tools
API_PIN='your-pin' python3 -m api.client call list_dir --arguments '{"path":"."}'
```

The CLI supports:

- `health` — public health endpoint.
- `tools` — authenticated tool/schema listing.
- `call TOOL` — authenticated tool call with a JSON object supplied through
  `--arguments`.

## Configuration and safety

- Base URL: `--url` or `API_URL`; default is
  `http://127.0.0.1:10002`.
- PIN: `API_PIN` or `--pin-file`; PINs are never placed in URL paths.
- Timeout: `--timeout`, default 15 seconds.
- Uses Python standard-library `urllib`; no third-party dependency.
- Prints JSON to stdout and errors to stderr; non-zero exit status on failure.
- Does not start, stop, or reconfigure either server.
- Does not change API authentication, endpoints, MCP port 10001, or Funnel setup.

For safety, avoid passing a PIN as a command-line argument because process
arguments can be visible to other local users. Prefer a protected environment
or a PIN file readable only by the service user.

## Validation

- API service tests: **4 passed**.
- New API client tests: **6 passed**.
- Existing MCP suite: **173 passed, 45 skipped** (loopback/live jail network
  tests are unavailable in the isolated environment).
- API HTTP integration suite: **16 skipped** because local TCP loopback is
  blocked in this environment.
- Python compileall, client help/argument smoke checks, shell syntax, and
  `git diff --check`: passed.
- Real API HTTP connectivity still requires validation on the Debian host.
