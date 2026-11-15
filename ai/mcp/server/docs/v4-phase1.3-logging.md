# v4 Phase 1.3 — Logging and audit modularisation

## Scope

Split `mcp/log.py` into focused implementation modules while preserving the
historical `mcp.log` import surface.

## Changes

- `mcp/log_modules/events.py`: timestamp generation and JSON-lines event log.
- `mcp/log_modules/formatting.py`: safe escaping and human-readable audit line
  formatting.
- `mcp/log_modules/storage.py`: synchronized append, file permissions and
  audit-log rotation.
- `mcp/log_modules/commands.py`: tool-call audit policy and command/path
  field selection.
- `mcp/log.py`: compatibility facade re-exporting the historical helpers.

## Compatibility and safety

Function implementations were moved without intentional behavior changes.
The existing audit format, redaction behavior, 0600 file mode, rotation rules,
thread lock, and best-effort error handling are preserved. No secrets or file
contents are added to audit records. `protocol.py` and the HTTP request handler
continue importing from the stable facade.

## Validation

Run the full unittest suite, Python compilation, shell syntax checks, and
`git diff --check`. Live HTTP and jail tests may be skipped in an isolated
runner that blocks local TCP loopback; validate those on the Debian host.

## Release status

No version bump or release tag. This phase is committed separately while the
v3.3 baseline version remains unchanged.
