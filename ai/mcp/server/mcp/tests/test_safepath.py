"""Regression tests for descriptor-relative filesystem confinement."""
from __future__ import annotations

import os
import shutil
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from helpers import make_cfg, write_text  # noqa: E402
from mcp import safepath, tools  # noqa: E402


class DescriptorPathTests(unittest.TestCase):
    """Verify symlink entries cannot redirect file tools outside the root."""

    def setUp(self):
        self.cfg = make_cfg(sandbox="none")
        self.outside = os.path.join(self.cfg._tmp, "outside")
        write_text(self.outside, "do not touch")

    def tearDown(self):
        shutil.rmtree(self.cfg._tmp, ignore_errors=True)

    def test_recursive_delete_unlinks_symlink_not_target(self):
        folder = os.path.join(self.cfg.workspace, "folder")
        os.mkdir(folder)
        os.symlink(self.outside, os.path.join(folder, "link"))
        tools.tool_delete_path({"path": "folder", "recursive": True}, self.cfg)
        self.assertTrue(os.path.isfile(self.outside))
        with open(self.outside, encoding="utf-8") as stream:
            self.assertEqual(stream.read(), "do not touch")

    def test_delete_symlink_unlinks_link_only(self):
        link = os.path.join(self.cfg.workspace, "link")
        os.symlink(self.outside, link)
        tools.tool_delete_path({"path": "link"}, self.cfg)
        self.assertFalse(os.path.lexists(link))
        self.assertTrue(os.path.isfile(self.outside))

    def test_recursive_list_reports_but_does_not_follow_symlink(self):
        folder = os.path.join(self.cfg.workspace, "folder")
        os.mkdir(folder)
        os.symlink(self.cfg._tmp, os.path.join(folder, "link"))
        result = tools.tool_list_dir({"path": "folder", "recursive": True}, self.cfg)
        self.assertEqual([(e["name"], e["type"]) for e in result["entries"]], [("link", "symlink")])

    def test_write_replaces_entry_atomically_without_following_final_symlink(self):
        link = os.path.join(self.cfg.workspace, "link")
        os.symlink(self.outside, link)
        with self.assertRaises(ValueError):
            tools.tool_write_file({"path": "link", "content": "bad"}, self.cfg)
        with open(self.outside, encoding="utf-8") as stream:
            self.assertEqual(stream.read(), "do not touch")

    def test_move_moves_symlink_without_following_it(self):
        src = os.path.join(self.cfg.workspace, "src")
        dst = os.path.join(self.cfg.workspace, "dst")
        os.symlink(self.outside, src)
        tools.tool_move_path({"src": "src", "dest": "dst"}, self.cfg)
        self.assertTrue(os.path.islink(dst))
        self.assertTrue(os.path.isfile(self.outside))

    def test_fifo_is_rejected_without_blocking(self):
        fifo = os.path.join(self.cfg.workspace, "pipe")
        os.mkfifo(fifo)
        with self.assertRaises(ValueError):
            tools.tool_read_file({"path": "pipe"}, self.cfg)
        with self.assertRaises(ValueError):
            tools.tool_edit_file({"path": "pipe", "old_string": "x", "new_string": "y"}, self.cfg)

    def test_atomic_write_uses_pinned_parent_descriptor(self):
        root_fd = safepath.open_root(self.cfg.root)
        try:
            parts = ["workspace", "pinned", "result.txt"]
            parent, name = safepath.open_parent(root_fd, parts, create=True)
            try:
                # Rename the directory entry and replace its old name with
                # a symlink after it has been opened. The pinned descriptor
                # still names the original directory; no symlink is followed.
                pinned_path = os.path.join(self.cfg.root, "workspace", "pinned")
                moved_path = os.path.join(self.cfg.root, "workspace", "moved")
                os.rename(pinned_path, moved_path)
                os.symlink(self._tmp_link_target(), pinned_path)
                safepath.atomic_write_at(parent, name, "safe")
                with open(os.path.join(moved_path, "result.txt"), encoding="utf-8") as stream:
                    self.assertEqual(stream.read(), "safe")
                self.assertFalse(os.path.exists(os.path.join(self.outside, "result.txt")))
            finally:
                os.close(parent)
        finally:
            os.close(root_fd)

    def _tmp_link_target(self):
        """Return the outside directory used as the hostile symlink target."""
        target = os.path.join(self.cfg._tmp, "outside-dir")
        os.makedirs(target, exist_ok=True)
        return target


if __name__ == "__main__":
    unittest.main()
