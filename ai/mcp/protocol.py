"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/protocol.py
Purpose:      MCP JSON-RPC methods: initialize, ping, tools/list, tools/call,
              and the notifications/initialized notification.
Place:        mcp/protocol.py — called from http.py after a request is authorized.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+ standard library only (json).
"""
from __future__ import annotations

import json
import time

from .config import (
    ERROR_SNIPPET_LEN,
    JSON_INDENT,
    JSONRPC_VERSION,
    LATEST_PROTOCOL_VERSION,
    RPC_INTERNAL_ERROR,
    RPC_INVALID_PARAMS,
    RPC_INVALID_REQUEST,
    RPC_METHOD_NOT_FOUND,
    SERVER_NAME,
    SUPPORTED_PROTOCOL_VERSIONS,
    VERSION,
    client_instructions,
    client_tool_defs,
)
from .log import audit, tool_audit
from .tools import summarize_args, tool_handlers

# Re-export protocol names so existing tests (`protocol.VERSION`,
# `protocol.LATEST_PROTOCOL_VERSION`) keep importing them from this module.
# The values themselves are defined only in config.py (imported above).


def rpc_result(req_id, result):
    """Build a JSON-RPC 2.0 success object.

    Args:
        req_id: The request id to echo (any JSON-RPC id type, or None).
        result: The method result payload.

    Returns:
        dict: A complete JSON-RPC response with a "result" key.
    """
    return {"jsonrpc": JSONRPC_VERSION, "id": req_id, "result": result}


def rpc_error(req_id, code, message, data=None):
    """Build a JSON-RPC 2.0 error object.

    Args:
        req_id: The request id to echo, or None when the id is unknown.
        code (int): A JSON-RPC error code from config.py.
        message (str): Short error message.
        data: Optional extra error payload (omitted when None).

    Returns:
        dict: A complete JSON-RPC response with an "error" key.
    """
    err = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": JSONRPC_VERSION, "id": req_id, "error": err}


def handle_initialize(params, cfg=None):
    """Return the initialize result (protocol version, caps, serverInfo).

    If the client asked for a supported protocol version, that version is
    echoed; otherwise LATEST_PROTOCOL_VERSION is offered. Instructions
    are built from the live Config so they match isolation, network and
    limits.

    Args:
        params (dict | any): The request params. Non-dicts are treated as {}.
        cfg: Runtime Config used to fill instructions. None uses defaults.

    Returns:
        dict: The MCP initialize result object.
    """
    if not isinstance(params, dict):
        params = {}
    client_ver = params.get("protocolVersion")
    version = client_ver if client_ver in SUPPORTED_PROTOCOL_VERSIONS else LATEST_PROTOCOL_VERSION
    return {
        "protocolVersion": version,
        "capabilities": {"tools": {}},
        "serverInfo": {"name": SERVER_NAME, "version": VERSION},
        "instructions": client_instructions(cfg),
    }


def handle_tools_call(params, cfg, ip):
    """Run one named tool and wrap its return value as MCP content.

    Unknown tools and exceptions become isError results rather than
    JSON-RPC errors, which is what MCP clients expect for tool failures.

    Args:
        params (dict): Must contain "name" and optionally "arguments".
        cfg (Config): Runtime configuration passed to the tool.
        ip (str): Client address, stored in the audit log.

    Returns:
        dict: An MCP tools/call result with content and isError.

    Raises:
        ValueError: If params is not an object, the name is missing, or
            arguments is not an object. The dispatcher turns this into
            a JSON-RPC invalid-params error.
    """
    if not isinstance(params, dict):
        raise ValueError("params must be an object")
    name = params.get("name")
    arguments = params.get("arguments") if params.get("arguments") is not None else {}
    if not name or not isinstance(name, str):
        raise ValueError("tool name is required")
    if not isinstance(arguments, dict):
        raise ValueError("arguments must be an object")
    func = tool_handlers.get(name)
    if not func:
        return {
            "content": [{"type": "text", "text": "Unknown tool: %s" % name}],
            "isError": True,
        }
    # v4.3: enforce per-user permission flags when a user is attached.
    user = getattr(cfg, "mcp_user", None)
    if user is not None:
        from .users import tool_allowed
        if not tool_allowed(user, name):
            return {
                "content": [{"type": "text", "text": "Error: permission denied (%s)" % name}],
                "isError": True,
            }
    summary = summarize_args(arguments)
    # started is used for the human-readable audit duration.
    started = time.time()
    try:
        raw = func(arguments, cfg)
        duration = time.time() - started
        text = raw if isinstance(raw, str) else json.dumps(
            raw, ensure_ascii=False, indent=JSON_INDENT
        )
        extra = {"ok": True, "result_size": len(text)}
        if isinstance(raw, dict) and "exit_code" in raw:
            extra["exit"] = raw.get("exit_code")
            extra["timed_out"] = raw.get("timed_out")
        audit(cfg, ip, name, summary, extra)
        tool_audit(cfg, ip, name, arguments, raw, duration, error=None)
        return {"content": [{"type": "text", "text": text}], "isError": False}
    except Exception as exc:
        duration = time.time() - started
        audit(cfg, ip, name, summary, {"ok": False, "error": str(exc)[:ERROR_SNIPPET_LEN]})
        tool_audit(cfg, ip, name, arguments, None, duration, error=exc)
        return {"content": [{"type": "text", "text": "Error: %s" % exc}], "isError": True}


def dispatch_rpc(msg, cfg, ip):
    """Dispatch one JSON-RPC message and return (is_notification, response).

    Args:
        msg: The parsed JSON body (must be a dict to be valid).
        cfg (Config): Runtime configuration for tools/call.
        ip (str): Client address for the audit log.

    Returns:
        tuple[bool, dict | None]: is_notification is True when the message
        has no id. response is None for a notification (including unknown
        notification methods); otherwise it is a JSON-RPC result or error.
    """
    if not isinstance(msg, dict):
        return False, rpc_error(None, RPC_INVALID_REQUEST, "Invalid Request")
    if msg.get("jsonrpc") != JSONRPC_VERSION:
        return False, rpc_error(msg.get("id"), RPC_INVALID_REQUEST, "Invalid Request")
    method = msg.get("method")
    if not method or not isinstance(method, str):
        return False, rpc_error(msg.get("id"), RPC_INVALID_REQUEST, "Invalid Request")
    is_notif = "id" not in msg
    req_id = msg.get("id") if not is_notif else None
    params = msg.get("params", {})
    if params is None:
        params = {}
    try:
        if method == "initialize":
            result = handle_initialize(params, cfg)
        elif method == "ping":
            result = {}
        elif method == "notifications/initialized":
            result = {}
        elif method == "tools/list":
            result = {"tools": client_tool_defs(cfg)}
        elif method == "tools/call":
            result = handle_tools_call(params, cfg, ip)
        else:
            if is_notif:
                return True, None
            return False, rpc_error(req_id, RPC_METHOD_NOT_FOUND, "Method not found")
    except ValueError as exc:
        if is_notif:
            return True, None
        return False, rpc_error(req_id, RPC_INVALID_PARAMS, str(exc))
    except Exception as exc:
        if is_notif:
            return True, None
        return False, rpc_error(req_id, RPC_INTERNAL_ERROR, "Internal error", str(exc)[:ERROR_SNIPPET_LEN])
    if is_notif:
        return True, None
    return False, rpc_result(req_id, result)
