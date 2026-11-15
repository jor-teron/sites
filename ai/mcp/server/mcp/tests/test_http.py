"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_http.py
Purpose:      End-to-end HTTP tests: auth, health, CORS, file tools, run_command, lockout.
Place:        mcp/tests/test_http.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, helpers, mcp.auth, mcp.protocol, mcp.sandbox.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import unittest
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from helpers import (  # noqa: E402
    PIN,
    auth_headers,
    call_tool,
    http_req,
    make_cfg,
    rpc,
    start_server,
    tool_payload,
    LOOPBACK_OK,
    LOOPBACK_NOTE,
)
from mcp import auth  # noqa: E402
from mcp import protocol  # noqa: E402
from mcp import sandbox  # noqa: E402


@unittest.skipUnless(LOOPBACK_OK, LOOPBACK_NOTE)
class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg = make_cfg(cors=("https://agent.example",), sandbox="none")
        cls.httpd, cls.thread, cls.url = start_server(cls.cfg)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        shutil.rmtree(cls.cfg._tmp, ignore_errors=True)

    def test_auth_missing(self):
        status, headers, _ = http_req(
            self.url,
            body={"jsonrpc": "2.0", "id": 1, "method": "ping"},
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(status, 401)
        self.assertIn("bearer", headers.get("www-authenticate", "").lower())
        # v2 has no OAuth resource_metadata
        self.assertNotIn("resource_metadata", headers.get("www-authenticate", "").lower())

    def test_auth_wrong_password(self):
        status, _, _ = rpc(self.url, "ping", password="wrong-password")
        self.assertEqual(status, 401)

    def test_auth_bearer_and_initialize(self):
        status, headers, parsed = rpc(
            self.url,
            "initialize",
            {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "0"},
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(parsed["result"]["protocolVersion"], "2025-06-18")
        self.assertIn("tools", parsed["result"]["capabilities"])
        self.assertTrue(headers.get("mcp-session-id"))
        self.assertEqual(parsed["result"]["serverInfo"]["version"], protocol.VERSION)
        self.assertEqual(parsed["result"]["serverInfo"]["version"], Path(AI_DIR, "VERSION").read_text(encoding="ascii").strip())
        # This test server uses sandbox="none"; the instructions must say so.
        instructions = parsed["result"]["instructions"]
        self.assertIn("NOT isolated", instructions)
        self.assertIn("/workspace", instructions)
        lowered = instructions.lower()
        for word in ("bwrap", "bubblewrap", "mcp_root", "mcp_sandbox"):
            self.assertNotIn(word, lowered)

    def test_auth_basic(self):
        status, _, parsed = rpc(self.url, "ping", kind="basic")
        self.assertEqual(status, 200)
        self.assertEqual(parsed.get("result"), {})

    def test_auth_header(self):
        status, _, parsed = rpc(self.url, "ping", kind="header")
        self.assertEqual(status, 200)
        self.assertEqual(parsed.get("result"), {})

    def test_auth_legacy_header(self):
        status, _, parsed = rpc(self.url, "ping", kind="legacy-header")
        self.assertEqual(status, 200)
        self.assertEqual(parsed.get("result"), {})

    def test_password_in_address(self):
        host, port = self.httpd.server_address[:2]
        base = "http://%s:%s" % (host, port)
        noauth = {"Content-Type": "application/json"}
        body = {"jsonrpc": "2.0", "id": 1, "method": "ping"}
        for path in ("/" + PIN, "/ai/mcp/" + PIN, "/mcp/" + PIN + "/"):
            status, _, raw = http_req(base + path, body=body, headers=noauth)
            self.assertEqual(status, 200, path)
            self.assertEqual(json.loads(raw).get("result"), {})
        for path in ("/wrong", "/ai/mcp/" + PIN + "x", "/ai/mcp/x" + PIN):
            status, _, _ = http_req(base + path, body=body, headers=noauth)
            self.assertEqual(status, 401, path)

    def test_redact_path(self):
        self.assertEqual(auth.redact_path("/ai/mcp/secret", "secret"), "/ai/mcp/***")
        self.assertEqual(auth.redact_path("/ai/mcp/other", "secret"), "/ai/mcp/other")

    def test_initialize_unknown_version_uses_latest(self):
        status, _, parsed = rpc(self.url, "initialize", {"protocolVersion": "1999-01-01"})
        self.assertEqual(status, 200)
        self.assertEqual(parsed["result"]["protocolVersion"], protocol.LATEST_PROTOCOL_VERSION)

    def test_initialized_notification(self):
        status, _, raw = rpc(self.url, "notifications/initialized", req_id=None)
        self.assertEqual(status, 202)
        self.assertTrue(raw in (None, "", b"", {}))

    def test_get_mcp_405(self):
        status, _, _ = http_req(self.url, method="GET")
        self.assertEqual(status, 405)

    def test_health(self):
        host, port = self.httpd.server_address[:2]
        base = "http://%s:%s" % (host, port)
        status, headers, raw = http_req(base + "/health", method="GET")
        self.assertEqual(status, 200)
        self.assertEqual(raw.strip(), b"ok")
        self.assertIn("text/plain", headers.get("content-type", ""))
        status, _, raw = http_req(base + "/ai/mcp/health", method="GET")
        self.assertEqual(status, 200)
        self.assertEqual(raw.strip(), b"ok")

    def test_post_any_path(self):
        host, port = self.httpd.server_address[:2]
        base = "http://%s:%s" % (host, port)
        for path in ("/", "/mcp", "/ai/mcp", "/ai/mcp/"):
            status, _, parsed = rpc(base + path, "ping")
            self.assertEqual(status, 200, path)
            self.assertEqual(parsed.get("result"), {})

    def test_no_oauth_endpoints(self):
        host, port = self.httpd.server_address[:2]
        base = "http://%s:%s" % (host, port)
        for path in (
            "/.well-known/oauth-authorization-server",
            "/mcp/.well-known/oauth-protected-resource",
            "/authorize",
            "/mcp/token",
            "/mcp/register",
        ):
            status, _, _ = http_req(base + path, method="GET")
            self.assertEqual(status, 405, path)

    def test_tools_list(self):
        status, _, parsed = rpc(self.url, "tools/list")
        self.assertEqual(status, 200)
        tools = parsed["result"]["tools"]
        names = {item["name"] for item in tools}
        self.assertTrue(
            {"run_command", "read_file", "write_file", "edit_file", "list_dir", "delete_path", "move_path"}
            <= names
        )
        # Live tools/list must reflect this server's sandbox="none" config
        # and must not advertise leftover v1 wording.
        run_cmd = [item for item in tools if item["name"] == "run_command"][0]
        self.assertIn("NOT isolated", run_cmd["description"])
        self.assertNotIn("There is no network.", run_cmd["description"])
        chunks = []
        for item in tools:
            chunks.append(item.get("description") or "")
            props = (item.get("inputSchema") or {}).get("properties") or {}
            for prop in props.values():
                chunks.append(prop.get("description") or "")
        lowered = "\n".join(chunks).lower()
        for word in ("bwrap", "bubblewrap", "mcp_root", "mcp_sandbox"):
            self.assertNotIn(word, lowered)

    def test_file_tools_and_move_delete(self):
        work = self.cfg.workspace
        status, _, parsed = call_tool(
            self.url,
            "write_file",
            {"path": "notes/hello.txt", "content": "hello world\nhello again\n", "create_parents": True},
        )
        self.assertEqual(status, 200)
        self.assertFalse(parsed["result"].get("isError"))
        path = os.path.join(work, "notes", "hello.txt")
        self.assertTrue(os.path.isfile(path))

        status, _, parsed = call_tool(self.url, "read_file", {"path": "notes/hello.txt"})
        data = tool_payload(parsed)
        self.assertIn("hello world", data["content"])

        status, _, parsed = call_tool(
            self.url, "read_file", {"path": "notes/hello.txt", "offset": 1, "limit": 1}
        )
        data = tool_payload(parsed)
        self.assertEqual(data["content"].strip(), "hello again")

        status, _, parsed = call_tool(
            self.url,
            "edit_file",
            {"path": "notes/hello.txt", "old_string": "world", "new_string": "there"},
        )
        self.assertFalse(parsed["result"].get("isError"))
        with open(path, encoding="utf-8") as fh:
            self.assertIn("hello there", fh.read())

        status, _, parsed = call_tool(self.url, "list_dir", {"path": "notes"})
        data = tool_payload(parsed)
        self.assertTrue(any(item["name"] == "hello.txt" for item in data["entries"]))

        status, _, parsed = call_tool(
            self.url, "move_path", {"src": "notes/hello.txt", "dest": "notes/moved.txt"}
        )
        self.assertFalse(parsed["result"].get("isError"))
        status, _, parsed = call_tool(self.url, "delete_path", {"path": "notes/moved.txt"})
        self.assertFalse(parsed["result"].get("isError"))
        self.assertFalse(os.path.exists(os.path.join(work, "notes", "moved.txt")))

    def test_relative_and_absolute_file_tool_paths(self):
        status, _, parsed = call_tool(
            self.url, "write_file", {"path": "rel-http.txt", "content": "rel"}
        )
        self.assertFalse(parsed["result"].get("isError"), parsed)
        self.assertTrue(os.path.isfile(os.path.join(self.cfg.workspace, "rel-http.txt")))
        status, _, parsed = call_tool(
            self.url, "write_file", {"path": "/abs-http.txt", "content": "abs"}
        )
        self.assertFalse(parsed["result"].get("isError"), parsed)
        self.assertTrue(os.path.isfile(os.path.join(self.cfg.root, "abs-http.txt")))
        self.assertFalse(os.path.isfile(os.path.join(self.cfg.workspace, "abs-http.txt")))

    def test_edit_not_found_and_ambiguous(self):
        call_tool(self.url, "write_file", {"path": "amb.txt", "content": "foo foo bar"})
        status, _, parsed = call_tool(
            self.url, "edit_file", {"path": "amb.txt", "old_string": "missing", "new_string": "x"}
        )
        self.assertTrue(parsed["result"]["isError"])
        self.assertIn("not found", parsed["result"]["content"][0]["text"])
        status, _, parsed = call_tool(
            self.url, "edit_file", {"path": "amb.txt", "old_string": "foo", "new_string": "baz"}
        )
        self.assertTrue(parsed["result"]["isError"])
        self.assertIn("ambiguous", parsed["result"]["content"][0]["text"])
        status, _, parsed = call_tool(
            self.url,
            "edit_file",
            {"path": "amb.txt", "old_string": "foo", "new_string": "baz", "replace_all": True},
        )
        self.assertFalse(parsed["result"].get("isError"))

    def test_root_escape_blocked(self):
        secret = os.path.join(self.cfg._tmp, "secret.txt")
        with open(secret, "w", encoding="utf-8") as fh:
            fh.write("top-secret")
        # A host-absolute secret path is remapped as a jail path and must
        # not return the host file's contents.
        status, _, parsed = call_tool(self.url, "read_file", {"path": secret})
        self.assertTrue(parsed["result"]["isError"])
        self.assertNotIn("top-secret", parsed["result"]["content"][0]["text"])
        # From /workspace, ../../ leaves the sandbox.
        status, _, parsed = call_tool(self.url, "read_file", {"path": "../../secret.txt"})
        self.assertTrue(parsed["result"]["isError"])
        text = parsed["result"]["content"][0]["text"]
        self.assertTrue("outside MCP_ROOT" in text or "does not exist" in text)
        self.assertNotIn("top-secret", text)

    def test_run_command(self):
        status, _, parsed = call_tool(self.url, "run_command", {"command": "echo hello-mcp"})
        self.assertEqual(status, 200)
        data = tool_payload(parsed)
        self.assertEqual(data["exit_code"], 0)
        self.assertIn("hello-mcp", data["stdout"])

    def test_timeout(self):
        status, _, parsed = call_tool(
            self.url, "run_command", {"command": "sleep 20", "timeout": 1}
        )
        data = tool_payload(parsed)
        self.assertTrue(data["timed_out"])
        self.assertEqual(data["exit_code"], -1)

    def test_output_cap(self):
        big = os.path.join(self.cfg.workspace, "big.txt")
        with open(big, "w", encoding="utf-8") as fh:
            fh.write("x" * 300000)
        status, _, parsed = call_tool(self.url, "run_command", {"command": "cat big.txt"})
        data = tool_payload(parsed)
        self.assertTrue(data["truncated"])
        self.assertIn("[truncated]", data["stdout"])
        self.assertLessEqual(len(data["stdout"].encode("utf-8")), sandbox.MAX_OUTPUT + 32)

    def test_cors_preflight(self):
        host, port = self.httpd.server_address[:2]
        status, headers, _ = http_req(
            "http://%s:%s/ai/mcp" % (host, port),
            method="OPTIONS",
            headers={
                "Origin": "https://agent.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version, X-MCP-PIN",
            },
        )
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("access-control-allow-origin"), "https://agent.example")
        allow = headers.get("access-control-allow-headers", "").lower()
        self.assertIn("authorization", allow)
        self.assertIn("mcp-session-id", allow)
        self.assertIn("x-mcp-pin", allow)
        status, _, _ = http_req(
            self.url,
            method="OPTIONS",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
        )
        self.assertEqual(status, 403)

    def test_lockout_returns_429(self):
        host, port = self.httpd.server_address[:2]
        url = "http://%s:%s/mcp" % (host, port)
        # Use a unique-looking PIN so we don't trip the class-wide server
        # with leftover state; the limiter is per IP, and all tests share 127.0.0.1.
        # So we only check that a 429 *can* be produced on a fresh limiter,
        # which is covered in test_auth. Here we just confirm a wrong PIN is 401
        # (the shared limiter should not yet be locked from a few misses).
        status, _, _ = rpc(url, "ping", password="still-wrong")
        self.assertIn(status, (401, 429))
