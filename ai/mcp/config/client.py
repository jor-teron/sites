"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/config/client.py
Purpose:      Client settings, instructions, and tool definitions.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
"""
from __future__ import annotations

import os
from .constants import *
from .client_text import *

from .helpers import *
from .helpers import _truthy
def client_settings(cfg=None):
    """Resolve isolation, network and numeric limits for client text.

    Values come from the runtime Config when one is given, otherwise from
    the defaults in this file. Memory and process counts are floored the
    same way the jail applies them. The advertised default timeout is
    capped at MAX_TIMEOUT. Network is reported as on when isolation is
    off, because unsandboxed commands use the host network.

    Args:
        cfg: A Config (or a simple object with the same attributes), or
            None to use defaults.

    Returns:
        dict: Keys used to fill the description templates, including
        isolated (bool), network_on (bool), timeout, max_timeout,
        memory_mb, max_procs, fsize, output, max_read, max_walk_depth,
        max_list_entries and reserved.
    """
    if cfg is None:
        sandbox = DEFAULT_SANDBOX_MODE
        sandbox_net = _truthy(DEFAULT_SANDBOX_NET)
        memory_mb = DEFAULT_MEMORY_MB
        max_procs = DEFAULT_MAX_PROCS
        timeout = DEFAULT_TIMEOUT
    else:
        sandbox = str(getattr(cfg, "sandbox", DEFAULT_SANDBOX_MODE) or DEFAULT_SANDBOX_MODE)
        sandbox = sandbox.strip().lower() or DEFAULT_SANDBOX_MODE
        if hasattr(cfg, "sandbox_net"):
            sandbox_net = bool(getattr(cfg, "sandbox_net"))
        else:
            sandbox_net = _truthy(DEFAULT_SANDBOX_NET)
        memory_mb = int(getattr(cfg, "memory_mb", DEFAULT_MEMORY_MB) or DEFAULT_MEMORY_MB)
        max_procs = int(getattr(cfg, "max_procs", DEFAULT_MAX_PROCS) or DEFAULT_MAX_PROCS)
        timeout = int(getattr(cfg, "default_timeout", DEFAULT_TIMEOUT) or DEFAULT_TIMEOUT)
    isolated = sandbox not in SANDBOX_DISABLED_VALUES
    network_on = True if not isolated else bool(sandbox_net)
    memory_mb = max(MIN_MEMORY_MB, memory_mb)
    max_procs = max(MIN_MAX_PROCS, max_procs)
    timeout = min(max(1, timeout), MAX_TIMEOUT)
    # Workspace cap text is honest: only shown when the live mount is on.
    workspace_limit_on = False
    workspace_size = parse_size(DEFAULT_WORKSPACE_SIZE)
    workspace_reserve = DEFAULT_WORKSPACE_RESERVE
    if cfg is not None:
        workspace_limit_on = bool(getattr(cfg, "workspace_limit_on", False))
        raw_size = getattr(cfg, "workspace_size", None)
        if raw_size is not None:
            try:
                workspace_size = parse_size(raw_size)
            except ValueError:
                workspace_size = parse_size(DEFAULT_WORKSPACE_SIZE)
        raw_reserve = getattr(cfg, "workspace_reserve", None)
        if raw_reserve is not None:
            try:
                workspace_reserve = parse_size(raw_reserve)
            except ValueError:
                workspace_reserve = DEFAULT_WORKSPACE_RESERVE
    return {
        "isolated": isolated,
        "network_on": network_on,
        "timeout": timeout,
        "max_timeout": MAX_TIMEOUT,
        "memory_mb": memory_mb,
        "max_procs": max_procs,
        "fsize": format_size(DEFAULT_FSIZE),
        "output": format_size(MAX_OUTPUT),
        "max_read": format_size(MAX_READ),
        "max_walk_depth": MAX_WALK_DEPTH,
        "max_list_entries": MAX_LIST_ENTRIES,
        "reserved": ", ".join(JAIL_PERSISTENT_MOUNTPOINTS),
        # workspace_limit_on is True only when the live workspace is a
        # separate mount. Defaults (cfg is None) stay off, so default
        # client text does not advertise a cap that is not active.
        "workspace_limit_on": workspace_limit_on,
        "workspace_size": format_size(workspace_size),
        "workspace_reserve": format_size(workspace_reserve),
    }


def _command_mode_text(settings):
    """Return the isolation/network sentence for the given settings.

    Args:
        settings (dict): Output of client_settings().

    Returns:
        str: One of the CLIENT_COMMAND_MODE_* templates, already complete.
    """
    if not settings["isolated"]:
        return CLIENT_COMMAND_MODE_NONE
    if settings["network_on"]:
        return CLIENT_COMMAND_MODE_NS_NET
    return CLIENT_COMMAND_MODE_NS_NO_NET


def _limits_text(settings):
    """Return the limit sentence for the given settings.

    Args:
        settings (dict): Output of client_settings().

    Returns:
        str: A filled CLIENT_LIMITS_* template.
    """
    template = (
        CLIENT_LIMITS_JAIL_TEMPLATE if settings["isolated"]
        else CLIENT_LIMITS_NONE_TEMPLATE
    )
    return template.format(**settings)


def _run_command_description(settings):
    """Return the run_command tool description for the given settings.

    Args:
        settings (dict): Output of client_settings().

    Returns:
        str: A filled CLIENT_RUN_COMMAND_* template.
    """
    if not settings["isolated"]:
        template = CLIENT_RUN_COMMAND_NONE
    elif settings["network_on"]:
        template = CLIENT_RUN_COMMAND_NS_NET
    else:
        template = CLIENT_RUN_COMMAND_NS_NO_NET
    return template.format(**settings)


def client_instructions(cfg=None):
    """Build the initialize() instructions from a runtime Config.

    Args:
        cfg: A Config (or a simple object with the same attributes), or
            None to describe the default settings (isolated jail, no
            network, default limits).

    Returns:
        str: The instructions text a connecting AI will see.
    """
    settings = client_settings(cfg)
    layout = CLIENT_LAYOUT.format(**settings)
    # Mention the disk cap only when the workspace is actually a mount.
    if settings["workspace_limit_on"]:
        layout = layout + " " + CLIENT_WORKSPACE_LIMIT.format(**settings)
    return CLIENT_INSTRUCTIONS_TEMPLATE.format(
        layout=layout,
        command_mode=_command_mode_text(settings),
        limits=_limits_text(settings),
    )


def _with_workspace_limit(text, settings):
    """Append the workspace size-limit sentence when the mount is active.

    Args:
        text (str): A tool description already filled from a template.
        settings (dict): Output of client_settings().

    Returns:
        str: text, plus CLIENT_WORKSPACE_LIMIT when workspace_limit_on.
    """
    if not settings.get("workspace_limit_on"):
        return text
    return text + " " + CLIENT_WORKSPACE_LIMIT.format(**settings)


def client_tool_defs(cfg=None):
    """Build the tools/list payload from a runtime Config.

    Args:
        cfg: A Config (or a simple object with the same attributes), or
            None to describe the default settings.

    Returns:
        list[dict]: MCP tool definitions with descriptions and
        inputSchema property descriptions filled from templates.
    """
    settings = client_settings(cfg)
    return [
        {
            "name": "run_command",
            "description": _run_command_description(settings),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": CLIENT_PROP_COMMAND,
                    },
                    "cwd": {
                        "type": "string",
                        "description": CLIENT_PROP_CWD,
                    },
                    "timeout": {
                        "type": "number",
                        "description": CLIENT_PROP_TIMEOUT.format(**settings),
                    },
                },
                "required": ["command"],
            },
        },
        {
            "name": "read_file",
            "description": CLIENT_READ_FILE.format(**settings),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": CLIENT_PROP_READ_PATH,
                    },
                    "offset": {
                        "type": "integer",
                        "description": CLIENT_PROP_OFFSET,
                    },
                    "limit": {
                        "type": "integer",
                        "description": CLIENT_PROP_LIMIT,
                    },
                    "max_bytes": {
                        "type": "integer",
                        "description": CLIENT_PROP_MAX_BYTES.format(**settings),
                    },
                },
                "required": ["path"],
            },
        },
        {
            "name": "write_file",
            "description": _with_workspace_limit(
                CLIENT_WRITE_FILE.format(**settings), settings
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": CLIENT_PROP_WRITE_PATH,
                    },
                    "content": {
                        "type": "string",
                        "description": CLIENT_PROP_CONTENT,
                    },
                    "create_parents": {
                        "type": "boolean",
                        "description": CLIENT_PROP_CREATE_PARENTS,
                    },
                },
                "required": ["path", "content"],
            },
        },
        {
            "name": "edit_file",
            "description": _with_workspace_limit(
                CLIENT_EDIT_FILE.format(**settings), settings
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": CLIENT_PROP_EDIT_PATH,
                    },
                    "old_string": {
                        "type": "string",
                        "description": CLIENT_PROP_OLD_STRING,
                    },
                    "new_string": {
                        "type": "string",
                        "description": CLIENT_PROP_NEW_STRING,
                    },
                    "replace_all": {
                        "type": "boolean",
                        "description": CLIENT_PROP_REPLACE_ALL,
                    },
                },
                "required": ["path", "old_string", "new_string"],
            },
        },
        {
            "name": "list_dir",
            "description": CLIENT_LIST_DIR.format(**settings),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": CLIENT_PROP_LIST_PATH,
                    },
                    "recursive": {
                        "type": "boolean",
                        "description": CLIENT_PROP_RECURSIVE,
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": CLIENT_PROP_MAX_DEPTH.format(**settings),
                    },
                },
                "required": ["path"],
            },
        },
        {
            "name": "delete_path",
            "description": CLIENT_DELETE_PATH.format(**settings),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": CLIENT_PROP_DELETE_PATH,
                    },
                    "recursive": {
                        "type": "boolean",
                        "description": CLIENT_PROP_DELETE_RECURSIVE,
                    },
                },
                "required": ["path"],
            },
        },
        {
            "name": "move_path",
            "description": CLIENT_MOVE_PATH.format(**settings),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "src": {
                        "type": "string",
                        "description": CLIENT_PROP_SRC,
                    },
                    "dest": {
                        "type": "string",
                        "description": CLIENT_PROP_DEST,
                    },
                },
                "required": ["src", "dest"],
            },
        },
    ]

