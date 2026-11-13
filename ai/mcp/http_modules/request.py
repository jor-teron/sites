"""HTTP request handling: health, CORS-aware routing, auth and JSON-RPC."""
from __future__ import annotations

import ipaddress
import json
import sys
import uuid
from http.server import BaseHTTPRequestHandler

from .. import auth
from ..config import (
    AUTH_RETRY_AFTER_MIN, AUTH_RETRY_AFTER_PAD, AUTH_USER_AGENT_LOG_LEN,
    CORS_ALLOW_HEADERS, CORS_ALLOW_METHODS, CORS_EXPOSE_HEADERS, CORS_MAX_AGE,
    HEALTH_BODY, HEALTH_CONTENT_TYPE, HTTP_PROTOCOL_VERSION, HTTP_READ_TIMEOUT,
    JSON_CONTENT_TYPE, LATEST_PROTOCOL_VERSION, MAX_BODY, RPC_INVALID_REQUEST,
    RPC_PARSE_ERROR, SERVER_NAME, SUPPORTED_PROTOCOL_VERSIONS, VERSION,
)
from ..log import audit
from ..protocol import dispatch_rpc, rpc_error
from .cors import CORSMixin
from .routing import _content_length, is_health_path, url_path

class MCPHandler(CORSMixin, BaseHTTPRequestHandler):
    """Request handler for health checks, CORS preflight, and MCP JSON-RPC."""

    def setup(self):
        """Initialize the request streams and bound socket read time.

        Returns:
            None.
        """
        super().setup()
        self.connection.settimeout(HTTP_READ_TIMEOUT)

    # Advertise HTTP/1.1 so Content-Length / Connection: close work with Funnel.
    protocol_version = HTTP_PROTOCOL_VERSION
    # Server header: "<name>/<version>". sys_version is cleared so CPython
    # is not advertised.
    server_version = SERVER_NAME + "/" + VERSION
    sys_version = ""

    def log_message(self, fmt, *args):
        """Write one access-log line to stderr, with any PIN in the path redacted.

        Args:
            fmt (str): A printf-style format used by BaseHTTPRequestHandler.
            *args: Values for fmt.

        Returns:
            None.
        """
        msg = fmt % args
        try:
            pin = self.server.cfg.pin
            if pin and getattr(self, "path", None):
                msg = msg.replace(self.path, auth.redact_path(self.path, pin))
        except Exception:
            pass
        sys.stderr.write("%s - %s\n" % (self._ip(), msg))

    def _ip(self):
        """Return the client address, honouring X-Forwarded-For when trusted.

        Returns:
            str: The first X-Forwarded-For hop if MCP_TRUST_PROXY is on and
            that header is present, otherwise the socket peer address.
        """
        peer = self.client_address[0]
        if not getattr(self.server.cfg, "trust_proxy", False):
            return peer
        try:
            peer_ip = ipaddress.ip_address(peer)
        except ValueError:
            return peer
        trusted = getattr(self.server.cfg, "trust_proxy_ips", ())
        if not any(peer_ip in network for network in trusted):
            return peer
        forwarded = self.headers.get("X-Forwarded-For")
        if forwarded:
            # Only the first hop is used; require a plain valid IP literal.
            candidate = forwarded.split(",", 1)[0].strip()
            try:
                return str(ipaddress.ip_address(candidate))
            except ValueError:
                pass
        return peer

    def _send(self, status, body=None, content_type=None, extra_headers=None, origin=None):
        """Send a complete HTTP response.

        Error responses (status >= 400) always close the connection because
        the request body may not have been fully read, and Funnel reuses
        backend connections.

        Args:
            status (int): HTTP status code.
            body (str | bytes | None): Response body. None means no body
                (Content-Length 0).
            content_type (str | None): Overrides the default JSON type.
            extra_headers (list[tuple[str, str]] | None): Extra header pairs.
            origin (str | None): Allowed Origin, if CORS headers should be added.

        Returns:
            None.
        """
        payload = b"" if body is None else (
            body if isinstance(body, bytes) else body.encode("utf-8")
        )
        self.send_response(status)
        if origin:
            self._add_cors(origin)
        if extra_headers:
            for key, value in extra_headers:
                self.send_header(key, value)
        if status >= 400:
            # Request body may be unread; never reuse this connection
            # (Funnel pools backend connections).
            self.send_header("Connection", "close")
            self.close_connection = True
        if body is not None:
            self.send_header("Content-Type", content_type or JSON_CONTENT_TYPE)
            self.send_header("Content-Length", str(len(payload)))
        else:
            self.send_header("Content-Length", "0")
        self.end_headers()
        if payload and self.command != "HEAD":
            self.wfile.write(payload)

    def do_OPTIONS(self):
        """Handle a CORS preflight. Allowed origins get 204, others 403.

        Returns:
            None.
        """
        ok, origin = self._origin_state()
        if not ok:
            self._reject_origin()
            return
        self._send(204, origin=origin)

    def do_GET(self):
        """Serve GET /health (200, body "ok") or 405 for every other path.

        Returns:
            None.
        """
        ok, origin = self._origin_state()
        if not ok:
            self._reject_origin()
            return
        if is_health_path(self.path):
            self._send(200, HEALTH_BODY, content_type=HEALTH_CONTENT_TYPE, origin=origin)
            return
        self._send(405, json.dumps({"error": "method not allowed"}), origin=origin)

    def do_DELETE(self):
        """Reject DELETE (MCP is POST-only) with HTTP 405.

        Returns:
            None.
        """
        self._handle_non_post(405)

    def do_PUT(self):
        """Reject PUT (MCP is POST-only) with HTTP 405.

        Returns:
            None.
        """
        self._handle_non_post(405)

    def _handle_non_post(self, status):
        """Shared 405 path for methods other than GET, POST and OPTIONS.

        Args:
            status (int): HTTP status to send (always 405 today).

        Returns:
            None.
        """
        ok, origin = self._origin_state()
        if not ok:
            self._reject_origin()
            return
        if is_health_path(self.path):
            self._send(405, json.dumps({"error": "method not allowed"}), origin=origin)
            return
        self._send(status, json.dumps({"error": "method not allowed"}), origin=origin)

    def _authorize(self, origin):
        """Check the PIN and the per-IP lockout. Send 401 or 429 on failure.

        Args:
            origin (str | None): Allowed CORS origin to echo on the response.

        Returns:
            bool: True if the request may proceed to JSON-RPC dispatch.
        """
        ip = self._ip()
        allowed, wait = self.server.limiter.check(ip)
        if not allowed:
            retry_after = max(AUTH_RETRY_AFTER_MIN, int(wait) + AUTH_RETRY_AFTER_PAD)
            self._send(
                429,
                json.dumps({"error": "too many failed authentication attempts"}),
                extra_headers=[("Retry-After", str(retry_after))],
                origin=origin,
            )
            return False
        if not getattr(self.server.cfg, "auth_enabled", True):
            return True
        # v4.2: multi-user path /ai/mcp/<username>/<password> (or /mcp/...).
        # On success the User is attached to the handler for later steps.
        users = getattr(self.server.cfg, "users", None) or {}
        from ..users import authenticate_user
        user = authenticate_user(users, self.path)
        if user is not None:
            # v4.4: create the private home on first successful login.
            from ..users import ensure_user_home
            try:
                ensure_user_home(self.server.cfg, user)
            except Exception:
                # Do not block login if the directory cannot be created;
                # later tool calls will surface the error.
                pass
            self.mcp_user = user
            self.server.limiter.success(ip)
            return True
        # Fall back to the original single-PIN checks.
        provided = auth.extract_provided_pin(self.headers)
        expected = self.server.cfg.pin
        if auth.pins_match(provided, expected) or auth.path_has_pin(self.path, expected):
            self.mcp_user = None
            self.server.limiter.success(ip)
            return True
        self.server.limiter.fail(ip)
        auth_hdr = (self.headers.get("Authorization") or "").strip()
        audit(self.server.cfg, ip, None, {}, {
            "event": "auth_fail",
            "path": auth.redact_path(self.path, expected),
            "auth_scheme": (auth_hdr.split(" ", 1)[0] if auth_hdr else "none"),
            "header_names": sorted(k for k in self.headers.keys()),
            "user_agent": (self.headers.get("User-Agent") or "")[:AUTH_USER_AGENT_LOG_LEN],
        })
        self._send(
            401,
            json.dumps({"error": "unauthorized"}),
            extra_headers=auth.www_authenticate_headers(),
            origin=origin,
        )
        return False

    def do_POST(self):
        """Authorize, parse the JSON-RPC body, and dispatch one or more calls.

        A missing or unknown MCP-Protocol-Version header is tolerated
        (unknown values get HTTP 400). An empty body or invalid JSON is
        a parse error. A JSON array is a batch; notifications (no id)
        get HTTP 202 when there is no response to send.

        Returns:
            None.
        """
        ok, origin = self._origin_state()
        if not ok:
            self._reject_origin()
            return
        proto = self.headers.get("MCP-Protocol-Version")
        if proto and proto not in SUPPORTED_PROTOCOL_VERSIONS:
            self._send(
                400,
                json.dumps({
                    "error": "unsupported MCP-Protocol-Version",
                    "supported": list(SUPPORTED_PROTOCOL_VERSIONS),
                }),
                origin=origin,
            )
            return
        if not self._authorize(origin):
            return
        try:
            length = _content_length(self.headers)
        except ValueError:
            self._send(400, json.dumps(rpc_error(None, RPC_PARSE_ERROR, "Parse error")), origin=origin)
            return
        if length > MAX_BODY:
            self._send(413, json.dumps({"error": "request body too large"}), origin=origin)
            return
        body = self.rfile.read(length) if length else b""
        if len(body) > MAX_BODY:
            self._send(413, json.dumps({"error": "request body too large"}), origin=origin)
            return
        if not body:
            self._send(400, json.dumps(rpc_error(None, RPC_PARSE_ERROR, "Parse error")), origin=origin)
            return
        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send(400, json.dumps(rpc_error(None, RPC_PARSE_ERROR, "Parse error")), origin=origin)
            return
        extra = []
        session = self.headers.get("Mcp-Session-Id")
        ip = self._ip()
        # v4.3: if a multi-user login succeeded, scope tools to that home.
        cfg = self.server.cfg
        user = getattr(self, "mcp_user", None)
        if user is not None:
            from ..users import UserCfg
            cfg = UserCfg(cfg, user)
        if isinstance(payload, list):
            if not payload:
                self._send(
                    400,
                    json.dumps(rpc_error(None, RPC_INVALID_REQUEST, "Invalid Request")),
                    origin=origin,
                )
                return
            responses = []
            for item in payload:
                _notif, resp = dispatch_rpc(item, cfg, ip)
                if resp is not None:
                    responses.append(resp)
            if not responses:
                self._send(202, origin=origin)
                return
            self._send(200, json.dumps(responses), extra_headers=extra, origin=origin)
            return
        is_notif, resp = dispatch_rpc(payload, cfg, ip)
        if isinstance(payload, dict) and payload.get("method") == "initialize" and resp and "result" in resp:
            extra.append(("Mcp-Session-Id", session or uuid.uuid4().hex))
            extra.append((
                "MCP-Protocol-Version",
                resp["result"].get("protocolVersion", LATEST_PROTOCOL_VERSION),
            ))
        if is_notif and resp is None:
            self._send(202, extra_headers=extra, origin=origin)
            return
        self._send(200, json.dumps(resp), extra_headers=extra, origin=origin)
