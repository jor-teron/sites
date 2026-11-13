# Phase 6.0 — Embedding provider architecture

**Release:** v3.22

## Purpose

Create the provider-management boundary needed for future real embedding
implementations, without installing or selecting a model in this phase.

## Included

- Added rag.providers.EmbeddingProviderRegistry for explicit provider/model
  registration, metadata listing and exact provider construction.
- Provider factories are invoked only when explicitly requested.
- Provider identity is checked against the registered provider/model pair.
- Added optional AI_RAG_EMBEDDING_PROVIDER and AI_RAG_EMBEDDING_MODEL
  configuration fields. They must be supplied together and require both RAG
  and embeddings to be enabled.
- The default registry is intentionally empty. No model, SDK, network access,
  credentials, dynamic plugin imports or optional dependencies are loaded.
- Existing provider-neutral vector validation and storage remain unchanged.

## Configuration

The future provider integration can use:

\`\`\`sh
AI_RAG_ENABLED=true
AI_RAG_EMBEDDINGS_ENABLED=true
AI_RAG_EMBEDDING_PROVIDER=local
AI_RAG_EMBEDDING_MODEL=all-MiniLM-L6-v2
\`\`\`

These identifiers describe a selection; this release does not implement that
provider or download the model. An unregistered selection cannot be constructed.

## Boundaries

- No actual embedding provider/model is included.
- No automatic provider discovery or arbitrary Python module loading.
- No model download, network request, credentials or additional dependency.
- Keyword RAG remains usable without embeddings.
- The existing MCP and API process lifecycle is unchanged.

## Validation

The provider registry tests cover empty defaults, registration, listing,
explicit construction, unknown selections, duplicate registration and
identity/type validation. Existing RAG and storage regression suites remain
part of the release checks.
