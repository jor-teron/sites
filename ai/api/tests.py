"""Unit tests for API service routing-independent behavior."""
from __future__ import annotations

import os
import sys
import tempfile
import unittest

ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from api.service import call_tool, list_tools
from api import rag_service
from rag.application import initialize_application_runtime
from api.http import make_server as make_api_server
from mcp.http import make_server as make_mcp_server
from mcp.tests.helpers import make_cfg


class APIServiceTests(unittest.TestCase):
    def setUp(self):
        self.cfg = make_cfg(sandbox="none")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.cfg._tmp, ignore_errors=True)

    def test_tool_list_matches_mcp_registry(self):
        names = {item["name"] for item in list_tools(self.cfg)}
        self.assertTrue({"run_command", "read_file", "write_file", "list_dir"} <= names)

    def test_write_and_read_use_shared_tool_path(self):
        written = call_tool("write_file", {"path": "api-test.txt", "content": "hello"}, self.cfg, "127.0.0.1")
        self.assertTrue(written["ok"])
        self.assertEqual(written["result"]["bytes"], 5)
        read = call_tool("read_file", {"path": "api-test.txt"}, self.cfg, "127.0.0.1")
        self.assertTrue(read["ok"])
        self.assertEqual(read["result"]["content"], "hello")

    def test_unknown_tool_is_reported(self):
        result = call_tool("not_a_tool", {}, self.cfg, "127.0.0.1")
        self.assertFalse(result["ok"])

    def test_rag_service_requires_enabled_runtime(self):
        from rag.config import RAGConfig, RAGRuntime, RAGDisabledError
        with self.assertRaises(RAGDisabledError):
            rag_service.list_documents(RAGRuntime.create(RAGConfig()))

    def test_rag_service_ingest_search_list_get_delete(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime, _database = initialize_application_runtime({
                "AI_RAG_ENABLED": "true",
                "AI_RAG_EMBEDDINGS_ENABLED": "false",
                "AI_STORAGE_PATH": os.path.join(directory, "rag.sqlite3"),
            })
            metadata = rag_service.ingest(
                runtime, "api-unit.md", "Assam rivers and green hills"
            )
            document_id = metadata["document_id"]
            listed = rag_service.list_documents(runtime, limit=10, offset=0)
            self.assertEqual(len(listed["documents"]), 1)
            self.assertEqual(listed["pagination"]["total"], 1)
            searched = rag_service.search(runtime, "rivers", limit=10)
            self.assertEqual(len(searched["results"]), 1)
            self.assertFalse(searched["pagination"]["has_more"])
            rag_service.ingest(runtime, "api-unit-2.md", "Assam rivers and broad valleys")
            first_page = rag_service.list_documents(runtime, limit=1, offset=0)
            self.assertEqual(first_page["pagination"]["total"], 2)
            self.assertTrue(first_page["pagination"]["has_more"])
            search_page = rag_service.search(runtime, "rivers", limit=1)
            self.assertEqual(len(search_page["results"]), 1)
            self.assertTrue(search_page["pagination"]["has_more"])
            self.assertEqual(rag_service.get_document(runtime, document_id)["source"], "api-unit.md")
            self.assertTrue(rag_service.delete_document(runtime, document_id))
            remaining = rag_service.list_documents(runtime)["documents"]
            self.assertEqual(len(remaining), 1)
            self.assertTrue(rag_service.delete_document(runtime, remaining[0]["document_id"]))
            self.assertEqual(rag_service.list_documents(runtime)["documents"], [])

    def test_mcp_and_api_bind_independent_listeners(self):
        mcp_server = make_mcp_server(self.cfg)
        api_server = make_api_server(self.cfg, "127.0.0.1", 0)
        try:
            self.assertNotEqual(mcp_server.server_address[1], api_server.server_address[1])
            self.assertEqual(mcp_server.server_address[0], "127.0.0.1")
            self.assertEqual(api_server.server_address[0], "127.0.0.1")
        finally:
            mcp_server.server_close()
            api_server.server_close()


if __name__ == "__main__":
    unittest.main()
