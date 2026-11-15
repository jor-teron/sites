"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/auth.py
Purpose:      PIN authentication (Bearer, Basic, X-MCP-PIN, URL path) and
              the per-IP failed-attempt lockout.
Place:        mcp/auth.py — used by http.py on every request except /health.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+ standard library only (base64, hmac, threading, time).
"""
from __future__ import annotations

import base64
from collections import OrderedDict
import hmac
import threading
import time
import urllib.parse

from .config import (
    AUTH_BASIC_PREFIX,
    AUTH_BEARER_PREFIX,
    AUTH_FAIL_THRESHOLD,
    AUTH_LOCKOUT_BASE,
    AUTH_MAX_DELAY,
    AUTH_MAX_TRACKED_IPS,
    AUTH_PIN_HEADERS,
    PIN_REDACT_MARK,
    WWW_AUTHENTICATE,
)


def pins_match(provided, expected):
    """Return True if the provided PIN equals the expected PIN.

    Comparison is constant-time (hmac.compare_digest) so a remote client
    cannot time individual characters. None or a length mismatch is False.

    Args:
        provided (str | None): PIN taken from a header or URL path.
        expected (str | None): Configured PIN.

    Returns:
        bool: True only when both values are strings of equal length and
        identical contents. Encoding errors are treated as a mismatch.
    """
    if provided is None or expected is None:
        return False
    try:
        return hmac.compare_digest(
            provided.encode("utf-8"), expected.encode("utf-8")
        )
    except Exception:
        return False


def extract_provided_pin(headers):
    """Return the PIN carried in request headers, or None if none is present.

    Lookup order: Authorization Bearer, Authorization Basic (the password
    field; any username is accepted), then X-MCP-PIN / X-MCP-Pin /
    X-MCP-Password.

    Args:
        headers: A mapping of HTTP header names to values (case as provided
            by http.server, typically title-case).

    Returns:
        str | None: The stripped PIN, or None if no recognised header is
        present or a Basic value cannot be decoded.
    """
    header = (headers.get("Authorization", "") or "").strip()
    low = header.lower()
    if low.startswith(AUTH_BEARER_PREFIX):
        return header[len(AUTH_BEARER_PREFIX):].strip()
    if low.startswith(AUTH_BASIC_PREFIX):
        try:
            raw = base64.b64decode(
                header[len(AUTH_BASIC_PREFIX):].strip(), validate=False
            ).decode("utf-8")
        except Exception:
            return None
        if ":" not in raw:
            return None
        return raw.split(":", 1)[1]
    for name in AUTH_PIN_HEADERS:
        extra = headers.get(name)
        if extra is not None:
            return extra.strip()
    return None


def path_has_pin(path, expected):
    """Return True if any URL path segment equals the expected PIN.

    This is the Grok-style `/ai/mcp/<PIN>` form. Segments are URL-decoded
    before the constant-time compare, so a PIN with `@` can be written
    as `p%40ss`. Query strings and fragments are ignored.

    Args:
        path (str | None): The request path, possibly including `?` or `#`.
        expected (str | None): Configured PIN. An empty or missing PIN
            never matches.

    Returns:
        bool: True if at least one path segment equals the PIN.
    """
    if not expected:
        return False
    raw = (path or "").split("?", 1)[0].split("#", 1)[0]
    exp = expected.encode("utf-8")
    ok = False
    for seg in raw.split("/"):
        if not seg:
            continue
        try:
            seg = urllib.parse.unquote(seg)
        except Exception:
            pass
        if hmac.compare_digest(seg.encode("utf-8"), exp):
            ok = True
    return ok


def redact_path(path, expected):
    """Return a copy of path with any PIN segment replaced by PIN_REDACT_MARK.

    Used in server access logs and auth-failure audit records so the PIN
    is not written to disk.

    Args:
        path (str | None): The request path.
        expected (str | None): Configured PIN to look for.

    Returns:
        str | None: The redacted path, or the original value if either
        argument is missing.
    """
    if not expected or not path:
        return path
    parts = path.split("/")
    out = []
    for seg in parts:
        try:
            dec = urllib.parse.unquote(seg)
        except Exception:
            dec = seg
        if seg and hmac.compare_digest(dec.encode("utf-8"), expected.encode("utf-8")):
            out.append(PIN_REDACT_MARK)
        else:
            out.append(seg)
    return "/".join(out)


def www_authenticate_headers():
    """Return the WWW-Authenticate headers to send with HTTP 401.

    Returns:
        list[tuple[str, str]]: A single Bearer challenge. No OAuth
        resource_metadata parameter is included (v2 dropped OAuth).
    """
    return [("WWW-Authenticate", WWW_AUTHENTICATE)]


class RateLimiter(object):
    """Lock out a client IP after repeated failed PIN attempts.

    The first (fail_threshold - 1) failures are recorded but not delayed.
    From the fail_threshold-th failure onwards the IP is blocked for
    min(max_delay, AUTH_LOCKOUT_BASE ** (count - fail_threshold)) seconds.
    A successful authentication clears the record for that IP.

    Args to the constructor set the threshold and ceiling; defaults come
    from config.py.
    """

    def __init__(
        self,
        fail_threshold=AUTH_FAIL_THRESHOLD,
        max_delay=AUTH_MAX_DELAY,
        max_entries=AUTH_MAX_TRACKED_IPS,
    ):
        """Create an empty limiter.

        Args:
            fail_threshold (int): Failure count that starts a lockout.
            max_delay (int): Maximum lockout length, in seconds.
            max_entries (int): Maximum distinct IP records retained in memory.
        """
        # Guards _fails; every public method takes this lock.
        self._lock = threading.Lock()
        # Oldest record is evicted first when the bounded table is full.
        # ip -> (fail_count, last_fail_time, locked_until)
        self._fails = OrderedDict()
        self.fail_threshold = fail_threshold
        self.max_delay = max_delay
        self.max_entries = max(1, int(max_entries))

    def check(self, ip):
        """Return whether this IP is currently allowed to attempt auth.

        Args:
            ip (str): Client address (possibly from X-Forwarded-For).

        Returns:
            tuple[bool, float]: (allowed, seconds_remaining). seconds_remaining
            is 0.0 when the IP is allowed.
        """
        now = time.monotonic()
        with self._lock:
            rec = self._fails.get(ip)
            if rec:
                self._fails.move_to_end(ip)
                if rec[2] > now:
                    return False, rec[2] - now
            return True, 0.0

    def fail(self, ip):
        """Record a failed attempt and start a lockout when the threshold is met.

        Args:
            ip (str): Client address.

        Returns:
            tuple[int, int]: (new_fail_count, delay_seconds). delay_seconds
            is 0 when the IP is not yet locked out.
        """
        now = time.monotonic()
        with self._lock:
            previous = self._fails.get(ip)
            if previous is None and len(self._fails) >= self.max_entries:
                self._fails.popitem(last=False)
            count = (previous[0] if previous else 0) + 1
            delay = 0
            if count >= self.fail_threshold:
                delay = min(self.max_delay, AUTH_LOCKOUT_BASE ** (count - self.fail_threshold))
            self._fails[ip] = (count, now, now + delay if delay else 0.0)
            self._fails.move_to_end(ip)
            return count, delay

    def success(self, ip):
        """Clear any failure record for this IP after a correct PIN.

        Args:
            ip (str): Client address.

        Returns:
            None.
        """
        with self._lock:
            self._fails.pop(ip, None)

    def failures(self, ip):
        """Return the recorded failure count for an IP, or 0 if none.

        Args:
            ip (str): Client address.

        Returns:
            int: Number of consecutive failures since the last success.
        """
        with self._lock:
            rec = self._fails.get(ip)
            return rec[0] if rec else 0
