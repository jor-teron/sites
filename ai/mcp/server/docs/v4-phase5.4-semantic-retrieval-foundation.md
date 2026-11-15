# Phase 5.4 — Semantic retrieval foundation

**Release:** v3.15

**Status:** Implemented as opt-in RAG library functionality; not connected to MCP/API startup.

## Provider contract

`rag.embeddings.EmbeddingProvider` is an abstract, provider-neutral interface:

- `provider_id`: stable implementation/vendor identifier.
- `model_id`: stable model/version identifier.
- `embed(texts)`: return one numeric vector per input string, in input order.

No provider SDK, API key handling, network client, default model or test-only
production embedding provider is bundled. Applications explicitly implement
the interface and decide how credentials, batching, retries and network access
are handled.

## Vector validation

Provider output must be a list/tuple with one vector per input. Vectors must be
non-empty, finite numeric values, non-zero, consistent in dimension within a
batch and no more than 8,192 dimensions. Boolean values and NaN/infinity are
rejected. Cosine similarity is calculated without a third-party numerical
library and is bounded to [-1, 1].

## Persistence and retrieval

`RAGStore.index_embeddings(document_id, provider)` loads one document's
chunks, invokes the provider outside the database transaction, validates the
result and atomically replaces that document's stored vectors in the
`rag.embeddings` namespace. Each vector records provider/model identity,
dimension and source content hash. A content and chunk fingerprint is checked
again before commit to prevent a concurrent update from storing stale vectors.

`RAGStore.search_semantic(query, provider, limit=10, ...)` embeds the query and
ranks stored chunks by exact cosine similarity. It supports the existing source
and document filters, bounded snippets and optional per-document deduplication.
Only vectors matching the supplied provider/model identity are considered.
Semantic scores are higher-is-better; unlike BM25, they range from -1 to 1.

Updating or re-chunking a document invalidates its old vectors. Re-saving
identical chunks preserves vectors. Deleting a document also deletes its
vectors. SQLite backup/restore naturally includes the embedding records.

## Current limitations and safety boundary

Semantic retrieval currently scans all matching vectors in process. It is an
exact, small-corpus foundation, not an approximate vector index and not suited
to large collections yet. A document stores one active embedding set at a time;
re-indexing it with another provider/model replaces its previous vectors.

Embedding calls occur only when an application explicitly invokes indexing or
semantic search. This phase adds no MCP/API tool, endpoint, startup wiring,
background job, automatic ingestion, provider credentials, network permission,
LLM call or vector database dependency.

## Example

```python
from rag import EmbeddingProvider

class MyProvider(EmbeddingProvider):
    @property
    def provider_id(self):
        return "my-provider"

    @property
    def model_id(self):
        return "embedding-model-v1"

    def embed(self, texts):
        # Call your chosen local model or provider here.
        return [my_embedding_function(text) for text in texts]

store.index_embeddings(document_id, MyProvider())
results = store.search_semantic("related concept", MyProvider(), limit=5)
```
