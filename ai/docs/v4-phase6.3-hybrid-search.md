# Phase 6.3 — Hybrid keyword and semantic search

**Release:** v3.25

## Ranking method

Hybrid retrieval uses weighted reciprocal-rank fusion (RRF). Keyword search
(FTS5/BM25, or the existing LIKE fallback) and semantic search (cosine
similarity) each produce an ordered candidate list. The fusion score is:

`sum(normalized_channel_weight / (rrf_k + channel_rank))`

The default `rrf_k` is 60. The channel weights default to 0.5 each and are
normalized across channels that returned results. This avoids incorrectly
adding BM25 scores to cosine similarity scores, which have different scales.
The response retains the original `keyword_score` and `semantic_score`, both
channel ranks, and the combined `hybrid_score` (`score` is the combined score).

## Store/runtime API

- `RAGStore.search_hybrid(query, provider=None, limit=10, keyword_weight=0.5, semantic_weight=0.5, ...)`
- `RAGRuntime.search_hybrid(...)`
- Supports source/document filters, snippets and optional document deduplication.
- Candidate retrieval is bounded to 50 results per channel; hybrid pagination
  is bounded to an offset plus limit of 50.
- Weights must be finite, non-negative numbers and cannot both be zero.

## Fallback behavior

If no provider is supplied, embeddings are disabled, or semantic weight is zero,
hybrid mode uses keyword-only retrieval and marks each result as
`search_type=keyword_fallback`. If a configured provider is selected but model
loading or inference fails, the error is surfaced; it is not silently hidden.

## API and CLI

`GET /api/rag/search?q=network&mode=hybrid`

Optional parameters:
- `keyword_weight=0.5`
- `semantic_weight=0.5`
- Existing `limit`, `offset`, `source`, `deduplicate` and `snippet_chars`

Keyword mode remains the default. API CLI example:

`python3 -m api.client rag search "network routing" --mode hybrid --keyword-weight 0.7 --semantic-weight 0.3`

The endpoint remains PIN-authenticated under the existing API authentication
configuration. No model is downloaded at startup; the configured local model
is loaded only when semantic inference is actually requested.
