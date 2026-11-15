"""Live HTTP integration tests for the standalone API transport."""
from __future__ import annotations

import json
import os
import shutil
import sys
import unittest
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.realpath(os.path.join(HERE, ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from api.http import make_server
from rag.application import initialize_application_runtime
from mcp.tests.helpers import (
    LOOPBACK_OK,
    LOOPBACK_NOTE,
    auth_headers,
    http_req,
    make_cfg,
)


@unittest.skipUnless(LOOPBACK_OK, LOOPBACK_NOTE)
class APIHTTPIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg = make_cfg(cors=("https://agent.example",), sandbox="none")
        cls.storage_dir = tempfile.TemporaryDirectory()
        cls.rag_runtime, cls.rag_database = initialize_application_runtime({
            "AI_RAG_ENABLED": "true",
            "AI_RAG_EMBEDDINGS_ENABLED": "false",
            "AI_STORAGE_PATH": os.path.join(cls.storage_dir.name, "rag.sqlite3"),
        })
        cls.httpd = make_server(cls.cfg, "127.0.0.1", 0, rag_runtime=cls.rag_runtime)
        import threading
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        host, port = cls.httpd.server_address[:2]
        cls.base = "http://%s:%s" % (host, port)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)
        shutil.rmtree(cls.cfg._tmp, ignore_errors=True)
        cls.storage_dir.cleanup()

    def request(self, path, method="GET", body=None, headers=None):
        return http_req(self.base + path, method=method, body=body, headers=headers)

    def test_rag_dashboard_is_served_without_exposing_api_data(self):
        status, headers, raw = self.request("/rag")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers.get("content-type", ""))
        page = raw.decode("utf-8")
        self.assertIn("RAG Dashboard", page)
        self.assertIn("/api/rag/status", page)
        self.assertIn("/api/rag/search?", page)
        self.assertIn('id="search-mode"', page)
        self.assertIn('id="search-results"', page)
        self.assertIn("Open document", page)
        self.assertIn("X-MCP-PIN", page)
        self.assertIn("not saved", page)

    def test_rag_dashboard_rejects_query_parameters(self):
        status, _, raw = self.request("/rag?file=secret")
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(raw)["code"], "invalid_request")

    def test_health_is_public_and_identifies_api(self):
        status, _, raw = self.request("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw), {"ok": True, "service": "api"})

    def test_unknown_route_is_404(self):
        status, _, raw = self.request("/api/not-a-route")
        self.assertEqual(status, 404)
        self.assertEqual(json.loads(raw)["error"], "not found")

    def test_tools_requires_authentication(self):
        status, headers, raw = self.request("/api/tools")
        self.assertEqual(status, 401)
        self.assertIn("bearer", headers.get("www-authenticate", "").lower())
        self.assertEqual(json.loads(raw)["error"], "unauthorized")

    def test_tools_list_accepts_bearer_auth(self):
        status, _, raw = self.request("/api/tools", headers=auth_headers())
        self.assertEqual(status, 200)
        names = {item["name"] for item in json.loads(raw)["tools"]}
        self.assertTrue({"list_dir", "read_file", "write_file"} <= names)

    def test_tool_call_executes_shared_tool(self):
        headers = auth_headers()
        status, _, raw = self.request(
            "/api/tools/call",
            method="POST",
            body={"name": "write_file", "arguments": {
                "path": "api-http-test.txt", "content": "from-http"
            }},
            headers=headers,
        )
        self.assertEqual(status, 200, raw)
        self.assertTrue(json.loads(raw)["ok"])

        status, _, raw = self.request(
            "/api/tools/call",
            method="POST",
            body={"name": "read_file", "arguments": {"path": "api-http-test.txt"}},
            headers=headers,
        )
        self.assertEqual(status, 200, raw)
        self.assertEqual(json.loads(raw)["result"]["content"], "from-http")

    def test_rag_status_is_authenticated_and_reports_enabled_switches(self):
        status, _, raw = self.request("/api/rag/status")
        self.assertEqual(status, 401)
        status, _, raw = self.request("/api/rag/status", headers=auth_headers())
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)["rag"], {
            "enabled": True, "embeddings_enabled": False,
            "keyword_search": True, "semantic_search": False,
            "hybrid_search": True,
        })

    def test_rag_ingest_search_list_get_and_delete_round_trip(self):
        headers = auth_headers()
        status, _, raw = self.request(
            "/api/rag/ingest", method="POST",
            body={"source": "api-notes.md", "content": "Assam has rivers and green hills."},
            headers=headers,
        )
        self.assertEqual(status, 201, raw)
        document_id = json.loads(raw)["document"]["document_id"]

        status, _, raw = self.request("/api/rag/documents", headers=headers)
        self.assertEqual(status, 200)
        listed = json.loads(raw)
        self.assertEqual(len(listed["documents"]), 1)
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertFalse(listed["pagination"]["has_more"])

        status, _, raw = self.request(
            "/api/rag/search?q=rivers&limit=1&offset=0&snippet_chars=100",
            headers=headers,
        )
        self.assertEqual(status, 200)
        searched = json.loads(raw)
        self.assertEqual(len(searched["results"]), 1)
        self.assertEqual(searched["pagination"]["offset"], 0)

        status, _, raw = self.request("/api/rag/documents/" + document_id, headers=headers)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)["document"]["source"], "api-notes.md")

        status, _, raw = self.request(
            "/api/rag/documents/" + document_id, method="DELETE", headers=headers
        )
        self.assertEqual(status, 200, raw)
        self.assertTrue(json.loads(raw)["deleted"])

    def test_rag_hybrid_search_falls_back_to_keyword_when_embeddings_are_disabled(self):
        headers = auth_headers()
        status, _, raw = self.request(
            "/api/rag/ingest", method="POST",
            body={"source": "hybrid.txt", "content": "Hybrid keyword retrieval works."},
            headers=headers,
        )
        self.assertEqual(status, 201, raw)
        status, _, raw = self.request(
            "/api/rag/search?q=hybrid&mode=hybrid", headers=headers,
        )
        self.assertEqual(status, 200, raw)
        result = json.loads(raw)
        self.assertEqual(result["results"][0]["search_type"], "keyword_fallback")
        self.assertEqual(result["results"][0]["keyword_rank"], 1)

    def test_rag_hybrid_search_validates_mode_weights_and_page_window(self):
        headers = auth_headers()
        for path in (
            "/api/rag/search?q=x&mode=unknown",
            "/api/rag/search?q=x&mode=hybrid&keyword_weight=-1",
            "/api/rag/search?q=x&mode=hybrid&semantic_weight=nan",
            "/api/rag/search?q=x&mode=hybrid&offset=49&limit=1",
        ):
            status, _, raw = self.request(path, headers=headers)
            self.assertEqual(status, 400, (path, raw))

    def test_rag_rejects_duplicate_or_unknown_search_parameters(self):
        headers = auth_headers()
        status, _, raw = self.request("/api/rag/search?q=a&q=b", headers=headers)
        self.assertEqual(status, 400)
        self.assertIn("duplicate", json.loads(raw)["error"])
        status, _, raw = self.request("/api/rag/search?q=a&other=b", headers=headers)
        self.assertEqual(status, 400)
        self.assertIn("unknown query", json.loads(raw)["error"])

    def test_rag_pagination_rejects_invalid_limits_offsets_and_flags(self):
        headers = auth_headers()
        for path in (
            "/api/rag/documents?limit=0",
            "/api/rag/documents?offset=-1",
            "/api/rag/search?q=x&limit=51",
            "/api/rag/search?q=x&offset=nope",
            "/api/rag/search?q=x&deduplicate=yes",
            "/api/rag/search?q=x&snippet_chars=20",
        ):
            status, _, raw = self.request(path, headers=headers)
            self.assertEqual(status, 400, (path, raw))

    def test_rag_document_list_supports_offset(self):
        headers = auth_headers()
        for source in ("c.txt", "a.txt", "b.txt"):
            status, _, raw = self.request(
                "/api/rag/ingest", method="POST",
                body={"source": source, "content": "content " + source},
                headers=headers,
            )
            self.assertEqual(status, 201, raw)
        status, _, raw = self.request("/api/rag/documents?limit=2&offset=1", headers=headers)
        self.assertEqual(status, 200)
        result = json.loads(raw)
        self.assertEqual([item["source"] for item in result["documents"]], ["b.txt", "c.txt"])
        self.assertTrue(result["pagination"]["has_more"] is False)

    def test_rag_ingest_rejects_unknown_fields_and_invalid_content(self):
        status, _, raw = self.request(
            "/api/rag/ingest", method="POST",
            body={"source": "x.txt", "content": "text", "extra": 1},
            headers=auth_headers(),
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(raw)["code"], "unknown_fields")

    def test_rag_document_not_found_and_invalid_id(self):
        headers = auth_headers()
        status, _, raw = self.request("/api/rag/documents/" + ("0" * 64), headers=headers)
        self.assertEqual(status, 404)
        status, _, raw = self.request("/api/rag/documents/not-an-id", headers=headers)
        self.assertEqual(status, 400)

    def test_invalid_json_is_400(self):
        status, _, raw = self.request(
            "/api/tools/call", method="POST", body=b"{",
            headers=auth_headers(),
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(raw)["error"], "invalid JSON")

    def test_non_object_request_is_400(self):
        status, _, raw = self.request(
            "/api/tools/call", method="POST", body=[],
            headers=auth_headers(),
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(raw)["error"], "request must be an object")

    def test_bad_arguments_shape_is_400(self):
        status, _, raw = self.request(
            "/api/tools/call", method="POST",
            body={"name": "list_dir", "arguments": []},
            headers=auth_headers(),
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(raw)["error"], "arguments must be an object")

    def test_unknown_tool_is_422(self):
        status, _, raw = self.request(
            "/api/tools/call", method="POST",
            body={"name": "not_a_tool", "arguments": {}},
            headers=auth_headers(),
        )
        self.assertEqual(status, 422)
        self.assertFalse(json.loads(raw)["ok"])

    def test_wrong_content_type_is_415(self):
        headers = auth_headers(extra={"Content-Type": "text/plain"})
        status, _, raw = self.request(
            "/api/tools/call", method="POST", body=b"{}", headers=headers,
        )
        self.assertEqual(status, 415)
        self.assertEqual(json.loads(raw)["code"], "unsupported_media_type")

    def test_duplicate_json_keys_are_rejected(self):
        status, _, raw = self.request(
            "/api/tools/call", method="POST",
            body=b'{"name":"list_dir","name":"write_file","arguments":{}}',
            headers=auth_headers(),
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(raw)["code"], "invalid_json")

    def test_unknown_request_fields_are_rejected(self):
        status, _, raw = self.request(
            "/api/tools/call", method="POST",
            body={"name": "list_dir", "arguments": {}, "extra": True},
            headers=auth_headers(),
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(raw)["code"], "unknown_fields")

    def test_put_is_json_405(self):
        status, headers, raw = self.request("/api/tools/call", method="PUT")
        self.assertEqual(status, 405)
        self.assertIn("POST", headers.get("allow", ""))
        self.assertIn("DELETE", headers.get("allow", ""))
        self.assertEqual(json.loads(raw)["code"], "method_not_allowed")

    def test_health_supports_head(self):
        status, headers, raw = self.request("/api/health", method="HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(raw, b"")
        self.assertGreater(int(headers["content-length"]), 0)

    def test_cors_preflight_allows_configured_origin(self):
        status, headers, _ = self.request(
            "/api/tools", method="OPTIONS",
            headers={"Origin": "https://agent.example"},
        )
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("access-control-allow-origin"), "https://agent.example")
        self.assertIn("POST", headers.get("access-control-allow-methods", ""))

    def test_cors_rejects_unconfigured_origin(self):
        status, _, raw = self.request(
            "/api/health", headers={"Origin": "https://evil.example"},
        )
        self.assertEqual(status, 403)
        self.assertEqual(json.loads(raw)["error"], "origin not allowed")


if __name__ == "__main__":
    unittest.main()
