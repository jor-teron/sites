#!/usr/bin/env python3
"""Process entry point for the independent HTTP API server."""
from __future__ import annotations

import os
import signal
import sys
import threading

from mcp.config import Config, ConfigError
from .http import make_server
from rag.application import initialize_application_runtime
from storage import StorageError


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv in (["-h"], ["--help"]):
        print("Usage: python3 -m api.server")
        print("Environment: API_HOST (default 127.0.0.1), API_PORT (default 10002)")
        return 0
    try:
        cfg = Config().validate()
        host = os.environ.get("API_HOST", "127.0.0.1").strip() or "127.0.0.1"
        port = int(os.environ.get("API_PORT", "10002"))
        if not 0 <= port <= 65535:
            raise ValueError("API_PORT must be between 0 and 65535")
    except (ConfigError, ValueError) as exc:
        sys.stderr.write("ai-api: invalid configuration: %s\n" % exc)
        return 1
    try:
        rag_runtime, rag_database = initialize_application_runtime()
    except (ValueError, OSError, StorageError) as exc:
        sys.stderr.write("ai-api: RAG startup configuration error: %s\n" % exc)
        return 1
    server = make_server(cfg, host, port, rag_runtime=rag_runtime)
    server.rag_database = rag_database

    def stop(_signum, _frame):
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    actual_host, actual_port = server.server_address[:2]
    sys.stderr.write(
        "RAG: %s (embeddings: %s)\n"
        % ("enabled" if rag_runtime.enabled else "disabled",
           "enabled" if rag_runtime.embeddings_enabled else "disabled")
    )
    sys.stderr.write("ai-api\nlistening: http://%s:%s/api\nhealth: http://%s:%s/api/health\n" % (actual_host, actual_port, actual_host, actual_port))
    if not cfg.auth_enabled:
        sys.stderr.write("WARNING: authentication is OFF.\n")
    try:
        server.serve_forever()
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
