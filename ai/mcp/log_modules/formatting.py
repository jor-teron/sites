"""Safe formatting helpers for human-readable command audit records."""
from __future__ import annotations
from ..config import (
    AUDIT_LINE_TEMPLATE, AUDIT_TRUNC_MARK, DEFAULT_AUDIT_COMMAND_LEN,
    DURATION_DECIMALS,
)
from .events import now

def escape_audit_text(text, max_len):
    """Escape newlines and truncate text for one audit-log field.

    Backslashes are doubled first, then CR / LF / TAB become \\r, \\n
    and \\t, so the line stays a single physical line. The result is
    cut to max_len characters and AUDIT_TRUNC_MARK is added when it
    was longer. Never pass a PIN, an auth header, or file contents.

    Args:
        text: A string (or any value converted with str). None becomes "".
        max_len (int): Maximum characters of the escaped result (before
            the truncation mark). Values below 1 are treated as 1.

    Returns:
        str: A single-line, length-limited field.
    """
    if text is None:
        text = ""
    elif not isinstance(text, str):
        text = str(text)
    # cap is the maximum kept length; at least one character so a
    # misconfigured 0 does not produce an empty unreadable field.
    cap = max(1, int(max_len))
    text = (
        text.replace("\\", "\\\\")
        .replace("\r", "\\r")
        .replace("\n", "\\n")
        .replace("\t", "\\t")
    )
    if len(text) > cap:
        return text[:cap] + AUDIT_TRUNC_MARK
    return text

def format_audit_line(ts, ip, tool, cwd, duration, exit_code, timed_out, command, max_len=None):
    """Build one human-readable audit line (no trailing newline).

    Args:
        ts (str): Timestamp already formatted with now() / AUDIT_TIME_FORMAT.
        ip (str): Client address (or "-" if unknown).
        tool (str): Tool name (for example run_command).
        cwd (str | None): Working directory as the AI sees it, or "-".
        duration: Seconds as a number, or None when unknown.
        exit_code: Integer exit status, or None when unknown.
        timed_out: Truthy when the command hit its timeout.
        command (str | None): Command text or a path summary; escaped
            and truncated. Never a PIN or file contents.
        max_len (int | None): Command field cap; defaults to
            DEFAULT_AUDIT_COMMAND_LEN.

    Returns:
        str: One audit line, filled from AUDIT_LINE_TEMPLATE.
    """
    if max_len is None:
        max_len = DEFAULT_AUDIT_COMMAND_LEN
    # duration_text is a fixed-decimal second count, or "-" if missing.
    if duration is None:
        duration_text = "-"
    else:
        duration_text = "%.*f" % (DURATION_DECIMALS, float(duration))
    # exit_text is the numeric status, or "-" if the tool had no status.
    if exit_code is None:
        exit_text = "-"
    else:
        exit_text = str(int(exit_code))
    # timed_text is 1 or 0 so the field stays easy to grep.
    timed_text = "1" if timed_out else "0"
    return AUDIT_LINE_TEMPLATE.format(
        ts=ts or now(),
        ip=ip or "-",
        tool=tool or "-",
        cwd=escape_audit_text(cwd or "-", max_len),
        duration=duration_text,
        exit_code=exit_text,
        timed_out=timed_text,
        command=escape_audit_text(command, max_len),
    )
