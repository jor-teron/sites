"""Static contract tests for the browser-based RAG dashboard."""
from pathlib import Path
import unittest


DASHBOARD = Path(__file__).resolve().parent / "static" / "rag.html"


class RAGDashboardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = DASHBOARD.read_text(encoding="utf-8")

    def test_search_controls_use_existing_authenticated_api(self):
        for marker in (
            'id="search-form"', 'id="search-query"', 'id="search-mode"',
            'id="search-source"', 'id="search-deduplicate"',
            'id="search-results"', 'id="search-next"',
            '"/api/rag/search?"', 'X-MCP-PIN',
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, self.page)

    def test_search_results_reuse_document_inspection_safely(self):
        self.assertIn('viewDocument(item.document_id)', self.page)
        self.assertIn('snippet.textContent = item.snippet || item.text || ""', self.page)
        self.assertIn('heading.textContent = item.title || item.source', self.page)
        self.assertIn('item.search_type === "keyword_fallback"', self.page)

    def test_upload_copy_does_not_claim_semantic_embeddings_are_generated(self):
        self.assertIn('>Upload document</button>', self.page)
        self.assertIn('semantic embeddings are managed separately', self.page)
        self.assertNotIn('>Upload and index</button>', self.page)

    def test_pin_is_not_persisted_in_browser_storage(self):
        self.assertNotIn("localStorage", self.page)
        self.assertNotIn("sessionStorage", self.page)


    def test_rag_settings_controls_use_authenticated_settings_api(self):
        for marker in (
            'id="settings-panel"', 'id="setting-rag"',
            'id="setting-embeddings"', 'id="setting-provider"',
            'id="setting-model"', 'id="save-settings"',
            'api("/api/rag/settings")', 'method: "POST"',
            'Apply to API', 'id="apply-settings"', 'api("/api/rag/apply"',
            'MCP restart is still required',
        ):
            self.assertIn(marker, self.page)

    def test_embedding_controls_follow_rag_enablement(self):
        self.assertIn('byId("setting-embeddings").disabled = !rag;', self.page)
        self.assertIn('byId("setting-provider").disabled = !rag || !embeddings;', self.page)
        self.assertIn('byId("setting-model").disabled = !rag || !embeddings', self.page)
        self.assertIn('The previous API runtime remains active.', self.page)


if __name__ == "__main__":
    unittest.main()
