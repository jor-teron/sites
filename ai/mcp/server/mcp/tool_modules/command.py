"""Command execution tool implementation."""
from __future__ import annotations

from .. import sandbox
from ..config import DEFAULT_TIMEOUT, MAX_TIMEOUT
from .common import resolve_cwd


def tool_run_command(args, cfg):
    """Run a bash command, confined by the configured sandbox mode.

    Args:
        args (dict): Must contain "command". Optional "cwd" and "timeout"
            (seconds, capped at MAX_TIMEOUT).
        cfg (Config): Runtime configuration passed to sandbox.run_command.

    Returns:
        dict: exit_code, stdout, stderr, timed_out, truncated, duration_sec.

    Raises:
        ValueError: If command is missing or timeout is not a positive number.
    """
    command = args.get("command")
    if not command or not isinstance(command, str):
        raise ValueError("command is required")
    cwd = resolve_cwd(args.get("cwd"), cfg)
    try:
        timeout = float(args.get("timeout", DEFAULT_TIMEOUT))
    except (TypeError, ValueError):
        raise ValueError("timeout must be a number")
    if timeout <= 0:
        raise ValueError("timeout must be positive")
    timeout = min(timeout, MAX_TIMEOUT)
    return sandbox.run_command(command, cwd, timeout, cfg)
