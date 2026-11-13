# Phase 7.1 — RAG document management GUI

**Release:** v3.27

## Added

- Upload one local TXT, Markdown (`.md` / `.markdown`) or HTML (`.html` / `.htm`)
  file from the browser. Maximum file size is 5 MiB.
- Browser decodes file bytes as strict UTF-8 before submitting content to the
  authenticated API. Invalid UTF-8, empty files, unsupported extensions and
  oversized files are rejected with a visible message.
- Paginated document list (20 items per page) with title/source, chunk count
  and content type.
- Document detail inspection, including extracted text and chunk contents.
- Explicit confirmation before deletion. The existing store deletion removes
  the document, its chunks and associated embeddings/FTS rows atomically.

## Security and architecture

The browser does not access SQLite or the filesystem on the server. It submits
text to the existing PIN-authenticated `POST /api/rag/ingest` endpoint and uses
the existing authenticated document list/detail/delete endpoints. Document
text and filenames are rendered using DOM `textContent`, not HTML injection.
The API's existing request-body limit remains in force. The PIN remains in page
memory and is not persisted to browser storage.

## Use

Start the API server and open `http://127.0.0.1:10002/rag`. Connect with the
API PIN, choose a supported file, and select **Upload and index**. Use **View**
to inspect extracted text/chunks and **Delete** to remove a document after
confirming. RAG must be enabled in the server environment.

## Not included

Search/result inspection remains Phase 7.2. Persistent settings and GUI runtime
controls remain Phase 8.x. No automatic embedding generation is triggered by
upload; the existing RAG ingestion behavior is preserved.
