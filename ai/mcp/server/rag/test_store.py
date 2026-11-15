"""Persistence tests for the RAG repository."""
import os
import tempfile
import unittest
from dataclasses import replace

from rag import RAGStore, ingest_document
from storage import Database, StorageError


class RAGStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = Database(os.path.join(self.temp.name, "state.sqlite3")).initialize()
        self.store = RAGStore(self.database)

    def test_save_and_load_document_with_chunks(self):
        document = ingest_document("guide.md", "# Guide\n\n" + "Useful text. " * 30,
                                   chunk_size=80, overlap=10)
        result = self.store.save(document)
        loaded = self.store.get(document.document_id)
        self.assertTrue(result["created"])
        self.assertEqual(result["chunk_count"], len(document.chunks))
        self.assertEqual(loaded["text"], document.text)
        self.assertEqual(loaded["content_sha256"], document.content_sha256)
        self.assertEqual(len(loaded["chunks"]), len(document.chunks))
        self.assertEqual(loaded["chunks"][0]["text"], document.chunks[0].text)

    def test_repeated_save_is_idempotent(self):
        document = ingest_document("same.txt", "same text")
        first = self.store.save(document)
        second = self.store.save(document)
        self.assertTrue(first["created"])
        self.assertFalse(second["created"])
        self.assertEqual(len(self.store.list_documents()), 1)
        self.assertEqual(len(self.store.get(document.document_id)["chunks"]), 1)

    def test_update_replaces_previous_chunks_atomically(self):
        first = ingest_document("guide.txt", "A " * 300, chunk_size=50, overlap=5)
        second = ingest_document("guide.txt", "Updated short content", chunk_size=50, overlap=5)
        self.store.save(first)
        self.store.save(second)
        self.assertEqual(first.document_id, second.document_id)
        loaded = self.store.get(second.document_id)
        self.assertEqual(loaded["text"], "Updated short content")
        self.assertEqual(len(loaded["chunks"]), 1)
        self.assertEqual(len(self.store.list_documents()), 1)

    def test_list_and_find_by_content_hash(self):
        one = ingest_document("a.txt", "shared content")
        two = ingest_document("b.txt", "shared content")
        self.store.save(one)
        duplicate = self.store.save(two)
        self.assertTrue(duplicate["duplicate"])
        self.assertEqual(duplicate["document_id"], one.document_id)
        listed = self.store.list_documents()
        self.assertEqual(len(listed), 1)
        self.assertNotIn("text", listed[0])
        found = self.store.find_by_content_hash(one.content_sha256)
        self.assertEqual({item["source"] for item in found}, {"a.txt"})

    def test_delete_removes_document_and_chunks(self):
        document = ingest_document("delete.txt", "Delete me")
        self.store.save(document)
        self.assertTrue(self.store.delete(document.document_id))
        self.assertFalse(self.store.delete(document.document_id))
        self.assertIsNone(self.store.get(document.document_id))
        self.assertEqual(self.store.list_documents(), [])

    def test_failed_chunk_replacement_rolls_back_document_update(self):
        original = ingest_document("stable.txt", "Original content")
        self.store.save(original)
        malformed = replace(original, text="Changed content", chunks=(
            original.chunks[0], original.chunks[0]
        ))
        with self.assertRaises(StorageError):
            self.store.save(malformed)
        loaded = self.store.get(original.document_id)
        self.assertEqual(loaded["text"], "Original content")
        self.assertEqual(len(loaded["chunks"]), 1)

    def test_backup_restore_preserves_documents_and_chunks(self):
        document = ingest_document("backup.md", "Persist this content")
        self.store.save(document)
        backup = os.path.join(self.temp.name, "backup.sqlite3")
        restored_path = os.path.join(self.temp.name, "restored.sqlite3")
        self.database.backup(backup)
        restored = Database(restored_path).restore(backup)
        restored_document = RAGStore(restored).get(document.document_id)
        self.assertEqual(restored_document["text"], document.text)
        self.assertEqual(restored_document["chunks"][0]["text"], document.chunks[0].text)

    def test_search_uses_fts5_and_returns_ranked_source_metadata(self):
        first = ingest_document("network.txt", "Network security protects network traffic. " * 8,
                                chunk_size=90, overlap=0)
        second = ingest_document("garden.txt", "Garden plants need water and sunlight.",
                                 chunk_size=90, overlap=0)
        self.store.save(first)
        self.store.save(second)
        available = self.store.initialize_search()
        if not available:
            self.skipTest("SQLite build does not include FTS5")
        results = self.store.search("network security", limit=5)
        self.assertTrue(results)
        self.assertEqual(results[0]["source"], "network.txt")
        self.assertIn("network", results[0]["text"].lower())
        self.assertIsInstance(results[0]["score"], float)
        self.assertIn("document_id", results[0])

    def test_search_index_tracks_updates_and_deletions(self):
        original = ingest_document("changing.txt", "oldterm appears here")
        self.store.save(original)
        available = self.store.initialize_search()
        if not available:
            self.skipTest("SQLite build does not include FTS5")
        self.assertEqual(len(self.store.search("oldterm")), 1)
        updated = ingest_document("changing.txt", "newterm appears here")
        self.store.save(updated)
        self.assertEqual(self.store.search("oldterm"), [])
        self.assertEqual(len(self.store.search("newterm")), 1)
        self.store.delete(updated.document_id)
        self.assertEqual(self.store.search("newterm"), [])

    def test_search_falls_back_to_like_without_fts_index(self):
        document = ingest_document("fallback.txt", "fallback keyword is searchable")
        self.store.save(document)
        results = self.store.search("fallback keyword")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["source"], "fallback.txt")
        self.assertIsNone(results[0]["score"])

    def test_search_fallback_matches_chunk_text_not_document_metadata(self):
        document = ingest_document("metadata-only.txt", "The actual body has ordinary words",
                                   title="Secretneedle title")
        self.store.save(document)
        self.assertEqual(self.store.search("secretneedle"), [])
        self.assertEqual(len(self.store.search("ordinary words")), 1)

    def test_search_validates_query_and_limit(self):
        with self.assertRaises(ValueError):
            self.store.search("---")
        with self.assertRaises(ValueError):
            self.store.search("something", limit=0)
        with self.assertRaises(ValueError):
            self.store.search("something", limit=52)

    def test_list_documents_supports_sql_pagination_and_count(self):
        for source in ("c.txt", "a.txt", "b.txt"):
            self.store.save(ingest_document(source, "content for " + source))
        self.assertEqual(self.store.count_documents(), 3)
        first = self.store.list_documents(limit=2, offset=0)
        second = self.store.list_documents(limit=2, offset=2)
        self.assertEqual([item["source"] for item in first], ["a.txt", "b.txt"])
        self.assertEqual([item["source"] for item in second], ["c.txt"])
        self.assertEqual(self.store.list_documents(limit=2, offset=3), [])

    def test_list_documents_rejects_invalid_page_controls(self):
        with self.assertRaises(ValueError):
            self.store.list_documents(limit=0)
        with self.assertRaises(ValueError):
            self.store.list_documents(limit=101)
        with self.assertRaises(ValueError):
            self.store.list_documents(offset=-1)

    def test_search_supports_offsets_with_and_without_deduplication(self):
        document = ingest_document("pages.txt", "needle " * 160,
                                   chunk_size=80, overlap=0)
        self.store.save(document)
        all_results = self.store.search("needle", limit=10)
        next_results = self.store.search("needle", limit=10, offset=10)
        self.assertTrue(all_results)
        self.assertTrue(next_results)
        self.assertNotEqual(all_results[0]["chunk_index"], next_results[0]["chunk_index"])
        dedup_first = self.store.search("needle", limit=1, deduplicate=True)
        self.assertEqual(self.store.search("needle", limit=1, offset=1,
                                           deduplicate=True), [])
        self.assertEqual(len(dedup_first), 1)

    def test_search_validates_offset_and_internal_page_limit(self):
        with self.assertRaises(ValueError):
            self.store.search("term", offset=-1)
        with self.assertRaises(ValueError):
            self.store.search("term", limit=52)
        with self.assertRaises(ValueError):
            self.store.search("term", offset=451, deduplicate=True)

    def test_search_filters_by_source_and_document_id_without_fts(self):
        first = ingest_document("manual-a.txt", "shared keyword in first manual")
        second = ingest_document("manual-b.txt", "shared keyword in second manual")
        self.store.save(first)
        self.store.save(second)
        by_source = self.store.search("shared keyword", source="manual-b.txt")
        self.assertEqual([item["source"] for item in by_source], ["manual-b.txt"])
        by_id = self.store.search("shared keyword", document_id=first.document_id)
        self.assertEqual([item["document_id"] for item in by_id], [first.document_id])
        self.assertEqual(self.store.search("shared keyword", source="missing.txt"), [])

    def test_search_returns_bounded_snippet(self):
        content = "Opening material. " + ("ordinary filler. " * 20) + "TARGETWORD near the end."
        document = ingest_document("snippet.txt", content, chunk_size=500, overlap=0)
        self.store.save(document)
        result = self.store.search("targetword", snippet_chars=60)[0]
        self.assertIn("TARGETWORD", result["snippet"])
        self.assertLessEqual(len(result["snippet"]), 62)
        self.assertIn("text", result)
        self.assertGreater(len(result["text"]), len(result["snippet"]))

    def test_search_can_deduplicate_multiple_chunks_per_document(self):
        document = ingest_document("repeated.txt", "needle " * 80,
                                   chunk_size=80, overlap=20)
        self.store.save(document)
        all_matches = self.store.search("needle", limit=50)
        unique_matches = self.store.search("needle", limit=50, deduplicate=True)
        self.assertGreater(len(all_matches), 1)
        self.assertEqual(len(unique_matches), 1)
        self.assertEqual(unique_matches[0]["document_id"], document.document_id)

    def test_search_filters_and_deduplicates_with_fts5(self):
        first = ingest_document("fts-a.txt", "needle " * 60,
                                chunk_size=80, overlap=20)
        second = ingest_document("fts-b.txt", "needle in another source")
        self.store.save(first)
        self.store.save(second)
        if not self.store.initialize_search():
            self.skipTest("SQLite build does not include FTS5")
        filtered = self.store.search("needle", source="fts-b.txt", deduplicate=True)
        self.assertEqual([item["source"] for item in filtered], ["fts-b.txt"])
        by_id = self.store.search("needle", document_id=first.document_id,
                                  deduplicate=True)
        self.assertEqual(len(by_id), 1)
        self.assertEqual(by_id[0]["document_id"], first.document_id)

    def test_search_max_score_is_an_inclusive_fts5_threshold(self):
        document = ingest_document("threshold.txt", "ranking threshold keyword")
        self.store.save(document)
        if not self.store.initialize_search():
            self.skipTest("SQLite build does not include FTS5")
        baseline = self.store.search("threshold keyword")
        score = baseline[0]["score"]
        self.assertEqual(len(self.store.search("threshold keyword", max_score=score)), 1)
        self.assertEqual(self.store.search("threshold keyword", max_score=score - 1), [])

    def test_search_rejects_invalid_filter_options(self):
        with self.assertRaises(ValueError):
            self.store.search("term", source="  ")
        with self.assertRaises(ValueError):
            self.store.search("term", document_id="invalid")
        with self.assertRaises(ValueError):
            self.store.search("term", max_score=float("nan"))
        with self.assertRaises(ValueError):
            self.store.search("term", snippet_chars=20)
        with self.assertRaises(TypeError):
            self.store.search("term", deduplicate=1)
        with self.assertRaises(ValueError):
            self.store.search("term", max_score=0)

    def test_uninitialized_database_is_rejected(self):
        other = Database(os.path.join(self.temp.name, "not-ready.sqlite3"))
        with self.assertRaises(StorageError):
            RAGStore(other).list_documents()

    def test_requires_database_instance(self):
        with self.assertRaises(TypeError):
            RAGStore("state.sqlite3")

    def test_invalid_document_id_rejected(self):
        with self.assertRaises(ValueError):
            self.store.get("../bad")
        with self.assertRaises(ValueError):
            self.store.delete("short")


if __name__ == "__main__":
    unittest.main()
