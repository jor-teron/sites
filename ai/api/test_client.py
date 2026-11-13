"""Tests for the API command-line client."""
from __future__ import annotations

import io
import json
import os
import sys
import unittest
from unittest import mock

ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from api.client import APIClient, APIClientError, main


class FakeResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.payload


class APIClientTests(unittest.TestCase):
    @mock.patch("api.client.urllib.request.urlopen")
    def test_health_uses_public_health_endpoint(self, open_url):
        open_url.return_value = FakeResponse({"ok": True, "service": "api"})
        result = APIClient().health()
        self.assertEqual(result["service"], "api")
        request = open_url.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:10002/api/health")
        self.assertEqual(request.get_method(), "GET")
        self.assertIsNone(request.get_header("Authorization"))

    @mock.patch("api.client.urllib.request.urlopen")
    def test_tools_attaches_bearer_pin(self, open_url):
        open_url.return_value = FakeResponse({"ok": True, "tools": []})
        APIClient("http://localhost:10002/", "123456").tools()
        request = open_url.call_args.args[0]
        self.assertEqual(request.full_url, "http://localhost:10002/api/tools")
        self.assertEqual(request.get_header("Authorization"), "Bearer 123456")

    @mock.patch("api.client.urllib.request.urlopen")
    def test_call_posts_json_envelope(self, open_url):
        open_url.return_value = FakeResponse({"ok": True, "result": {"entries": []}})
        APIClient(pin="secret").call("list_dir", {"path": "."})
        request = open_url.call_args.args[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("Content-type"), "application/json")
        self.assertEqual(request.get_header("Authorization"), "Bearer secret")
        self.assertEqual(json.loads(request.data), {
            "name": "list_dir", "arguments": {"path": "."}
        })

    @mock.patch("api.client.urllib.request.urlopen")
    def test_rag_search_uses_encoded_query_and_auth(self, open_url):
        open_url.return_value = FakeResponse({"ok": True, "results": []})
        APIClient(pin="secret").rag_search(
            "Assam rivers & hills", limit=5, offset=10,
            deduplicate=True, snippet_chars=120,
        )
        request = open_url.call_args.args[0]
        self.assertIn("q=Assam+rivers+%26+hills", request.full_url)
        self.assertIn("offset=10", request.full_url)
        self.assertIn("deduplicate=true", request.full_url)
        self.assertIn("snippet_chars=120", request.full_url)
        self.assertIn("mode=keyword", request.full_url)
        self.assertIn("keyword_weight=0.5", request.full_url)
        self.assertEqual(request.get_header("Authorization"), "Bearer secret")

    @mock.patch("api.client.urllib.request.urlopen")
    def test_rag_search_forwards_hybrid_mode_and_weights(self, open_url):
        open_url.return_value = FakeResponse({"ok": True, "results": []})
        APIClient(pin="secret").rag_search(
            "network", mode="hybrid", keyword_weight=0.7, semantic_weight=0.3
        )
        url = open_url.call_args.args[0].full_url
        self.assertIn("mode=hybrid", url)
        self.assertIn("keyword_weight=0.7", url)
        self.assertIn("semantic_weight=0.3", url)

    @mock.patch("api.client.urllib.request.urlopen")
    def test_rag_documents_sends_page_controls(self, open_url):
        open_url.return_value = FakeResponse({"ok": True, "documents": [], "pagination": {}})
        APIClient(pin="secret").rag_documents(limit=25, offset=50)
        request = open_url.call_args.args[0]
        self.assertIn("limit=25&offset=50", request.full_url)
        self.assertEqual(request.get_header("Authorization"), "Bearer secret")

    @mock.patch("api.client.urllib.request.urlopen")
    def test_rag_ingest_posts_source_and_text(self, open_url):
        open_url.return_value = FakeResponse({"ok": True, "document": {}})
        APIClient(pin="secret").rag_ingest("notes.md", "some text", title="Notes")
        request = open_url.call_args.args[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(json.loads(request.data), {
            "source": "notes.md", "content": "some text", "title": "Notes"
        })

    @mock.patch("api.client.urllib.request.urlopen")
    def test_http_errors_are_readable(self, open_url):
        import urllib.error
        error = urllib.error.HTTPError(
            "http://localhost/api/tools", 401, "Unauthorized", {},
            io.BytesIO(b'{"ok":false,"error":"unauthorized","code":"unauthorized"}'),
        )
        open_url.side_effect = error
        with self.assertRaisesRegex(APIClientError, "HTTP 401: unauthorized"):
            APIClient(pin="wrong").tools()

    def test_cli_rejects_non_object_arguments(self):
        output = io.StringIO()
        with mock.patch("sys.stderr", output):
            code = main(["call", "list_dir", "--arguments", "[]"])
        self.assertEqual(code, 1)
        self.assertIn("JSON object", output.getvalue())

    def test_cli_rejects_invalid_timeout(self):
        output = io.StringIO()
        with mock.patch("sys.stderr", output):
            code = main(["--timeout", "0", "health"])
        self.assertEqual(code, 2)
        self.assertIn("timeout", output.getvalue())

    @mock.patch("api.client.urllib.request.urlopen")
    def test_connection_failure_is_readable(self, open_url):
        import urllib.error
        open_url.side_effect = urllib.error.URLError("connection refused")
        with self.assertRaisesRegex(APIClientError, "cannot reach API"):
            APIClient("http://127.0.0.1:10002").health()

    @mock.patch("api.client.urllib.request.urlopen")
    def test_invalid_json_response_is_rejected(self, open_url):
        class InvalidResponse(FakeResponse):
            def __init__(self):
                self.payload = b"not-json"
        open_url.return_value = InvalidResponse()
        with self.assertRaisesRegex(APIClientError, "invalid JSON"):
            APIClient().health()

    @mock.patch("api.client.urllib.request.urlopen")
    def test_cli_uses_api_url_and_pin_environment(self, open_url):
        open_url.return_value = FakeResponse({"ok": True, "tools": []})
        output = io.StringIO()
        with mock.patch.dict(os.environ, {"API_URL": "http://127.0.0.1:10002", "API_PIN": "test-pin"}), \
             mock.patch("sys.stdout", output):
            code = main(["tools"])
        self.assertEqual(code, 0)
        request = open_url.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:10002/api/tools")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-pin")

    @mock.patch("api.client.urllib.request.urlopen")
    def test_rag_cli_status_uses_authenticated_status_endpoint(self, open_url):
        open_url.return_value = FakeResponse({"ok": True, "rag": {"enabled": True}})
        output = io.StringIO()
        with mock.patch.dict(os.environ, {"API_PIN": "cli-pin"}), mock.patch("sys.stdout", output):
            code = main(["rag", "status"])
        self.assertEqual(code, 0)
        request = open_url.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:10002/api/rag/status")
        self.assertEqual(request.get_header("Authorization"), "Bearer cli-pin")

    @mock.patch("api.client.urllib.request.urlopen")
    def test_rag_cli_search_forwards_filters_and_pagination(self, open_url):
        open_url.return_value = FakeResponse({"ok": True, "results": [], "pagination": {}})
        with mock.patch("sys.stdout", io.StringIO()):
            code = main(["rag", "search", "Assam rivers", "--limit", "7", "--offset", "14",
                         "--source", "notes.md", "--deduplicate", "--snippet-chars", "180",
                         "--mode", "hybrid", "--keyword-weight", "0.7",
                         "--semantic-weight", "0.3"])
        self.assertEqual(code, 0)
        url = open_url.call_args.args[0].full_url
        self.assertIn("q=Assam+rivers", url)
        self.assertIn("limit=7", url)
        self.assertIn("offset=14", url)
        self.assertIn("source=notes.md", url)
        self.assertIn("deduplicate=true", url)
        self.assertIn("snippet_chars=180", url)
        self.assertIn("mode=hybrid", url)
        self.assertIn("keyword_weight=0.7", url)
        self.assertIn("semantic_weight=0.3", url)

    @mock.patch("api.client.urllib.request.urlopen")
    def test_rag_cli_ingests_utf8_file_and_title(self, open_url):
        import tempfile
        from pathlib import Path
        open_url.return_value = FakeResponse({"ok": True, "document": {"id": "abc"}})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "notes.md"
            path.write_text("Assam rivers", encoding="utf-8")
            with mock.patch("sys.stdout", io.StringIO()):
                code = main(["rag", "ingest", str(path), "--title", "Field notes"])
        self.assertEqual(code, 0)
        request = open_url.call_args.args[0]
        self.assertEqual(request.get_method(), "POST")
        body = json.loads(request.data)
        self.assertEqual(body["content"], "Assam rivers")
        self.assertEqual(body["title"], "Field notes")
        self.assertEqual(body["source"], str(path.resolve()))

    def test_rag_cli_delete_requires_confirmation(self):
        output = io.StringIO()
        with mock.patch("sys.stderr", output):
            code = main(["rag", "delete", "abc123"])
        self.assertEqual(code, 1)
        self.assertIn("requires --yes", output.getvalue())

    def test_rag_cli_rejects_out_of_range_deduplicated_offset(self):
        output = io.StringIO()
        with mock.patch("sys.stderr", output):
            code = main(["rag", "search", "term", "--deduplicate", "--offset", "450"])
        self.assertEqual(code, 1)
        self.assertIn("offset must be 0-449", output.getvalue())

    def test_cli_reports_missing_pin_file(self):
        output = io.StringIO()
        with mock.patch("sys.stderr", output):
            code = main(["--pin-file", "/definitely/not/a/real/pin-file", "tools"])
        self.assertEqual(code, 2)
        self.assertIn("cannot read PIN file", output.getvalue())


if __name__ == "__main__":
    unittest.main()
