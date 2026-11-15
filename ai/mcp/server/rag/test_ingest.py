"""Tests for the dependency-free RAG ingestion foundation."""
import unittest

from rag import ExtractionError, chunk_text, extract_text, ingest_document
from rag.extract import MAX_DOCUMENT_BYTES


class ExtractionTests(unittest.TestCase):
    def test_plain_text_normalizes_whitespace(self):
        text, kind, title = extract_text(b"\xef\xbb\xbfHello  world\r\n\r\nNext\tline", "note.txt")
        self.assertEqual(text, "Hello world\n\nNext line")
        self.assertEqual(kind, "text/plain")
        self.assertIsNone(title)

    def test_markdown_is_preserved_as_text(self):
        text, kind, _ = extract_text("# Heading\n\n**Body**", "readme.md")
        self.assertEqual(text, "# Heading\n\n**Body**")
        self.assertEqual(kind, "text/markdown")

    def test_html_extracts_title_and_visible_text(self):
        text, kind, title = extract_text(
            "<html><head><title>My page</title><script>secret()</script></head>"
            "<body><h1>Hello</h1><p>World &amp; friends</p><style>hidden</style></body></html>",
            "page.html",
        )
        self.assertEqual(title, "My page")
        self.assertEqual(kind, "text/html")
        self.assertIn("Hello", text)
        self.assertIn("World & friends", text)
        self.assertNotIn("secret", text)
        self.assertNotIn("hidden", text)

    def test_rejects_unsupported_types(self):
        for source in ("file.pdf", "file.docx", "unknown.bin"):
            with self.subTest(source=source), self.assertRaises(ExtractionError):
                extract_text(b"content", source)

    def test_rejects_invalid_utf8_and_nul(self):
        with self.assertRaises(ExtractionError):
            extract_text(b"\xff", "x.txt")
        with self.assertRaises(ExtractionError):
            extract_text("bad\x00text", "x.txt")

    def test_rejects_oversized_input(self):
        with self.assertRaises(ExtractionError):
            extract_text(b"x" * (MAX_DOCUMENT_BYTES + 1), "x.txt")
        with self.assertRaises(ExtractionError):
            extract_text("x" * (MAX_DOCUMENT_BYTES + 1), "x.txt")

    def test_rejects_empty_extract(self):
        with self.assertRaises(ExtractionError):
            extract_text(" \n  ", "empty.txt")


class ChunkTests(unittest.TestCase):
    def test_empty_and_small_text(self):
        self.assertEqual(chunk_text("  "), [])
        chunks = chunk_text("hello", chunk_size=10, overlap=2)
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0].text, "hello")
        self.assertEqual((chunks[0].start_char, chunks[0].end_char), (0, 5))

    def test_chunks_respect_size_and_have_overlap(self):
        source = "First paragraph. " * 30
        chunks = chunk_text(source, chunk_size=100, overlap=20)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk.text) <= 100 for chunk in chunks))
        self.assertTrue(all(chunk.index == i for i, chunk in enumerate(chunks)))
        self.assertTrue(any(a.end_char > b.start_char for a, b in zip(chunks, chunks[1:])))

    def test_prefers_paragraph_boundaries(self):
        source = "A" * 45 + "\n\n" + "B" * 45
        chunks = chunk_text(source, chunk_size=60, overlap=5)
        self.assertEqual(chunks[0].text, "A" * 45)

    def test_validates_chunk_options(self):
        for size, overlap in ((0, 0), (10, 10), (10, -1), (True, 0), (10, True)):
            with self.subTest(size=size, overlap=overlap), self.assertRaises(ValueError):
                chunk_text("abc", size, overlap)


class IngestionTests(unittest.TestCase):
    def test_document_metadata_and_chunks(self):
        doc = ingest_document("docs/guide.md", "# Guide\n\n" + "Useful text. " * 30,
                              chunk_size=80, overlap=10)
        self.assertEqual(doc.title, "guide.md")
        self.assertEqual(doc.content_type, "text/markdown")
        self.assertEqual(doc.metadata["document_id"], doc.document_id)
        self.assertEqual(doc.metadata["chunk_count"], len(doc.chunks))
        self.assertEqual(len(doc.content_sha256), 64)
        self.assertGreater(len(doc.chunks), 1)

    def test_html_title_used_unless_overridden(self):
        doc = ingest_document("page.html", "<title>Page title</title><p>Text</p>")
        self.assertEqual(doc.title, "Page title")
        overridden = ingest_document("page.html", "<title>Page title</title><p>Text</p>", title="Chosen")
        self.assertEqual(overridden.title, "Chosen")

    def test_identity_is_stable_for_source_and_changes_for_different_sources(self):
        first = ingest_document("same.txt", "same content")
        same_source_update = ingest_document("same.txt", "updated content")
        different_source = ingest_document("other.txt", "same content")
        self.assertEqual(first.document_id, same_source_update.document_id)
        self.assertNotEqual(first.content_sha256, same_source_update.content_sha256)
        self.assertNotEqual(first.document_id, different_source.document_id)

    def test_requires_source(self):
        with self.assertRaises(ValueError):
            ingest_document(" ", "text")
        with self.assertRaises(ValueError):
            ingest_document("x" * 2049, "text")
        with self.assertRaises(ValueError):
            ingest_document("x.txt", "text", title="t" * 513)


if __name__ == "__main__":
    unittest.main()
