"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/config/client_text.py
Purpose:      Client-facing instruction and tool description templates.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
"""
from __future__ import annotations

from .constants import *
# -----------------------------------------------------------------------------
# These templates are filled at startup by client_instructions() and
# client_tool_defs() from the live Config, so a connecting AI sees the
# actual isolation mode, network setting and numeric limits. The wording
# is from the AI's point of view: no host environment-variable names,
# no implementation names such as bwrap, and no claims that do not match
# the running server.

# Shared layout facts that do not depend on isolation mode. "{reserved}"
# is replaced with the persistent jail mount-point names.
CLIENT_LAYOUT = (
    "'/' is the sandbox. Work and projects go in /workspace, which is a "
    "git repository (initialised on first start). There is no automatic "
    "commit; commit yourself when you want a snapshot. Relative paths "
    "resolve against /workspace; absolute paths are sandbox paths "
    "starting at '/'. Nothing outside the sandbox is reachable. "
    "/usr, /bin, /lib, /lib64 and /sbin are read-only system files. "
    "/etc, /tmp, /run and /dev are temporary and reset each command; "
    "do not store files there. Do not store files at the sandbox root "
    "under reserved names ({reserved}); use /workspace instead."
)

# initialize() instructions body. "{layout}", "{command_mode}" and
# "{limits}" are filled from the other templates below.
CLIENT_INSTRUCTIONS_TEMPLATE = (
    "This server gives you a shell and file tools inside a sandbox. "
    "{layout} {command_mode} {limits}"
)

# Isolation / network sentences. Only one command-mode template is used.
CLIENT_PHRASE_NO_NETWORK = "There is no network."
CLIENT_PHRASE_NETWORK_ON = "Commands have network access."
CLIENT_COMMAND_MODE_NS_NO_NET = (
    "run_command runs bash -lc as a non-root user, starting in "
    "/workspace, in an isolated jail. " + CLIENT_PHRASE_NO_NETWORK
)
CLIENT_COMMAND_MODE_NS_NET = (
    "run_command runs bash -lc as a non-root user, starting in "
    "/workspace, in an isolated jail. " + CLIENT_PHRASE_NETWORK_ON
)
CLIENT_PHRASE_NOT_ISOLATED = (
    "Commands are NOT isolated: they run as the server user on the host, "
    "in the sandbox folder, and a shell command can leave that folder."
)
CLIENT_COMMAND_MODE_NONE = (
    CLIENT_PHRASE_NOT_ISOLATED + " File tools still cannot leave the "
    "sandbox. Commands use the host network."
)

# Limit sentences. The jail template is used when isolation is on; the
# "none" template is used when commands run unsandboxed on the host
# (timeout and output cap still apply; memory, process and file-size
# rlimits do not).
CLIENT_LIMITS_JAIL_TEMPLATE = (
    "Each command is limited to {timeout} seconds by default "
    "(maximum {max_timeout} seconds), {memory_mb} MiB of memory, "
    "{max_procs} processes, a {fsize} file-size cap, and {output} of "
    "captured output."
)
CLIENT_LIMITS_NONE_TEMPLATE = (
    "Each command is limited to {timeout} seconds by default "
    "(maximum {max_timeout} seconds) and {output} of captured output. "
    "Host memory, process and file-size limits are not applied."
)

# run_command tool description templates (one per isolation/network mode).
CLIENT_RUN_COMMAND_NS_NO_NET = (
    "Run a bash command (bash -lc) as a non-root user, starting in "
    "/workspace, in an isolated jail where '/' is the sandbox. "
    + CLIENT_PHRASE_NO_NETWORK +
    " Nothing outside the sandbox is reachable. Default timeout is "
    "{timeout} seconds (maximum {max_timeout}). Limits: {memory_mb} MiB "
    "memory, {max_procs} processes, {fsize} file size, {output} captured "
    "output."
)
CLIENT_RUN_COMMAND_NS_NET = (
    "Run a bash command (bash -lc) as a non-root user, starting in "
    "/workspace, in an isolated jail where '/' is the sandbox. "
    + CLIENT_PHRASE_NETWORK_ON +
    " Nothing outside the sandbox is reachable. Default timeout is "
    "{timeout} seconds (maximum {max_timeout}). Limits: {memory_mb} MiB "
    "memory, {max_procs} processes, {fsize} file size, {output} captured "
    "output."
)
CLIENT_RUN_COMMAND_NONE = (
    "Run a bash command (bash -lc) starting in /workspace. "
    + CLIENT_PHRASE_NOT_ISOLATED +
    " File tools still cannot leave the sandbox. Commands use the host "
    "network. Default timeout is {timeout} seconds (maximum "
    "{max_timeout}). Captured output is capped at {output}."
)

# Property and other-tool description templates. Path wording is shared.
CLIENT_PATH_RESOLVE = (
    "Relative paths resolve against /workspace; absolute paths are "
    "sandbox paths starting at '/'."
)
CLIENT_PATH_STAY = (
    CLIENT_PATH_RESOLVE + " Nothing outside the sandbox is reachable."
)
CLIENT_PROP_COMMAND = "The bash command to run (passed to bash -lc)."
CLIENT_PROP_CWD = (
    "Working directory. " + CLIENT_PATH_RESOLVE +
    " Defaults to /workspace."
)
CLIENT_PROP_TIMEOUT = (
    "Timeout in seconds (default {timeout}, maximum {max_timeout})."
)
CLIENT_READ_FILE = (
    "Read a UTF-8 text file (invalid bytes are replaced). "
    + CLIENT_PATH_STAY +
    " Capped at {max_read} (default and maximum)."
)
CLIENT_PROP_READ_PATH = "File to read. " + CLIENT_PATH_STAY
CLIENT_PROP_OFFSET = "0-based start line. When set, the read is line-based."
CLIENT_PROP_LIMIT = "Maximum number of lines to return, used with offset."
CLIENT_PROP_MAX_BYTES = (
    "Byte cap when not using line offsets (default and maximum {max_read})."
)
CLIENT_WRITE_FILE = (
    "Write a UTF-8 text file atomically (temporary file + rename). "
    + CLIENT_PATH_STAY +
    " Prefer /workspace for projects; do not store files at the sandbox "
    "root under reserved names ({reserved}), or in /etc, /tmp, /run or "
    "/dev (those are temporary and reset each command)."
)
CLIENT_PROP_WRITE_PATH = "File to write. " + CLIENT_PATH_STAY
CLIENT_PROP_CONTENT = "UTF-8 text to write."
CLIENT_PROP_CREATE_PARENTS = "If true, create missing parent directories."
CLIENT_EDIT_FILE = (
    "Replace old_string with new_string in a UTF-8 text file. Errors if "
    "the string is not found or is ambiguous (more than one match and "
    "replace_all is false). " + CLIENT_PATH_STAY
)
CLIENT_PROP_EDIT_PATH = "File to edit. " + CLIENT_PATH_STAY
CLIENT_PROP_OLD_STRING = "Exact text to find in the file."
CLIENT_PROP_NEW_STRING = "Replacement text."
CLIENT_PROP_REPLACE_ALL = (
    "If true, replace every occurrence. If false (the default), exactly "
    "one match is required."
)
CLIENT_LIST_DIR = (
    "List a directory. Does not follow directory symlinks when recursing. "
    + CLIENT_PATH_STAY +
    " Recursion is capped at {max_walk_depth} levels and "
    "{max_list_entries} entries."
)
CLIENT_PROP_LIST_PATH = "Directory to list. " + CLIENT_PATH_STAY
CLIENT_PROP_RECURSIVE = "If true, list subdirectories up to max_depth."
CLIENT_PROP_MAX_DEPTH = "Directory depth cap (maximum {max_walk_depth})."
CLIENT_DELETE_PATH = (
    "Delete a file, symlink, or directory inside the sandbox "
    "(directories need recursive=true). " + CLIENT_PATH_STAY +
    " Refuses to delete the sandbox root itself."
)
CLIENT_PROP_DELETE_PATH = "Path to delete. " + CLIENT_PATH_STAY
CLIENT_PROP_DELETE_RECURSIVE = (
    "Required to be true when deleting a directory."
)
CLIENT_MOVE_PATH = (
    "Rename or move a path inside the sandbox. " + CLIENT_PATH_STAY +
    " Both source and destination must stay inside the sandbox."
)
CLIENT_PROP_SRC = "Path to rename or move. " + CLIENT_PATH_STAY
CLIENT_PROP_DEST = "Destination path. " + CLIENT_PATH_STAY


# Re-export operational constants for compatibility with existing imports.
from .limits import *  # noqa: F401,F403
