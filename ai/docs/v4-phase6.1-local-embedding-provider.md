# Phase 6.1 — First actual local embedding provider

**Release:** v3.23

## Included

- Added the optional `local` provider using Sentence Transformers.
- Default model: `sentence-transformers/all-MiniLM-L6-v2`.
- Model loading is lazy: importing RAG/provider modules does not import the
  optional SDK, load model weights or contact a model host.
- Embedding generation runs locally after the model is available.
- Output is normalized and passed through the existing vector validation.
- Added `rag/requirements-embeddings.txt`; base MCP/API installation is unchanged.
- Model loading can be restricted to cached files with `local_files_only=True`.
- Remote model code is explicitly disabled (`trust_remote_code=False`).

## Install the optional dependency

```sh
python3 -m pip install -r rag/requirements-embeddings.txt
```

The first embedding operation may download the model weights from the model
repository if they are not already cached. This is a one-time download; later
inference is local. The model is not downloaded by installation of the base
project or by starting MCP/API.

## Configuration

```sh
AI_RAG_ENABLED=true
AI_RAG_EMBEDDINGS_ENABLED=true
AI_RAG_EMBEDDING_PROVIDER=local
AI_RAG_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
```

Application code can use `create_default_registry()` and pass it to
`RAGRuntime.create_embedding_provider(registry)`. The resulting provider can
be passed to the existing `index_embeddings` and `search_semantic` methods.

## Limitations

- This release includes one local model only.
- It does not add an API endpoint, GUI, automatic indexing, or automatic
  model downloads at server startup.
- Existing documents must be explicitly indexed. Model changes require
  re-indexing with the selected model.
- The current semantic search scans stored vectors in-process; it is exact
  search, not an approximate-nearest-neighbor index.
- The optional SDK and model weights are not installed in this coding
  environment; provider behavior is covered by isolated mocked tests.
