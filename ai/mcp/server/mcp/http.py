"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/http.py
Purpose:      Stable HTTP transport facade; implementation is in http_modules/.
Place:        mcp/http.py — started from server.py via make_server(cfg).
Version:      3.3
Project:      ai-mcp
Dependencies: Python 3.8+ standard library only.
"""
from .http_modules.routing import url_path, is_health_path, _content_length
from .http_modules.request import MCPHandler
from .http_modules.connections import MCPHTTPServer

def make_server(cfg):
    """Create the threaded HTTP server bound to cfg.host:cfg.port."""
    return MCPHTTPServer((cfg.host, cfg.port), cfg)

__all__ = ["url_path", "is_health_path", "_content_length", "MCPHandler", "MCPHTTPServer", "make_server"]
