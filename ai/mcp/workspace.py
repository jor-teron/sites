"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/workspace.py
Purpose:      Create the sandbox layout used from v2.2: the working
              directory <sandbox>/workspace, reserved jail mount-point
              directories at the sandbox root, and a one-time git init
              of the working directory (no auto-commit). Also detect
              whether /workspace is a separate mount (v2.4 disk limit)
              and report used/free/total space.
Place:        mcp/workspace.py — called from Config.validate() on start
              and from tests that build a Config.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+ standard library only (os, shutil, subprocess,
              sys), plus constants from mcp.config.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys

from .config import (
    GIT_DIR_NAME,
    GIT_INIT_ARGV,
    GIT_INIT_DONE_LOG,
    GIT_INIT_FAIL_LOG,
    GIT_INIT_SKIP_LOG,
    GIT_INIT_TIMEOUT,
    JAIL_PERSISTENT_MOUNTPOINTS,
    RO_LINKS,
    WORKSPACE_LIMIT_OFF_LABEL,
    WORKSPACE_LIMIT_ON_TEMPLATE,
    format_size_short,
    workspace_path,
)


def ensure_workspace_dir(root):
    """Create <root>/workspace if it does not already exist.

    Args:
        root (str): Host path of the sandbox folder (must already exist).

    Returns:
        str: Real path of the working directory.

    Raises:
        OSError: If the directory cannot be created.
        ValueError: If root is empty or is not a directory.
    """
    if not root or not os.path.isdir(root):
        raise ValueError("sandbox root is not a directory: %s" % root)
    path = workspace_path(os.path.realpath(root))
    os.makedirs(path, exist_ok=True)
    return os.path.realpath(path)


def ensure_mountpoints(root):
    """Create empty reserved mount-point directories at the sandbox root.

    These names (usr, bin, lib, and so on) are covered by system mounts
    inside the jail. They have to exist as directories on the host
    because the sandbox folder itself is bound at /. lib64 (and any
    other usrmerge link whose host path is missing) is skipped.

    Args:
        root (str): Host path of the sandbox folder.

    Returns:
        list[str]: Real paths of mount-point directories that now exist.

    Raises:
        OSError: If a reserved name exists and is not a directory, or a
            directory cannot be created.
    """
    root = os.path.realpath(root)
    created = []
    # Only pre-create a usrmerge name (bin, lib, lib64, sbin) when the
    # matching host path exists; otherwise the jail will not mount it.
    needed = []
    for name in JAIL_PERSISTENT_MOUNTPOINTS:
        host_ro = "/" + name
        if name in tuple(item.lstrip("/") for item in RO_LINKS) and not os.path.lexists(host_ro):
            continue
        needed.append(name)
    for name in needed:
        path = os.path.join(root, name)
        if os.path.lexists(path) and not os.path.isdir(path):
            raise OSError(
                "sandbox root has a non-directory %r; that name is reserved "
                "as a jail mount point" % name
            )
        os.makedirs(path, exist_ok=True)
        created.append(os.path.realpath(path))
    return created


def init_workspace_git(workspace):
    """Run `git init` in workspace if it is not already a git repository.

    If git is not installed, a clear line is written to stderr and the
    function returns "skipped". No commit is created.

    Args:
        workspace (str): Host path of the working directory.

    Returns:
        str: "created" if git init ran, "exists" if a repo was already
        present, or "skipped" if git is missing or git init failed.
    """
    workspace = os.path.realpath(workspace)
    git_dir = os.path.join(workspace, GIT_DIR_NAME)
    if os.path.lexists(git_dir):
        return "exists"
    git = shutil.which(GIT_INIT_ARGV[0])
    if not git:
        sys.stderr.write(GIT_INIT_SKIP_LOG % workspace)
        return "skipped"
    argv = (git,) + tuple(GIT_INIT_ARGV[1:])
    try:
        proc = subprocess.run(
            argv,
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=GIT_INIT_TIMEOUT,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        sys.stderr.write(GIT_INIT_FAIL_LOG % (workspace, exc))
        return "skipped"
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "exit %s" % proc.returncode).strip()
        sys.stderr.write(GIT_INIT_FAIL_LOG % (workspace, detail))
        return "skipped"
    sys.stderr.write(GIT_INIT_DONE_LOG % workspace)
    return "created"


def is_workspace_mount(workspace):
    """Return True if workspace is a mount point (its own filesystem).

    A loop-mounted workspace.img has a different device from its parent
    (sandbox/), so os.path.ismount is True. A plain directory on the
    host disk is not a mount point.

    Args:
        workspace (str): Host path of the working directory.

    Returns:
        bool: False if the path is missing, empty, or not a directory.
    """
    if not workspace or not os.path.isdir(workspace):
        return False
    return os.path.ismount(workspace)


def workspace_disk_usage(workspace):
    """Return used, free and total bytes for the workspace filesystem.

    Free is the space available to an unprivileged user (f_bavail),
    which is what write_file/edit_file can actually use.

    Args:
        workspace (str): Host path of a directory on the target filesystem.

    Returns:
        tuple[int, int, int] | None: (used, free, total) in bytes, or
        None if the path cannot be statvfs'd.
    """
    if not workspace or not os.path.isdir(workspace):
        return None
    try:
        # st is the statvfs result for the filesystem that holds workspace.
        st = os.statvfs(workspace)
    except OSError:
        return None
    # fragment size times block counts gives byte figures.
    frags = st.f_frsize
    total = frags * st.f_blocks
    # f_bfree is free to root; f_bavail is free to the server user.
    free = frags * st.f_bavail
    used = total - (frags * st.f_bfree)
    if used < 0:
        used = 0
    return (used, free, total)


def workspace_limit_status(workspace, limit_on=None):
    """Return a short label for banners and mcp.sh --status.

    Args:
        workspace (str): Host path of the working directory.
        limit_on (bool | None): If given, used as the mount flag;
            otherwise is_workspace_mount(workspace) is called.

    Returns:
        str: 'off' when the cap is not active, or
        'on, <used> used of <total>' when it is.
    """
    if limit_on is None:
        limit_on = is_workspace_mount(workspace)
    if not limit_on:
        return WORKSPACE_LIMIT_OFF_LABEL
    usage = workspace_disk_usage(workspace)
    if not usage:
        return WORKSPACE_LIMIT_OFF_LABEL
    used, _free, total = usage
    return WORKSPACE_LIMIT_ON_TEMPLATE.format(
        used=format_size_short(used),
        total=format_size_short(total),
    )


def existing_dir(path):
    """Return the nearest existing directory at or above path.

    Args:
        path (str): A filesystem path that may not exist yet.

    Returns:
        str: An existing directory, or an empty string if none is found.
    """
    current = path
    while current and not os.path.isdir(current):
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    if current and os.path.isdir(current):
        return current
    return ""


def same_filesystem(path, other):
    """Return True if both paths are on the same mounted filesystem.

    If path does not exist, its nearest existing parent is used. This
    lets write_file check a destination before the file is created.

    Args:
        path (str): A file or directory path (may not exist).
        other (str): A path that should already exist (the workspace).

    Returns:
        bool: False if either side cannot be stat'd.
    """
    left = path if os.path.exists(path) else existing_dir(path)
    if not left or not other or not os.path.exists(other):
        return False
    try:
        return os.stat(left).st_dev == os.stat(other).st_dev
    except OSError:
        return False


def ensure_layout(root):
    """Create the v2.2 sandbox layout and initialise git if needed.

    Args:
        root (str): Host path of the sandbox folder (MCP_ROOT).

    Returns:
        str: Real path of the working directory (<root>/workspace).

    Raises:
        ValueError: If root is not a directory.
        OSError: If a reserved mount-point name exists as a non-directory.
    """
    workspace = ensure_workspace_dir(root)
    ensure_mountpoints(root)
    init_workspace_git(workspace)
    return workspace
