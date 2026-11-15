"""Domain-specific operational constants for the MCP server."""
from __future__ import annotations

from ..constants import *  # noqa: F401,F403

# Command audit log (v2.5)
# =============================================================================
# A human-readable, one-line-per-call log written next to the JSON event
# log. It records run_command (and, optionally, file-tool) calls with
# timestamp, client IP, tool name, cwd, duration, exit code, timed_out
# and a truncated command or path. It never records the PIN, auth headers
# or file contents. mcp.sh --logs audit (or --audit) shows this file.

# Default for MCP_AUDIT. "1" appends lines to the audit log.
DEFAULT_AUDIT_ENABLED = "1"

# Default for MCP_AUDIT_FILES. "1" also logs file-tool calls (paths only,
# never file contents). "0" logs run_command only.
DEFAULT_AUDIT_FILES = "1"

# Default maximum size of the audit log, in bytes (5 MiB), before rotation.
DEFAULT_AUDIT_MAX = 5 * 1024 * 1024

# Number of rotated backups to keep (mcp-audit.log.1 .. .N).
DEFAULT_AUDIT_KEEP = 3

# Maximum characters of a command (or path summary) stored on one audit line.
DEFAULT_AUDIT_COMMAND_LEN = 500

# Mode of the audit log file (owner read/write only).
AUDIT_FILE_MODE = 0o600

# Template of one audit line. Fields are already escaped / formatted.
AUDIT_LINE_TEMPLATE = (
    "{ts} ip={ip} tool={tool} cwd={cwd} duration={duration} "
    "exit={exit_code} timed_out={timed_out} command={command}"
)

# Ellipsis appended when a command string is truncated to the max length.
AUDIT_TRUNC_MARK = "..."


# =============================================================================
# PIN strength (self-test and install.sh only)
# =============================================================================
# The running server still accepts any non-empty PIN; these rules are
# used by mcp.sh --selftest and by install.sh when writing a new mcp.conf.
# Stronger start-up refusal of weak PINs is parked (not in this release).

# Shortest PIN that is not reported as weak (characters, not bytes).
MIN_PIN_LEN = 12

# Shortest all-digit PIN that is not reported as weak. Shorter numeric
# PINs are easy to guess.
MIN_DIGIT_PIN_LEN = 16

# Demo / obviously weak PIN (compared case-insensitively). Same value as
# DEFAULT_PIN, named separately so a later default change stays explicit.
WEAK_PIN = DEFAULT_PIN


# =============================================================================
