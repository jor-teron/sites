"""Public MCP tool interface and registry.

Implementation is split by responsibility under :mod:`mcp.tool_modules`.
This module re-exports the historical names so protocol and external callers
remain compatible.
"""
from __future__ import annotations

# Keep these module attributes available for compatibility with existing
# callers and tests that patch the underlying implementation modules.
from . import safepath, sandbox
from .config import client_tool_defs
from .tool_modules.common import (
    check_workspace_space,
    is_within,
    resolve_cwd,
    resolve_user_path,
    summarize_args,
)
from .tool_modules.command import tool_run_command
from .tool_modules.files import (
    tool_delete_path,
    tool_edit_file,
    tool_list_dir,
    tool_move_path,
    tool_read_file,
    tool_write_file,
)
from .approval import tool_request_approval, tool_confirm_approval
from .tool_modules.binary import (
    tool_upload_file,
    tool_upload_file_from_url,
    tool_download_file,
    tool_get_file_info,
    tool_upload_chunk,
    tool_download_chunk,
    tool_upload_status,
)

# Registry remains in this public module: protocol.py and existing tests
# continue importing the same names and callable mapping.
tool_handlers = {
    "run_command": tool_run_command,
    "read_file": tool_read_file,
    "write_file": tool_write_file,
    "edit_file": tool_edit_file,
    "list_dir": tool_list_dir,
    "delete_path": tool_delete_path,
    "move_path": tool_move_path,
    "upload_file": tool_upload_file,
    "upload_file_from_url": tool_upload_file_from_url,
    "download_file": tool_download_file,
    "get_file_info": tool_get_file_info,
    "upload_chunk": tool_upload_chunk,
    "download_chunk": tool_download_chunk,
    "upload_status": tool_upload_status,
    "request_approval": tool_request_approval,
    "confirm_approval": tool_confirm_approval,
}

# Runtime tool schemas are generated from the shared configuration.
tool_defs = client_tool_defs(None)
