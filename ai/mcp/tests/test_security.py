"""Focused fail-closed regression tests for sandbox and HTTP boundaries."""
from __future__ import annotations

import email.message
import ipaddress
import os
import tempfile
import unittest
from unittest import mock

from mcp import jail, sandbox
from mcp.config import DEFAULT_MEMORY_MB, DEFAULT_MAX_PROCS
from mcp.http import _content_length


class ReadOnlyBindTests(unittest.TestCase):
    def test_read_only_remount_failure_aborts(self):
        with tempfile.TemporaryDirectory() as root:
            src = os.path.join(root, "source")
            dst = os.path.join(root, "target")
            os.mkdir(src)
            os.mkdir(dst)
            with mock.patch.object(jail, "libc_mount") as mount:
                mount.side_effect = [None, OSError("remount denied")]
                with self.assertRaisesRegex(jail.JailError, "read-only bind remount failed"):
                    jail._bind(src, dst, ro=True)
            self.assertEqual(mount.call_count, 2)

    def test_read_write_bind_does_not_remount(self):
        with tempfile.TemporaryDirectory() as root:
            src = os.path.join(root, "source")
            dst = os.path.join(root, "target")
            os.mkdir(src)
            os.mkdir(dst)
            with mock.patch.object(jail, "libc_mount") as mount:
                jail._bind(src, dst, ro=False)
            self.assertEqual(mount.call_count, 1)


class RequiredSandboxControlsTests(unittest.TestCase):
    def test_rlimit_failure_aborts_startup(self):
        cfg = type("Cfg", (), {
            "memory_mb": DEFAULT_MEMORY_MB, "max_procs": DEFAULT_MAX_PROCS
        })()
        with mock.patch.object(sandbox.resource, "setrlimit", side_effect=OSError("denied")):
            with self.assertRaisesRegex(sandbox.SandboxError, "cannot apply resource limit"):
                sandbox.apply_rlimits(cfg, 10)

    def test_no_new_privs_failure_aborts_startup(self):
        cfg = type("Cfg", (), {
            "memory_mb": DEFAULT_MEMORY_MB, "max_procs": DEFAULT_MAX_PROCS
        })()
        with mock.patch.object(sandbox.resource, "setrlimit"), mock.patch.object(
            sandbox, "libc_prctl", side_effect=OSError("denied")
        ):
            with self.assertRaisesRegex(sandbox.SandboxError, "cannot set no_new_privs"):
                sandbox.apply_rlimits(cfg, 10)


class HttpBodyFramingTests(unittest.TestCase):
    def _headers(self, *pairs):
        headers = email.message.Message()
        for key, value in pairs:
            headers.add_header(key, value)
        return headers

    def test_missing_length_means_empty_body(self):
        self.assertEqual(_content_length(self._headers()), 0)

    def test_valid_length(self):
        self.assertEqual(_content_length(self._headers(("Content-Length", "123"))), 123)

    def test_rejects_negative_and_non_decimal_lengths(self):
        for value in ("-1", "+1", "1.5", "", "１２"):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    _content_length(self._headers(("Content-Length", value)))

    def test_rejects_duplicate_content_length(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            _content_length(self._headers(("Content-Length", "1"), ("Content-Length", "1")))

    def test_rejects_transfer_encoding(self):
        with self.assertRaisesRegex(ValueError, "Transfer-Encoding"):
            _content_length(self._headers(("Transfer-Encoding", "chunked")))


if __name__ == "__main__":
    unittest.main()


class TrustedProxyTests(unittest.TestCase):
    def _handler(self, peer, trusted, forwarded, enabled=True):
        from types import SimpleNamespace
        from mcp.http import MCPHandler

        handler = object.__new__(MCPHandler)
        handler.client_address = (peer, 12345)
        handler.headers = email.message.Message()
        if forwarded is not None:
            handler.headers.add_header("X-Forwarded-For", forwarded)
        handler.server = SimpleNamespace(cfg=SimpleNamespace(
            trust_proxy=enabled, trust_proxy_ips=trusted
        ))
        return handler

    def test_untrusted_peer_cannot_spoof_forwarded_ip(self):
        handler = self._handler("192.0.2.10", ( ipaddress.ip_network("127.0.0.1/32"),), "198.51.100.7")
        self.assertEqual(handler._ip(), "192.0.2.10")

    def test_trusted_peer_uses_valid_first_forwarded_ip(self):
        handler = self._handler("127.0.0.1", (ipaddress.ip_network("127.0.0.0/8"),), "198.51.100.7, 203.0.113.9")
        self.assertEqual(handler._ip(), "198.51.100.7")

    def test_trusted_peer_without_allowlist_ignores_forwarded_ip(self):
        handler = self._handler("127.0.0.1", (), "198.51.100.7")
        self.assertEqual(handler._ip(), "127.0.0.1")

    def test_invalid_forwarded_ip_is_ignored(self):
        handler = self._handler("127.0.0.1", (ipaddress.ip_network("127.0.0.1/32"),), "not-an-ip")
        self.assertEqual(handler._ip(), "127.0.0.1")

    def test_proxy_disabled_ignores_forwarded_ip(self):
        handler = self._handler("127.0.0.1", (ipaddress.ip_network("127.0.0.1/32"),), "198.51.100.7", enabled=False)
        self.assertEqual(handler._ip(), "127.0.0.1")


class HttpConcurrencyTests(unittest.TestCase):
    def test_slot_released_when_thread_creation_fails(self):
        import threading
        from mcp.http import MCPHTTPServer

        server = object.__new__(MCPHTTPServer)
        server._request_slots = threading.BoundedSemaphore(1)
        with mock.patch("socketserver.ThreadingMixIn.process_request", side_effect=RuntimeError("thread failed")):
            with self.assertRaisesRegex(RuntimeError, "thread failed"):
                server.process_request(object(), ("127.0.0.1", 1))
        self.assertTrue(server._request_slots.acquire(blocking=False))

    def test_slot_released_after_request_thread_finishes(self):
        import threading
        from mcp.http import MCPHTTPServer

        server = object.__new__(MCPHTTPServer)
        server._request_slots = threading.BoundedSemaphore(1)
        self.assertTrue(server._request_slots.acquire(blocking=False))
        with mock.patch("socketserver.ThreadingMixIn.process_request_thread"):
            server.process_request_thread(object(), ("127.0.0.1", 1))
        self.assertTrue(server._request_slots.acquire(blocking=False))
