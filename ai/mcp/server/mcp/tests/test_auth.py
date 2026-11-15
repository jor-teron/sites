"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_auth.py
Purpose:      Unit tests for PIN matching, path PINs, header extraction and lockout.
Place:        mcp/tests/test_auth.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, mcp.auth.
"""
from __future__ import annotations

import os
import sys
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from mcp import auth  # noqa: E402


class PinMatchTests(unittest.TestCase):
    def test_match(self):
        self.assertTrue(auth.pins_match("secret", "secret"))
        self.assertFalse(auth.pins_match("secret", "Secret"))
        self.assertFalse(auth.pins_match("secret", "secret "))
        self.assertFalse(auth.pins_match(None, "secret"))
        self.assertFalse(auth.pins_match("secret", None))
        self.assertFalse(auth.pins_match("", "secret"))

    def test_path_pin(self):
        self.assertTrue(auth.path_has_pin("/ai/mcp/secret", "secret"))
        self.assertTrue(auth.path_has_pin("/secret", "secret"))
        self.assertTrue(auth.path_has_pin("/mcp/secret/", "secret"))
        self.assertFalse(auth.path_has_pin("/ai/mcp/secretx", "secret"))
        self.assertFalse(auth.path_has_pin("/ai/mcp/xsecret", "secret"))
        self.assertFalse(auth.path_has_pin("/ai/mcp/wrong", "secret"))
        # URL-encoded PIN
        self.assertTrue(auth.path_has_pin("/ai/mcp/p%40ss", "p@ss"))

    def test_redact(self):
        self.assertEqual(auth.redact_path("/ai/mcp/secret", "secret"), "/ai/mcp/***")
        self.assertEqual(auth.redact_path("/ai/mcp/other", "secret"), "/ai/mcp/other")
        self.assertEqual(auth.redact_path("/ai/mcp/p%40ss", "p@ss"), "/ai/mcp/***")

    def test_extract_bearer_and_basic_and_headers(self):
        import base64

        self.assertEqual(
            auth.extract_provided_pin({"Authorization": "Bearer hunter2"}),
            "hunter2",
        )
        raw = base64.b64encode(b"anyone:hunter2").decode("ascii")
        self.assertEqual(
            auth.extract_provided_pin({"Authorization": "Basic " + raw}),
            "hunter2",
        )
        self.assertEqual(auth.extract_provided_pin({"X-MCP-PIN": "hunter2"}), "hunter2")
        self.assertEqual(
            auth.extract_provided_pin({"X-MCP-Password": "hunter2"}), "hunter2"
        )
        self.assertIsNone(auth.extract_provided_pin({}))


class RateLimiterTests(unittest.TestCase):
    def test_lockout_after_repeated_failures(self):
        limiter = auth.RateLimiter(fail_threshold=5, max_delay=60)
        ip = "203.0.113.9"
        for _ in range(4):
            ok, wait = limiter.check(ip)
            self.assertTrue(ok)
            self.assertEqual(wait, 0.0)
            limiter.fail(ip)
        # 5th failure starts a lockout
        limiter.fail(ip)
        ok, wait = limiter.check(ip)
        self.assertFalse(ok)
        self.assertGreater(wait, 0)
        limiter.success(ip)
        ok, wait = limiter.check(ip)
        self.assertTrue(ok)

    def test_failure_table_is_bounded(self):
        limiter = auth.RateLimiter(fail_threshold=3, max_delay=30, max_entries=2)
        limiter.fail("10.0.0.1")
        limiter.fail("10.0.0.2")
        limiter.fail("10.0.0.3")
        self.assertEqual(len(limiter._fails), 2)
        self.assertNotIn("10.0.0.1", limiter._fails)
        self.assertIn("10.0.0.2", limiter._fails)
        self.assertIn("10.0.0.3", limiter._fails)

    def test_active_record_is_recently_used_before_eviction(self):
        limiter = auth.RateLimiter(fail_threshold=3, max_delay=30, max_entries=2)
        limiter.fail("10.0.0.1")
        limiter.fail("10.0.0.2")
        limiter.check("10.0.0.1")
        limiter.fail("10.0.0.3")
        self.assertIn("10.0.0.1", limiter._fails)
        self.assertNotIn("10.0.0.2", limiter._fails)

    def test_independent_ips(self):
        limiter = auth.RateLimiter(fail_threshold=3, max_delay=30)
        for _ in range(5):
            limiter.fail("10.0.0.1")
        ok, _ = limiter.check("10.0.0.1")
        self.assertFalse(ok)
        ok, _ = limiter.check("10.0.0.2")
        self.assertTrue(ok)
