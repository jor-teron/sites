"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/helpers.py
Purpose:      Shared helpers for v2.5 tests (temp Config, HTTP client, RPC wrappers).
Place:        mcp/tests/helpers.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, mcp.server, mcp.nscompat.
"""
from __future__ import annotations

import base64
import json
import os
import socket
import sys
import tempfile
import threading
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PKG_ROOT = os.path.realpath(os.path.join(HERE, "..", ".."))  # .../www/ai
if PKG_ROOT not in sys.path:
    sys.path.insert(0, PKG_ROOT)

from mcp import server  # noqa: E402
from mcp.config import (  # noqa: E402
    DEFAULT_MAX_PROCS,
    DEFAULT_MEMORY_MB,
    DEFAULT_PIN,
    DEFAULT_PUBLIC_URL,
    DEFAULT_TIMEOUT,
)
from mcp.nscompat import userns_available  # noqa: E402

# Demo PIN used by the HTTP tests; same value as config.DEFAULT_PIN.
PIN = DEFAULT_PIN

USERNS_OK, USERNS_NOTE = userns_available()


def _loopback_available():
    """Return whether this process can connect to a local TCP listener.

    Returns:
        bool: True when IPv4 loopback connections are permitted.
    """
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        client.settimeout(1.0)
        client.connect(listener.getsockname())
        accepted, _ = listener.accept()
        accepted.close()
        return True
    except OSError:
        return False
    finally:
        client.close()
        listener.close()


LOOPBACK_OK = _loopback_available()
LOOPBACK_NOTE = "local TCP loopback connections are blocked in this environment"


def write_text(path, value, mode=0o644):
    """Write a text file, creating parent directories if needed.

    Args:
        path (str): Destination path.
        value (str): UTF-8 text to write.
        mode (int): chmod after the write (default 0o644).

    Returns:
        None.
    """
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(value)
    os.chmod(path, mode)


def make_cfg(sandbox="none", cors=(), sandbox_net=False, pin=PIN, binds=None):
    """Build a validated Config pointing at a fresh temporary sandbox.

    Args:
        sandbox (str): Isolation mode ('none' or 'ns').
        cors (iterable): Allowed CORS origins.
        sandbox_net (bool): Whether the jail should have a network namespace skipped.
        pin (str): PIN the test server should accept.
        binds (list | None): Extra BIND= triples.

    Returns:
        Config: A validated config. _tmp is the temp parent, _work is the
        sandbox folder (the AI's /), and _workspace is sandbox/workspace
        (the AI's /workspace, also cfg.workspace and cfg.default_cwd).
        The caller must shutil.rmtree(cfg._tmp).
    """
    tmp = tempfile.mkdtemp(prefix="aimcp-")
    work = os.path.join(tmp, "work")
    os.mkdir(work)
    cfg = server.Config.__new__(server.Config)
    cfg.conf_path = None
    cfg.host = "127.0.0.1"
    cfg.port = 0
    cfg.pin = pin
    cfg.pin_file = None
    cfg.password = pin
    cfg.password_file = None
    cfg.log_file = os.path.join(tmp, "mcp.log")
    cfg.cors_origins = tuple(cors)
    cfg.root = work
    cfg.server_dir = os.path.realpath(os.path.join(PKG_ROOT, "mcp"))
    cfg.trust_proxy = False
    cfg.sandbox = sandbox
    cfg.sandbox_net = sandbox_net
    cfg.public_url = DEFAULT_PUBLIC_URL
    cfg.memory_mb = DEFAULT_MEMORY_MB
    cfg.max_procs = DEFAULT_MAX_PROCS
    cfg.default_timeout = DEFAULT_TIMEOUT
    cfg.binds = binds or ()
    cfg.using_default_pin = pin == DEFAULT_PIN
    cfg.using_default_password = cfg.using_default_pin
    # validate() creates <root>/workspace, reserved mount points, and
    # git-inits the workspace, then points default_cwd at it.
    cfg.workspace = None
    cfg.default_cwd = work
    cfg.validate()
    cfg._tmp = tmp
    cfg._work = work
    cfg._workspace = cfg.workspace
    return cfg


def start_server(cfg):
    """Start MCPHTTPServer on an ephemeral port in a daemon thread.

    Args:
        cfg (Config): Validated configuration (cfg.port may be 0).

    Returns:
        tuple: (httpd, thread, url) where url is http://host:port/mcp.
    """
    httpd = server.make_server(cfg)
    thread = threading.Thread(target=httpd.serve_forever)
    thread.daemon = True
    thread.start()
    host, port = httpd.server_address[:2]
    return httpd, thread, "http://%s:%s/mcp" % (host, port)


def http_req(url, method="POST", body=None, headers=None, timeout=20):
    """Issue one HTTP request and return (status, headers, body_bytes).

    Args:
        url (str): Request URL.
        method (str): HTTP method (default POST).
        body: bytes, str, or a JSON-serialisable object.
        headers (dict | None): Extra request headers.
        timeout (int | float): urllib timeout in seconds.

    Returns:
        tuple[int, dict, bytes]: Status, lower-cased header map, raw body.
        HTTPError is captured and returned as a status, not raised.
    """
    data = None
    if body is not None:
        if isinstance(body, bytes):
            data = body
        elif isinstance(body, str):
            data = body.encode("utf-8")
        else:
            data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, {k.lower(): v for k, v in exc.headers.items()}, exc.read()


def auth_headers(kind="bearer", pin=PIN, extra=None):
    """Build JSON + auth headers for a given PIN scheme.

    Args:
        kind (str): 'bearer', 'basic', 'header', 'legacy-header', or 'none'.
        pin (str): PIN to send.
        extra (dict | None): Additional headers to merge.

    Returns:
        dict: Header mapping suitable for http_req / rpc.
    """
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if kind == "bearer":
        headers["Authorization"] = "Bearer " + pin
    elif kind == "basic":
        raw = base64.b64encode(("anyone:" + pin).encode("utf-8")).decode("ascii")
        headers["Authorization"] = "Basic " + raw
    elif kind == "header":
        headers["X-MCP-PIN"] = pin
    elif kind == "legacy-header":
        headers["X-MCP-Password"] = pin
    elif kind == "none":
        pass
    if extra:
        headers.update(extra)
    return headers


def rpc(url, method, params=None, req_id=1, kind="bearer", pin=PIN, extra=None, password=None):
    """POST one JSON-RPC method and return (status, headers, parsed body).

    Args:
        url (str): MCP endpoint URL.
        method (str): JSON-RPC method name.
        params: JSON-RPC params, or None to omit the key.
        req_id: JSON-RPC id, or None for a notification.
        kind, pin, extra: Passed to auth_headers.
        password: Alias for pin, so ported v1 tests keep working.

    Returns:
        tuple: Status, header map, and the parsed JSON body (or text if
        the body is not JSON).
    """
    # password= is accepted as an alias so ported v1 tests keep working.
    if password is not None:
        pin = password
    payload = {"jsonrpc": "2.0", "method": method}
    if req_id is not None:
        payload["id"] = req_id
    if params is not None:
        payload["params"] = params
    status, headers, raw = http_req(url, body=payload, headers=auth_headers(kind, pin, extra))
    parsed = None
    if raw:
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            parsed = raw.decode("utf-8", errors="replace")
    return status, headers, parsed


def call_tool(url, name, arguments, **kwargs):
    """Call tools/call with the given tool name and arguments.

    Args:
        url (str): MCP endpoint URL.
        name (str): Tool name.
        arguments (dict): Tool arguments.
        **kwargs: Passed through to rpc (kind, pin, and so on).

    Returns:
        tuple: The rpc() result for this tools/call.
    """
    return rpc(url, "tools/call", {"name": name, "arguments": arguments}, **kwargs)


def tool_payload(parsed):
    """Parse the text content of a tools/call result as JSON if possible.

    Args:
        parsed (dict): A JSON-RPC response whose result.content[0].text
            holds the tool output.

    Returns:
        The parsed JSON object, or the raw text if it is not JSON.
    """
    text = parsed["result"]["content"][0]["text"]
    try:
        return json.loads(text)
    except (TypeError, json.JSONDecodeError, KeyError):
        return text
