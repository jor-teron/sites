# Phase 8.0 — Persistent RAG settings

## Scope

Persist only the existing RAG feature configuration: `enabled`,
`embeddings_enabled`, `embedding_provider`, and `embedding_model`. No new RAG
runtime, provider, database, model, or credential store is introduced.

## Storage

- Default file: `~/.config/ai-mcp/rag.json` for the service account.
- Override: `AI_RAG_CONFIG_PATH`.
- Parent directory is created with owner-only permissions (`0700`); settings
  file is written atomically with owner-only permissions (`0600`).
- The file contains no API PIN, MCP credentials, tokens, or secrets.
- Invalid JSON or invalid combinations fail closed at startup; settings are
  never silently reset.
- If no file exists, existing environment configuration remains the fallback.

## API

Both routes require the existing API authentication:

- `GET /api/rag/settings` returns validated settings and whether they are
  persisted.
- `POST /api/rag/settings` validates and atomically saves the supplied settings.
  The response includes `restart_required: true`; the running runtime is not
  changed by saving.

The settings object accepts only the four fields above. Embeddings require RAG;
provider and model must be selected together and require embeddings to be on.

## Validation

Unit tests cover round-trip persistence, file/directory permissions, missing
files, corrupt JSON, invalid combinations, unknown keys and secret exclusion.
