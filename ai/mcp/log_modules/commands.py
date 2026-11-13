"""Tool-call command audit record construction and policy."""
from __future__ import annotations
from ..config import DEFAULT_AUDIT_COMMAND_LEN
from .events import now
from .formatting import format_audit_line
from .storage import append_audit_line

def _command_field(tool, arguments, raw):
    """Return the command= field for an audit line (never file contents).

    For run_command this is the command string. For file tools it is a
    short path summary (path=, or src= and dest=). Content, old_string
    and new_string are never included.

    Args:
        tool (str): Tool name.
        arguments (dict | None): Raw tool arguments.
        raw: Tool result (unused; accepted so callers can pass it).

    Returns:
        str: Text to store in the command field (unescaped).
    """
    args = arguments or {}
    if tool == "run_command":
        return args.get("command") or ""
    if tool == "move_path":
        src = args.get("src") or args.get("path") or ""
        dest = args.get("dest") or ""
        return "src=%s dest=%s" % (src, dest)
    path = args.get("path") or ""
    if path:
        return "path=%s" % path
    return ""

def tool_audit(cfg, ip, tool, arguments, raw, duration, error=None):
    """Append one human-readable audit line for a tools/call, if enabled.

    run_command is always logged when the audit log is on. File-tool
    calls are logged only when cfg.audit_files is true. The PIN, auth
    headers and file contents are never written.

    Args:
        cfg: Runtime Config. Missing or disabled audit_enabled is a no-op.
        ip (str): Client address.
        tool (str): Tool name.
        arguments (dict | None): Raw tool arguments (command / paths only
            are read).
        raw (dict | None): Tool result, used for exit_code and timed_out
            when this was run_command.
        duration (float | None): Wall time of the call, in seconds.
        error: An exception if the call failed before returning a result,
            otherwise None. Failed calls are logged with exit 1.

    Returns:
        None.
    """
    if cfg is None or not getattr(cfg, "audit_enabled", True):
        return
    if tool != "run_command" and not getattr(cfg, "audit_files", True):
        return
    # cwd_value is the path the AI asked for, or /workspace when omitted.
    args = arguments or {}
    cwd_value = args.get("cwd") or "/workspace"
    exit_code = None
    timed_out = False
    if isinstance(raw, dict):
        if "exit_code" in raw:
            exit_code = raw.get("exit_code")
        if raw.get("timed_out"):
            timed_out = True
        if duration is None and "duration_sec" in raw:
            duration = raw.get("duration_sec")
    if error is not None and exit_code is None:
        exit_code = 1
    elif exit_code is None:
        exit_code = 0
    # max_len is the configured command-field cap.
    max_len = getattr(cfg, "audit_command_len", DEFAULT_AUDIT_COMMAND_LEN)
    line = format_audit_line(
        now(),
        ip,
        tool,
        cwd_value,
        duration,
        exit_code,
        timed_out,
        _command_field(tool, arguments, raw),
        max_len=max_len,
    )
    append_audit_line(cfg, line)
