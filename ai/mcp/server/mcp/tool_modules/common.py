"""Shared path, argument-summary and workspace helpers for MCP tools."""
from __future__ import annotations

import os
import stat

from .. import safepath
from ..config import (
    DEFAULT_WORKSPACE_RESERVE,
    SUMMARIZE_COMMAND_LEN,
    SUMMARIZE_TEXT_LEN,
    WORKSPACE_SPACE_ERROR,
    format_size,
    parse_size,
)
from ..workspace import same_filesystem, workspace_disk_usage


def is_within(path, root):
    """Return True if path is root or a file/dir under root, after realpath.

    Args:
        path (str): A filesystem path (may be relative; it is resolved).
        root (str): The allowed root (the sandbox folder).

    Returns:
        bool: False if either argument is empty.
    """
    if not path or not root:
        return False
    rp = os.path.realpath(path)
    rr = os.path.realpath(root)
    return rp == rr or rp.startswith(rr + os.sep)

def resolve_user_path(path, cfg, must_exist=False):
    """Return a confined host path after checking existing components without following symlinks."""
    root, parts, candidate = safepath.path_parts(path, cfg)
    root_fd = safepath.open_root(root)
    try:
        if not parts:
            return candidate
        # Validate each existing directory component independently. A
        # missing suffix is allowed for destinations that will be created.
        for index in range(1, len(parts)):
            try:
                fd = safepath.open_dir(root_fd, parts[:index])
                os.close(fd)
            except FileNotFoundError as exc:
                if must_exist: raise ValueError("path does not exist") from exc
                break
            except safepath.UnsafePathError as exc:
                raise ValueError("path is outside MCP_ROOT or traverses a symlink") from exc
        try:
            parent, name = safepath.open_parent(root_fd, parts)
        except FileNotFoundError as exc:
            if must_exist: raise ValueError("path does not exist") from exc
            return candidate
        try:
            st = safepath.stat_at(parent, name)
            if st is not None and stat.S_ISLNK(st.st_mode):
                raise ValueError("path is outside MCP_ROOT or traverses a symlink")
            if must_exist and st is None:
                raise ValueError("path does not exist")
        finally:
            os.close(parent)
    finally:
        os.close(root_fd)
    return candidate

def resolve_cwd(cwd, cfg):
    """Resolve a command working directory, defaulting to /workspace.

    Args:
        cwd (str | None): User-supplied cwd, or None/empty for the default
            (cfg.default_cwd, the host path of /workspace).
        cfg (Config): Passed to resolve_user_path.

    Returns:
        str: A real directory path inside MCP_ROOT.

    Raises:
        ValueError: If the path escapes the root or is not a directory.
    """
    if not cwd:
        return cfg.default_cwd
    real = resolve_user_path(cwd, cfg, must_exist=True)
    if not os.path.isdir(real):
        raise ValueError("cwd is not a directory")
    return real

def summarize_args(args):
    """Return a log-safe copy of tool arguments, with long strings truncated.

    content / old_string / new_string are cut to SUMMARIZE_TEXT_LEN and a
    `_len` field is added. command is cut to SUMMARIZE_COMMAND_LEN. Other
    keys are copied as-is.

    Args:
        args (dict | None): Raw tool arguments.

    Returns:
        dict: A new mapping safe to write to the audit log.
    """
    out = {}
    for key, val in (args or {}).items():
        if key in ("content", "old_string", "new_string"):
            text = val if isinstance(val, str) else str(val)
            out[key] = text[:SUMMARIZE_TEXT_LEN] + ("..." if len(text) > SUMMARIZE_TEXT_LEN else "")
            out[key + "_len"] = len(text)
        elif key == "command":
            text = val if isinstance(val, str) else str(val)
            out[key] = text[:SUMMARIZE_COMMAND_LEN] + (
                "..." if len(text) > SUMMARIZE_COMMAND_LEN else ""
            )
        else:
            out[key] = val
    return out

def check_workspace_space(path, new_bytes, cfg, parent_fd=None):
    """Refuse a write that would leave too little free space in /workspace.

    The check applies only when the destination is on the same filesystem
    as cfg.workspace. Atomic writes keep the old file until the temp file
    is renamed, so the new content must fit in addition to the reserve,
    not merely as a net delta.

    Args:
        path (str): Resolved destination path.
        new_bytes (int): Size of the new UTF-8 content, in bytes.
        cfg (Config): Must expose workspace and workspace_reserve.

    Returns:
        None.

    Raises:
        ValueError: If the write would leave less than the reserve free.
    """
    workspace = getattr(cfg, "workspace", None)
    if not workspace or not os.path.isdir(workspace):
        return
    if parent_fd is not None:
        try:
            same_fs = os.fstat(parent_fd).st_dev == os.stat(workspace).st_dev
        except OSError:
            return
    else:
        same_fs = same_filesystem(path, workspace)
    if not same_fs:
        return
    usage = workspace_disk_usage(workspace)
    if usage is None:
        return
    _used, free, _total = usage
    raw_reserve = getattr(cfg, "workspace_reserve", DEFAULT_WORKSPACE_RESERVE)
    try:
        reserve = parse_size(raw_reserve)
    except ValueError:
        reserve = DEFAULT_WORKSPACE_RESERVE
    if reserve < 0:
        reserve = 0
    # need is the temp file plus the reserve that must remain afterwards.
    need = int(new_bytes) + reserve
    if free < need:
        raise ValueError(
            WORKSPACE_SPACE_ERROR
            % (format_size(need), format_size(free), format_size(reserve))
        )
