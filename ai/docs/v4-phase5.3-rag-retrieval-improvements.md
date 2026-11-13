# Phase 5.3 — RAG retrieval improvements

**Release:** v3.14

**Status:** Implemented in `rag/store.py`; not connected to MCP/API startup.

## Search interface

`RAGStore.search(query, limit=10, *, source=None, document_id=None,
max_score=None, snippet_chars=240, deduplicate=False)` retains the original
keyword query and result shape, with additional optional controls:

- `source`: exact source-label filter.
- `document_id`: exact document-ID filter (validated as a SHA-256 identifier).
- `snippet_chars`: excerpt length, from 40 through 1,000 characters. The
  snippet is centred near the earliest query-term occurrence; full `text`
  remains in every result.
- `deduplicate`: when true, keep one matching chunk per document. With FTS5,
  this is the best BM25-ranked chunk; with LIKE fallback, it is the first
  deterministic chunk-key match. Up to 500 candidate chunks are examined
  before applying the final result limit, keeping this operation bounded.
- `max_score`: inclusive BM25 score ceiling (lower BM25 scores are better).
  This option requires an initialized FTS5 index. It is rejected rather than
  silently ignored when only the LIKE fallback is available.

FTS5 results are ordered by BM25 score, then document ID and chunk index for
stable ties. The LIKE fallback keeps deterministic chunk-key ordering and
returns `score: None`; it supports source/document filters, snippets and
per-document deduplication, but cannot apply a relevance threshold. Since
LIKE has no relevance ranking, deduplication keeps the first matching chunk
in deterministic chunk-key order.

## Result contract and future backends

Results retain `document_id`, `chunk_index`, full `text`, source offsets,
`source`, `title`, `content_type` and optional `score`; they now also include a
bounded `snippet`. Search options are backend-neutral except `max_score`,
which explicitly represents an FTS5/BM25 threshold. A future semantic backend
can implement the same result fields while defining its own score policy.
No embedding model, vector index, reranker, LLM call, server integration or
public MCP/API endpoint is introduced in this phase.

## Example

```python
results = store.search(
    "network security",
    limit=5,
    source="handbook/network.md",
    snippet_chars=180,
    deduplicate=True,
)
for result in results:
    print(result["source"], result["snippet"], result["score"])
```

The database remains explicitly initialized by the caller, and search-index
creation remains an explicit `initialize_search()` operation.


Phase 5.4 adds the opt-in provider contract and exact cosine-similarity search.
See `docs/v4-phase5.4-semantic-retrieval-foundation.md`.
