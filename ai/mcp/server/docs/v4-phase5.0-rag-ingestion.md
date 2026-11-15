# Phase 5.0 — RAG ingestion foundation

**Release:** v3.11  
**Status:** Implemented; persistence is added separately in Phase 5.1.

## Included

- `rag/extract.py`: UTF-8 text extraction for `.txt`, `.md`/`.markdown` and
  `.html`/`.htm`; HTML scripts, styles, templates and SVG content are omitted.
- `rag/chunk.py`: deterministic character-based chunking with configurable
  size and overlap, preferring paragraph and sentence boundaries. Each chunk
  records its index and offsets in normalized source text.
- `rag/ingest.py`: composes extraction and chunking and produces document
  metadata, a SHA-256 content digest, stable source-based document ID, timestamp,
  title, source label and chunk collection.
- Input is limited to 5 MiB and must be valid UTF-8. Empty documents, NUL bytes
  and unsupported formats are rejected.
- No external packages, filesystem reads or network requests. SQLite persistence
  is provided separately by `rag/store.py` (Phase 5.1), not by this pipeline.

## Usage

```python
from rag import ingest_document

document = ingest_document(
    "notes/guide.md",
    "# Guide\n\nThe document text goes here.",
    chunk_size=1200,
    overlap=150,
)

print(document.metadata)
for chunk in document.chunks:
    print(chunk.index, chunk.start_char, chunk.end_char, chunk.text)
```

`source` is a descriptive, stable identifier supplied by the caller; it is
never opened as a path. The document ID is derived from this source label, so
new content for the same source can update the same stored document. The
separate content SHA-256 identifies exact normalized content. Pass content as
a Python string or UTF-8 bytes.

## Deliberate exclusions

This phase does not include PDF/DOCX extraction, OCR, directory crawling,
watchers, embeddings, vector indexes, retrieval, reranking, LLM calls, MCP
tools or API endpoints. Chunk sizes are measured in characters, not model
tokens. Persistence is a separate explicit repository described in
`docs/v4-phase5.1-rag-persistence.md`.

## Validation

`python3 -m unittest rag.test_ingest -v` covers format extraction, HTML hidden
content, invalid/oversized input, chunk limits/overlap/offsets, deterministic
identity and metadata.
