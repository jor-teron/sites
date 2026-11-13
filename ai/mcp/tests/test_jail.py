"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_jail.py
Purpose:      Tests for the unprivileged user-namespace probe used by the jail.
Place:        mcp/tests/test_jail.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, helpers, mcp.nscompat.
"""
from __future__ import annotations

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from helpers import USERNS_NOTE, USERNS_OK  # noqa: E402
from mcp.nscompat import userns_available  # noqa: E402


class UsernsTests(unittest.TestCase):
    def test_probe_reports_status(self):
        ok, msg = userns_available()
        self.assertIsInstance(ok, bool)
        self.assertTrue(msg)
        # This box should allow unprivileged user namespaces.
        self.assertEqual(ok, USERNS_OK)
        if not ok:
            self.assertIn("user namespace", msg.lower() + USERNS_NOTE.lower())

    @unittest.skipUnless(USERNS_OK, "userns unavailable: %s" % USERNS_NOTE)
    def test_probe_ok_on_this_box(self):
        ok, msg = userns_available()
        self.assertTrue(ok, msg)
        self.assertIn("work", msg.lower())
