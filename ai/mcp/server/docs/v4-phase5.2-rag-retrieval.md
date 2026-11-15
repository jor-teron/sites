# Phase 5.2 — RAG chunk retrieval

**Release:** v3.13  
**Status:** Implemented in `rag/store.py`; not connected to MCP/API startup.

## Search behavior

`RAGStore.search(query, limit=10)` searches stored chunks. All alphanumeric
query terms must occur in a matching chunk. The result includes document ID,
chunk index, chunk text, source offsets, source label, title, content type and
score. `limit` is an integer from 1 through 50. Empty/punctuation-only queries
and invalid limits are rejected.

When the FTS5 index exists, search uses SQLite FTS5 and BM25 ranking (lower
scores are better). Otherwise it uses parameterized `LIKE` conditions over
stored chunk records. The fallback is portable but slower and returns `score`
as `None`; result order is deterministic by chunk key rather than relevance.

## Explicit index lifecycle

Call `store.initialize_search()` after creating the RAGStore to create or
rebuild the optional FTS5 index. It returns `True` when FTS5 is available and
index creation succeeds, or `False` when the SQLite build lacks FTS5. Search
works in either case. Constructing RAGStore does not modify the database.

After the index exists, `save()` and `delete()` maintain it inside the same
transaction as document/chunk changes. Re-running `initialize_search()`
rebuilds it from persisted chunks. Existing backups include the FTS virtual
table; restoring a database preserves the index.

## Example

```python
from rag import RAGStore

store = RAGStore(database)  # database was explicitly initialized
fts5_available = store.initialize_search()
results = store.search("network security", limit=5)
for result in results:
    print(result["source"], result["title"], result["text"])
```

## Boundaries

This is lexical keyword search, not semantic search. There are no embeddings,
vector indexes, reranking, LLM calls, automatic background indexing, MCP tools
or API endpoints. The FTS index is an acceleration/index structure only; the
canonical document and chunk data remains in the namespaced records table.


Phase 5.3 extends this interface with filters, snippets, optional per-document
deduplication and an FTS5 BM25 score ceiling. See
`docs/v4-phase5.3-rag-retrieval-improvements.md`.
