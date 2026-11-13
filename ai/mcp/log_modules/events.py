"""JSON-lines event logging for tool calls and authentication failures."""
from __future__ import annotations
import json
import os
import sys
import time
from ..config import AUDIT_TIME_FORMAT

def now():
    """Return the current local time as an audit-log timestamp.

    Returns:
        str: A timestamp in AUDIT_TIME_FORMAT (ISO-like, with a numeric
        UTC offset).
    """
    return time.strftime(AUDIT_TIME_FORMAT)

def audit(cfg, ip, tool, args_summary, extra):
    """Append one JSON object to cfg.log_file.

    A write failure is reported on stderr and otherwise ignored, so a
    full or unwritable log can never fail a tool call.

    Args:
        cfg (Config): Must expose log_file.
        ip (str): Client address.
        tool (str | None): Tool name, or None for an auth event.
        args_summary (dict): Redacted argument summary (see summarize_args).
        extra (dict | None): Additional fields merged into the record
            (ok, error, event, and so on).

    Returns:
        None.
    """
    rec = {"ts": now(), "ip": ip, "tool": tool, "args": args_summary}
    rec.update(extra or {})
    try:
        parent = os.path.dirname(cfg.log_file)
        if parent and not os.path.isdir(parent):
            os.makedirs(parent)
        with open(cfg.log_file, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except OSError as exc:
        sys.stderr.write("audit log write failed: %s\n" % exc)
