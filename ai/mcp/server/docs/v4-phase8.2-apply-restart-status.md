# Phase 8.2 — Apply, restart and runtime status

## Apply behavior

`POST /api/rag/apply` rebuilds the API's RAG runtime from the validated
persistent settings and current process environment. It initializes a
candidate runtime first, then swaps the API server's runtime/database
references only after initialization succeeds. On failure, the previous API
runtime remains active and the API returns a conflict response with the error.

This is an in-process API apply, not an operating-system process restart. It
never signals or controls an unrelated process. The MCP server is a separate
process and reads the same persistent settings at its own startup, so the GUI
explicitly requires a separate MCP restart. Existing SQLite data is preserved
when RAG is disabled; disabling a module does not delete its database.

## Runtime status

`GET /api/rag/settings` returns saved settings, active API settings, whether the
API settings differ, and whether the settings file exists. The dashboard shows
when saved settings are pending application. A successful apply reports that
MCP still needs a restart.

## Safety

- API apply is authenticated and accepts only an empty JSON object.
- No shell command, process kill, service-manager action, or remote restart is
  exposed through the API.
- A failed candidate initialization does not replace the currently active
  runtime.
- The API and MCP remain separate processes and listeners.
