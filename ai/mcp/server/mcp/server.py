#!/usr/bin/env python3
"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/server.py
Purpose:      Process entry point. Loads Config and starts the HTTP server.
              Configuration itself lives in mcp/config.py; this file only
              prints the startup banner and serves until SIGINT/SIGTERM.
Place:        mcp/server.py — invoked as `python3 -m mcp.server` by mcp.sh.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+ standard library only (signal, sys, threading).
"""
from __future__ import annotations

import os
import signal
import sys
import threading

from .config import (
    Config,
    ConfigError,
    FUNNEL_PATH,
    FUNNEL_TARGET_PATH,
    VERSION,
    WORKSPACE_LIMIT_OFF_LOG,
)
from .http import make_server
from .workspace import workspace_limit_status
from rag.application import initialize_application_runtime
from storage import StorageError

# Config and ConfigError are imported from .config so existing tests
# (`from mcp import server; server.Config`) and any v2 call sites keep working.


def main(argv=None):
    """Load configuration, start the HTTP server, and serve until a signal.

    Args:
        argv (list[str] | None): Command-line arguments without the program
            name. Defaults to sys.argv[1:]. `-h` / `--help` print usage and
            return 0 without starting the server.

    Returns:
        int: Process exit status. 0 on a clean shutdown or help, 1 on a
        configuration error.

    Raises:
        This function catches ConfigError and ValueError from Config and
        turns them into a stderr message plus a non-zero return. Other
        exceptions propagate.
    """
    argv = argv if argv is not None else sys.argv[1:]
    if argv in (["-h"], ["--help"]):
        sys.stdout.write(
            "Usage: mcp.sh  (or: python3 %s)\n"
            "See README.md for environment variables and setup.\n" % sys.argv[0]
        )
        return 0
    try:
        cfg = Config().validate()
    except ConfigError as exc:
        sys.stderr.write("ai-mcp: %s\n" % exc)
        return 1
    except ValueError as exc:
        sys.stderr.write("ai-mcp: invalid configuration: %s\n" % exc)
        return 1
    try:
        rag_runtime, rag_database = initialize_application_runtime()
    except (ValueError, OSError, StorageError) as exc:
        sys.stderr.write("ai-mcp: RAG startup configuration error: %s\n" % exc)
        return 1
    httpd = make_server(cfg)
    # Retain the optional runtime on the application server for future
    # explicitly registered RAG handlers; no RAG tools are exposed here.
    httpd.rag_runtime = rag_runtime
    httpd.rag_database = rag_database
    host, port = httpd.server_address[:2]

    def stop(_signum, _frame):
        """Shut the HTTP server down from a SIGINT/SIGTERM handler.

        Args:
            _signum: Signal number (unused).
            _frame: Interpreter frame (unused).

        Returns:
            None. Shutdown runs on a daemon thread because serve_forever()
            must be able to leave its accept loop on the main thread.
        """
        threading.Thread(target=httpd.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    base = "http://%s:%s" % (host, port)
    if not getattr(cfg, "auth_enabled", True):
        sys.stderr.write(
            "WARNING: authentication is OFF. Any client can connect. "
            "Set AUTH=1 in mcp.conf (or MCP_AUTH=1) to require a PIN.\n"
        )
    if cfg.using_default_pin:
        sys.stderr.write(
            "WARNING: using the default demo PIN. "
            "Set MCP_PIN (or PIN in mcp.conf) to change it before exposing this server.\n"
        )
    # limit_label is 'off' or 'on, X used of Y' for the banner line.
    limit_label = workspace_limit_status(
        cfg.workspace, getattr(cfg, "workspace_limit_on", False)
    )
    if cfg.workspace and not getattr(cfg, "workspace_limit_on", False):
        sys.stderr.write(WORKSPACE_LIMIT_OFF_LOG % cfg.workspace)
    sys.stderr.write(
        "RAG:       %s (embeddings: %s)\n"
        % ("enabled" if rag_runtime.enabled else "disabled",
           "enabled" if rag_runtime.embeddings_enabled else "disabled")
    )
    sys.stderr.write(
        "ai-mcp %s\n"
        "listening: %s  (POST JSON-RPC on /mcp, /ai/mcp, or any path)\n"
        "health:    %s/health\n"
        "sandbox:   %s\n"
        "workspace: %s (size limit: %s)\n"
        "isolation: %s\n"
        "server:    %s\n"
        "\n"
        "Suggested Funnel command:\n"
        "  tailscale funnel --bg --set-path %s http://127.0.0.1:%s%s\n"
        "\n"
        "Then check:\n"
        "  curl %s/health\n"
        "  curl https://<machine>.<tailnet>.ts.net%s/health\n"
        "\n"
        "MCP client URL: %s\n"
        "Grok URL:       %s/<PIN>\n"
        "Auth: Authorization: Bearer <PIN>\n"
        "     or Authorization: Basic base64(user:PIN)\n"
        "     or X-MCP-PIN: <PIN>\n"
        "     or the PIN as the last path segment\n"
        % (
            VERSION,
            base,
            base,
            cfg.root or "-",
            cfg.workspace or "-",
            limit_label,
            cfg.sandbox,
            cfg.server_dir,
            FUNNEL_PATH,
            port,
            FUNNEL_TARGET_PATH,
            base,
            FUNNEL_PATH,
            cfg.public_url,
            cfg.public_url,
        )
    )
    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
