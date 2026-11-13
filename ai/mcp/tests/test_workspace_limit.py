"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_workspace_limit.py
Purpose:      Tests for the v2.4 /workspace disk limit: parse_size,
              format_size_short, mount detection, the write_file /
              edit_file free-space guard, honest client text, and
              Config loading of WORKSPACE_SIZE / WORKSPACE_RESERVE.
Place:        mcp/tests/test_workspace_limit.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, helpers, mcp.config, mcp.tools,
              mcp.workspace.
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from helpers import make_cfg  # noqa: E402
from mcp.config import (  # noqa: E402
    BYTES_PER_GIB,
    BYTES_PER_MIB,
    CLIENT_WORKSPACE_LIMIT,
    DEFAULT_WORKSPACE_RESERVE,
    DEFAULT_WORKSPACE_SIZE,
    client_instructions,
    client_settings,
    client_tool_defs,
    format_size,
    format_size_short,
    parse_size,
)
from mcp.tools import tool_edit_file, tool_write_file  # noqa: E402
from mcp.workspace import (  # noqa: E402
    is_workspace_mount,
    workspace_disk_usage,
    workspace_limit_status,
)


class ParseSizeTests(unittest.TestCase):
    """parse_size and the short/long formatters."""

    def test_parse_size_default_is_two_gib(self):
        self.assertEqual(parse_size(DEFAULT_WORKSPACE_SIZE), 2 * BYTES_PER_GIB)
        self.assertEqual(parse_size("2G"), 2 * BYTES_PER_GIB)
        self.assertEqual(parse_size("2g"), 2 * BYTES_PER_GIB)
        self.assertEqual(parse_size("2GB"), 2 * BYTES_PER_GIB)
        self.assertEqual(parse_size("2GiB"), 2 * BYTES_PER_GIB)
        self.assertEqual(parse_size(" 2 GiB "), 2 * BYTES_PER_GIB)

    def test_parse_size_other_units_and_ints(self):
        self.assertEqual(parse_size("16M"), 16 * BYTES_PER_MIB)
        self.assertEqual(parse_size("16MiB"), DEFAULT_WORKSPACE_RESERVE)
        self.assertEqual(parse_size("1024"), 1024)
        self.assertEqual(parse_size(1024), 1024)
        self.assertEqual(parse_size("0"), 0)
        self.assertEqual(parse_size(0), 0)

    def test_parse_size_rejects_bad_values(self):
        with self.assertRaises(ValueError):
            parse_size("")
        with self.assertRaises(ValueError):
            parse_size("G")
        with self.assertRaises(ValueError):
            parse_size("2X")
        with self.assertRaises(ValueError):
            parse_size(-1)
        with self.assertRaises(ValueError):
            parse_size(True)

    def test_format_size_gib(self):
        self.assertEqual(format_size(2 * BYTES_PER_GIB), "2 GiB")
        self.assertEqual(format_size(DEFAULT_WORKSPACE_RESERVE), "16 MiB")
        self.assertEqual(format_size_short(2 * BYTES_PER_GIB), "2.0G")
        self.assertEqual(format_size_short(DEFAULT_WORKSPACE_RESERVE), "16M")
        self.assertEqual(format_size_short(100), "100B")


class MountDetectTests(unittest.TestCase):
    """A plain directory is not a mount; status is then 'off'."""

    def setUp(self):
        self.cfg = make_cfg(sandbox="none")

    def tearDown(self):
        shutil.rmtree(self.cfg._tmp, ignore_errors=True)

    def test_temp_workspace_is_not_a_mount(self):
        self.assertFalse(is_workspace_mount(self.cfg.workspace))
        self.assertFalse(self.cfg.workspace_limit_on)
        self.assertEqual(workspace_limit_status(self.cfg.workspace), "off")
        self.assertEqual(
            workspace_limit_status(self.cfg.workspace, limit_on=False), "off"
        )
        usage = workspace_disk_usage(self.cfg.workspace)
        self.assertIsNotNone(usage)
        used, free, total = usage
        self.assertGreater(total, 0)
        self.assertGreaterEqual(free, 0)
        self.assertGreaterEqual(used, 0)

    def test_missing_path_is_not_a_mount(self):
        self.assertFalse(is_workspace_mount(""))
        self.assertFalse(is_workspace_mount("/no/such/aimcp-workspace-dir"))
        self.assertIsNone(workspace_disk_usage("/no/such/aimcp-workspace-dir"))


class FreeSpaceGuardTests(unittest.TestCase):
    """write_file and edit_file refuse writes that would go below the reserve."""

    def setUp(self):
        self.cfg = make_cfg(sandbox="none")

    def tearDown(self):
        shutil.rmtree(self.cfg._tmp, ignore_errors=True)

    def test_write_succeeds_with_small_reserve(self):
        self.cfg.workspace_reserve = 1
        result = tool_write_file({"path": "ok.txt", "content": "hello"}, self.cfg)
        self.assertEqual(result["bytes"], 5)
        self.assertTrue(os.path.isfile(os.path.join(self.cfg.workspace, "ok.txt")))

    def test_write_refused_when_reserve_exceeds_free_space(self):
        # A reserve larger than any normal disk forces the guard to fire.
        self.cfg.workspace_reserve = 10 * BYTES_PER_GIB * 1024
        with self.assertRaises(ValueError) as ctx:
            tool_write_file({"path": "big.txt", "content": "nope"}, self.cfg)
        message = str(ctx.exception)
        self.assertIn("not enough free space in /workspace", message)
        self.assertIn("reserve", message)
        self.assertFalse(os.path.exists(os.path.join(self.cfg.workspace, "big.txt")))

    def test_edit_refused_when_reserve_exceeds_free_space(self):
        self.cfg.workspace_reserve = 1
        tool_write_file({"path": "ed.txt", "content": "old"}, self.cfg)
        self.cfg.workspace_reserve = 10 * BYTES_PER_GIB * 1024
        with self.assertRaises(ValueError) as ctx:
            tool_edit_file(
                {"path": "ed.txt", "old_string": "old", "new_string": "new"},
                self.cfg,
            )
        self.assertIn("not enough free space in /workspace", str(ctx.exception))
        with open(os.path.join(self.cfg.workspace, "ed.txt"), encoding="utf-8") as fh:
            self.assertEqual(fh.read(), "old")


class ClientTextLimitTests(unittest.TestCase):
    """Client text mentions the cap only when the mount is actually on."""

    def test_default_text_omits_size_limit(self):
        text = client_instructions(None)
        self.assertNotIn("/workspace is limited to", text)
        self.assertNotIn("2 GiB", text)
        for tool in client_tool_defs(None):
            self.assertNotIn("/workspace is limited to", tool["description"])
            if tool["name"] in ("write_file", "edit_file"):
                self.assertNotIn("16 MiB", tool["description"])

    def test_active_limit_is_described_honestly(self):
        cfg = make_cfg(sandbox="none")
        try:
            cfg.workspace_limit_on = True
            settings = client_settings(cfg)
            self.assertTrue(settings["workspace_limit_on"])
            self.assertEqual(settings["workspace_size"], "2 GiB")
            self.assertEqual(settings["workspace_reserve"], "16 MiB")
            text = client_instructions(cfg)
            expected = CLIENT_WORKSPACE_LIMIT.format(**settings)
            self.assertIn(expected, text)
            for tool in client_tool_defs(cfg):
                if tool["name"] in ("write_file", "edit_file"):
                    self.assertIn(expected, tool["description"])
                elif tool["name"] == "run_command":
                    self.assertNotIn(expected, tool["description"])
        finally:
            shutil.rmtree(cfg._tmp, ignore_errors=True)


class ConfigWorkspaceSizeTests(unittest.TestCase):
    """mcp.conf and MCP_WORKSPACE_SIZE are loaded as bytes."""

    def test_conf_file_workspace_size_and_reserve(self):
        tmp = tempfile.mkdtemp(prefix="aimcp-wsize-")
        try:
            conf = os.path.join(tmp, "mcp.conf")
            with open(conf, "w", encoding="utf-8") as fh:
                fh.write("SANDBOX=none\nWORKSPACE_SIZE=1G\nWORKSPACE_RESERVE=8M\nPIN=from-conf\n")
            work = os.path.join(tmp, "sandbox")
            os.mkdir(work)
            saved = {
                key: os.environ.get(key)
                for key in (
                    "MCP_CONF", "MCP_ROOT", "MCP_PIN", "MCP_PASSWORD",
                    "MCP_SANDBOX", "MCP_WORKSPACE_SIZE", "MCP_WORKSPACE_RESERVE",
                )
            }
            try:
                os.environ["MCP_CONF"] = conf
                os.environ["MCP_ROOT"] = work
                os.environ.pop("MCP_PIN", None)
                os.environ.pop("MCP_PASSWORD", None)
                os.environ.pop("MCP_SANDBOX", None)
                os.environ.pop("MCP_WORKSPACE_SIZE", None)
                os.environ.pop("MCP_WORKSPACE_RESERVE", None)
                from mcp.server import Config

                cfg = Config()
                self.assertEqual(cfg.workspace_size, BYTES_PER_GIB)
                self.assertEqual(cfg.workspace_reserve, 8 * BYTES_PER_MIB)
                self.assertFalse(cfg.workspace_limit_on)
            finally:
                for key, value in saved.items():
                    if value is None:
                        os.environ.pop(key, None)
                    else:
                        os.environ[key] = value
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
