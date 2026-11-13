"""Path routing and safe HTTP request-framing helpers."""

def url_path(path):
    """Return the URL path with any query string removed.

    Args:
        path (str): A request path, possibly including `?query`.

    Returns:
        str: The path only.
    """
    return path.split("?", 1)[0]


def is_health_path(path):
    """Return True if this path is the unauthenticated health endpoint.

    Matches `/health` and any path that ends with `/health` (for example
    `/ai/mcp/health` when Funnel forwards the public prefix).

    Args:
        path (str): The request path, possibly including a query string.

    Returns:
        bool: True if a health GET should be served.
    """
    cleaned = url_path(path).rstrip("/") or "/"
    return cleaned == "/health" or cleaned.endswith("/health")


def _content_length(headers):
    """Return a safe Content-Length, rejecting ambiguous HTTP body framing.

    Transfer-Encoding is unsupported by this server. Duplicate or malformed
    Content-Length fields are rejected to avoid parser disagreement.

    Args:
        headers: An email.message.Message-style HTTP headers collection.

    Returns:
        int: The declared body length, or zero when no length is supplied.

    Raises:
        ValueError: If body framing is ambiguous or invalid.
    """
    if headers.get_all("Transfer-Encoding", []):
        raise ValueError("Transfer-Encoding is not supported")
    values = headers.get_all("Content-Length", [])
    if len(values) > 1:
        raise ValueError("duplicate Content-Length")
    if not values:
        return 0
    value = values[0].strip()
    if not value or not value.isascii() or not value.isdigit():
        raise ValueError("invalid Content-Length")
    return int(value)
