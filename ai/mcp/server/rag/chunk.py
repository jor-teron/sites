"""Deterministic character-based document chunking."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TextChunk:
    index: int
    text: str
    start_char: int
    end_char: int


def chunk_text(text, chunk_size=1200, overlap=150):
    """Split text near paragraph/sentence boundaries with bounded overlap.

    Offsets refer to the normalized source string. The implementation is
    character-based (not a tokenizer); callers can replace it later without
    changing the ingestion result contract.
    """
    if not isinstance(text, str):
        raise TypeError("text must be a string")
    if not isinstance(chunk_size, int) or isinstance(chunk_size, bool) or chunk_size < 1:
        raise ValueError("chunk_size must be a positive integer")
    if not isinstance(overlap, int) or isinstance(overlap, bool) or overlap < 0:
        raise ValueError("overlap must be a non-negative integer")
    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")
    text = text.strip()
    if not text:
        return []

    chunks = []
    start = 0
    length = len(text)
    while start < length:
        hard_end = min(start + chunk_size, length)
        end = hard_end
        if hard_end < length:
            floor = start + max(1, chunk_size // 2)
            candidates = [text.rfind("\n\n", floor, hard_end),
                          text.rfind("\n", floor, hard_end),
                          text.rfind(". ", floor, hard_end),
                          text.rfind("? ", floor, hard_end),
                          text.rfind("! ", floor, hard_end)]
            boundary = max(candidates)
            if boundary >= floor:
                end = boundary + (2 if text[boundary:boundary + 2] in ("\n\n", ". ", "? ", "! ") else 1)
        piece = text[start:end].strip()
        if piece:
            left_trim = len(text[start:end]) - len(text[start:end].lstrip())
            right_trim = len(text[start:end].rstrip())
            chunks.append(TextChunk(len(chunks), piece, start + left_trim, start + right_trim))
        if end >= length:
            break
        next_start = max(start + 1, end - overlap)
        start = next_start
    return chunks
