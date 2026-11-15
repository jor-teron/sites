"""CORS origin policy and response-header helpers."""
from __future__ import annotations

from ..config import (
    CORS_ALLOW_HEADERS, CORS_ALLOW_METHODS, CORS_EXPOSE_HEADERS, CORS_MAX_AGE,
)

class CORSMixin:
    """Methods mixed into the HTTP request handler for CORS handling."""

    def _origin_state(self):
        """Decide whether the request Origin is allowed by MCP_CORS_ORIGINS.

        Returns:
            tuple[bool, str | None]: (allowed, origin). origin is None when
            the client sent no Origin header (non-browser), which is always
            allowed. A browser Origin must be listed, or the list must
            contain `*`.
        """
        origin = self.headers.get("Origin")
        if not origin:
            return True, None
        allowed = self.server.cfg.cors_origins
        if "*" in allowed or origin in allowed:
            return True, origin
        return False, origin

    def _add_cors(self, origin):
        """Write Access-Control-* headers for an allowed browser origin.

        Args:
            origin (str | None): The request Origin. No headers are added
                when this is missing (non-browser clients).

        Returns:
            None.
        """
        if not origin:
            return
        if "*" in self.server.cfg.cors_origins:
            self.send_header("Access-Control-Allow-Origin", "*")
        else:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS)
        self.send_header("Access-Control-Allow-Methods", CORS_ALLOW_METHODS)
        self.send_header("Access-Control-Expose-Headers", CORS_EXPOSE_HEADERS)
        self.send_header("Access-Control-Max-Age", CORS_MAX_AGE)

    def _reject_origin(self):
        """Send HTTP 403 for a browser Origin that is not in the allow-list.

        Returns:
            None.
        """
        self._send(403, json.dumps({"error": "origin not allowed"}))
