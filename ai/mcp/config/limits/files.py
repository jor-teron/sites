"""Domain-specific operational constants for the MCP server."""
from __future__ import annotations

from ..constants import *  # noqa: F401,F403

MAX_READ = 1 * 1024 * 1024

# Maximum entries list_dir will return before setting truncated=True.
MAX_LIST_ENTRIES = 2000

# Hard cap on list_dir recursion depth, regardless of the caller's max_depth.
MAX_WALK_DEPTH = 8

# Default list_dir max_depth when recursive is true (start dir + one level).
DEFAULT_LIST_DEPTH_RECURSIVE = 2

# Default list_dir max_depth when recursive is false (the start directory only).
DEFAULT_LIST_DEPTH = 1

# Characters of content / old_string / new_string kept in an audit summary.
SUMMARIZE_TEXT_LEN = 80

# Characters of a run_command command string kept in an audit summary.
SUMMARIZE_COMMAND_LEN = 200

# Prefix of the temporary file used by atomic writes (temp file + rename).
WRITE_TMP_PREFIX = ".mcp-"

# Suffix of the temporary file used by atomic writes.
WRITE_TMP_SUFFIX = ".tmp"


# =============================================================================
