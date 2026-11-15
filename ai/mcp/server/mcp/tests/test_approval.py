"""Tests for one-time internet/sudo approval."""
from __future__ import annotations

import os
import unittest

from mcp.approval import confirm_approval, request_approval
from mcp.config.constants import ALLOW_NET_FLAG, ALLOW_SUDO_FLAG


class ApprovalTests(unittest.TestCase):
    def tearDown(self):
        for path in (ALLOW_NET_FLAG, ALLOW_SUDO_FLAG):
            try:
                os.unlink(path)
            except OSError:
                pass

    def test_internet_roundtrip(self):
        asked = request_approval("internet", "need apt")
        self.assertIn("ALLOW INTERNET", asked["message"])
        result = confirm_approval("internet", asked["code"])
        self.assertTrue(result["ok"])
        self.assertTrue(os.path.isfile(ALLOW_NET_FLAG))

    def test_bad_code(self):
        request_approval("sudo", "install")
        with self.assertRaises(ValueError):
            confirm_approval("sudo", "NOPE")

    def test_unknown_kind(self):
        with self.assertRaises(ValueError):
            request_approval("root", "")
