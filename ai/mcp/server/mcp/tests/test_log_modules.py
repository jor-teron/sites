"""Compatibility tests for the modular logging boundary."""
import unittest

from mcp import log
from mcp.log_modules import commands, events, formatting, storage


class LogModuleCompatibilityTests(unittest.TestCase):
    """Historical mcp.log functions remain available after extraction."""

    def test_public_functions_are_reexported(self):
        expected = {
            "now": events.now,
            "audit": events.audit,
            "escape_audit_text": formatting.escape_audit_text,
            "format_audit_line": formatting.format_audit_line,
            "rotate_audit_log": storage.rotate_audit_log,
            "append_audit_line": storage.append_audit_line,
            "_command_field": commands._command_field,
            "tool_audit": commands.tool_audit,
        }
        for name, implementation in expected.items():
            with self.subTest(name=name):
                self.assertIs(getattr(log, name), implementation)

    def test_command_audit_uses_shared_formatter_and_storage(self):
        self.assertIs(commands.format_audit_line, formatting.format_audit_line)
        self.assertIs(commands.append_audit_line, storage.append_audit_line)


if __name__ == "__main__":
    unittest.main()
