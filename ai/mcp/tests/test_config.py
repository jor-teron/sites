"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_config.py
Purpose:      Tests for Config loading, PIN files, mcp.conf, env aliases and defaults.
Place:        mcp/tests/test_config.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, mcp.server, helpers.
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from mcp import server  # noqa: E402
from helpers import PIN, make_cfg, write_text  # noqa: E402


class ConfigTests(unittest.TestCase):
    def test_missing_pin_file(self):
        cfg = server.Config.__new__(server.Config)
        cfg.pin = PIN
        cfg.pin_file = os.path.join(tempfile.gettempdir(), "missing-aimcp-pin")
        cfg.password = PIN
        cfg.password_file = cfg.pin_file
        cfg.sandbox = "none"
        cfg.root = None
        cfg.log_file = os.path.join(tempfile.gettempdir(), "mcp.log")
        cfg.server_dir = os.path.dirname(os.path.abspath(server.__file__))
        cfg.binds = ()
        cfg.trust_proxy = False
        cfg.sandbox_net = False
        cfg.cors_origins = ()
        cfg.host = "127.0.0.1"
        cfg.port = 0
        cfg.memory_mb = 512
        cfg.max_procs = 64
        cfg.default_timeout = 60
        cfg.default_cwd = os.getcwd()
        with self.assertRaises(server.ConfigError):
            cfg.validate()

    def test_short_pin_allowed(self):
        tmp = tempfile.NamedTemporaryFile("w", delete=False)
        tmp.write("x\n")
        tmp.close()
        try:
            cfg = make_cfg()
            cfg.pin_file = tmp.name
            cfg.password_file = tmp.name
            cfg.sandbox = "none"
            cfg.validate()
            self.assertEqual(cfg.pin, "x")
            self.assertEqual(cfg.password, "x")
        finally:
            os.unlink(tmp.name)
            shutil.rmtree(cfg._tmp, ignore_errors=True)

    def test_ns_requires_root(self):
        cfg = server.Config.__new__(server.Config)
        cfg.pin = PIN
        cfg.pin_file = None
        cfg.password = PIN
        cfg.password_file = None
        cfg.root = None
        cfg.sandbox = "ns"
        cfg.log_file = "/tmp/mcp.log"
        cfg.server_dir = os.path.dirname(os.path.abspath(server.__file__))
        cfg.binds = ()
        cfg.trust_proxy = False
        cfg.sandbox_net = False
        cfg.cors_origins = ()
        cfg.host = "127.0.0.1"
        cfg.port = 0
        cfg.memory_mb = 512
        cfg.max_procs = 64
        cfg.default_timeout = 60
        cfg.default_cwd = os.getcwd()
        with self.assertRaises(server.ConfigError):
            cfg.validate()

    def test_secrets_inside_root_rejected(self):
        cfg = make_cfg()
        try:
            visible = os.path.join(cfg.root, "visible.pin")
            write_text(visible, "secret\n")
            cfg.pin_file = visible
            cfg.password_file = visible
            with self.assertRaises(server.ConfigError):
                cfg.validate()
        finally:
            shutil.rmtree(cfg._tmp, ignore_errors=True)

    def test_bad_sandbox_value(self):
        cfg = make_cfg()
        try:
            cfg.sandbox = "bwrap"
            with self.assertRaises(server.ConfigError):
                cfg.validate()
            cfg.sandbox = "chroot"
            with self.assertRaises(server.ConfigError):
                cfg.validate()
        finally:
            shutil.rmtree(cfg._tmp, ignore_errors=True)

    def test_defaults(self):
        keys = (
            "MCP_ROOT", "MCP_SANDBOX", "MCP_PIN", "MCP_PASSWORD",
            "MCP_PIN_FILE", "MCP_PASSWORD_FILE", "MCP_LOG", "MCP_HOST",
            "MCP_PORT", "MCP_PUBLIC_URL", "MCP_CONF", "MCP_BIND", "MCP_TRUST_PROXY_IPS",
        )
        saved = {key: os.environ.get(key) for key in keys}
        # Point MCP_CONF at a missing file so leftover mcp.conf in the
        # install tree is not picked up while we assert defaults.
        missing = os.path.join(tempfile.gettempdir(), "no-such-aimcp.conf")
        try:
            for key in keys:
                os.environ.pop(key, None)
            os.environ["MCP_CONF"] = missing
            cfg = server.Config()
            self.assertTrue(cfg.root.endswith("sandbox"), cfg.root)
            self.assertEqual(cfg.sandbox, "ns")
            self.assertEqual(cfg.pin, "password")
            self.assertEqual(cfg.password, "password")
            self.assertIsNone(cfg.pin_file)
            self.assertEqual(cfg.log_file, "/home/ai/mcp.log")
            self.assertEqual(cfg.public_url, "https://debian.tail94ffdb.ts.net/ai/mcp")
            self.assertEqual(cfg.host, "127.0.0.1")
            self.assertEqual(cfg.port, 10001)
            self.assertEqual(cfg.trust_proxy_ips, ())
        finally:
            for key, value in saved.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value


    def test_trusted_proxy_cidr_config(self):
        tmp = tempfile.mkdtemp(prefix="aimcp-proxy-")
        try:
            conf = os.path.join(tmp, "mcp.conf")
            write_text(conf, "PIN=from-conf\nTRUST_PROXY=1\nTRUST_PROXY_IPS=127.0.0.1,10.0.0.0/8\n")
            cfg = server.Config(conf_path=conf)
            self.assertTrue(cfg.trust_proxy)
            self.assertEqual([str(net) for net in cfg.trust_proxy_ips], ["127.0.0.1/32", "10.0.0.0/8"])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_invalid_trusted_proxy_cidr_rejected(self):
        tmp = tempfile.mkdtemp(prefix="aimcp-proxy-bad-")
        try:
            conf = os.path.join(tmp, "mcp.conf")
            write_text(conf, "TRUST_PROXY_IPS=not-an-ip\n")
            with self.assertRaisesRegex(server.ConfigError, "MCP_TRUST_PROXY_IPS"):
                server.Config(conf_path=conf)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_password_alias_and_conf_file(self):
        tmp = tempfile.mkdtemp(prefix="aimcp-conf-")
        try:
            conf = os.path.join(tmp, "mcp.conf")
            write_text(conf, "PIN=from-conf\nPORT=9191\nSANDBOX=none\n")
            work = os.path.join(tmp, "workspace")
            os.mkdir(work)
            saved = {k: os.environ.get(k) for k in ("MCP_CONF", "MCP_ROOT", "MCP_PIN", "MCP_PASSWORD", "MCP_PORT", "MCP_SANDBOX")}
            try:
                os.environ["MCP_CONF"] = conf
                os.environ["MCP_ROOT"] = work
                os.environ.pop("MCP_PIN", None)
                os.environ.pop("MCP_PASSWORD", None)
                os.environ.pop("MCP_PORT", None)
                os.environ.pop("MCP_SANDBOX", None)
                cfg = server.Config()
                self.assertEqual(cfg.pin, "from-conf")
                self.assertEqual(cfg.port, 9191)
                self.assertEqual(cfg.sandbox, "none")
            finally:
                for key, value in saved.items():
                    if value is None:
                        os.environ.pop(key, None)
                    else:
                        os.environ[key] = value
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_env_password_alias_without_pin(self):
        tmp = tempfile.mkdtemp(prefix="aimcp-alias-")
        try:
            work = os.path.join(tmp, "workspace")
            os.mkdir(work)
            saved = {k: os.environ.get(k) for k in ("MCP_PIN", "MCP_PASSWORD", "MCP_ROOT", "MCP_SANDBOX", "MCP_CONF")}
            try:
                os.environ.pop("MCP_PIN", None)
                os.environ["MCP_PASSWORD"] = "alias-pin"
                os.environ["MCP_ROOT"] = work
                os.environ["MCP_SANDBOX"] = "none"
                os.environ["MCP_CONF"] = os.path.join(tmp, "missing.conf")
                cfg = server.Config()
                self.assertEqual(cfg.pin, "alias-pin")
            finally:
                for key, value in saved.items():
                    if value is None:
                        os.environ.pop(key, None)
                    else:
                        os.environ[key] = value
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
