# Current release: v3.32

**Focus:** Apply, restart and runtime status (Phase 8.2).

## Included
- Added authenticated `POST /api/rag/apply` to initialize a candidate runtime and swap the API runtime only after success.
- Failed initialization leaves the previous API runtime active and returns a clear conflict error.
- Settings reads report saved settings, active API settings and whether an API apply is pending.
- Dashboard now saves and applies settings, and clearly requires a separate MCP process restart.
- No shell execution, process killing, service-manager integration or remote MCP restart was added.

## Validation
- RAG, storage and API tests: **209 run, 182 passed, 27 skipped**.
- MCP tests: **173 run, 128 passed, 45 skipped**.
- Combined regression: **310 passed, 72 skipped** (382 total).
- Python compilation, `sh -n install.sh`, `sh -n mcp.sh` and `git diff --check` passed.
- Loopback HTTP tests were skipped because local TCP is blocked in this coding sandbox.
- Browser JavaScript was not executed in a real browser; Debian host process restart and actual Sentence Transformers inference remain unverified.

## Versioning rule

Version identifiers are text labels, not decimals. Advance the final numeric
component by one per commit, preserving every digit: `3.31` → `3.32` → `3.33`.
Never parse a version as a floating-point number. Update `VERSION` and
current-release metadata in the same commit; leave historical release notes
unchanged.
