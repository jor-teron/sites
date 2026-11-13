"""Small API service layer reusing the MCP tool registry and audit path."""
from __future__ import annotations

import json

from mcp.protocol import handle_tools_call
from mcp.config import client_tool_defs


def list_tools(cfg):
    """Return the same configured tool definitions advertised by MCP."""
    return client_tool_defs(cfg)


def call_tool(name, arguments, cfg, client_ip):
    """Execute one registered tool through the shared MCP validation/audit path."""
    result = handle_tools_call({"name": name, "arguments": arguments}, cfg, client_ip)
    content = result.get("content") or []
    raw_text = content[0].get("text", "") if content else ""
    try:
        payload = json.loads(raw_text)
    except (TypeError, ValueError):
        payload = raw_text
    return {"ok": not result.get("isError", False), "tool": name, "result": payload}
