"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_audit.py
Purpose:      Tests for the v2.5 human-readable command audit log:
              line format, escaping, rotation, file mode, disable flag,
              and the promise that PINs, auth headers and file contents
              are never written.
Place:        mcp/tests/test_audit.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, helpers, mcp.log, mcp.protocol.
"""
from __future__ import annotations

import os
import shutil
import stat
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from helpers import call_tool, make_cfg, start_server, write_text, LOOPBACK_OK, LOOPBACK_NOTE  # noqa: E402
from mcp.config import (  # noqa: E402
    AUDIT_FILE_MODE,
    AUDIT_TRUNC_MARK,
    DEFAULT_AUDIT_COMMAND_LEN,
    default_audit_log,
)
from mcp.log import (  # noqa: E402
    append_audit_line,
    escape_audit_text,
    format_audit_line,
    rotate_audit_log,
    tool_audit,
)


class _TinyCfg(object):
    """Minimal object with the audit attributes append_audit_line needs."""

    def __init__(self, path, max_bytes=1024, keep=3, enabled=True, files=True, command_len=None):
        """Store audit settings for a test.

        Args:
            path (str): Audit log path.
            max_bytes (int): Rotation size.
            keep (int): Number of backups.
            enabled (bool): cfg.audit_enabled.
            files (bool): cfg.audit_files.
            command_len (int | None): Command field cap.
        """
        self.audit_log = path
        self.audit_max = max_bytes
        self.audit_keep = keep
        self.audit_enabled = enabled
        self.audit_files = files
        self.audit_command_len = command_len or DEFAULT_AUDIT_COMMAND_LEN
        self.log_file = os.path.join(os.path.dirname(path), "mcp.log")


class EscapeAndFormatTests(unittest.TestCase):
    """Pure formatting tests; no server and no files required."""

    def test_escape_newlines_and_truncate(self):
        text = escape_audit_text("a\nb\tc\\d\r", 100)
        self.assertEqual(text, "a\\nb\\tc\\\\d\\r")
        short = escape_audit_text("abcdefghij", 4)
        self.assertEqual(short, "abcd" + AUDIT_TRUNC_MARK)
        self.assertEqual(escape_audit_text(None, 10), "")

    def test_format_line_fields(self):
        line = format_audit_line(
            "2026-11-10T16:00:00+0530",
            "127.0.0.1",
            "run_command",
            "/workspace",
            0.312,
            0,
            False,
            "ls -la",
        )
        self.assertIn("2026-11-10T16:00:00+0530", line)
        self.assertIn("ip=127.0.0.1", line)
        self.assertIn("tool=run_command", line)
        self.assertIn("cwd=/workspace", line)
        self.assertIn("duration=0.312", line)
        self.assertIn("exit=0", line)
        self.assertIn("timed_out=0", line)
        self.assertIn("command=ls -la", line)
        self.assertNotIn("\n", line)
        timed = format_audit_line(
            "t", "ip", "run_command", "/workspace", 1.5, 124, True, "sleep 20"
        )
        self.assertIn("timed_out=1", timed)
        self.assertIn("exit=124", timed)

    def test_default_audit_log_path(self):
        self.assertEqual(
            default_audit_log("/home/ai/mcp.log"),
            "/home/ai/mcp-audit.log",
        )
        self.assertEqual(
            default_audit_log("/tmp/state/mcp.log"),
            "/tmp/state/mcp-audit.log",
        )


class RotationAndModeTests(unittest.TestCase):
    """Rotation and chmod behaviour on a temporary directory."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="aimcp-audit-")
        self.path = os.path.join(self.tmp, "mcp-audit.log")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_append_creates_mode_600(self):
        cfg = _TinyCfg(self.path)
        append_audit_line(cfg, "first line")
        self.assertTrue(os.path.isfile(self.path))
        mode = stat.S_IMODE(os.stat(self.path).st_mode)
        self.assertEqual(mode, AUDIT_FILE_MODE)
        with open(self.path, encoding="utf-8") as fh:
            self.assertEqual(fh.read(), "first line\n")

    def test_rotate_by_size_keeps_backups(self):
        # A tiny cap so the second short line forces a rotation.
        cfg = _TinyCfg(self.path, max_bytes=20, keep=3)
        append_audit_line(cfg, "AAAAAAAAAA")
        append_audit_line(cfg, "BBBBBBBBBB")
        # After the second write the first file should have been rotated.
        self.assertTrue(os.path.isfile(self.path))
        self.assertTrue(os.path.isfile(self.path + ".1"))
        with open(self.path, encoding="utf-8") as fh:
            current = fh.read()
        with open(self.path + ".1", encoding="utf-8") as fh:
            previous = fh.read()
        self.assertIn("BBBBBBBBBB", current)
        self.assertIn("AAAAAAAAAA", previous)
        # Keep writing until we have .2 and confirm .3 is the last kept.
        append_audit_line(cfg, "CCCCCCCCCC")
        append_audit_line(cfg, "DDDDDDDDDD")
        self.assertTrue(os.path.isfile(self.path + ".2"))
        self.assertTrue(os.path.isfile(self.path + ".3"))
        # A fifth rotation should drop the oldest (.4 must not remain).
        append_audit_line(cfg, "EEEEEEEEEE")
        self.assertFalse(os.path.isfile(self.path + ".4"))
        self.assertTrue(os.path.isfile(self.path + ".3"))

    def test_rotate_helper_noop_when_small(self):
        write_text(self.path, "small\n")
        rotate_audit_log(self.path, 10 * 1024 * 1024, 3)
        self.assertTrue(os.path.isfile(self.path))
        self.assertFalse(os.path.isfile(self.path + ".1"))


class ToolAuditTests(unittest.TestCase):
    """tool_audit filtering, and an end-to-end tools/call line."""

    def setUp(self):
        self.cfg = make_cfg(sandbox="none")

    def tearDown(self):
        shutil.rmtree(self.cfg._tmp, ignore_errors=True)

    def _read_audit(self):
        path = self.cfg.audit_log
        if not os.path.isfile(path):
            return ""
        with open(path, encoding="utf-8") as fh:
            return fh.read()

    @unittest.skipUnless(LOOPBACK_OK, LOOPBACK_NOTE)
    def test_run_command_line_and_no_secrets(self):
        httpd, thread, url = start_server(self.cfg)
        try:
            status, _, parsed = call_tool(
                url, "run_command", {"command": "echo hello"}
            )
            self.assertEqual(status, 200, parsed)
        finally:
            httpd.shutdown()
            httpd.server_close()
        body = self._read_audit()
        self.assertIn("tool=run_command", body)
        self.assertIn("command=echo hello", body)
        self.assertIn("cwd=/workspace", body)
        self.assertIn("exit=0", body)
        self.assertIn("timed_out=0", body)
        self.assertIn("ip=127.0.0.1", body)
        # The PIN used by the test server must not appear.
        self.assertNotIn(self.cfg.pin, body)
        self.assertNotIn("Authorization", body)
        self.assertNotIn("Bearer ", body)
        lines = [ln for ln in body.splitlines() if ln.strip()]
        self.assertGreaterEqual(len(lines), 1)
        self.assertIn("command=echo hello", lines[-1])

    def test_file_tool_logs_path_not_contents(self):
        secret = "UNIQUE_FILE_CONTENTS_XYZ"
        tool_audit(
            self.cfg,
            "127.0.0.1",
            "write_file",
            {"path": "/workspace/secret.txt", "content": secret},
            {"path": "/workspace/secret.txt", "bytes": len(secret)},
            0.01,
        )
        body = self._read_audit()
        self.assertIn("tool=write_file", body)
        self.assertIn("path=/workspace/secret.txt", body)
        self.assertNotIn(secret, body)
        self.assertNotIn("content=", body)

    def test_audit_disabled_writes_nothing(self):
        self.cfg.audit_enabled = False
        tool_audit(
            self.cfg,
            "127.0.0.1",
            "run_command",
            {"command": "echo should-not-log"},
            {"exit_code": 0, "timed_out": False},
            0.01,
        )
        self.assertFalse(os.path.isfile(self.cfg.audit_log))

    def test_audit_files_off_skips_file_tools_only(self):
        self.cfg.audit_files = False
        tool_audit(
            self.cfg,
            "127.0.0.1",
            "read_file",
            {"path": "/workspace/x"},
            {"content": "nope"},
            0.01,
        )
        self.assertFalse(os.path.isfile(self.cfg.audit_log))
        tool_audit(
            self.cfg,
            "127.0.0.1",
            "run_command",
            {"command": "true"},
            {"exit_code": 0, "timed_out": False},
            0.02,
        )
        body = self._read_audit()
        self.assertIn("tool=run_command", body)
        self.assertNotIn("read_file", body)
        self.assertNotIn("nope", body)
