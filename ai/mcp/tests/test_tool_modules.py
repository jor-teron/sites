"""Compatibility tests for the modular MCP tool implementation."""
from __future__ import annotations

import unittest

from mcp import tools
from mcp.tool_modules import command, common, files


class ToolModuleCompatibilityTests(unittest.TestCase):
    """Ensure modular implementations remain available through mcp.tools."""

    def test_public_functions_are_reexported(self):
        """The legacy tools module continues exposing all public handlers."""
        self.assertIs(tools.tool_run_command, command.tool_run_command)
        self.assertIs(tools.tool_read_file, files.tool_read_file)
        self.assertIs(tools.tool_write_file, files.tool_write_file)
        self.assertIs(tools.tool_edit_file, files.tool_edit_file)
        self.assertIs(tools.tool_list_dir, files.tool_list_dir)
        self.assertIs(tools.tool_delete_path, files.tool_delete_path)
        self.assertIs(tools.tool_move_path, files.tool_move_path)
        self.assertIs(tools.resolve_user_path, common.resolve_user_path)

    def test_registry_names_and_handlers_are_stable(self):
        """The MCP registry retains the existing tool names and callables."""
        expected = {
            "run_command", "read_file", "write_file", "edit_file",
            "list_dir", "delete_path", "move_path",
        }
        self.assertEqual(set(tools.tool_handlers), expected)
        self.assertIs(tools.tool_handlers["run_command"], tools.tool_run_command)
        self.assertIs(tools.tool_handlers["read_file"], tools.tool_read_file)

    def test_tool_definitions_remain_available(self):
        """The public facade continues exposing generated tool definitions."""
        self.assertTrue(tools.tool_defs)
        self.assertIsInstance(tools.tool_defs, list)


if __name__ == "__main__":
    unittest.main()
