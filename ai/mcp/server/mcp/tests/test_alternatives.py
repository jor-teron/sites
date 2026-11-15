"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_alternatives.py
Purpose:      Tests for the v2.5 /etc/alternatives jail bind: the
              decision helper always, and a live awk probe inside the
              namespace jail when unprivileged user namespaces work.
Place:        mcp/tests/test_alternatives.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, helpers, mcp.jail.
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from helpers import (  # noqa: E402
    USERNS_NOTE,
    USERNS_OK,
    LOOPBACK_OK,
    LOOPBACK_NOTE,
    call_tool,
    make_cfg,
    start_server,
    tool_payload,
)
from mcp.config import HOST_ALTERNATIVES_PATH  # noqa: E402
from mcp.jail import alternatives_bind_source  # noqa: E402


class AlternativesDecisionTests(unittest.TestCase):
    """Unit tests for alternatives_bind_source; no userns required."""

    def test_disabled_returns_none(self):
        self.assertIsNone(alternatives_bind_source(False, HOST_ALTERNATIVES_PATH))
        self.assertIsNone(alternatives_bind_source(False, "/etc/alternatives"))

    def test_missing_host_path_returns_none(self):
        missing = os.path.join(tempfile.gettempdir(), "no-such-alternatives-dir")
        self.assertFalse(os.path.isdir(missing))
        self.assertIsNone(alternatives_bind_source(True, missing))

    def test_existing_directory_is_returned(self):
        tmp = tempfile.mkdtemp(prefix="aimcp-alt-")
        try:
            self.assertEqual(alternatives_bind_source(True, tmp), tmp)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_host_alternatives_when_present(self):
        src = alternatives_bind_source(True)
        if os.path.isdir(HOST_ALTERNATIVES_PATH):
            self.assertEqual(src, HOST_ALTERNATIVES_PATH)
        else:
            self.assertIsNone(src)


@unittest.skipUnless(LOOPBACK_OK, LOOPBACK_NOTE)
@unittest.skipUnless(USERNS_OK, "unprivileged userns unavailable: %s" % USERNS_NOTE)
@unittest.skipUnless(
    os.path.isdir(HOST_ALTERNATIVES_PATH),
    "host has no /etc/alternatives",
)
class AlternativesJailTests(unittest.TestCase):
    """Live jail probe: awk should resolve when the bind is on."""

    @classmethod
    def setUpClass(cls):
        cls.cfg = make_cfg(sandbox="ns")
        cls.cfg.bind_alternatives = True
        cls.httpd, cls.thread, cls.url = start_server(cls.cfg)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        shutil.rmtree(cls.cfg._tmp, ignore_errors=True)

    def _run(self, command, timeout=15):
        """Run a command in the live jail and return the tool payload.

        Args:
            command (str): Shell command.
            timeout (int | float): Tool timeout in seconds.

        Returns:
            dict: run_command result (exit_code, stdout, stderr, ...).
        """
        status, _, parsed = call_tool(
            self.url, "run_command", {"command": command, "timeout": timeout}
        )
        self.assertEqual(status, 200, parsed)
        return tool_payload(parsed)

    def test_awk_resolves_and_runs(self):
        data = self._run(
            "command -v awk; test -e /etc/alternatives/awk && echo ALT_OK; "
            "awk 'BEGIN{print \"AWK_OK\"}'"
        )
        combined = str(data.get("stdout") or "") + str(data.get("stderr") or "")
        self.assertEqual(data["exit_code"], 0, data)
        self.assertIn("AWK_OK", combined)
        self.assertIn("ALT_OK", combined)

    def test_flag_off_skips_alternatives_dir(self):
        # A second jail with the flag off should not see /etc/alternatives
        # (the directory is only created when the bind is attempted).
        cfg = make_cfg(sandbox="ns")
        cfg.bind_alternatives = False
        httpd, thread, url = start_server(cfg)
        try:
            status, _, parsed = call_tool(
                url,
                "run_command",
                {
                    "command": "test -e /etc/alternatives && echo HAS_ALT || echo NO_ALT",
                    "timeout": 15,
                },
            )
            self.assertEqual(status, 200, parsed)
            data = tool_payload(parsed)
            combined = str(data.get("stdout") or "") + str(data.get("stderr") or "")
            self.assertIn("NO_ALT", combined)
        finally:
            httpd.shutdown()
            httpd.server_close()
            shutil.rmtree(cfg._tmp, ignore_errors=True)
