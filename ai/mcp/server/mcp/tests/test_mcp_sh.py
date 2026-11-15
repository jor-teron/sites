"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_mcp_sh.py
Purpose:      Smoke-test mcp.sh under both sh and bash on a temp port.
Place:        mcp/tests/test_mcp_sh.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, subprocess, mcp.sh.
"""
from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
AI_DIR = os.path.realpath(os.path.join(HERE, "..", ".."))
MCP_SH = os.path.join(AI_DIR, "mcp.sh")
EXPECTED_VERSION = Path(AI_DIR, "VERSION").read_text(encoding="ascii").strip()
sys.path.insert(0, AI_DIR)
from mcp.tests.helpers import LOOPBACK_OK, LOOPBACK_NOTE  # noqa: E402


def _free_port():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def _http_code(url, timeout=3):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status
    except urllib.error.HTTPError as exc:
        return exc.code
    except Exception:
        return 0


class McpShSmokeTests(unittest.TestCase):
    def _smoke(self, shell):
        if not shutil.which(shell):
            self.skipTest("%s not installed" % shell)
        self.assertTrue(os.path.isfile(MCP_SH))
        state = tempfile.mkdtemp(prefix="aimcp-sh-")
        work = os.path.join(state, "workspace")
        os.mkdir(work)
        port = _free_port()
        env = os.environ.copy()
        env.update({
            "MCP_STATE_DIR": state,
            "MCP_ROOT": work,
            "MCP_LOG": os.path.join(state, "mcp.log"),
            "MCP_PORT": str(port),
            "MCP_HOST": "127.0.0.1",
            "MCP_SANDBOX": "none",
            "MCP_PIN": "password",
            "MCP_CONF": os.path.join(state, "no-such.conf"),
        })
        try:
            start = subprocess.run(
                [shell, MCP_SH, "--bg"],
                cwd=AI_DIR,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=20,
                text=True,
            )
            self.assertEqual(start.returncode, 0, start.stdout)
            self.assertIn("[1/6] Load configuration", start.stdout)
            self.assertIn("[6/6] Wait for HTTP health response", start.stdout)
            self.assertIn("Local endpoint:", start.stdout)
            # Wait until it answers (401 on unauthenticated POST / GET 405 or health 200)
            url = "http://127.0.0.1:%s/health" % port
            deadline = time.time() + 8
            code = 0
            while time.time() < deadline:
                code = _http_code(url)
                if code == 200:
                    break
                time.sleep(0.2)
            self.assertEqual(code, 200, start.stdout)

            status = subprocess.run(
                [shell, MCP_SH, "--status"],
                cwd=AI_DIR,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=10,
                text=True,
            )
            self.assertEqual(status.returncode, 0, status.stdout)
            self.assertIn("running", status.stdout.lower())
            self.assertIn("good", status.stdout.lower())
            # A temp workspace is not a loop mount, so the cap is off.
            self.assertIn("workspace size limit: off", status.stdout)

            # restart
            restart = subprocess.run(
                [shell, MCP_SH, "--restart"],
                cwd=AI_DIR,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=25,
                text=True,
            )
            self.assertEqual(restart.returncode, 0, restart.stdout)
            deadline = time.time() + 8
            code = 0
            while time.time() < deadline:
                code = _http_code(url)
                if code == 200:
                    break
                time.sleep(0.2)
            self.assertEqual(code, 200, restart.stdout)

            stop = subprocess.run(
                [shell, MCP_SH, "--stop"],
                cwd=AI_DIR,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=15,
                text=True,
            )
            self.assertEqual(stop.returncode, 0, stop.stdout)
            # Give the port a moment to close
            time.sleep(0.4)
            self.assertNotEqual(_http_code(url), 200)

            # Quiet mode suppresses progress steps but keeps the final result.
            quiet = subprocess.run(
                [shell, MCP_SH, "--quiet", "--bg"],
                cwd=AI_DIR,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=20,
                text=True,
            )
            self.assertEqual(quiet.returncode, 0, quiet.stdout)
            self.assertNotIn("[1/6]", quiet.stdout)
            self.assertIn("READY:", quiet.stdout)
        finally:
            subprocess.run(
                [shell, MCP_SH, "--stop"],
                cwd=AI_DIR,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=15,
            )
            shutil.rmtree(state, ignore_errors=True)

    @unittest.skipUnless(LOOPBACK_OK, LOOPBACK_NOTE)
    def test_smoke_sh(self):
        self._smoke("sh")

    @unittest.skipUnless(LOOPBACK_OK, LOOPBACK_NOTE)
    def test_smoke_bash(self):
        self._smoke("bash")

    def test_version_reports_release(self):
        out = subprocess.run(
            ["sh", MCP_SH, "--version"],
            cwd=AI_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=5,
            text=True,
        )
        self.assertEqual(out.returncode, 0, out.stdout)
        self.assertIn(EXPECTED_VERSION, out.stdout)

    def test_help_and_unknown(self):
        help_out = subprocess.run(
            ["sh", MCP_SH, "--help"],
            cwd=AI_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=5,
            text=True,
        )
        self.assertEqual(help_out.returncode, 0, help_out.stdout)
        self.assertIn("--bg", help_out.stdout)
        self.assertIn("--funnel", help_out.stdout)
        self.assertIn("--selftest", help_out.stdout)
        bad = subprocess.run(
            ["sh", MCP_SH, "--nope"],
            cwd=AI_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=5,
            text=True,
        )
        self.assertNotEqual(bad.returncode, 0)
        self.assertIn("unknown option", bad.stdout.lower())
