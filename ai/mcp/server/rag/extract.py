"""Small, dependency-free text extraction for supported RAG inputs."""
from __future__ import annotations

import os
import re
from html.parser import HTMLParser

MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
SUPPORTED_TYPES = {
    "text/plain": "txt",
    "text/markdown": "md",
    "text/html": "html",
}
_EXTENSION_TYPES = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
}


class ExtractionError(ValueError):
    """Raised when an input cannot be safely converted to text."""


class _TextHTMLParser(HTMLParser):
    _BLOCKS = {
        "address", "article", "aside", "blockquote", "br", "dd", "div",
        "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
        "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li",
        "main", "nav", "ol", "p", "pre", "section", "table", "td",
        "th", "tr", "ul",
    }
    _HIDDEN = {"script", "style", "noscript", "template", "svg"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.title_parts = []
        self._hidden_depth = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in self._HIDDEN:
            self._hidden_depth += 1
        if tag == "title":
            self._in_title = True
        if not self._hidden_depth and tag in self._BLOCKS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "title":
            self._in_title = False
        if not self._hidden_depth and tag in self._BLOCKS:
            self.parts.append("\n")
        if tag in self._HIDDEN and self._hidden_depth:
            self._hidden_depth -= 1

    def handle_data(self, data):
        if self._hidden_depth:
            return
        self.parts.append(data)
        if self._in_title:
            self.title_parts.append(data)


def normalize_text(text):
    """Normalize line endings and excessive whitespace without flattening paragraphs."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\x00", "")
    lines = [re.sub(r"[\t\f\v ]+", " ", line).strip() for line in text.split("\n")]
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def detect_content_type(source, content_type=None):
    if content_type:
        if not isinstance(content_type, str):
            raise ExtractionError("content type must be a string")
        normalized = content_type.split(";", 1)[0].strip().lower()
        if normalized not in SUPPORTED_TYPES:
            raise ExtractionError("unsupported content type: %s" % normalized)
        return normalized
    source_text = str(source or "").lower().split("?", 1)[0].split("#", 1)[0]
    guessed = _EXTENSION_TYPES.get(os.path.splitext(source_text)[1])
    if guessed is None:
        raise ExtractionError("cannot determine document type; provide a supported extension or content type")
    return guessed


def extract_text(content, source="document.txt", content_type=None):
    """Extract normalized UTF-8 text from bytes or str for supported formats."""
    kind = detect_content_type(source, content_type)
    if isinstance(content, str):
        if len(content) > MAX_DOCUMENT_BYTES:
            raise ExtractionError("document exceeds the %d-byte limit" % MAX_DOCUMENT_BYTES)
        encoded = content.encode("utf-8")
        raw_text = content
    elif isinstance(content, (bytes, bytearray, memoryview)):
        if len(content) > MAX_DOCUMENT_BYTES:
            raise ExtractionError("document exceeds the %d-byte limit" % MAX_DOCUMENT_BYTES)
        encoded = bytes(content)
        try:
            raw_text = encoded.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ExtractionError("document must be valid UTF-8 text") from exc
    else:
        raise TypeError("content must be str or bytes-like")
    if len(encoded) > MAX_DOCUMENT_BYTES:
        raise ExtractionError("document exceeds the %d-byte limit" % MAX_DOCUMENT_BYTES)
    if "\x00" in raw_text:
        raise ExtractionError("document contains a NUL character")

    title = None
    if kind == "text/html":
        parser = _TextHTMLParser()
        try:
            parser.feed(raw_text)
            parser.close()
        except Exception as exc:
            raise ExtractionError("invalid HTML document") from exc
        title = normalize_text(" ".join(parser.title_parts)) or None
        raw_text = "".join(parser.parts)
    normalized = normalize_text(raw_text)
    if not normalized:
        raise ExtractionError("document contains no extractable text")
    return normalized, kind, title
