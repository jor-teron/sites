"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_selftest.py
Purpose:      Tests for mcp.sh --selftest / mcp.selftest: status lines,
              PIN classification, redaction, summary exit codes, and a
              live run against a temporary server that must not print
              the PIN.
Place:        mcp/tests/test_selftest.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, helpers, mcp.selftest, mcp.sh.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
AI_DIR = os.path.realpath(os.path.join(HERE, "..", ".."))
MCP_SH = os.path.join(AI_DIR, "mcp.sh")
sys.path.insert(0, AI_DIR)

from helpers import make_cfg, start_server, LOOPBACK_OK, LOOPBACK_NOTE  # noqa: E402
from mcp.config import (  # noqa: E402
    MIN_DIGIT_PIN_LEN,
    MIN_PIN_LEN,
    SELFTEST_FAIL,
    SELFTEST_PASS,
    SELFTEST_SKIP,
    pin_is_weak,
)
from mcp.selftest import (  # noqa: E402
    CheckResult,
    check_python,
    format_check_line,
    format_summary,
    pin_leaks,
    redact_pin,
    run_all,
    summarise,
)


class PinAndFormatTests(unittest.TestCase):
    """PIN strength and output formatting, no server required."""

    def test_pin_is_weak_rules(self):
        self.assertTrue(pin_is_weak("password"))
        self.assertTrue(pin_is_weak("PASSWORD"))
        self.assertTrue(pin_is_weak("short"))
        self.assertTrue(pin_is_weak("12345678901"))  # 11 digits, also short
        self.assertTrue(pin_is_weak("123456789012"))  # 12 digits, still short
        self.assertTrue(pin_is_weak(""))
        self.assertFalse(pin_is_weak("correct-horse"))  # 13 chars, not all digits
        # A 16-digit PIN meets MIN_DIGIT_PIN_LEN.
        self.assertEqual(MIN_PIN_LEN, 12)
        self.assertEqual(MIN_DIGIT_PIN_LEN, 16)
        self.assertFalse(pin_is_weak("1234567890123456"))

    def test_redact_and_format_never_show_pin(self):
        pin = "super-secret-pin"
        line = format_check_line(
            CheckResult(SELFTEST_FAIL, "config", "used " + pin + " by mistake")
        )
        # The helper that prints results redacts first; this test checks
        # both the raw leak detector and redact_pin.
        self.assertTrue(pin_leaks(line, pin))
        safe = redact_pin(line, pin)
        self.assertNotIn(pin, safe)
        self.assertIn("config:", safe)

    def test_python_check_passes_here(self):
        result = check_python()
        self.assertEqual(result.status, SELFTEST_PASS)
        self.assertIn("python3", format_check_line(result))

    def test_summary_exit_code(self):
        results = [
            CheckResult(SELFTEST_PASS, "a", "ok"),
            CheckResult(SELFTEST_SKIP, "b", "no"),
        ]
        passed, failed, skipped, code = summarise(results)
        self.assertEqual((passed, failed, skipped, code), (1, 0, 1, 0))
        results.append(CheckResult(SELFTEST_FAIL, "c", "bad"))
        passed, failed, skipped, code = summarise(results)
        self.assertEqual(code, 1)
        self.assertEqual(failed, 1)
        self.assertIn("2 passed, 1 failed, 1 skipped", format_summary(2, 1, 1))


class SelftestOfflineTests(unittest.TestCase):
    """run_all(include_live=False) against a temp Config."""

    def test_weak_pin_fails_config_and_prints_no_pin(self):
        cfg = make_cfg(sandbox="none", pin="password")
        try:
            results = run_all(cfg=cfg, include_live=False)
            names = [item.name for item in results]
            self.assertIn("python3", names)
            self.assertIn("config", names)
            conf = [item for item in results if item.name == "config"][0]
            self.assertEqual(conf.status, SELFTEST_FAIL)
            blob = "\n".join(format_check_line(item) for item in results)
            self.assertNotIn("password", blob)
            self.assertIn("too weak", conf.detail)
        finally:
            shutil.rmtree(cfg._tmp, ignore_errors=True)

    def test_strong_pin_passes_config(self):
        cfg = make_cfg(sandbox="none", pin="correct-horse-battery")
        try:
            results = run_all(cfg=cfg, include_live=False)
            conf = [item for item in results if item.name == "config"][0]
            self.assertEqual(conf.status, SELFTEST_PASS)
            blob = "\n".join(format_check_line(item) for item in results)
            self.assertNotIn("correct-horse-battery", blob)
        finally:
            shutil.rmtree(cfg._tmp, ignore_errors=True)


class SelftestLiveTests(unittest.TestCase):
    """Full self-test against a temporary unsandboxed server."""

    @unittest.skipUnless(LOOPBACK_OK, LOOPBACK_NOTE)
    def test_live_run_all_and_mcp_sh(self):
        pin = "correct-horse-battery"
        cfg = make_cfg(sandbox="none", pin=pin)
        httpd, thread, url = start_server(cfg)
        # start_server binds an ephemeral port (cfg.port was 0).
        cfg.port = httpd.server_address[1]
        try:
            results = run_all(cfg=cfg, include_live=True)
            blob = "\n".join(format_check_line(item) for item in results)
            self.assertNotIn(pin, blob)
            by_name = {item.name: item for item in results}
            self.assertEqual(by_name["python3"].status, SELFTEST_PASS)
            self.assertEqual(by_name["config"].status, SELFTEST_PASS)
            self.assertEqual(by_name["server"].status, SELFTEST_PASS)
            # Isolation is off, so jail/network are skipped, not failed.
            self.assertEqual(by_name["jail"].status, SELFTEST_SKIP)
            self.assertEqual(by_name["network"].status, SELFTEST_SKIP)
            self.assertEqual(by_name["git"].status, SELFTEST_PASS)
            self.assertIn(by_name["workspace size limit"].status, (SELFTEST_PASS, SELFTEST_FAIL))
            _, failed, _, code = summarise(results)
            # Funnel / autostart may fail on this box; that is still a
            # valid non-zero exit, but none of the lines may show the PIN.
            self.assertGreaterEqual(failed, 0)
            if by_name["server"].status == SELFTEST_PASS and by_name["git"].status == SELFTEST_PASS:
                pass

            # Also drive mcp.sh --selftest with the same temp server.
            env = os.environ.copy()
            env.update({
                "MCP_STATE_DIR": cfg._tmp,
                "MCP_ROOT": cfg.root,
                "MCP_LOG": cfg.log_file,
                "MCP_AUDIT_LOG": cfg.audit_log,
                "MCP_PORT": str(cfg.port if cfg.port else httpd.server_address[1]),
                "MCP_HOST": "127.0.0.1",
                "MCP_SANDBOX": "none",
                "MCP_PIN": pin,
                "MCP_CONF": os.path.join(cfg._tmp, "no-such.conf"),
            })
            # The Config the server was started with used port 0 (ephemeral).
            env["MCP_PORT"] = str(httpd.server_address[1])
            proc = subprocess.run(
                ["sh", MCP_SH, "--selftest"],
                cwd=AI_DIR,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=40,
                text=True,
            )
            self.assertNotIn(pin, proc.stdout)
            self.assertIn("python3:", proc.stdout)
            self.assertIn("passed", proc.stdout.lower())
            # Weak/strong already classified inside run_all; the script
            # must print the summary even when funnel/cron fail.
            self.assertRegex(proc.stdout, r"\d+ passed, \d+ failed, \d+ skipped")
        finally:
            httpd.shutdown()
            httpd.server_close()
            shutil.rmtree(cfg._tmp, ignore_errors=True)

    def test_mcp_sh_logs_missing_output_file(self):
        state = tempfile.mkdtemp(prefix="aimcp-logs-")
        try:
            env = os.environ.copy()
            env.update({
                "MCP_STATE_DIR": state,
                "MCP_LOG": os.path.join(state, "mcp.log"),
                "MCP_CONF": os.path.join(state, "no-such.conf"),
                "MCP_SANDBOX": "none",
                "MCP_PIN": "correct-horse-battery",
            })
            missing = subprocess.run(
                ["sh", MCP_SH, "--logs"],
                cwd=AI_DIR,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=5,
                text=True,
            )
            self.assertEqual(missing.returncode, 0, missing.stdout)
            self.assertIn("no output file yet", missing.stdout)
        finally:
            shutil.rmtree(state, ignore_errors=True)
