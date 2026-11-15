"""HTTP transport for the standalone /api service."""
from __future__ import annotations

import ipaddress
import json
import os
import socketserver
import sys
import threading
from urllib.parse import parse_qs, urlsplit
from http.server import BaseHTTPRequestHandler, HTTPServer

from mcp import auth
from mcp.config import HTTP_MAX_THREADS, HTTP_REQUEST_QUEUE_SIZE, MAX_BODY, HTTP_READ_TIMEOUT
from mcp.config import client_tool_defs
from mcp.log import audit
from .service import call_tool
from . import rag_service
from rag.config import RAGDisabledError
from storage import StorageError


def _reject_duplicate_keys(pairs):
    """Build a JSON object while rejecting ambiguous duplicate keys."""
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON object key")
        result[key] = value
    return result


def _reject_json_constant(value):
    """Reject JavaScript-style constants that are not valid JSON."""
    raise ValueError("invalid JSON constant: %s" % value)


class APIHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ai-api/1"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(HTTP_READ_TIMEOUT)

    def log_message(self, fmt, *args):
        message = fmt % args
        try:
            pin = self.server.cfg.pin
            if pin and getattr(self, "path", None):
                message = message.replace(self.path, auth.redact_path(self.path, pin))
        except Exception:
            pass
        sys.stderr.write("%s - %s\n" % (self.client_address[0], message))

    def _send(self, status, data=None, content_type="application/json", headers=None):
        payload = b"" if data is None else (data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode("utf-8"))
        self.send_response(status)
        origin = self.headers.get("Origin")
        if origin and origin in self.server.cfg.cors_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-MCP-PIN")
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, DELETE, OPTIONS")
        if headers:
            for key, value in headers:
                self.send_header(key, value)
        self.send_header("Content-Type", content_type)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        if status >= 400:
            self.send_header("Connection", "close")
            self.close_connection = True
        self.end_headers()
        if payload and self.command != "HEAD":
            self.wfile.write(payload)

    def _error(self, status, code, message, headers=None):
        return self._send(status, {"ok": False, "error": message, "code": code}, headers=headers)

    def _origin_ok(self):
        origin = self.headers.get("Origin")
        return not origin or origin in self.server.cfg.cors_origins

    def _client_ip(self):
        peer = self.client_address[0]
        cfg = self.server.cfg
        if not getattr(cfg, "trust_proxy", False):
            return peer
        try:
            peer_ip = ipaddress.ip_address(peer)
        except ValueError:
            return peer
        if not any(peer_ip in network for network in getattr(cfg, "trust_proxy_ips", ())):
            return peer
        forwarded = self.headers.get("X-Forwarded-For")
        if forwarded:
            candidate = forwarded.split(",", 1)[0].strip()
            try:
                return str(ipaddress.ip_address(candidate))
            except ValueError:
                pass
        return peer

    def _authorize(self):
        ip = self._client_ip()
        allowed, wait = self.server.limiter.check(ip)
        if not allowed:
            self._error(429, "rate_limited", "too many failed authentication attempts",
                        headers=[("Retry-After", str(max(1, int(wait) + 1)))])
            return False
        if not self.server.cfg.auth_enabled:
            return True
        supplied = auth.extract_provided_pin(self.headers)
        if auth.pins_match(supplied, self.server.cfg.pin):
            self.server.limiter.success(ip)
            return True
        self.server.limiter.fail(ip)
        auth_header = (self.headers.get("Authorization") or "").strip()
        audit(self.server.cfg, ip, None, {}, {
            "event": "auth_fail",
            "path": self.path,
            "auth_scheme": auth_header.split(" ", 1)[0] if auth_header else "none",
            "header_names": sorted(self.headers.keys()),
            "user_agent": (self.headers.get("User-Agent") or "")[:160],
        })
        self._error(401, "unauthorized", "unauthorized", headers=auth.www_authenticate_headers())
        return False

    def do_OPTIONS(self):
        if not self._origin_ok():
            self._error(403, "origin_not_allowed", "origin not allowed")
            return
        self._send(204)

    def do_HEAD(self):
        """Return GET headers without a response body."""
        self.do_GET()

    def do_GET(self):
        if not self._origin_ok():
            self._error(403, "origin_not_allowed", "origin not allowed")
            return
        parsed = urlsplit(self.path)
        path = parsed.path
        if path in ("/rag", "/rag/"):
            if parsed.query:
                self._error(400, "invalid_request", "query parameters are not supported")
                return
            page = os.path.join(os.path.dirname(__file__), "static", "rag.html")
            try:
                with open(page, "rb") as handle:
                    payload = handle.read()
            except OSError:
                self._error(503, "gui_unavailable", "RAG dashboard files are unavailable")
                return
            self._send(200, payload, content_type="text/html; charset=utf-8")
            return
        if path == "/api/health":
            self._send(200, {"ok": True, "service": "api"})
            return
        if path == "/api/tools":
            if not self._authorize():
                return
            self._send(200, {"ok": True, "tools": client_tool_defs(self.server.cfg)})
            return
        if path.startswith("/api/rag/"):
            if not self._authorize():
                return
            try:
                if path == "/api/rag/settings":
                    self._reject_query(parsed.query, set())
                    self._send(200, {"ok": True, **rag_service.get_settings(
                        runtime=getattr(self.server, "rag_runtime", None)
                    )})
                    return
                if path == "/api/rag/status":
                    self._send(200, {"ok": True, "rag": rag_service.status(
                        getattr(self.server, "rag_runtime", None)
                    )})
                    return
                if path == "/api/rag/documents":
                    params = self._query_params(parsed.query, {"limit", "offset"})
                    limit = self._integer_param(params, "limit", 50, 1, 100)
                    offset = self._integer_param(params, "offset", 0, 0, 100000)
                    page = rag_service.list_documents(
                        getattr(self.server, "rag_runtime", None), limit, offset
                    )
                    self._send(200, {"ok": True, **page})
                    return
                if path == "/api/rag/search":
                    params = self._query_params(
                        parsed.query,
                        {"q", "limit", "offset", "source", "deduplicate", "snippet_chars",
                         "mode", "keyword_weight", "semantic_weight"},
                    )
                    query = self._one_param(params, "q", required=True)
                    limit = self._integer_param(params, "limit", 10, 1, 50)
                    offset = self._integer_param(params, "offset", 0, 0, 100000)
                    snippet_chars = self._integer_param(params, "snippet_chars", 240, 40, 1000)
                    source = self._one_param(params, "source")
                    deduplicate_text = self._one_param(params, "deduplicate", default="false")
                    if deduplicate_text.lower() not in ("true", "false"):
                        raise ValueError("deduplicate must be true or false")
                    deduplicate = deduplicate_text.lower() == "true"
                    mode = self._one_param(params, "mode", default="keyword")
                    keyword_weight = self._float_param(params, "keyword_weight", 0.5)
                    semantic_weight = self._float_param(params, "semantic_weight", 0.5)
                    if deduplicate and offset > 449:
                        raise ValueError("offset must be between 0 and 449 when deduplicate is enabled")
                    page = rag_service.search(
                        getattr(self.server, "rag_runtime", None), query,
                        limit=limit, offset=offset, source=source,
                        deduplicate=deduplicate, snippet_chars=snippet_chars,
                        mode=mode, keyword_weight=keyword_weight,
                        semantic_weight=semantic_weight,
                    )
                    self._send(200, {"ok": True, "query": query, **page})
                    return
                prefix = "/api/rag/documents/"
                if path.startswith(prefix):
                    self._reject_query(parsed.query, set())
                    document_id = path[len(prefix):]
                    if not document_id or "/" in document_id:
                        self._error(404, "not_found", "not found")
                        return
                    document = rag_service.get_document(
                        getattr(self.server, "rag_runtime", None), document_id
                    )
                    self._send(200, {"ok": True, "document": document})
                    return
            except RAGDisabledError as exc:
                self._error(503, "rag_disabled", str(exc))
                return
            except KeyError as exc:
                self._error(404, "not_found", str(exc).strip("'"))
                return
            except (ValueError, TypeError) as exc:
                self._error(400, "invalid_request", str(exc))
                return
            except StorageError as exc:
                self._error(500, "storage_error", str(exc))
                return
        self._error(404, "not_found", "not found")

    @staticmethod
    def _query_params(raw_query, allowed):
        params = parse_qs(raw_query, keep_blank_values=True, strict_parsing=True)
        unknown = set(params) - allowed
        if unknown:
            raise ValueError("unknown query parameter(s): %s" % ", ".join(sorted(unknown)))
        if any(len(values) != 1 for values in params.values()):
            raise ValueError("duplicate query parameters are not allowed")
        return params

    @staticmethod
    def _integer_param(params, name, default, minimum, maximum):
        raw = APIHandler._one_param(params, name, default=str(default))
        try:
            value = int(raw)
        except ValueError as exc:
            raise ValueError("%s must be an integer between %s and %s" %
                             (name, minimum, maximum)) from exc
        if str(value) != raw or not minimum <= value <= maximum:
            raise ValueError("%s must be an integer between %s and %s" %
                             (name, minimum, maximum))
        return value

    @staticmethod
    def _float_param(params, name, default):
        raw = APIHandler._one_param(params, name, default=str(default))
        try:
            value = float(raw)
        except ValueError as exc:
            raise ValueError("%s must be a finite number" % name) from exc
        import math
        if not math.isfinite(value):
            raise ValueError("%s must be a finite number" % name)
        return value

    @staticmethod
    def _one_param(params, name, required=False, default=None):
        values = params.get(name)
        if not values:
            if required:
                raise ValueError("query parameter '%s' is required" % name)
            return default
        value = values[0]
        if required and not value.strip():
            raise ValueError("query parameter '%s' must not be empty" % name)
        return value

    @staticmethod
    def _reject_query(raw_query, allowed):
        APIHandler._query_params(raw_query, allowed)

    def do_POST(self):
        if not self._origin_ok():
            self._error(403, "origin_not_allowed", "origin not allowed")
            return
        path = urlsplit(self.path).path
        if path not in ("/api/tools/call", "/api/rag/ingest", "/api/rag/settings", "/api/rag/apply"):
            self._error(404, "not_found", "not found")
            return
        if path in ("/api/rag/ingest", "/api/rag/settings", "/api/rag/apply") and urlsplit(self.path).query:
            self._error(400, "invalid_request", "query parameters are not supported")
            return
        if not self._authorize():
            return
        if self.headers.get("Transfer-Encoding"):
            self._error(400, "unsupported_transfer_encoding", "Transfer-Encoding is not supported")
            return
        raw_length = self.headers.get("Content-Length")
        if raw_length is None or not raw_length.isascii() or not raw_length.isdecimal():
            self._error(411, "content_length_required", "valid Content-Length required")
            return
        length = int(raw_length)
        if length > MAX_BODY:
            self._error(413, "body_too_large", "request body too large")
            return
        content_type = (self.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if content_type != "application/json":
            self._error(415, "unsupported_media_type", "Content-Type must be application/json")
            return
        body = self.rfile.read(length) if length else b""
        if len(body) != length:
            self._error(400, "incomplete_body", "request body is incomplete")
            return
        try:
            request = json.loads(
                body.decode("utf-8"),
                object_pairs_hook=_reject_duplicate_keys,
                parse_constant=_reject_json_constant,
            )
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            self._error(400, "invalid_json", "invalid JSON")
            return
        if not isinstance(request, dict):
            self._error(400, "invalid_request", "request must be an object")
            return
        if path == "/api/rag/apply":
            if request:
                self._error(400, "invalid_request", "apply request body must be an empty object")
                return
            try:
                result = rag_service.apply_settings(self.server)
                self._send(200, {"ok": True, **result})
            except (ValueError, TypeError, OSError, StorageError) as exc:
                self._error(409, "apply_failed", "settings were saved but could not be applied: %s" % exc)
            return
        if path == "/api/rag/settings":
            try:
                result = rag_service.put_settings(request)
                self._send(200, {"ok": True, **result})
            except (ValueError, TypeError) as exc:
                self._error(400, "invalid_settings", str(exc))
            except OSError as exc:
                self._error(500, "settings_storage_error", "could not persist RAG settings: %s" % exc)
            return
        if path == "/api/rag/ingest":
            unknown = set(request) - {"source", "content", "content_type", "title"}
            if unknown:
                self._error(400, "unknown_fields", "unknown request field(s): %s" % ", ".join(sorted(unknown)))
                return
            source, content = request.get("source"), request.get("content")
            if not isinstance(source, str) or not source.strip():
                self._error(400, "invalid_source", "source must be a non-empty string")
                return
            if not isinstance(content, str) or not content:
                self._error(400, "invalid_content", "content must be a non-empty string")
                return
            content_type, title = request.get("content_type"), request.get("title")
            if content_type is not None and not isinstance(content_type, str):
                self._error(400, "invalid_content_type", "content_type must be a string")
                return
            if title is not None and not isinstance(title, str):
                self._error(400, "invalid_title", "title must be a string")
                return
            try:
                metadata = rag_service.ingest(
                    getattr(self.server, "rag_runtime", None), source, content,
                    content_type=content_type, title=title,
                )
                self._send(201, {"ok": True, "document": metadata})
            except RAGDisabledError as exc:
                self._error(503, "rag_disabled", str(exc))
            except (ValueError, TypeError) as exc:
                self._error(400, "invalid_document", str(exc))
            except StorageError as exc:
                self._error(500, "storage_error", str(exc))
            return
        unknown = set(request) - {"name", "arguments"}
        if unknown:
            self._error(400, "unknown_fields", "unknown request field(s): %s" % ", ".join(sorted(unknown)))
            return
        name = request.get("name")
        arguments = request.get("arguments", {})
        if not isinstance(name, str) or not name or name != name.strip():
            self._error(400, "invalid_tool_name", "name must be a non-empty tool name")
            return
        if not isinstance(arguments, dict):
            self._error(400, "invalid_arguments", "arguments must be an object")
            return
        result = call_tool(name, arguments, self.server.cfg, self._client_ip())
        self._send(200 if result["ok"] else 422, result)

    def do_DELETE(self):
        if not self._origin_ok():
            self._error(403, "origin_not_allowed", "origin not allowed")
            return
        path = urlsplit(self.path).path
        prefix = "/api/rag/documents/"
        if not path.startswith(prefix) or not path[len(prefix):] or "/" in path[len(prefix):]:
            self._error(404, "not_found", "not found")
            return
        if urlsplit(self.path).query:
            self._error(400, "invalid_request", "query parameters are not supported")
            return
        if not self._authorize():
            return
        try:
            deleted = rag_service.delete_document(
                getattr(self.server, "rag_runtime", None), path[len(prefix):]
            )
            if not deleted:
                self._error(404, "not_found", "document not found")
                return
            self._send(200, {"ok": True, "deleted": True, "document_id": path[len(prefix):]})
        except RAGDisabledError as exc:
            self._error(503, "rag_disabled", str(exc))
        except (ValueError, TypeError) as exc:
            self._error(400, "invalid_document_id", str(exc))
        except StorageError as exc:
            self._error(500, "storage_error", str(exc))

    def _method_not_allowed(self):
        """Return a JSON 405 response for unsupported API methods."""
        self._error(405, "method_not_allowed", "method not allowed",
                    headers=[("Allow", "GET, HEAD, POST, DELETE, OPTIONS")])

    do_PUT = _method_not_allowed
    do_PATCH = _method_not_allowed
    do_TRACE = _method_not_allowed
    do_CONNECT = _method_not_allowed

    def send_error(self, code, message=None, explain=None):
        """Keep parser-level HTTP errors in the API's JSON response format."""
        messages = {400: "bad request", 414: "request target too long", 501: "method not implemented"}
        self._error(code, "http_error", messages.get(code, message or "HTTP error"))


class APIHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = HTTP_REQUEST_QUEUE_SIZE

    def __init__(self, address, cfg):
        self.cfg = cfg
        self.limiter = auth.RateLimiter()
        self._slots = threading.BoundedSemaphore(HTTP_MAX_THREADS)
        super().__init__(address, APIHandler)

    def process_request(self, request, client_address):
        self._slots.acquire()
        try:
            super().process_request(request, client_address)
        except Exception:
            self._slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()


def make_server(cfg, host, port, rag_runtime=None):
    """Create the API HTTP server on its independent bind address."""
    server = APIHTTPServer((host, port), cfg)
    server.rag_runtime = rag_runtime
    return server
