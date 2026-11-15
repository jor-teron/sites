"""Domain-specific operational constants for the MCP server."""
from __future__ import annotations

from ..constants import *  # noqa: F401,F403
from .command import (BYTES_PER_KIB, BYTES_PER_MIB, BYTES_PER_GIB, BYTES_PER_TIB)

# Git (workspace repo)
# =============================================================================

# Basename of the git metadata directory used to detect an existing repo.
GIT_DIR_NAME = ".git"

# git argv used to initialise a new repo in sandbox/workspace (no extra flags).
GIT_INIT_ARGV = ("git", "init")

# Seconds to wait for `git init` on the host at server start.
GIT_INIT_TIMEOUT = 15

# Default author/committer name used inside the jail so `git commit` works
# without a user-provided identity. No auto-commit is performed.
GIT_DEFAULT_NAME = "mcp"

# Default author/committer email paired with GIT_DEFAULT_NAME.
GIT_DEFAULT_EMAIL = "mcp@mcp"

# safe.directory value written to the jail's /etc/gitconfig. "*" covers
# /workspace even if git still reports dubious ownership after the uid map.
GIT_SAFE_DIRECTORY = "*"

# Filename of the system gitconfig written onto the jail's private /etc tmpfs.
GIT_CONFIG_BASENAME = "gitconfig"

# Log line when git is not installed (written to stderr; %s is the workspace).
GIT_INIT_SKIP_LOG = "ai-mcp: git not installed; skipped git init in %s\n"

# Log line when git init successfully creates a new repo (%s is the workspace).
GIT_INIT_DONE_LOG = "ai-mcp: git init in %s\n"

# Log line when git init runs but fails (%s is the workspace, %s is the error).
GIT_INIT_FAIL_LOG = "ai-mcp: git init failed in %s: %s\n"

# =============================================================================
# Workspace disk limit (v2.4)
# =============================================================================
# /workspace can live on a fixed-size loop image (workspace.img) so the AI
# cannot fill the host disk. install.sh creates and mounts the image.
# The Python server only detects whether the mount is active, warns if it
# is not, and refuses write_file/edit_file that would go below a reserve.

# Default size of the /workspace disk image, as a human string (1024-based).
# install.sh and mcp.conf use the same value. Parsed by parse_size().
DEFAULT_WORKSPACE_SIZE = "2G"

# Default free-space reserve, in bytes (16 MiB). write_file and edit_file
# refuse a write that would leave less than this free on the workspace
# filesystem (including space needed for the temporary file).
DEFAULT_WORKSPACE_RESERVE = 16 * 1024 * 1024

# Suffix letters accepted by parse_size(), mapped to a byte multiplier.
# K/M/G/T are 1024-based; a trailing i or iB/B is ignored ("2GiB" == "2G").
SIZE_SUFFIX_BYTES = {
    "": 1,
    "K": BYTES_PER_KIB,
    "M": BYTES_PER_MIB,
    "G": BYTES_PER_GIB,
    "T": BYTES_PER_TIB,
}

# Log / banner phrase when sandbox/workspace is not a separate mount.
WORKSPACE_LIMIT_OFF_LABEL = "off"

# Prefix of the "limit is on" status label, before the used/total figures.
WORKSPACE_LIMIT_ON_PREFIX = "on, "

# Status template when the limit is on. {used} and {total} are short sizes.
WORKSPACE_LIMIT_ON_TEMPLATE = "on, {used} used of {total}"

# Startup log line when the workspace is not a separate mount (%s is the path).
WORKSPACE_LIMIT_OFF_LOG = (
    "ai-mcp: workspace size limit is off (%s is not a separate mount). "
    "Run install.sh to create and mount the 2G workspace image, or the "
    "server will keep running without a disk cap.\n"
)

# write_file/edit_file error when a write would leave too little free space.
# {need} is bytes required (new content + reserve), {free} is available,
# {reserve} is the configured reserve; all are already formatted sizes.
WORKSPACE_SPACE_ERROR = (
    "not enough free space in /workspace (need %s, have %s, reserve %s)"
)

# Client-facing sentence, appended only when the workspace size limit is
# actually active (the folder is a separate mount).
CLIENT_WORKSPACE_LIMIT = (
    "/workspace is limited to {workspace_size}; write_file and edit_file "
    "refuse a write that would leave less than {workspace_reserve} free."
)


# =============================================================================
