"""Small, local command-line interface for the optional RAG store.

The CLI deliberately uses keyword retrieval only. It does not load an embedding
model, contact a provider, crawl directories, or expose a network listener.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from rag.application import initialize_application_runtime
from rag.config import RAGConfig
from storage import StorageConfig, StorageError


def _limit(value):
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("limit must be an integer between 1 and 50") from exc
    if not 1 <= parsed <= 50:
        raise argparse.ArgumentTypeError("limit must be an integer between 1 and 50")
    return parsed


def build_parser():
    parser = argparse.ArgumentParser(
        prog="rag", description="Manage a local, opt-in document search store."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("status", help="show feature switches without opening storage")
    subparsers.add_parser("list", help="list indexed documents")

    ingest = subparsers.add_parser("ingest", help="ingest one TXT, Markdown or HTML file")
    ingest.add_argument("file", help="path to one local file")

    search = subparsers.add_parser("search", help="search document chunks by keyword")
    search.add_argument("query", help="words to search for")
    search.add_argument("--limit", type=_limit, default=10, help="maximum results (1-50)")
    search.add_argument("--source", help="restrict results to an exact source label")

    show = subparsers.add_parser("show", help="show a document and its chunks")
    show.add_argument("document_id", help="64-character document ID")

    delete = subparsers.add_parser("delete", help="delete one document and its chunks")
    delete.add_argument("document_id", help="64-character document ID")
    delete.add_argument("--yes", action="store_true", help="confirm deletion")
    return parser


def _emit(value):
    print(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))


def _runtime():
    runtime, database = initialize_application_runtime()
    if not runtime.enabled:
        raise RuntimeError("RAG is disabled; set AI_RAG_ENABLED=true to enable the CLI")
    return runtime, database


def _read_file(path_value):
    path = Path(path_value).expanduser()
    try:
        if path.is_symlink() or not path.is_file():
            raise ValueError("input must be a regular file, not a symlink")
        # The extraction layer enforces the same hard byte limit. Check before
        # reading so an unexpectedly large file is not loaded into memory.
        from rag.extract import MAX_DOCUMENT_BYTES
        if path.stat().st_size > MAX_DOCUMENT_BYTES:
            raise ValueError("file exceeds the %d-byte ingestion limit" % MAX_DOCUMENT_BYTES)
        return path, path.read_bytes()
    except OSError as exc:
        raise ValueError("cannot read %s: %s" % (path, exc)) from exc


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "status":
            rag = RAGConfig.from_env()
            storage = StorageConfig.from_env()
            _emit({
                "rag_enabled": rag.enabled,
                "embeddings_enabled": rag.embeddings_enabled,
                "storage_configured": storage.enabled,
                "database_path": storage.database_path if rag.enabled else None,
                "keyword_search": rag.enabled,
                "semantic_search": rag.enabled and rag.embeddings_enabled,
            })
            return 0

        runtime, _database = _runtime()
        if args.command == "ingest":
            path, content = _read_file(args.file)
            result = runtime.ingest(str(path.resolve()), content)
            _emit({"document": result.metadata, "result": "ingested"})
        elif args.command == "list":
            _emit({"documents": runtime.list_documents()})
        elif args.command == "search":
            _emit({"query": args.query, "results": runtime.search(
                args.query, limit=args.limit, source=args.source
            )})
        elif args.command == "show":
            document = runtime.get(args.document_id)
            if document is None:
                print("document not found", file=sys.stderr)
                return 1
            _emit({"document": document})
        elif args.command == "delete":
            if not args.yes:
                raise ValueError("deletion requires --yes")
            deleted = runtime.delete(args.document_id)
            _emit({"document_id": args.document_id, "deleted": deleted})
            if not deleted:
                return 1
        return 0
    except (OSError, ValueError, RuntimeError, TypeError, StorageError) as exc:
        print("rag: %s" % exc, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
