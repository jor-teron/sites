"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_client_text.py
Purpose:      Guard rails for v2.5 client-facing text: initialize
              instructions and tools/list descriptions must be honest,
              free of host/implementation names, and filled from the
              live Config (isolation, network, numeric limits).
Place:        mcp/tests/test_client_text.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, mcp.config, mcp.protocol, mcp.tools.
"""
from __future__ import annotations

import os
import re
import sys
import unittest
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from mcp import protocol  # noqa: E402
from mcp.config import (  # noqa: E402
    CLIENT_PHRASE_NETWORK_ON,
    CLIENT_PHRASE_NO_NETWORK,
    CLIENT_PHRASE_NOT_ISOLATED,
    DEFAULT_FSIZE,
    DEFAULT_MAX_PROCS,
    DEFAULT_MEMORY_MB,
    DEFAULT_TIMEOUT,
    MAX_LIST_ENTRIES,
    MAX_OUTPUT,
    MAX_READ,
    MAX_TIMEOUT,
    MAX_WALK_DEPTH,
    MIN_MAX_PROCS,
    MIN_MEMORY_MB,
    VERSION,
    client_instructions,
    client_settings,
    client_tool_defs,
    format_size,
)
from mcp.tools import tool_handlers  # noqa: E402


# Host env-var names and the old v1 sandbox implementation must never
# appear in text a connecting AI reads (case-insensitive).
FORBIDDEN_WORDS = ("bwrap", "bubblewrap", "mcp_root", "mcp_sandbox")


class _Cfg:
    """Minimal stand-in for Config, used only to vary client text."""

    def __init__(
        self,
        sandbox="ns",
        sandbox_net=False,
        memory_mb=DEFAULT_MEMORY_MB,
        max_procs=DEFAULT_MAX_PROCS,
        default_timeout=DEFAULT_TIMEOUT,
    ):
        """Store the fields client_settings() reads.

        Args:
            sandbox (str): Isolation mode ('ns' or 'none').
            sandbox_net (bool): Whether the jail has network access.
            memory_mb (int): Advertised memory limit before flooring.
            max_procs (int): Advertised process limit before flooring.
            default_timeout (int): Default run_command timeout.
        """
        self.sandbox = sandbox
        self.sandbox_net = sandbox_net
        self.memory_mb = memory_mb
        self.max_procs = max_procs
        self.default_timeout = default_timeout


def _all_text(cfg=None):
    """Return instructions plus every tool and property description.

    Args:
        cfg: A Config-like object, or None for defaults.

    Returns:
        str: All client-facing description text, joined with newlines.
    """
    parts = [client_instructions(cfg)]
    for tool in client_tool_defs(cfg):
        parts.append(tool.get("description") or "")
        props = (tool.get("inputSchema") or {}).get("properties") or {}
        for prop in props.values():
            parts.append(prop.get("description") or "")
    return "\n".join(parts)


class ClientTextTests(unittest.TestCase):
    """Checks on initialize instructions and tools/list descriptions."""

    def test_forbidden_words_absent(self):
        """No tool, property or instructions text may name bwrap or host env vars."""
        configs = (
            None,
            _Cfg(sandbox="ns", sandbox_net=False),
            _Cfg(sandbox="ns", sandbox_net=True),
            _Cfg(sandbox="none"),
            _Cfg(sandbox="none", sandbox_net=True),
            _Cfg(memory_mb=256, max_procs=32, default_timeout=45),
        )
        for cfg in configs:
            text = _all_text(cfg)
            lowered = text.lower()
            for word in FORBIDDEN_WORDS:
                self.assertNotIn(
                    word,
                    lowered,
                    "forbidden %r in client text for cfg=%r" % (word, cfg),
                )

    def test_network_on_and_off(self):
        """Isolated jail text must follow the live network setting."""
        off = _all_text(_Cfg(sandbox="ns", sandbox_net=False))
        on = _all_text(_Cfg(sandbox="ns", sandbox_net=True))
        self.assertIn(CLIENT_PHRASE_NO_NETWORK, off)
        self.assertNotIn(CLIENT_PHRASE_NETWORK_ON, off)
        self.assertIn(CLIENT_PHRASE_NETWORK_ON, on)
        self.assertNotIn(CLIENT_PHRASE_NO_NETWORK, on)
        self.assertNotIn(CLIENT_PHRASE_NOT_ISOLATED, off)
        self.assertNotIn(CLIENT_PHRASE_NOT_ISOLATED, on)

    def test_sandbox_none_is_honest(self):
        """When isolation is off, the text must say commands run on the host."""
        none = _all_text(_Cfg(sandbox="none"))
        ns_text = _all_text(_Cfg(sandbox="ns"))
        self.assertIn(CLIENT_PHRASE_NOT_ISOLATED, none)
        self.assertIn("on the host", none)
        self.assertIn("sandbox folder", none)
        self.assertNotIn(CLIENT_PHRASE_NOT_ISOLATED, ns_text)
        self.assertIn("isolated jail", ns_text)
        # Unsandboxed commands do not get jail memory/process/file rlimits.
        self.assertNotIn("MiB of memory", none)
        self.assertIn("MiB of memory", ns_text)

    def test_numeric_limits_match_config_defaults(self):
        """Default descriptions must quote the live default limit values."""
        settings = client_settings(None)
        text = _all_text(None)
        self.assertEqual(settings["timeout"], DEFAULT_TIMEOUT)
        self.assertEqual(settings["max_timeout"], MAX_TIMEOUT)
        self.assertEqual(settings["memory_mb"], max(MIN_MEMORY_MB, DEFAULT_MEMORY_MB))
        self.assertEqual(settings["max_procs"], max(MIN_MAX_PROCS, DEFAULT_MAX_PROCS))
        self.assertEqual(settings["fsize"], format_size(DEFAULT_FSIZE))
        self.assertEqual(settings["output"], format_size(MAX_OUTPUT))
        self.assertEqual(settings["max_read"], format_size(MAX_READ))
        self.assertEqual(settings["max_walk_depth"], MAX_WALK_DEPTH)
        self.assertEqual(settings["max_list_entries"], MAX_LIST_ENTRIES)
        self.assertIn(
            "%s seconds by default (maximum %s seconds)"
            % (settings["timeout"], settings["max_timeout"]),
            text,
        )
        self.assertIn("%s MiB of memory" % settings["memory_mb"], text)
        self.assertIn("%s processes" % settings["max_procs"], text)
        self.assertIn("%s file-size cap" % settings["fsize"], text)
        self.assertIn("%s of captured output" % settings["output"], text)
        self.assertIn("Capped at %s" % settings["max_read"], text)
        self.assertIn(
            "capped at %s levels and %s entries"
            % (settings["max_walk_depth"], settings["max_list_entries"]),
            text,
        )
        self.assertIn(
            "default %s, maximum %s" % (settings["timeout"], settings["max_timeout"]),
            text,
        )
        # The 2 GiB workspace cap is off by default (no mount), so it
        # must not appear in the default client-facing text. "limited to"
        # still appears for the command timeout sentence, so we look for
        # the disk-cap wording instead.
        self.assertFalse(settings["workspace_limit_on"])
        self.assertNotIn("/workspace is limited to", text)
        self.assertNotIn("2 GiB", text)

    def test_numeric_limits_follow_runtime_config(self):
        """Custom Config limits must appear in the generated text, not the defaults."""
        cfg = _Cfg(sandbox="ns", memory_mb=256, max_procs=32, default_timeout=45)
        settings = client_settings(cfg)
        text = _all_text(cfg)
        self.assertEqual(settings["timeout"], 45)
        self.assertEqual(settings["memory_mb"], 256)
        self.assertEqual(settings["max_procs"], 32)
        self.assertIn("45 seconds by default (maximum %s seconds)" % MAX_TIMEOUT, text)
        self.assertIn("256 MiB of memory", text)
        self.assertIn("32 processes", text)
        self.assertNotIn(
            "%s seconds by default (maximum %s seconds)"
            % (DEFAULT_TIMEOUT, MAX_TIMEOUT),
            text,
        )
        self.assertNotIn("%s MiB of memory" % DEFAULT_MEMORY_MB, text)
        self.assertNotIn("%s processes" % DEFAULT_MAX_PROCS, text)
        # Floors and the timeout cap must be the values actually applied.
        floored = _Cfg(sandbox="ns", memory_mb=8, max_procs=1, default_timeout=9999)
        floored_settings = client_settings(floored)
        floored_text = _all_text(floored)
        self.assertEqual(floored_settings["memory_mb"], MIN_MEMORY_MB)
        self.assertEqual(floored_settings["max_procs"], MIN_MAX_PROCS)
        self.assertEqual(floored_settings["timeout"], MAX_TIMEOUT)
        self.assertIn("%s MiB of memory" % MIN_MEMORY_MB, floored_text)
        self.assertIn("%s processes" % MIN_MAX_PROCS, floored_text)
        self.assertIn(
            "%s seconds by default (maximum %s seconds)" % (MAX_TIMEOUT, MAX_TIMEOUT),
            floored_text,
        )

    def test_initialize_and_tools_list_serve_generated_text(self):
        """initialize and tools/list must return the generated, versioned text."""
        cfg = _Cfg(sandbox="ns", sandbox_net=False)
        init = protocol.handle_initialize({"protocolVersion": "2025-06-18"}, cfg)
        self.assertEqual(init["serverInfo"]["version"], VERSION)
        self.assertEqual(VERSION, Path(HERE, "..", "..", "VERSION").read_text(encoding="ascii").strip())
        self.assertEqual(init["instructions"], client_instructions(cfg))
        self.assertIn(CLIENT_PHRASE_NO_NETWORK, init["instructions"])

        is_notif, resp = protocol.dispatch_rpc(
            {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, cfg, "127.0.0.1"
        )
        self.assertFalse(is_notif)
        tools = resp["result"]["tools"]
        names = {item["name"] for item in tools}
        self.assertEqual(names, set(tool_handlers))
        expected = client_tool_defs(cfg)
        self.assertEqual(len(tools), len(expected))
        for got, want in zip(tools, expected):
            self.assertEqual(got["name"], want["name"])
            self.assertEqual(got["description"], want["description"])
            self.assertEqual(got["inputSchema"], want["inputSchema"])
            # Every property must have a description.
            for pname, prop in got["inputSchema"]["properties"].items():
                self.assertTrue(
                    prop.get("description"),
                    "missing description for %s.%s" % (got["name"], pname),
                )

        # A tools/list against an unsandboxed config must not reuse the
        # default (isolated, no-network) wording.
        none_cfg = _Cfg(sandbox="none")
        _, none_resp = protocol.dispatch_rpc(
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, none_cfg, "127.0.0.1"
        )
        run_cmd = [
            item for item in none_resp["result"]["tools"] if item["name"] == "run_command"
        ][0]
        self.assertIn(CLIENT_PHRASE_NOT_ISOLATED, run_cmd["description"])
        self.assertNotIn(CLIENT_PHRASE_NO_NETWORK, run_cmd["description"])

        # initialize without a cfg still describes the defaults.
        default_init = protocol.handle_initialize({})
        self.assertEqual(default_init["instructions"], client_instructions(None))
        self.assertIn(CLIENT_PHRASE_NO_NETWORK, default_init["instructions"])

    def test_format_size_matches_config_units(self):
        """format_size must print the exact config value in KiB or MiB."""
        self.assertEqual(format_size(MAX_OUTPUT), "200 KiB")
        self.assertEqual(format_size(DEFAULT_FSIZE), "64 MiB")
        self.assertEqual(format_size(MAX_READ), "1 MiB")
        self.assertEqual(format_size(500), "500 bytes")
        # The number in the formatted string is the config value in that unit.
        self.assertTrue(re.match(r"^200 KiB$", format_size(MAX_OUTPUT)))
        self.assertEqual(int(format_size(MAX_OUTPUT).split()[0]) * 1024, MAX_OUTPUT)
        self.assertEqual(
            int(format_size(DEFAULT_FSIZE).split()[0]) * 1024 * 1024, DEFAULT_FSIZE
        )
