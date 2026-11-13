"""Tests for the local RAG CLI; no network or external model is used."""
from __future__ import annotations

import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rag import cli


class RAGCLITests(unittest.TestCase):
    def test_status_is_read_only_and_reports_disabled_defaults(self):
        output = io.StringIO()
        with mock.patch.dict(os.environ, {}, clear=True), contextlib.redirect_stdout(output):
            self.assertEqual(cli.main(["status"]), 0)
        result = json.loads(output.getvalue())
        self.assertFalse(result["rag_enabled"])
        self.assertFalse(result["embeddings_enabled"])
        self.assertFalse(result["storage_configured"])
        self.assertIsNone(result["database_path"])

    def test_commands_refuse_to_open_store_when_rag_disabled(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            error = io.StringIO()
            with contextlib.redirect_stderr(error):
                self.assertEqual(cli.main(["list"]), 2)
        self.assertIn("RAG is disabled", error.getvalue())

    def test_ingest_search_list_show_delete_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "notes.md"
            source.write_text("Assam has many rivers and green hills.", encoding="utf-8")
            env = {
                "AI_RAG_ENABLED": "true",
                "AI_RAG_EMBEDDINGS_ENABLED": "false",
                "AI_STORAGE_PATH": str(root / "rag.sqlite3"),
            }
            with mock.patch.dict(os.environ, env, clear=True):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    self.assertEqual(cli.main(["ingest", str(source)]), 0)
                document_id = json.loads(out.getvalue())["document"]["document_id"]
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    self.assertEqual(cli.main(["search", "rivers"]), 0)
                self.assertEqual(len(json.loads(out.getvalue())["results"]), 1)
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    self.assertEqual(cli.main(["list"]), 0)
                self.assertEqual(len(json.loads(out.getvalue())["documents"]), 1)
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    self.assertEqual(cli.main(["show", document_id]), 0)
                self.assertIn("green hills", out.getvalue())
                err = io.StringIO()
                with contextlib.redirect_stderr(err):
                    self.assertEqual(cli.main(["delete", document_id]), 2)
                self.assertIn("requires --yes", err.getvalue())
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    self.assertEqual(cli.main(["delete", document_id, "--yes"]), 0)
                self.assertTrue(json.loads(out.getvalue())["deleted"])

    def test_rejects_symlink_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "target.txt"
            target.write_text("hello", encoding="utf-8")
            link = root / "link.txt"
            link.symlink_to(target)
            with self.assertRaisesRegex(ValueError, "symlink"):
                cli._read_file(str(link))

    def test_rejects_invalid_limit(self):
        with self.assertRaises(SystemExit):
            cli.build_parser().parse_args(["search", "term", "--limit", "0"])


if __name__ == "__main__":
    unittest.main()
