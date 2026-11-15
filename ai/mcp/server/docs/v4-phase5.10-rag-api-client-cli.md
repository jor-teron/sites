# Phase 5.10 — RAG API client CLI

**Release:** v3.21

## Purpose

Make the existing RAG HTTP API usable from a terminal without writing Python
code or opening the SQLite database directly. Commands run through the API
client, so the API process remains separate from MCP and owns the RAG runtime.

## Commands

All commands below use the existing `API_URL`, `API_PIN` and `--pin-file`
configuration. The API PIN is required when API authentication is enabled.

```sh
python3 -m api.client rag status
python3 -m api.client rag ingest ./notes.md --title "Field notes"
python3 -m api.client rag list --limit 25 --offset 0
python3 -m api.client rag search "Assam rivers" --limit 10 --source notes.md
python3 -m api.client rag search "Assam rivers" --deduplicate --snippet-chars 180
python3 -m api.client rag show DOCUMENT_ID
python3 -m api.client rag delete DOCUMENT_ID --yes
```

- `status` reports the API-side RAG switches.
- `ingest` reads one regular local UTF-8 file and submits its text as JSON.
  TXT, Markdown and HTML remain the supported formats; the existing 5 MiB
  document limit applies. Symlink inputs and non-regular files are rejected.
- `list` accepts `--limit` (1–100) and `--offset` (0–100000).
- `search` accepts `--limit` (1–50), `--offset` (0–100000), `--source`,
  `--deduplicate` and `--snippet-chars` (40–1000). With deduplication,
  offset is limited to 449 by the existing bounded candidate scan.
- `show` retrieves one document and its chunks.
- `delete` requires `--yes` to avoid accidental removal.

Output remains JSON. HTTP/API errors use the existing non-zero exit behavior.

## Boundaries

- The CLI does not connect to SQLite or initialize RAG locally.
- The existing API server must be running and RAG must be enabled for data
  operations. RAG remains disabled by default.
- Existing API authentication, rate limiting and request validation apply.
- No new endpoint, MCP tool, GUI, model, embedding provider or dependency was
  added. Search remains keyword-based.

## Validation

Client CLI behavior is covered with mocked HTTP requests, including auth,
file ingestion, filters, pagination bounds and deletion confirmation. Actual
Debian-host API startup and HTTP checks remain a deployment verification.
