# Phase 5.8 — RAG HTTP API

**Release:** v3.19

## Purpose

Expose the existing optional RAG runtime through the independent HTTP API so a
custom web or mobile client can manage and search its local document store.
This is a keyword-only interface; it does not add an AI model, embedding
provider, MCP tools, or another server process.

## Endpoints

All endpoints use the existing API authentication configuration. With the
default authentication setting, they require the API PIN; disabling API auth
for testing also disables this protection for RAG routes.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/rag/status` | Report RAG and embedding switches |
| `POST` | `/api/rag/ingest` | Ingest one text document |
| `GET` | `/api/rag/documents` | List document metadata |
| `GET` | `/api/rag/documents/{document_id}` | Retrieve document and chunks |
| `GET` | `/api/rag/search?q=...&limit=10&source=...` | Keyword search |
| `DELETE` | `/api/rag/documents/{document_id}` | Delete document and associated chunks |

Ingest accepts a JSON object with required `source` and `content` strings and
optional `content_type` and `title` strings. It ingests text already supplied
in the request; binary or multipart file uploads are not implemented. The
existing global API request-body limit applies.

Example ingest request body:

```json
{
  "source": "notes.md",
  "title": "My notes",
  "content": "Assam has many rivers and hills."
}
```

Search example: `GET /api/rag/search?q=Assam%20rivers&limit=10`.

RAG remains disabled by default. When disabled, status reports the switches
and data operations return HTTP 503 (`rag_disabled`). Enabling RAG still
requires `AI_RAG_ENABLED=true` and an explicit `AI_STORAGE_PATH`. Embeddings
remain independently controlled and are not used by these routes.

## Boundaries

- API remains a separate process and listener from MCP.
- Existing PIN authentication, rate limiting, CORS policy and response headers
  apply; the allowed CORS methods now include `DELETE`.
- The HTTP layer delegates to a small RAG service adapter and the existing
  `RAGRuntime`; it does not access SQLite directly.
- No MCP tool registry changes, helper model, provider, external network call,
  or public Funnel route is added.

## Validation

- API unit/service/client tests cover the RAG service and client request shapes.
- HTTP integration tests are present but are skipped in environments where
  local TCP loopback is blocked.
- Real Debian-host API startup and HTTP verification remain a deployment check.
