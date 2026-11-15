# v4 Phase 1.2 — HTTP transport modularisation

## Scope

Split the monolithic `mcp/http.py` implementation into focused modules while
keeping `mcp.http` as the stable compatibility facade.

## Changes

- `mcp/http_modules/request.py`: HTTP request methods, health handling,
  authentication, body parsing, and JSON-RPC dispatch.
- `mcp/http_modules/cors.py`: origin allow-list decisions and CORS response
  headers, shared through a handler mixin.
- `mcp/http_modules/routing.py`: URL path helpers, health-path matching, and
  strict Content-Length / Transfer-Encoding framing validation.
- `mcp/http_modules/connections.py`: threaded HTTP server, bounded worker
  concurrency, and connection lifecycle.
- `mcp/http.py`: compatibility facade preserving historical public imports.

## Compatibility and safety

No endpoint, route alias, HTTP status, response header, auth order, request
body limit, JSON-RPC behavior, or concurrency limit was intentionally changed.
The existing descriptor-relative file layer and sandbox code were not touched.

## Validation

Run `python3 -m unittest discover -s mcp/tests -p 'test_*.py' -v`, Python
compilation, shell syntax checks, and `git diff --check`. The isolated test
runner blocks local TCP loopback; live HTTP and jail tests are expected to be
skipped there and must be run on the Debian host.

## Release status

No version bump, commit, or release tag. The v3.3 baseline remains unchanged.
