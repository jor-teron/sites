"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_tools.py
Purpose:      Unit tests for path resolution and file/command tools without HTTP.
Place:        mcp/tests/test_tools.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, helpers, mcp.tools.
"""
from __future__ import annotations

import os
import shutil
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from helpers import make_cfg, write_text  # noqa: E402
from mcp import tools  # noqa: E402


class PathResolveTests(unittest.TestCase):
    def setUp(self):
        self.cfg = make_cfg(sandbox="none")

    def tearDown(self):
        shutil.rmtree(self.cfg._tmp, ignore_errors=True)

    def test_relative_and_absolute_inside(self):
        write_text(os.path.join(self.cfg.workspace, "a.txt"), "hi")
        real = tools.resolve_user_path("a.txt", self.cfg, must_exist=True)
        self.assertEqual(real, os.path.join(self.cfg.workspace, "a.txt"))
        # A host-absolute path already inside the sandbox is kept.
        real = tools.resolve_user_path(os.path.join(self.cfg.workspace, "a.txt"), self.cfg, must_exist=True)
        self.assertTrue(real.endswith("a.txt"))

    def test_relative_lands_in_workspace(self):
        tools.tool_write_file({"path": "rel.txt", "content": "rel"}, self.cfg)
        self.assertTrue(os.path.isfile(os.path.join(self.cfg.workspace, "rel.txt")))
        self.assertFalse(os.path.isfile(os.path.join(self.cfg.root, "rel.txt")))

    def test_absolute_jail_path_lands_in_sandbox_root(self):
        tools.tool_write_file({"path": "/rootfile.txt", "content": "abs"}, self.cfg)
        self.assertTrue(os.path.isfile(os.path.join(self.cfg.root, "rootfile.txt")))
        self.assertFalse(os.path.isfile(os.path.join(self.cfg.workspace, "rootfile.txt")))
        real = tools.resolve_user_path("/rootfile.txt", self.cfg, must_exist=True)
        self.assertEqual(real, os.path.join(self.cfg.root, "rootfile.txt"))
        # /workspace/x is the working directory, not a host path.
        tools.tool_write_file({"path": "/workspace/inws.txt", "content": "ws"}, self.cfg)
        self.assertTrue(os.path.isfile(os.path.join(self.cfg.workspace, "inws.txt")))

    def test_dotdot_escape_blocked(self):
        secret = os.path.join(self.cfg._tmp, "secret.txt")
        write_text(secret, "top-secret")
        # From /workspace, ../../ leaves the sandbox.
        with self.assertRaises(ValueError) as ctx:
            tools.resolve_user_path("../../secret.txt", self.cfg)
        self.assertIn("outside MCP_ROOT", str(ctx.exception))
        # A host-absolute path outside the sandbox is remapped as a jail
        # path and must not resolve to the host secret.
        remapped = tools.resolve_user_path(secret, self.cfg)
        self.assertTrue(tools.is_within(remapped, self.cfg.root))
        self.assertNotEqual(os.path.realpath(remapped), os.path.realpath(secret))
        # From /workspace, ../ stays inside the sandbox root (the AI's /).
        inside = tools.resolve_user_path("../also.txt", self.cfg)
        self.assertEqual(inside, os.path.join(self.cfg.root, "also.txt"))

    def test_symlink_escape_blocked(self):
        secret = os.path.join(self.cfg._tmp, "secret.txt")
        write_text(secret, "top-secret")
        link = os.path.join(self.cfg.workspace, "sneaky")
        os.symlink(secret, link)
        with self.assertRaises(ValueError) as ctx:
            tools.resolve_user_path("sneaky", self.cfg)
        self.assertIn("outside MCP_ROOT", str(ctx.exception))

    def test_symlink_to_dir_outside_blocked(self):
        outside = self.cfg._tmp
        link = os.path.join(self.cfg.workspace, "out")
        os.symlink(outside, link)
        with self.assertRaises(ValueError):
            tools.resolve_user_path("out/secret-name", self.cfg)


class FileToolTests(unittest.TestCase):
    def setUp(self):
        self.cfg = make_cfg(sandbox="none")

    def tearDown(self):
        shutil.rmtree(self.cfg._tmp, ignore_errors=True)

    def test_write_read_edit_move_delete(self):
        cfg = self.cfg
        tools.tool_write_file(
            {"path": "notes/hello.txt", "content": "hello world\nhello again\n", "create_parents": True},
            cfg,
        )
        path = os.path.join(cfg.workspace, "notes", "hello.txt")
        self.assertTrue(os.path.isfile(path))
        data = tools.tool_read_file({"path": "notes/hello.txt"}, cfg)
        self.assertIn("hello world", data["content"])
        data = tools.tool_read_file({"path": "notes/hello.txt", "offset": 1, "limit": 1}, cfg)
        self.assertEqual(data["content"].strip(), "hello again")
        tools.tool_edit_file(
            {"path": "notes/hello.txt", "old_string": "world", "new_string": "there"},
            cfg,
        )
        with open(path, encoding="utf-8") as fh:
            self.assertIn("hello there", fh.read())
        listing = tools.tool_list_dir({"path": "notes"}, cfg)
        self.assertTrue(any(item["name"] == "hello.txt" for item in listing["entries"]))
        tools.tool_move_path({"src": "notes/hello.txt", "dest": "notes/moved.txt"}, cfg)
        tools.tool_delete_path({"path": "notes/moved.txt"}, cfg)
        self.assertFalse(os.path.exists(os.path.join(cfg.workspace, "notes", "moved.txt")))

    def test_edit_not_found_and_ambiguous(self):
        cfg = self.cfg
        tools.tool_write_file({"path": "amb.txt", "content": "foo foo bar"}, cfg)
        with self.assertRaises(ValueError) as ctx:
            tools.tool_edit_file({"path": "amb.txt", "old_string": "missing", "new_string": "x"}, cfg)
        self.assertIn("not found", str(ctx.exception))
        with self.assertRaises(ValueError) as ctx:
            tools.tool_edit_file({"path": "amb.txt", "old_string": "foo", "new_string": "baz"}, cfg)
        self.assertIn("ambiguous", str(ctx.exception))
        tools.tool_edit_file(
            {"path": "amb.txt", "old_string": "foo", "new_string": "baz", "replace_all": True},
            cfg,
        )
        with open(os.path.join(cfg.workspace, "amb.txt"), encoding="utf-8") as fh:
            self.assertEqual(fh.read(), "baz baz bar")

    def test_refuse_delete_root(self):
        with self.assertRaises(ValueError):
            tools.tool_delete_path({"path": self.cfg.root, "recursive": True}, self.cfg)

    def test_run_command_unsandboxed(self):
        result = tools.tool_run_command({"command": "echo hello-mcp"}, self.cfg)
        self.assertEqual(result["exit_code"], 0)
        self.assertIn("hello-mcp", result["stdout"])

    def test_run_command_default_cwd_is_workspace(self):
        result = tools.tool_run_command({"command": "pwd && echo unsandboxed > marked.txt"}, self.cfg)
        self.assertEqual(result["exit_code"], 0, result)
        self.assertIn(self.cfg.workspace, result["stdout"])
        self.assertTrue(os.path.isfile(os.path.join(self.cfg.workspace, "marked.txt")))


class WorkspaceGitTests(unittest.TestCase):
    """git init of sandbox/workspace on Config.validate(), once only."""

    def setUp(self):
        self.cfg = make_cfg(sandbox="none")

    def tearDown(self):
        shutil.rmtree(self.cfg._tmp, ignore_errors=True)

    def test_git_init_happens_once(self):
        git_dir = os.path.join(self.cfg.workspace, ".git")
        self.assertTrue(os.path.exists(git_dir), "validate() should git init the workspace")
        marker = os.path.join(git_dir, "aimcp-once-marker")
        with open(marker, "w", encoding="utf-8") as fh:
            fh.write("keep\n")
        # A second validate must not rebuild the repo.
        self.cfg.validate()
        self.assertTrue(os.path.isfile(marker))
        with open(marker, encoding="utf-8") as fh:
            self.assertEqual(fh.read(), "keep\n")
