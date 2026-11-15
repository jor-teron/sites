# Phase 5.7 — Local RAG command line

**Release:** v3.18

## Goal

Provide a small local software interface for using the optional RAG store.
This is a terminal CLI, not a GUI, HTTP API, MCP tool, or background service.

## Entry points

Both forms are supported:

```sh
./rag.sh status
python3 -m rag status
```

`rag.sh` is a convenience wrapper; `rag.cli` is the implementation.

## Commands

- `status`: report feature switches and whether storage is configured. It does
  not initialize SQLite or create files and works when RAG is disabled.
- `ingest FILE`: read one regular TXT, Markdown or HTML file and persist it.
  Directories are not crawled.
- `list`: list document metadata.
- `search QUERY [--limit 1..50] [--source LABEL]`: keyword search with snippets.
- `show DOCUMENT_ID`: display a stored document and its chunks.
- `delete DOCUMENT_ID --yes`: explicitly confirm deletion.

Output is JSON for easy terminal reading and future scripting. Errors are
written to stderr with a non-zero exit status.

## Configuration and safety

Data commands require all of the following explicit configuration:

```sh
AI_RAG_ENABLED=true
AI_RAG_EMBEDDINGS_ENABLED=false
AI_STORAGE_PATH=/path/to/private/rag.sqlite3
```

The CLI uses the same startup helper, storage validation and RAG runtime as
the servers. The database is initialized only for data commands after RAG is
explicitly enabled. `status` is read-only. The input file must be a regular
non-symlink file and is checked against the ingestion byte limit before read.
Deletion requires `--yes`.

Keyword search works without embeddings. No provider, model, API key, network
request, MCP listener, API listener or sub-agent is started.

## Installer

The installer now copies `rag/`, `storage/` and `rag.sh` alongside the server
code. This is necessary because both server startup and the CLI import those
modules. Existing MCP and API process boundaries are unchanged.

## Tests

`rag.test_cli` covers default-off status, disabled-operation refusal, a full
ingest/search/list/show/delete round trip, symlink input rejection and limit
validation. Temporary SQLite databases are used; no host network is required.
