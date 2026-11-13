"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_users.py
Purpose:      Tests for the v4.1 user catalog loader.
Version:      4.1
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from mcp.users import (  # noqa: E402
    UserCfg,
    UserError,
    authenticate_user,
    ensure_share,
    ensure_user_home,
    get_user,
    load_users,
    parse_user_path,
    tool_allowed,
)


CSV = """uid,user,password,home,enabled,perms
10000,demo,demo,home/demo,1,read|write|run|share
10001,off,off,home/off,0,read
"""


class UserCatalogTests(unittest.TestCase):
    def test_load_and_lookup(self):
        path = tempfile.mktemp(suffix=".csv")
        try:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(CSV)
            users = load_users(path)
            self.assertIn("demo", users)
            demo = get_user(users, "demo")
            self.assertEqual(demo.home, "home/demo")
            self.assertEqual(demo.uid, 10000)
            self.assertTrue(demo.has("read"))
            self.assertTrue(demo.has("share"))
            self.assertFalse(demo.has("admin"))
            with self.assertRaises(UserError):
                get_user(users, "off")
            with self.assertRaises(UserError):
                get_user(users, "missing")
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

    def test_missing_file_is_empty(self):
        users = load_users("/tmp/does-not-exist-aimcp-users.csv")
        self.assertEqual(users, {})

    def test_bad_header(self):
        path = tempfile.mktemp(suffix=".csv")
        try:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write("uid,user\n10000,x\n")
            with self.assertRaises(UserError):
                load_users(path)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

    def test_parse_user_path(self):
        self.assertEqual(parse_user_path("/ai/mcp/demo/demo"), ("demo", "demo"))
        self.assertEqual(parse_user_path("/mcp/demo/secret"), ("demo", "secret"))
        self.assertIsNone(parse_user_path("/ai/mcp"))
        self.assertIsNone(parse_user_path("/health"))

    def test_authenticate_user(self):
        path = tempfile.mktemp(suffix=".csv")
        try:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(CSV)
            users = load_users(path)
            user = authenticate_user(users, "/ai/mcp/demo/demo")
            self.assertIsNotNone(user)
            self.assertEqual(user.username, "demo")
            self.assertIsNone(authenticate_user(users, "/ai/mcp/demo/wrong"))
            self.assertIsNone(authenticate_user(users, "/ai/mcp/off/off"))
            self.assertIsNone(authenticate_user(users, "/ai/mcp/missing/x"))
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

    def test_tool_allowed_and_usercfg(self):
        path = tempfile.mktemp(suffix=".csv")
        try:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(CSV)
            users = load_users(path)
            demo = get_user(users, "demo")
            self.assertTrue(tool_allowed(demo, "read_file"))
            self.assertTrue(tool_allowed(demo, "run_command"))
            self.assertTrue(tool_allowed(None, "read_file"))
            # A user without write should be refused.
            limited = get_user(users, "demo")
            limited.perms = frozenset(["read"])
            self.assertFalse(tool_allowed(limited, "write_file"))
            self.assertFalse(tool_allowed(limited, "run_command"))

            class FakeCfg(object):
                root = "/tmp/sandbox"
                pin = "x"

            view = UserCfg(FakeCfg(), demo)
            # Jail root stays the sandbox; only cwd / file tools move.
            self.assertEqual(view.root, "/tmp/sandbox")
            self.assertEqual(view.workspace, "/tmp/sandbox/home/demo")
            self.assertEqual(view.default_cwd, "/tmp/sandbox/home/demo")
            self.assertEqual(view.file_root, "/tmp/sandbox/home/demo")
            self.assertIs(view.mcp_user, demo)
            self.assertEqual(view.pin, "x")
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

    def test_ensure_dirs(self):
        root = tempfile.mkdtemp(prefix="aimcp-v44-")
        try:
            share = ensure_share(root)
            self.assertTrue(os.path.isdir(share))
            self.assertTrue(share.endswith("home/share"))
            path = tempfile.mktemp(suffix=".csv")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(CSV)
            users = load_users(path)
            demo = get_user(users, "demo")

            class FakeCfg(object):
                pass

            FakeCfg.root = root
            home = ensure_user_home(FakeCfg(), demo)
            self.assertTrue(os.path.isdir(home))
            self.assertTrue(home.endswith("home/demo"))
            os.unlink(path)
        finally:
            import shutil
            shutil.rmtree(root, ignore_errors=True)
