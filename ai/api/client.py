"""Small command-line client for the standalone HTTP API.

Examples:
    python3 -m api.client health
    python3 -m api.client tools
    python3 -m api.client call list_dir --arguments '{"path":"."}'
    python3 -m api.client rag status
    python3 -m api.client rag search "Assam rivers"
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request
from urllib.parse import quote, urlencode


DEFAULT_URL = "http://127.0.0.1:10002"


class APIClientError(Exception):
    """A connection, HTTP, or API response error."""


class APIClient:
    def __init__(self, base_url=None, pin=None, timeout=15):
        """Create a client for one API base URL and optional PIN."""
        self.base_url = (base_url or DEFAULT_URL).rstrip("/")
        self.pin = pin
        self.timeout = timeout

    def request(self, method, path, payload=None, authenticated=False):
        """Send one HTTP request and decode the JSON response."""
        url = self.base_url + path
        headers = {"Accept": "application/json"}
        if authenticated and self.pin:
            headers["Authorization"] = "Bearer " + self.pin
        data = None
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                detail = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                detail = {"error": str(exc)}
            message = detail.get("error", str(exc)) if isinstance(detail, dict) else str(exc)
            code = detail.get("code") if isinstance(detail, dict) else None
            suffix = " (%s)" % code if code else ""
            raise APIClientError("HTTP %s: %s%s" % (exc.code, message, suffix))
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            reason = getattr(exc, "reason", exc)
            raise APIClientError("cannot reach API at %s: %s" % (url, reason))
        if not raw:
            return {}
        try:
            result = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise APIClientError("API returned invalid JSON")
        if isinstance(result, dict) and result.get("ok") is False:
            raise APIClientError(result.get("error", "API request failed"))
        return result

    def health(self):
        """Return the public API health response."""
        return self.request("GET", "/api/health")

    def tools(self):
        """Return the authenticated tool definitions."""
        return self.request("GET", "/api/tools", authenticated=True)

    def call(self, name, arguments):
        """Call a registered tool with its argument object."""
        return self.request(
            "POST", "/api/tools/call",
            {"name": name, "arguments": arguments},
            authenticated=True,
        )

    def rag_status(self):
        """Return RAG feature status (authentication required)."""
        return self.request("GET", "/api/rag/status", authenticated=True)

    def rag_ingest(self, source, content, content_type=None, title=None):
        """Ingest one text document through the RAG API."""
        payload = {"source": source, "content": content}
        if content_type is not None:
            payload["content_type"] = content_type
        if title is not None:
            payload["title"] = title
        return self.request("POST", "/api/rag/ingest", payload, authenticated=True)

    def rag_documents(self, limit=50, offset=0):
        """List one page of RAG document metadata."""
        params = urlencode({"limit": limit, "offset": offset})
        return self.request("GET", "/api/rag/documents?" + params, authenticated=True)

    def rag_get(self, document_id):
        """Retrieve one RAG document and its chunks."""
        return self.request(
            "GET", "/api/rag/documents/" + quote(document_id, safe=""), authenticated=True
        )

    def rag_search(self, query, limit=10, source=None, offset=0,
                   deduplicate=False, snippet_chars=240, mode="keyword",
                   keyword_weight=0.5, semantic_weight=0.5):
        """Run a paginated keyword or hybrid search against the RAG store."""
        params = {
            "q": query, "limit": limit, "offset": offset,
            "deduplicate": str(bool(deduplicate)).lower(),
            "snippet_chars": snippet_chars, "mode": mode,
            "keyword_weight": keyword_weight, "semantic_weight": semantic_weight,
        }
        if source is not None:
            params["source"] = source
        return self.request(
            "GET", "/api/rag/search?" + urlencode(params), authenticated=True
        )

    def rag_delete(self, document_id):
        """Delete one RAG document and its associated chunks."""
        return self.request(
            "DELETE", "/api/rag/documents/" + quote(document_id, safe=""), authenticated=True
        )


def _parser():
    """Build the command-line argument parser."""
    parser = argparse.ArgumentParser(description="Command-line client for the ai HTTP API")
    parser.add_argument("--url", default=os.environ.get("API_URL", DEFAULT_URL),
                        help="API base URL (default: %(default)s; env: API_URL)")
    parser.add_argument("--pin-file", default=os.environ.get("API_PIN_FILE"),
                        help="read API PIN from this file (or set API_PIN)")
    parser.add_argument("--timeout", type=float, default=15,
                        help="request timeout in seconds (default: 15)")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("health", help="check API process health")
    commands.add_parser("tools", help="list available tools")
    call = commands.add_parser("call", help="call one registered tool")
    call.add_argument("name", help="registered tool name")
    call.add_argument("--arguments", default="{}", help="tool arguments as a JSON object")

    rag = commands.add_parser("rag", help="manage RAG through the API server")
    rag_commands = rag.add_subparsers(dest="rag_command", required=True)
    rag_commands.add_parser("status", help="show RAG feature status")

    ingest = rag_commands.add_parser("ingest", help="ingest one local TXT, Markdown or HTML file")
    ingest.add_argument("file", help="path to one local text file")
    ingest.add_argument("--title", help="optional document title")

    listing = rag_commands.add_parser("list", help="list indexed documents")
    listing.add_argument("--limit", type=int, default=50, help="page size (1-100)")
    listing.add_argument("--offset", type=int, default=0, help="number of documents to skip")

    search = rag_commands.add_parser("search", help="search indexed text by keyword")
    search.add_argument("query", help="words to search for")
    search.add_argument("--limit", type=int, default=10, help="result count (1-50)")
    search.add_argument("--offset", type=int, default=0, help="number of results to skip")
    search.add_argument("--source", help="exact source label")
    search.add_argument("--deduplicate", action="store_true", help="return at most one result per document")
    search.add_argument("--snippet-chars", type=int, default=240, help="snippet length (40-1000)")
    search.add_argument("--mode", choices=("keyword", "hybrid"), default="keyword",
                        help="search mode (hybrid uses embeddings when configured)")
    search.add_argument("--keyword-weight", type=float, default=0.5,
                        help="hybrid keyword rank weight (default: 0.5)")
    search.add_argument("--semantic-weight", type=float, default=0.5,
                        help="hybrid semantic rank weight (default: 0.5)")

    show = rag_commands.add_parser("show", help="retrieve one document and its chunks")
    show.add_argument("document_id", help="document ID")

    delete = rag_commands.add_parser("delete", help="delete one document")
    delete.add_argument("document_id", help="document ID")
    delete.add_argument("--yes", action="store_true", help="confirm deletion")
    return parser


def main(argv=None):
    """Run the CLI and return a process exit status."""
    args = _parser().parse_args(argv)
    pin = os.environ.get("API_PIN")
    if args.pin_file:
        try:
            with open(args.pin_file, "r", encoding="utf-8") as handle:
                pin = handle.readline().strip()
        except OSError as exc:
            print("ai-api-client: cannot read PIN file: %s" % exc, file=sys.stderr)
            return 2
        if not pin:
            print("ai-api-client: PIN file is empty", file=sys.stderr)
            return 2
    if args.timeout <= 0:
        print("ai-api-client: timeout must be greater than zero", file=sys.stderr)
        return 2
    client = APIClient(args.url, pin, args.timeout)
    try:
        if args.command == "health":
            result = client.health()
        elif args.command == "tools":
            result = client.tools()
        elif args.command == "rag":
            if args.rag_command == "status":
                result = client.rag_status()
            elif args.rag_command == "ingest":
                path = Path(args.file).expanduser()
                if path.is_symlink() or not path.is_file():
                    raise APIClientError("input must be a regular file, not a symlink")
                from rag.extract import MAX_DOCUMENT_BYTES
                try:
                    if path.stat().st_size > MAX_DOCUMENT_BYTES:
                        raise APIClientError("file exceeds the %d-byte ingestion limit" % MAX_DOCUMENT_BYTES)
                    content = path.read_bytes().decode("utf-8-sig")
                except UnicodeDecodeError:
                    raise APIClientError("input file must be valid UTF-8 text")
                except OSError as exc:
                    raise APIClientError("cannot read %s: %s" % (path, exc))
                result = client.rag_ingest(str(path.resolve()), content, title=args.title)
            elif args.rag_command == "list":
                if not 1 <= args.limit <= 100 or not 0 <= args.offset <= 100000:
                    raise APIClientError("list limit must be 1-100 and offset 0-100000")
                result = client.rag_documents(limit=args.limit, offset=args.offset)
            elif args.rag_command == "search":
                if (not 1 <= args.limit <= 50 or not 0 <= args.offset <= 100000
                        or not 40 <= args.snippet_chars <= 1000):
                    raise APIClientError("search limit must be 1-50, offset 0-100000 and snippet length 40-1000")
                if args.deduplicate and args.offset > 449:
                    raise APIClientError("deduplicated search offset must be 0-449")
                result = client.rag_search(
                    args.query, limit=args.limit, source=args.source, offset=args.offset,
                    deduplicate=args.deduplicate, snippet_chars=args.snippet_chars,
                    mode=args.mode, keyword_weight=args.keyword_weight,
                    semantic_weight=args.semantic_weight,
                )
            elif args.rag_command == "show":
                result = client.rag_get(args.document_id)
            elif args.rag_command == "delete":
                if not args.yes:
                    raise APIClientError("deletion requires --yes")
                result = client.rag_delete(args.document_id)
        else:
            try:
                arguments = json.loads(args.arguments)
            except ValueError as exc:
                raise APIClientError("invalid --arguments JSON: %s" % exc)
            if not isinstance(arguments, dict):
                raise APIClientError("--arguments must decode to a JSON object")
            result = client.call(args.name, arguments)
    except APIClientError as exc:
        print("ai-api-client: %s" % exc, file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
