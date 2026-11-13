"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/config/constants.py
Purpose:      Core server defaults, protocol and HTTP constants.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
"""
from __future__ import annotations

import os
from pathlib import Path

# =============================================================================
# Identity
# =============================================================================

# Public MCP serverInfo.name sent to clients and used in the HTTP Server header.
SERVER_NAME = "ai-mcp"

# Semantic version of this server release (serverInfo.version, banners, headers).
def _read_release_version() -> str:
    """Read the project release version from the repository/install root."""
    version_file = Path(__file__).resolve().parents[2] / "VERSION"
    try:
        version = version_file.read_text(encoding="ascii").strip()
    except OSError as exc:
        raise RuntimeError("VERSION file is missing; reinstall the complete release") from exc
    if not version or any(ch not in "0123456789." for ch in version):
        raise RuntimeError("VERSION file must contain a numeric dotted version")
    return version


VERSION = _read_release_version()


# =============================================================================
# Network and public URL
# =============================================================================

# Default bind address. Loopback only so the process is not exposed on LAN;
# Tailscale Funnel (or another proxy) reaches it on this address.
DEFAULT_HOST = "127.0.0.1"

# Default TCP port. Funnel is pointed at this port by mcp.sh --funnel.
# Changed from 8787 in v2.2; mcp.conf and MCP_PORT still override it.
DEFAULT_PORT = 10001

# Default public base URL (no trailing slash). Used in the startup banner
# and documentation; it is not a security boundary.
DEFAULT_PUBLIC_URL = "https://debian.tail94ffdb.ts.net/ai/mcp"

# Path Funnel publishes on the public URL. mcp.sh uses the same value.
FUNNEL_PATH = "/ai/mcp"

# Local HTTP path Funnel should forward to (the server accepts any path).
FUNNEL_TARGET_PATH = "/mcp"


# =============================================================================
# Paths
# =============================================================================

# Folder name of the chroot / file-tool root, next to mcp.sh and mcp.conf.
# Renamed from workspace/ in v2.1. Overridable via MCP_ROOT / ROOT / WORKSPACE.
# This host folder is the AI's "/" inside the jail (v2.2).
SANDBOX_DIR_NAME = "sandbox"

# Folder name of the default working directory, created under the sandbox root.
# On the host this is <sandbox>/workspace; the AI sees it as /workspace.
WORKSPACE_DIR_NAME = "workspace"

# Filename of the optional key=value config file next to mcp.sh.
CONF_FILENAME = "mcp.conf"

# Default JSON-lines event log path (tool calls and auth failures).
# Keep this outside the sandbox folder. Distinct from the human-readable
# command audit log (DEFAULT_AUDIT_LOG).
DEFAULT_LOG = "/home/ai/mcp.log"

# Filename of the human-readable command audit log, created next to
# the JSON log (same directory as MCP_LOG / DEFAULT_LOG).
AUDIT_LOG_FILENAME = "mcp-audit.log"

# Default path of that audit log when MCP_AUDIT_LOG is unset and no
# JSON log path is available to derive it from.
DEFAULT_AUDIT_LOG = "/home/ai/mcp-audit.log"

# Default directory where mcp.sh writes mcp.pid and mcp.out (not used by
# the Python server itself; listed here so the value lives in one place).
DEFAULT_STATE_DIR = "/home/ai"

# Filename of the /workspace disk image, kept next to mcp.sh (not inside
# the sandbox, so the AI cannot see or delete it).
WORKSPACE_IMAGE_NAME = "workspace.img"

# Filesystem type used when formatting the workspace image.
WORKSPACE_IMAGE_FS = "ext4"

# fstab mount options for the loop image. nofail so a missing image does
# not block boot; loop attaches the file as a block device.
WORKSPACE_FSTAB_OPTIONS = "loop,nofail"


# =============================================================================
# PIN and lockout
# =============================================================================

# Demo PIN used when neither PIN / MCP_PIN nor a PIN file is set.
# Must be changed before the server is reachable on a public address.
DEFAULT_PIN = "password"

# Default path of the multi-user catalog (v4.1). Outside the sandbox.
# Columns: username,password,home,enabled,perms  (perms uses |).
DEFAULT_USERS_CSV = "/home/ai/users.csv"

# Failed-PIN count at which the client IP is first locked out (the 5th failure).
# The first (threshold - 1) failures are recorded but not delayed.
AUTH_FAIL_THRESHOLD = 5

# Ceiling, in seconds, of the lockout delay. Delay is
# min(AUTH_MAX_DELAY, AUTH_LOCKOUT_BASE ** (count - AUTH_FAIL_THRESHOLD)).
AUTH_MAX_DELAY = 60

# Bound the in-memory failed-authentication table against IP-spray exhaustion.
AUTH_MAX_TRACKED_IPS = 4096

# Base of the exponential lockout delay. 2 gives 1s, 2s, 4s, ... up to the max.
AUTH_LOCKOUT_BASE = 2

# Extra seconds added when building the HTTP Retry-After header:
# max(AUTH_RETRY_AFTER_MIN, int(wait) + AUTH_RETRY_AFTER_PAD).
AUTH_RETRY_AFTER_PAD = 1

# Floor, in seconds, for the Retry-After value sent with HTTP 429.
AUTH_RETRY_AFTER_MIN = 1

# Max characters of the User-Agent copied into an auth-failure audit record.
AUTH_USER_AGENT_LOG_LEN = 120

# Path segment that replaces a PIN found in a request path in logs.
PIN_REDACT_MARK = "***"

# WWW-Authenticate value on HTTP 401. Bearer only (no OAuth metadata).
WWW_AUTHENTICATE = 'Bearer realm="ai-mcp"'

# Authorization scheme prefix for a Bearer PIN (matched case-insensitively).
AUTH_BEARER_PREFIX = "bearer "

# Authorization scheme prefix for Basic (password field is the PIN).
AUTH_BASIC_PREFIX = "basic "

# Extra header names, in lookup order, that may carry the PIN.
AUTH_PIN_HEADERS = ("X-MCP-PIN", "X-MCP-Pin", "X-MCP-Password")


# =============================================================================
# HTTP transport and CORS
# =============================================================================

# Maximum JSON-RPC request body, in bytes (10 MiB). Larger bodies get HTTP 413.
MAX_BODY = 10 * 1024 * 1024

# Socket read timeout for an individual HTTP connection, in seconds.
HTTP_READ_TIMEOUT = 15

# listen() backlog for the threaded HTTP server. 32 is enough for a few
# concurrent tool calls without a large queue of pending handshakes.
HTTP_REQUEST_QUEUE_SIZE = 32

# Maximum simultaneous HTTP request-handler threads. Excess connections wait
# in the kernel listen backlog rather than creating unbounded Python threads.
HTTP_MAX_THREADS = 32

# HTTP protocol version advertised by the request handler. 1.1 so Content-Length
# and Connection: close work as Funnel's connection reuse expects.
HTTP_PROTOCOL_VERSION = "HTTP/1.1"

# Body returned by GET /health (and any path ending in /health).
HEALTH_BODY = "ok\n"

# Content type for the health response (plain text, not JSON).
HEALTH_CONTENT_TYPE = "text/plain; charset=utf-8"

# Default Content-Type for JSON responses.
JSON_CONTENT_TYPE = "application/json"

# CORS preflight cache lifetime, in seconds (24 hours). Browsers will not
# re-issue OPTIONS on every request during that window.
CORS_MAX_AGE = "86400"

# Headers a browser MCP client is allowed to send. Includes both v2 PIN
# headers and the v1 X-MCP-Password alias.
CORS_ALLOW_HEADERS = (
    "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version, "
    "X-MCP-PIN, X-MCP-Password"
)

# Methods a browser client may use. GET is for /health, POST for JSON-RPC,
# OPTIONS for CORS preflight.
CORS_ALLOW_METHODS = "GET, POST, OPTIONS"

# Response headers a browser client is allowed to read.
CORS_EXPOSE_HEADERS = "Mcp-Session-Id, MCP-Protocol-Version"

# Default CORS origin list when MCP_CORS_ORIGINS is unset. Empty means
# browser requests with an Origin header are rejected (non-browser clients
# send no Origin and are unaffected).
DEFAULT_CORS_ORIGINS = ""

# Default for MCP_TRUST_PROXY. "0" means ignore X-Forwarded-For.
DEFAULT_TRUST_PROXY = "0"

# Empty by default: forwarded addresses are trusted only when the immediate
# socket peer matches an explicitly configured IP or CIDR in this list.
DEFAULT_TRUST_PROXY_IPS = ""


# =============================================================================
# JSON-RPC and MCP protocol
# =============================================================================

# JSON-RPC version string required on every request and copied onto replies.
JSONRPC_VERSION = "2.0"

# MCP protocol versions this server understands, newest first.
SUPPORTED_PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")

# Version offered when the client omits one or sends an unknown value.
LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0]

# JSON-RPC error codes (JSON-RPC 2.0 specification).
RPC_PARSE_ERROR = -32700
RPC_INVALID_REQUEST = -32600
RPC_METHOD_NOT_FOUND = -32601
RPC_INVALID_PARAMS = -32602
RPC_INTERNAL_ERROR = -32603

# Indent, in spaces, when a tool result is pretty-printed as JSON text.
JSON_INDENT = 2

# Max characters of an exception message stored in an audit record or RPC error.
ERROR_SNIPPET_LEN = 300

# -----------------------------------------------------------------------------

# One-time network approval flag. If this file exists when a command starts,
# the sandbox allows network for that command and removes the file.
ALLOW_NET_FLAG = "/tmp/mcp-allow-net"

# 1 = require PIN (default). 0 = allow connections without auth (testing only).
DEFAULT_AUTH = "1"
