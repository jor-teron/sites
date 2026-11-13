# Phase 6.2 — Vector indexing and semantic search improvements

**Release:** v3.24

## Included

- `RAGStore.embedding_status(provider)` reports coverage for the exact
  provider/model identity: document count, chunk count, indexed count,
  coverage ratio, and per-document `current`, `missing` or `stale` status.
- `RAGStore.index_all_embeddings(provider, force=False)` indexes missing and
  stale documents, skips current documents, and returns a final status report.
- `force=True` explicitly rebuilds every document's vectors.
- `RAGRuntime` exposes both operations and continues to enforce the RAG and
  embeddings feature switches.
- Existing content hash and chunk fingerprint checks still reject writes if a
  document changes while the model is generating vectors.
- Each document's vectors are replaced atomically after successful generation;
  a failed provider call does not commit a partial replacement.

## Model changes

Coverage is scoped to the selected provider/model identity. Selecting a new
model reports documents as missing for that model. Running bulk indexing with
that model rebuilds vectors for each document; the store replaces that
individual document's previous vector set. Existing model vectors for other
documents remain until those documents are re-indexed.

## API surface

- `RAGStore.embedding_status(provider)`
- `RAGStore.index_all_embeddings(provider, force=False)`
- `RAGRuntime.embedding_status(provider)`
- `RAGRuntime.index_all_embeddings(provider, force=False)`

No HTTP endpoint, GUI, automatic background job, approximate-nearest-neighbor
index, or automatic server-startup indexing was added in this phase.
