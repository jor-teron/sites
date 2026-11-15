"""
ai-mcp — one-time approval for internet and sudo.

File:         mcp/approval.py
Purpose:      Chat-gated one-time grants. The AI must ask the user,
              then confirm with the code the user repeats.
Version:      5.5
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
"""
from __future__ import annotations

import os
import secrets
import time

from .config.constants import ALLOW_NET_FLAG, ALLOW_SUDO_FLAG

# kind -> flag path
_FLAGS = {
    "internet": ALLOW_NET_FLAG,
    "sudo": ALLOW_SUDO_FLAG,
}

# Pending requests: kind -> {code, reason, created}
_PENDING = {}

# How long a pending confirmation code stays valid (seconds). 30 minutes.
APPROVAL_TTL = 1800

# How long a confirmed grant lasts (seconds).
# internet = 60 minutes, sudo = 30 minutes.
GRANT_TTL = {
    "internet": 3600,
    "sudo": 1800,
}


def request_approval(kind, reason):
    """Start an approval ask.

    Args:
        kind (str): "internet" or "sudo".
        reason (str): Why the AI needs it (shown to the user).

    Returns:
        dict: kind, code, message. The AI must show this to the user.

    Raises:
        ValueError: On an unknown kind.
    """
    if kind not in _FLAGS:
        raise ValueError("kind must be internet or sudo")
    code = secrets.token_hex(3).upper()
    _PENDING[kind] = {
        "code": code,
        "reason": (reason or "").strip()[:200],
        "created": time.time(),
    }
    phrase = "ALLOW INTERNET" if kind == "internet" else "ALLOW SUDO"
    return {
        "kind": kind,
        "code": code,
        "message": (
            "Ask the user in chat: %s %s\n"
            "Reason: %s\n"
            "Wait for the user to reply with that exact code, then call confirm_approval."
            % (phrase, code, _PENDING[kind]["reason"] or "(none)")
        ),
    }


def confirm_approval(kind, code):
    """Confirm a pending ask and write the one-time flag.

    Args:
        kind (str): "internet" or "sudo".
        code (str): The code the user repeated.

    Returns:
        dict: ok, kind, message.

    Raises:
        ValueError: If there is no pending ask, it expired, or the code is wrong.
    """
    if kind not in _FLAGS:
        raise ValueError("kind must be internet or sudo")
    pending = _PENDING.get(kind)
    if not pending:
        raise ValueError("no pending %s approval" % kind)
    if time.time() - pending["created"] > APPROVAL_TTL:
        _PENDING.pop(kind, None)
        raise ValueError("approval expired; request again")
    if (code or "").strip().upper() != pending["code"]:
        raise ValueError("code does not match")
    path = _FLAGS[kind]
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent, exist_ok=True)
    expires = int(time.time()) + GRANT_TTL.get(kind, 1800)
    with open(path, "w", encoding="utf-8") as fh:
        # First line is the expiry timestamp (unix seconds).
        fh.write("%d\n" % expires)
    _PENDING.pop(kind, None)
    minutes = GRANT_TTL.get(kind, 1800) // 60
    return {
        "ok": True,
        "kind": kind,
        "expires": expires,
        "message": "Approved. %s is allowed for %d minutes." % (kind, minutes),
    }


def grant_active(kind):
    """Return True if a confirmed grant for kind is still within its window.

    Args:
        kind (str): "internet" or "sudo".

    Returns:
        bool: True when the flag file exists and has not expired.
    """
    path = _FLAGS.get(kind)
    if not path or not os.path.exists(path):
        return False
    try:
        with open(path, "r", encoding="utf-8") as fh:
            line = (fh.readline() or "").strip()
        expires = int(line)
    except Exception:
        return False
    if time.time() > expires:
        try:
            os.unlink(path)
        except OSError:
            pass
        return False
    return True


def tool_request_approval(args, cfg):
    """MCP tool: start an allow-internet or allow-sudo ask."""
    return request_approval(
        (args.get("kind") or "").strip().lower(),
        args.get("reason") or "",
    )


def tool_confirm_approval(args, cfg):
    """MCP tool: confirm with the code the user repeated."""
    return confirm_approval(
        (args.get("kind") or "").strip().lower(),
        args.get("code") or "",
    )
