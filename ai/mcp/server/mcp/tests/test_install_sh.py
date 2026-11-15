"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_install_sh.py
Purpose:      Tests for install.sh: help text, PIN checks, idempotent
              install into a temp directory without root, and the
              workspace-image / fstab logic paths that can run without
              mkfs.ext4 or a loop mount.
Place:        mcp/tests/test_install_sh.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, subprocess, install.sh.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
AI_DIR = os.path.realpath(os.path.join(HERE, "..", ".."))
INSTALL_SH = os.path.join(AI_DIR, "install.sh")
EXPECTED_VERSION = Path(AI_DIR, "VERSION").read_text(encoding="ascii").strip()


def _run(args, env=None, timeout=30, input_text=None, cwd=None):
    """Run a command and return the CompletedProcess (text mode).

    Args:
        args (list[str]): argv.
        env (dict | None): Environment; defaults to os.environ.
        timeout (int | float): subprocess timeout in seconds.
        input_text (str | None): Bytes written to stdin.
        cwd (str | None): Working directory.

    Returns:
        subprocess.CompletedProcess: With text stdout/stderr combined.
    """
    return subprocess.run(
        args,
        cwd=cwd or AI_DIR,
        env=env or os.environ.copy(),
        input=input_text,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        text=True,
    )


def _lib(script, extra_env=None):
    """Source install.sh in library mode and run a short shell snippet.

    Args:
        script (str): POSIX sh commands run after the file is sourced.
        extra_env (dict | None): Extra environment variables.

    Returns:
        subprocess.CompletedProcess: Combined stdout/stderr, text mode.
    """
    env = os.environ.copy()
    env["MCP_INSTALL_LIB"] = "1"
    if extra_env:
        env.update(extra_env)
    return _run(
        ["sh", "-c", 'MCP_INSTALL_LIB=1; . "$1"; ' + script, "sh", INSTALL_SH],
        env=env,
    )


class InstallHelpTests(unittest.TestCase):
    """--help works under both sh and bash."""

    def test_help_sh_and_bash(self):
        self.assertTrue(os.path.isfile(INSTALL_SH))
        for shell in ("sh", "bash"):
            if not shutil.which(shell):
                self.skipTest("%s not installed" % shell)
            out = _run([shell, INSTALL_SH, "--help"])
            self.assertEqual(out.returncode, 0, out.stdout)
            self.assertIn("--dir", out.stdout)
            self.assertIn("--port", out.stdout)
            self.assertIn("--no-cron", out.stdout)
            self.assertIn("--no-funnel", out.stdout)
            self.assertIn("--yes", out.stdout)
            self.assertIn("workspace image feature is disabled", out.stdout)
            self.assertNotIn("--workspace-size", out.stdout)

    def test_version_reports_release(self):
        out = _run(["sh", INSTALL_SH, "--version"])
        self.assertEqual(out.returncode, 0, out.stdout)
        self.assertIn(EXPECTED_VERSION, out.stdout)

    def test_unknown_flag_fails(self):
        out = _run(["sh", INSTALL_SH, "--nope"])
        self.assertNotEqual(out.returncode, 0)
        self.assertIn("unknown option", out.stdout.lower())


class PinCheckTests(unittest.TestCase):
    """install.sh pin_is_weak and generate_pin (library mode)."""

    def test_weak_and_strong_pins(self):
        script = r"""
if pin_is_weak password; then echo weak_password; else echo fail_password; fi
if pin_is_weak PASSWORD; then echo weak_PASSWORD; else echo fail_PASSWORD; fi
if pin_is_weak short; then echo weak_short; else echo fail_short; fi
if pin_is_weak 12345678901; then echo weak_11; else echo fail_11; fi
if pin_is_weak 123456789012; then echo fail_12digits; else echo ok_12digits; fi
if pin_is_weak 'good-pin-here'; then echo weak_good; else echo ok_good; fi
if pin_is_weak 'has a space!!'; then echo weak_space; else echo fail_space; fi
"""
        out = _lib(script)
        self.assertEqual(out.returncode, 0, out.stdout)
        self.assertIn("weak_password", out.stdout)
        self.assertIn("weak_PASSWORD", out.stdout)
        self.assertIn("weak_short", out.stdout)
        self.assertIn("weak_11", out.stdout)
        self.assertIn("ok_12digits", out.stdout)
        self.assertIn("ok_good", out.stdout)
        self.assertIn("weak_space", out.stdout)

    def test_generate_pin_is_long_hex_and_strong(self):
        script = r"""
p=$(generate_pin)
# Do not print the PIN; only report length and weakness.
len=$(printf '%s' "$p" | wc -c)
if pin_is_weak "$p"; then weak=yes; else weak=no; fi
printf 'len=%s weak=%s\n' "$len" "$weak"
"""
        out = _lib(script)
        self.assertEqual(out.returncode, 0, out.stdout)
        self.assertIn("weak=no", out.stdout)
        # generate_pin uses 12 bytes -> 24 hex characters.
        self.assertRegex(out.stdout, r"len=24\b")
        # The generated value itself must not appear if we only printed len.
        # (A 24-char hex string would only be in the output if leaked.)
        leaked = [line for line in out.stdout.splitlines() if len(line) == 24]
        self.assertEqual(leaked, [])


class FstabHelperTests(unittest.TestCase):
    """add_fstab_line is idempotent and does not need root for a private file."""

    def test_add_fstab_line_once(self):
        tmp = tempfile.mkdtemp(prefix="aimcp-fstab-")
        try:
            fstab = os.path.join(tmp, "fstab")
            img = os.path.join(tmp, "workspace.img")
            mnt = os.path.join(tmp, "sandbox", "workspace")
            script = (
                'FSTAB="%s"; add_fstab_line "$FSTAB" "%s" "%s"; '
                'add_fstab_line "$FSTAB" "%s" "%s"'
            ) % (fstab, img, mnt, img, mnt)
            out = _lib(script)
            self.assertEqual(out.returncode, 0, out.stdout)
            with open(fstab, encoding="utf-8") as fh:
                body = fh.read()
            self.assertEqual(body.count(img), 1)
            self.assertIn("loop,nofail", body)
            self.assertIn(mnt, body)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class InstallSmokeTests(unittest.TestCase):
    """Run install.sh into a temp dir without cron, funnel, mount, or start."""

    def _install(self, dest, extra=None, env=None):
        """Run install.sh --yes into dest with the standard skip flags.

        Args:
            dest (str): Install directory.
            extra (list[str] | None): Extra flags.
            env (dict | None): Environment.

        Returns:
            subprocess.CompletedProcess: Combined output.
        """
        args = [
            "sh", INSTALL_SH,
            "--dir", dest,
            "--port", "18099",
            "--yes",
            "--no-cron",
            "--no-funnel",
            "--no-start",
        ]
        if extra:
            args.extend(extra)
        return _run(args, env=env, timeout=60)

    def test_smoke_no_image_idempotent(self):
        dest = tempfile.mkdtemp(prefix="aimcp-inst-")
        try:
            first = self._install(dest, extra=["--no-image"])
            self.assertEqual(first.returncode, 0, first.stdout)
            self.assertIn("python3:", first.stdout)
            self.assertIn("git:", first.stdout)
            self.assertTrue(os.path.isfile(os.path.join(dest, "mcp.sh")))
            self.assertTrue(os.path.isdir(os.path.join(dest, "mcp")))
            self.assertTrue(os.path.isdir(os.path.join(dest, "api")))
            self.assertTrue(os.path.isfile(os.path.join(dest, "api", "server.py")))
            self.assertTrue(os.path.isfile(os.path.join(dest, "api", "static", "rag.html")))
            self.assertTrue(os.path.isdir(os.path.join(dest, "storage")))
            self.assertTrue(os.path.isdir(os.path.join(dest, "rag")))
            self.assertTrue(os.path.isfile(os.path.join(dest, "rag.sh")))
            rag_status = _run(["sh", os.path.join(dest, "rag.sh"), "status"], cwd=dest)
            self.assertEqual(rag_status.returncode, 0, rag_status.stdout)
            self.assertIn("\"rag_enabled\": false", rag_status.stdout)
            self.assertTrue(os.path.isfile(os.path.join(dest, "README.md")))
            self.assertTrue(os.path.isfile(os.path.join(dest, "VERSION")))
            self.assertTrue(os.path.isfile(os.path.join(dest, "CHANGELOG.md")))
            self.assertTrue(os.path.isfile(os.path.join(dest, "RELEASE.md")))
            self.assertTrue(os.path.isfile(os.path.join(dest, "docs", "ARCHITECTURE.md")))
            self.assertTrue(os.path.isfile(os.path.join(dest, "docs", "SECURITY.md")))
            self.assertTrue(os.path.isfile(os.path.join(dest, "docs", "DEPLOYMENT.md")))
            with open(os.path.join(dest, "VERSION"), encoding="ascii") as version_file:
                self.assertEqual(version_file.read().strip(), EXPECTED_VERSION)
            installed_version = _run(["sh", os.path.join(dest, "mcp.sh"), "--version"])
            self.assertIn(EXPECTED_VERSION, installed_version.stdout)
            python_env = os.environ.copy()
            python_env["PYTHONPATH"] = dest
            python_version = subprocess.run(
                ["python3", "-c", "from mcp.config.constants import VERSION; print(VERSION)"],
                cwd=dest, env=python_env, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True, timeout=10,
            )
            self.assertEqual(python_version.returncode, 0, python_version.stdout)
            self.assertEqual(python_version.stdout.strip(), EXPECTED_VERSION)
            self.assertTrue(os.path.isfile(os.path.join(dest, "install.sh")))
            conf = os.path.join(dest, "mcp.conf")
            self.assertTrue(os.path.isfile(conf))
            with open(conf, encoding="utf-8") as fh:
                body = fh.read()
            self.assertIn("PORT=18099", body)
            self.assertIn("WORKSPACE_SIZE=2G", body)
            self.assertRegex(body, r"(?m)^PIN=.+$")
            # The PIN is in the file but must not have been printed.
            pin_line = [line for line in body.splitlines() if line.startswith("PIN=")][0]
            pin = pin_line.split("=", 1)[1]
            self.assertGreaterEqual(len(pin), 12)
            self.assertNotEqual(pin.lower(), "password")
            self.assertNotIn(pin, first.stdout)
            ws = os.path.join(dest, "sandbox", "workspace")
            self.assertTrue(os.path.isdir(ws))
            self.assertTrue(os.path.exists(os.path.join(ws, ".git")))
            # Re-run must keep the same mcp.conf (and therefore the same PIN).
            second = self._install(dest, extra=["--no-image"])
            self.assertEqual(second.returncode, 0, second.stdout)
            self.assertIn("keeping existing", second.stdout)
            with open(conf, encoding="utf-8") as fh:
                self.assertEqual(fh.read(), body)
        finally:
            shutil.rmtree(dest, ignore_errors=True)

    def test_workspace_image_disabled_by_default(self):
        dest = tempfile.mkdtemp(prefix="aimcp-img-")
        try:
            # Image creation is deliberately disabled by default in v2.8.
            out = self._install(dest, extra=["--no-mount"])
            self.assertEqual(out.returncode, 0, out.stdout)
            self.assertIn("skipping workspace image (--no-image)", out.stdout)
            self.assertFalse(os.path.exists(os.path.join(dest, "workspace.img")))
        finally:
            shutil.rmtree(dest, ignore_errors=True)

    def test_no_tty_without_yes_fails(self):
        dest = tempfile.mkdtemp(prefix="aimcp-notty-")
        try:
            args = [
                "sh", INSTALL_SH,
                "--dir", dest,
                "--no-cron", "--no-funnel", "--no-start", "--no-image",
            ]
            out = _run(args, timeout=20, input_text="")
            self.assertNotEqual(out.returncode, 0)
            self.assertIn("--yes", out.stdout)
            self.assertFalse(os.path.isfile(os.path.join(dest, "mcp.conf")))
        finally:
            shutil.rmtree(dest, ignore_errors=True)


class InstallSelftestHookTests(unittest.TestCase):
    """install.sh starts --selftest after a successful server start."""

    def test_start_server_runs_selftest(self):
        with open(INSTALL_SH, "r", encoding="utf-8") as fh:
            src = fh.read()
        # start_server should invoke mcp.sh --selftest after --bg/--status.
        self.assertIn("--selftest", src)
        start = src.index("start_server()")
        chunk = src[start:start + 1200]
        self.assertIn("--selftest", chunk)
        self.assertIn("--no-start", src)

