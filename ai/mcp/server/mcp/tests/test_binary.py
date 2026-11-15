"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_binary.py
Purpose:      Tests for binary upload/download/chunk tools (v4.10).
Version:      4.10
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
"""
from __future__ import annotations

import base64
import hashlib
import os
import shutil
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))
sys.path.insert(0, HERE)

from helpers import make_cfg  # noqa: E402
from mcp.tool_modules.binary import (
    tool_upload_file,
    tool_upload_file_from_url,
    tool_download_file,
    tool_get_file_info,
    tool_upload_chunk,
    tool_download_chunk,
    tool_upload_status,
    _assert_safe_url,
)


class BinaryToolTests(unittest.TestCase):
    def setUp(self):
        self.cfg = make_cfg(sandbox="none")

    def tearDown(self):
        shutil.rmtree(self.cfg._tmp, ignore_errors=True)

    def test_upload_download_roundtrip(self):
        data = b"PNG fake\x00\xff" + os.urandom(64)
        b64 = base64.b64encode(data).decode("ascii")
        path = "test.png"
        res = tool_upload_file({"path": path, "content": b64}, self.cfg)
        self.assertEqual(res["bytes"], len(data))
        self.assertEqual(res["sha256"], hashlib.sha256(data).hexdigest())

        dl = tool_download_file({"path": path}, self.cfg)
        got = base64.b64decode(dl["content"])
        self.assertEqual(got, data)
        self.assertEqual(dl["sha256"], res["sha256"])

    def test_get_file_info(self):
        data = b"hello binary"
        b64 = base64.b64encode(data).decode("ascii")
        tool_upload_file({"path": "info.bin", "content": b64}, self.cfg)
        info = tool_get_file_info({"path": "info.bin"}, self.cfg)
        self.assertEqual(info["size"], len(data))
        self.assertEqual(info["sha256"], hashlib.sha256(data).hexdigest())

    def test_url_rejects_non_https_and_private(self):
        with self.assertRaises(ValueError):
            _assert_safe_url("http://example.com/a.png")
        with self.assertRaises(ValueError):
            _assert_safe_url("https://127.0.0.1/a.png")
        with self.assertRaises(ValueError):
            _assert_safe_url("https://192.168.1.1/a.png")
        with self.assertRaises(ValueError):
            _assert_safe_url("https://10.0.0.5/secret")
        with self.assertRaises(ValueError):
            tool_upload_file_from_url(
                {"url": "http://example.com/a.png", "path": "a.png"}, self.cfg
            )

    def test_overwrite_protection(self):
        b64 = base64.b64encode(b"first").decode("ascii")
        tool_upload_file({"path": "once.txt", "content": b64}, self.cfg)
        with self.assertRaises(ValueError):
            tool_upload_file({"path": "once.txt", "content": b64, "overwrite": False}, self.cfg)
        # overwrite=True succeeds
        tool_upload_file({"path": "once.txt", "content": base64.b64encode(b"second").decode("ascii"), "overwrite": True}, self.cfg)

    def test_chunked_upload(self):
        data = b"chunked-" + os.urandom(200)
        chunks = [data[:100], data[100:]]
        upload_id = "test-upload-1"
        for i, part in enumerate(chunks):
            args = {
                "upload_id": upload_id,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "content": base64.b64encode(part).decode("ascii"),
            }
            if i == 0:
                args["path"] = "chunked.bin"
            res = tool_upload_chunk(args, self.cfg)
            if i < len(chunks) - 1:
                self.assertFalse(res.get("complete"))
            else:
                self.assertTrue(res.get("complete"))
                self.assertEqual(res["sha256"], hashlib.sha256(data).hexdigest())

        dl = tool_download_file({"path": "chunked.bin"}, self.cfg)
        self.assertEqual(base64.b64decode(dl["content"]), data)

    def test_download_chunk(self):
        data = b"ABCDEFGH" * 20
        b64 = base64.b64encode(data).decode("ascii")
        tool_upload_file({"path": "parts.bin", "content": b64}, self.cfg)
        c0 = tool_download_chunk({"path": "parts.bin", "chunk_index": 0, "chunk_size": 50}, self.cfg)
        self.assertEqual(base64.b64decode(c0["content"]), data[:50])
        self.assertGreater(c0["total_chunks"], 1)

    def test_upload_status(self):
        upload_id = "status-test"
        tool_upload_chunk({
            "upload_id": upload_id,
            "chunk_index": 0,
            "total_chunks": 2,
            "content": base64.b64encode(b"aaa").decode("ascii"),
            "path": "status.bin",
        }, self.cfg)
        st = tool_upload_status({"upload_id": upload_id}, self.cfg)
        self.assertEqual(st["received"], 1)
        self.assertEqual(st["total"], 2)
        self.assertFalse(st["complete"])


if __name__ == "__main__":
    unittest.main()
