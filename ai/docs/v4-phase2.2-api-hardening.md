# Phase 2.2 — API transport hardening

**Status:** implemented; no release version bump or commit performed.

## Changes

- API errors now use a consistent JSON shape with `ok: false`, a human-readable `error`, and a stable machine-readable `code`.
- Parser-level HTTP errors are JSON rather than the default HTML response.
- Unsupported methods return `405` with an `Allow` header. `HEAD` mirrors `GET` without sending a response body.
- Tool calls require `Content-Type: application/json` and a valid, bounded `Content-Length`; unsupported transfer encodings and incomplete bodies are rejected.
- JSON parsing rejects duplicate object keys and non-standard constants such as `NaN` and `Infinity`.
- The request envelope accepts only `name` and optional `arguments`; tool names must be non-empty and trimmed, and arguments must be an object.
- Responses include `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- CORS advertises only the implemented methods (`GET`, `HEAD`, `POST`, `OPTIONS`).

## Compatibility

- Existing endpoint paths, PIN authentication, default loopback bind (`127.0.0.1:10002`), shared MCP tool execution path, and MCP listener remain unchanged.
- Successful tool-call response shape is unchanged. Error responses retain the `error` string and add `ok` and `code` fields.
- No public proxy or Tailscale Funnel exposure was added.

## Validation

- API service/listener tests: **4 passed**.
- API live HTTP integration tests: **16 skipped** because this isolated environment blocks local TCP loopback. The additional tests cover media type, duplicate JSON keys, unknown fields, method handling, and `HEAD`.
- Real HTTP behavior on the Debian host remains unverified while the machine is unavailable.
