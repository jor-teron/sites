"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_protocol.py
Purpose:      Unit tests for initialize, ping, tools/list and dispatch_rpc errors.
Place:        mcp/tests/test_protocol.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, mcp.protocol, mcp.tools.
"""
from __future__ import annotations

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from mcp import protocol  # noqa: E402
from mcp.tools import tool_handlers  # noqa: E402


class ProtocolTests(unittest.TestCase):
    def test_initialize_known_and_unknown_version(self):
        result = protocol.handle_initialize({"protocolVersion": "2025-06-18"})
        self.assertEqual(result["protocolVersion"], "2025-06-18")
        self.assertEqual(result["serverInfo"]["name"], "ai-mcp")
        self.assertEqual(result["serverInfo"]["version"], protocol.VERSION)
        self.assertIn("tools", result["capabilities"])
        result = protocol.handle_initialize({"protocolVersion": "1999-01-01"})
        self.assertEqual(result["protocolVersion"], protocol.LATEST_PROTOCOL_VERSION)
        result = protocol.handle_initialize({})
        self.assertEqual(result["protocolVersion"], protocol.LATEST_PROTOCOL_VERSION)

    def test_dispatch_ping_and_invalid(self):
        class Dummy:
            pass

        cfg = Dummy()
        is_notif, resp = protocol.dispatch_rpc(
            {"jsonrpc": "2.0", "id": 1, "method": "ping"}, cfg, "127.0.0.1"
        )
        self.assertFalse(is_notif)
        self.assertEqual(resp["result"], {})

        is_notif, resp = protocol.dispatch_rpc({"id": 1, "method": "ping"}, cfg, "127.0.0.1")
        self.assertEqual(resp["error"]["code"], -32600)

        is_notif, resp = protocol.dispatch_rpc(
            {"jsonrpc": "2.0", "id": 1, "method": "nope"}, cfg, "127.0.0.1"
        )
        self.assertEqual(resp["error"]["code"], -32601)

        is_notif, resp = protocol.dispatch_rpc(
            {"jsonrpc": "2.0", "method": "notifications/initialized"}, cfg, "127.0.0.1"
        )
        self.assertTrue(is_notif)
        self.assertIsNone(resp)

    def test_tools_list_names(self):
        is_notif, resp = protocol.dispatch_rpc(
            {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, None, "127.0.0.1"
        )
        names = {item["name"] for item in resp["result"]["tools"]}
        self.assertEqual(names, set(tool_handlers))
        expected = {
            "run_command", "read_file", "write_file", "edit_file",
            "list_dir", "delete_path", "move_path",
        }
        self.assertEqual(names, expected)

    def test_unknown_tool_is_error_result(self):
        class Dummy:
            pass

        is_notif, resp = protocol.dispatch_rpc(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "no_such_tool", "arguments": {}},
            },
            Dummy(),
            "127.0.0.1",
        )
        self.assertTrue(resp["result"]["isError"])
        self.assertIn("Unknown tool", resp["result"]["content"][0]["text"])
