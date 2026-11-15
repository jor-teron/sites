"""Compatibility tests for the modular HTTP transport boundary."""
import unittest

from mcp import http
from mcp.http_modules import cors, connections, request, routing


class HttpModuleCompatibilityTests(unittest.TestCase):
    """The historical mcp.http interface remains stable after extraction."""

    def test_public_classes_and_helpers_are_reexported(self):
        self.assertIs(http.MCPHandler, request.MCPHandler)
        self.assertIs(http.MCPHTTPServer, connections.MCPHTTPServer)
        self.assertIs(http.url_path, routing.url_path)
        self.assertIs(http.is_health_path, routing.is_health_path)
        self.assertIs(http._content_length, routing._content_length)

    def test_cors_mixin_is_used_by_request_handler(self):
        self.assertTrue(issubclass(request.MCPHandler, cors.CORSMixin))
        for name in ("_origin_state", "_add_cors", "_reject_origin"):
            self.assertTrue(hasattr(request.MCPHandler, name))

    def test_make_server_uses_modular_connection_server(self):
        self.assertIs(http.make_server.__globals__["MCPHTTPServer"], connections.MCPHTTPServer)


if __name__ == "__main__":
    unittest.main()
