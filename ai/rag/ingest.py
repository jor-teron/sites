"""In-memory document ingestion pipeline; persistence is a later integration."""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone

from .chunk import chunk_text
from .extract import extract_text


@dataclass(frozen=True)
class IngestedDocument:
    document_id: str
    source: str
    title: str
    content_type: str
    text: str
    content_sha256: str
    ingested_at: str
    chunks: tuple

    @property
    def metadata(self):
        return {
            "document_id": self.document_id,
            "source": self.source,
            "title": self.title,
            "content_type": self.content_type,
            "content_sha256": self.content_sha256,
            "character_count": len(self.text),
            "chunk_count": len(self.chunks),
            "ingested_at": self.ingested_at,
        }


def ingest_document(source, content, content_type=None, title=None,
                    chunk_size=1200, overlap=150):
    """Extract, normalize and chunk one in-memory document.

    `source` is a caller-supplied label/filename, not a path that this module
    opens. The pipeline performs no filesystem, network or database access.
    """
    if not isinstance(source, str) or not source.strip():
        raise ValueError("source must be a non-empty string")
    source = source.strip()
    if len(source) > 2048 or "\x00" in source:
        raise ValueError("source must be at most 2048 characters and contain no NUL")
    if title is not None and (not isinstance(title, str) or len(title) > 512):
        raise ValueError("title must be a string of at most 512 characters")
    text, kind, extracted_title = extract_text(content, source, content_type)
    final_title = (title.strip() if isinstance(title, str) and title.strip()
                   else extracted_title or os.path.basename(source) or source)
    final_title = final_title[:512]
    content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    # Stable source identity lets changed content update the same document.
    # content_sha256 separately identifies exact normalized content.
    document_id = hashlib.sha256(source.encode("utf-8")).hexdigest()
    chunks = tuple(chunk_text(text, chunk_size=chunk_size, overlap=overlap))
    return IngestedDocument(
        document_id=document_id,
        source=source,
        title=final_title,
        content_type=kind,
        text=text,
        content_sha256=content_hash,
        ingested_at=datetime.now(timezone.utc).isoformat(),
        chunks=chunks,
    )
