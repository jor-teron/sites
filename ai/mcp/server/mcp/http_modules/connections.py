"""Threaded HTTP connection server and concurrency bounds."""
from __future__ import annotations

import socketserver
import threading
from http.server import HTTPServer

from .. import auth
from ..config import HTTP_MAX_THREADS, HTTP_REQUEST_QUEUE_SIZE
from .request import MCPHandler

class MCPHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    """Threaded HTTP server that holds the Config and the RateLimiter.

    daemon_threads is True so a hung tool call cannot block process exit.
    allow_reuse_address is True so --restart can rebind quickly.
    """

    # True: worker threads do not keep the process alive after shutdown.
    daemon_threads = True
    # True: SO_REUSEADDR, so a restart can bind the same port immediately.
    allow_reuse_address = True
    # listen() backlog; value comes from config.py.
    request_queue_size = HTTP_REQUEST_QUEUE_SIZE

    def __init__(self, addr, cfg):
        """Bind the server and attach configuration plus a shared limiter.

        Args:
            addr (tuple): (host, port) passed to HTTPServer.
            cfg (Config): Validated runtime configuration.

        Returns:
            None.
        """
        self.cfg = cfg
        self.limiter = auth.RateLimiter()
        self._request_slots = threading.BoundedSemaphore(HTTP_MAX_THREADS)
        HTTPServer.__init__(self, addr, MCPHandler)

    def process_request(self, request, client_address):
        """Bound concurrent request threads; excess connections wait in backlog."""
        self._request_slots.acquire()
        try:
            socketserver.ThreadingMixIn.process_request(self, request, client_address)
        except Exception:
            self._request_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        """Release one concurrency slot after the handler finishes."""
        try:
            socketserver.ThreadingMixIn.process_request_thread(self, request, client_address)
        finally:
            self._request_slots.release()
