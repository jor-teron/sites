"""
ai-mcp — MCP logging compatibility facade.

Implementation is split into event logging, audit formatting, storage, and
tool-call audit policy under mcp/log_modules/.
"""
from .log_modules.events import now, audit
from .log_modules.formatting import escape_audit_text, format_audit_line
from .log_modules.storage import rotate_audit_log, append_audit_line
from .log_modules.commands import _command_field, tool_audit

__all__ = [
    "now", "audit", "escape_audit_text", "format_audit_line",
    "rotate_audit_log", "append_audit_line", "_command_field", "tool_audit",
]
