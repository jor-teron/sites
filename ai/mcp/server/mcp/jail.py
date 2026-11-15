"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/jail.py
Purpose:      Layer 1 of isolation: build a new root and enter it with
              pivot_root (the unprivileged equivalent of chroot). The host
              sandbox folder is bound at / so the AI sees sandbox/ as the
              jail root. System directories (/usr read-only, /bin /lib
              /lib64 /sbin, a private /etc, /dev nodes, a private /proc,
              a private tmpfs /tmp and /run) are mounted over reserved
              empty directories created in the sandbox. Those empty
              directories are the only unavoidable host-side pollution;
              passwd, device nodes and scratch files are written on
              tmpfs, not into the host sandbox.
Place:        mcp/jail.py — called from sandbox.py after layer 2 has already
              unshared namespaces and mapped this process to uid 0 in the
              user namespace.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+ standard library only, plus mcp.nscompat and
              constants from mcp.config.
"""
from __future__ import annotations

import os

from .config import (
    DEV_NODES,
    DEV_SYMLINKS,
    DEV_TMPFS_DATA,
    DEVPTS_DATA,
    ETC_BIND_FILES,
    ETC_TMPFS_DATA,
    HOST_ALTERNATIVES_PATH,
    GIT_CONFIG_BASENAME,
    GIT_DEFAULT_EMAIL,
    GIT_DEFAULT_NAME,
    GIT_SAFE_DIRECTORY,
    JAIL_GID,
    JAIL_HOSTNAME,
    JAIL_MOUNTPOINT_NAMES,
    JAIL_NEWROOT_TEMPLATE,
    JAIL_NOLOGIN,
    JAIL_NSSWITCH,
    JAIL_PIVOT_OLD_NAME,
    JAIL_ROOT_PATH,
    JAIL_SHELL,
    JAIL_TMP_PATH,
    JAIL_UID,
    JAIL_USER_NAME,
    JAIL_WORKSPACE_PATH,
    JAIL_ALTERNATIVES_NAME,
    NEWROOT_TMPFS_DATA,
    NOBODY_NAME,
    NOBODY_UID,
    PLACEHOLDER_FILE_MODE,
    RO_LINKS,
    RUN_TMPFS_DATA,
    SHM_TMPFS_DATA,
    TMP_TMPFS_DATA,
    WORKSPACE_DIR_NAME,
    workspace_path,
)
from .nscompat import (
    CLONE_NEWUSER,
    MNT_DETACH,
    MS_BIND,
    MS_NODEV,
    MS_NOEXEC,
    MS_NOSUID,
    MS_PRIVATE,
    MS_RDONLY,
    MS_REC,
    MS_REMOUNT,
    libc_mount,
    libc_pivot_root,
    libc_sethostname,
    libc_umount2,
    libc_unshare,
    write_file,
)


class JailError(Exception):
    """Raised when a mount, bind, or pivot_root step fails.

    The sandbox child turns this into a stderr message and exits with
    SANDBOX_FAIL_EXIT.
    """


def _mount(src, target, fstype, flags, data=None):
    """mount(2) wrapper that turns OSError into JailError with both paths.

    Args:
        src (str | None): Source device or bind path.
        target (str): Mount point.
        fstype (str | None): Filesystem type, or None for a bind mount.
        flags (int): MS_* flags from nscompat.
        data (str | None): Filesystem-specific options.

    Returns:
        None on success.

    Raises:
        JailError: If the mount syscall fails.
    """
    try:
        libc_mount(src, target, fstype, flags, data)
    except OSError as exc:
        raise JailError("mount %s -> %s failed: %s" % (src, target, exc))


def _ensure_dir(path, reserved_name=None):
    """Create a directory, or raise if a reserved name exists as a non-dir.

    Args:
        path (str): Directory to create.
        reserved_name (str | None): If set, used in the error message when
            path exists and is not a directory.

    Returns:
        str: The path that now exists as a directory.

    Raises:
        JailError: If path exists and is not a directory.
    """
    if os.path.lexists(path) and not os.path.isdir(path):
        label = reserved_name or os.path.basename(path)
        raise JailError(
            "sandbox root has a non-directory %r; that name is reserved "
            "as a jail mount point" % label
        )
    os.makedirs(path, exist_ok=True)
    return path


def _bind(src, dst, ro=False, rec=False):
    """Bind-mount src at dst, creating a file or directory placeholder first.

    Args:
        src (str): Existing host path to bind.
        dst (str): Destination path inside the new root (created if needed).
        ro (bool): If True, remount with MS_RDONLY | MS_NOSUID | MS_NODEV.
            Failure is fatal because a writable host bind would weaken the jail.
        rec (bool): If True, use MS_REC so submounts are followed.

    Returns:
        None.

    Raises:
        JailError: If the source is missing, the bind fails, or a requested
            read-only remount cannot be enforced.
    """
    if not os.path.lexists(src):
        raise JailError("bind source missing: %s" % src)
    parent = os.path.dirname(dst)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent)
    if os.path.isdir(src) and not os.path.islink(src):
        if not os.path.exists(dst):
            os.makedirs(dst)
    elif os.path.isdir(src):
        # Directory reached through a symlink; treat as a directory so the
        # bind target is a real directory, not a file placeholder.
        if not os.path.exists(dst):
            os.makedirs(dst)
    else:
        if not os.path.exists(dst):
            # A regular file needs a file placeholder; bind-mounting a
            # file onto a directory (or vice versa) is EINVAL.
            flags = os.O_CREAT | os.O_WRONLY
            fd = os.open(dst, flags, PLACEHOLDER_FILE_MODE)
            os.close(fd)
    flags = MS_BIND | (MS_REC if rec else 0)
    _mount(src, dst, None, flags)
    if ro:
        try:
            # Remounting a bind needs MS_BIND|MS_REMOUNT plus the desired flags.
            remount = MS_BIND | MS_REMOUNT | MS_RDONLY | MS_NOSUID | MS_NODEV
            if rec:
                remount |= MS_REC
            libc_mount(src, dst, None, remount, None)
        except OSError as exc:
            raise JailError(
                "read-only bind remount failed for %s -> %s: %s"
                % (src, dst, exc)
            ) from exc


def _write(path, text, mode=PLACEHOLDER_FILE_MODE):
    """Write a small text file into the new root, creating parent dirs.

    Do not reuse nscompat.write_file(): that helper is for /proc maps and
    has no O_CREAT. Callers must only use this on a tmpfs (for example
    the private /etc) so the bytes do not land in the host sandbox.

    Args:
        path (str): Destination path inside the new root.
        text (str): File contents.
        mode (int): chmod after the write (best-effort; ignored on error).

    Returns:
        None.
    """
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    try:
        os.chmod(path, mode)
    except OSError:
        pass


def write_maps(host_uid, host_gid, inside_uid=0, inside_gid=0):
    """Map a single host uid/gid into the current user namespace.

    setgroups must be written to "deny" first, otherwise an unprivileged
    process is not allowed to write gid_map.

    Args:
        host_uid (int): The uid the process currently has on the host (or
            in the outer user namespace).
        host_gid (int): Matching host/outer gid.
        inside_uid (int): The uid the process should see after the map
            (0 while building the jail, JAIL_UID after the inner unshare).
        inside_gid (int): Matching inside gid.

    Returns:
        None.

    Raises:
        OSError: If a /proc map write is rejected (typically EPERM).
    """
    write_file("/proc/self/setgroups", "deny")
    write_file("/proc/self/uid_map", "%d %d 1\n" % (inside_uid, host_uid))
    write_file("/proc/self/gid_map", "%d %d 1\n" % (inside_gid, host_gid))


def drop_to_mapped_user():
    """Create a nested user namespace so commands run as uid 1000, not 0.

    Must be called after pivot_root (chroot itself blocks a later unshare of
    CLONE_NEWUSER; pivot_root does not). The inner map is JAIL_UID->0, and 0
    in the outer user namespace is the host uid, so files owned by the server
    user appear as uid JAIL_UID inside the jail.

    Returns:
        None.

    Raises:
        JailError: If the unshare or map succeeds but getuid() is not JAIL_UID.
        OSError: If unshare or the map write fails.
    """
    libc_unshare(CLONE_NEWUSER)
    write_maps(0, 0, inside_uid=JAIL_UID, inside_gid=JAIL_GID)
    if os.getuid() != JAIL_UID or os.getgid() != JAIL_GID:
        raise JailError(
            "failed to drop to uid %d (got %d:%d)"
            % (JAIL_UID, os.getuid(), os.getgid())
        )


def _gitconfig_text():
    """Return the /etc/gitconfig written into the jail's private /etc.

    Sets a default identity so `git commit` works, and safe.directory so
    a dubious-ownership check cannot block `git status` after the uid map.

    Returns:
        str: gitconfig file contents.
    """
    return (
        "[user]\n"
        "\tname = %s\n"
        "\temail = %s\n"
        "[safe]\n"
        "\tdirectory = %s\n"
        % (GIT_DEFAULT_NAME, GIT_DEFAULT_EMAIL, GIT_SAFE_DIRECTORY)
    )


def alternatives_bind_source(enabled, host_path=None):
    """Return the host path to bind into the jail /etc, or None to skip.

    The bind is skipped when enabled is false, or when the host path is
    missing or is not a directory (a dangling symlink counts as missing).

    Args:
        enabled (bool): Config flag (cfg.bind_alternatives). False skips
            the bind even if the host directory exists.
        host_path (str | None): Directory to use; defaults to
            HOST_ALTERNATIVES_PATH (/etc/alternatives).

    Returns:
        str | None: The host directory to bind-mount read-only, or None.
    """
    if not enabled:
        return None
    path = host_path if host_path is not None else HOST_ALTERNATIVES_PATH
    if not path:
        return None
    if os.path.isdir(path) and not os.path.islink(path):
        return path
    # A directory reached through a symlink still works as a bind source
    # (the kernel follows it); require that the resolved path is a dir.
    if os.path.isdir(path):
        return path
    return None


def bind_host_alternatives(root, enabled=True, host_path=None):
    """Bind-mount host /etc/alternatives read-only under the jail /etc.

    Must be called after the private /etc tmpfs is already mounted, so
    the destination directory is created on that tmpfs (not in the host
    sandbox). Missing sources and mount failures are ignored so a host
    without update-alternatives, or a kernel that rejects the bind,
    still gets a usable jail.

    Args:
        root (str): Path of the new root (still on the host until pivot).
        enabled (bool): If False, do nothing and return None.
        host_path (str | None): Override the host directory for tests.

    Returns:
        str | None: The destination path that was bound, or None if the
        bind was skipped or failed.
    """
    src = alternatives_bind_source(enabled, host_path=host_path)
    if not src:
        return None
    dest = os.path.join(root, "etc", JAIL_ALTERNATIVES_NAME)
    try:
        os.makedirs(dest, exist_ok=True)
        _bind(src, dest, ro=True)
    except (OSError, JailError):
        return None
    return dest


def _minimal_etc(root, bind_alternatives=True):
    """Populate a private tmpfs /etc and bind selected host files read-only.

    A tmpfs is mounted over root/etc first so passwd, group, hostname and
    gitconfig are never written into the host sandbox/etc directory. The
    whole of host /etc is never bind-mounted, because it would leak host
    users, /etc/shadow, and ssh keys. Only ETC_BIND_FILES are considered,
    each read-only, plus (when enabled and present) host /etc/alternatives
    so commands such as awk and vi resolve inside the jail.

    Args:
        root (str): Path of the new root (still on the host until pivot_root).
        bind_alternatives (bool): If True, bind host /etc/alternatives
            read-only under the jail /etc when that directory exists.

    Returns:
        None.
    """
    etc = os.path.join(root, "etc")
    _ensure_dir(etc, "etc")
    _mount("tmpfs", etc, "tmpfs", MS_NOSUID | MS_NODEV, ETC_TMPFS_DATA)
    _write(
        os.path.join(etc, "passwd"),
        "root:x:0:0:root:%s:%s\n"
        "%s:x:%d:%d:mcp:%s:%s\n"
        "%s:x:%d:%d:%s:%s:%s\n"
        % (
            JAIL_ROOT_PATH, JAIL_NOLOGIN,
            JAIL_USER_NAME, JAIL_UID, JAIL_GID, JAIL_WORKSPACE_PATH, JAIL_SHELL,
            NOBODY_NAME, NOBODY_UID, NOBODY_UID, NOBODY_NAME, JAIL_TMP_PATH, JAIL_NOLOGIN,
        ),
    )
    _write(
        os.path.join(etc, "group"),
        "root:x:0:\n"
        "%s:x:%d:\n"
        "%s:x:%d:\n" % (JAIL_USER_NAME, JAIL_GID, NOBODY_NAME, NOBODY_UID),
    )
    nss = os.path.join(etc, "nsswitch.conf")
    if not os.path.exists(nss):
        _write(nss, JAIL_NSSWITCH)
    _write(os.path.join(etc, "hostname"), JAIL_HOSTNAME + "\n")
    _write(os.path.join(etc, GIT_CONFIG_BASENAME), _gitconfig_text())
    # Optional host files that help the dynamic linker and TLS, never /etc as a whole.
    for name in ETC_BIND_FILES:
        src = os.path.join("/etc", name)
        dst = os.path.join(etc, name)
        if not os.path.lexists(src):
            continue
        try:
            if os.path.isdir(src) and not os.path.islink(src):
                os.makedirs(dst, exist_ok=True)
                _bind(src, dst, ro=True)
            else:
                _bind(src, dst, ro=True)
        except (OSError, JailError):
            continue
    # awk, vi, editor and similar Debian commands are /usr/bin symlinks
    # into /etc/alternatives; bind that directory so those names resolve.
    bind_host_alternatives(root, enabled=bind_alternatives)


def _setup_dev(root):
    """Create a private /dev: tmpfs, a few bind-mounted nodes, and stdio symlinks.

    The tmpfs is mounted over root/dev so device placeholders never persist
    in the host sandbox/dev directory.

    Args:
        root (str): Path of the new root.

    Returns:
        None. Optional mounts (devpts, /dev/shm) are skipped on failure so
        a kernel without those filesystems still gets a usable /dev.
    """
    dev = os.path.join(root, "dev")
    _ensure_dir(dev, "dev")
    _mount("tmpfs", dev, "tmpfs", MS_NOSUID | MS_NOEXEC | MS_NODEV, DEV_TMPFS_DATA)
    pts = os.path.join(dev, "pts")
    os.makedirs(pts, exist_ok=True)
    try:
        _mount("devpts", pts, "devpts", MS_NOSUID | MS_NOEXEC, DEVPTS_DATA)
    except JailError:
        pass
    for name in DEV_NODES:
        src = os.path.join("/dev", name)
        dst = os.path.join(dev, name)
        if os.path.exists(src):
            try:
                _bind(src, dst, ro=False)
            except (OSError, JailError):
                continue
    for name, target in DEV_SYMLINKS:
        try:
            os.symlink(target, os.path.join(dev, name))
        except OSError:
            pass
    # /dev/shm for anything that expects it
    shm = os.path.join(dev, "shm")
    os.makedirs(shm, exist_ok=True)
    try:
        _mount("tmpfs", shm, "tmpfs", MS_NOSUID | MS_NODEV, SHM_TMPFS_DATA)
    except JailError:
        pass


def _setup_usr(root):
    """Bind-mount host /usr read-only and bind /bin, /lib, /lib64, /sbin.

    On a usrmerge system those paths are symlinks into /usr; they are
    bind-mounted as directories (the symlink target) rather than copied
    as symlinks, so a symlink is never created in the host sandbox.
    Missing host paths (for example /lib64 on some ARM systems) are
    skipped and their mount-point directory is not required.

    Args:
        root (str): Path of the new root.

    Returns:
        None.

    Raises:
        JailError: If host /usr is missing (bash, coreutils and python3
            all live there).
    """
    if not os.path.isdir("/usr"):
        raise JailError("/usr is required to build the jail (bash, coreutils, python3)")
    usr = os.path.join(root, "usr")
    _ensure_dir(usr, "usr")
    _bind("/usr", usr, ro=True, rec=True)
    for item in RO_LINKS:
        if not os.path.lexists(item):
            continue
        dest = os.path.join(root, item.lstrip("/"))
        _ensure_dir(dest, item.lstrip("/"))
        _bind(item, dest, ro=True, rec=True)


def _bind_sandbox_as_root(newroot, sandbox):
    """Bind the host sandbox folder over newroot so that / is the sandbox.

    After this bind, creating reserved mount-point directories creates
    them in the host sandbox (the unavoidable pollution documented in
    the README). Project files the AI writes at / then land in the
    host sandbox, except where a system mount covers the name.

    The host path of the sandbox is not also bound at its original
    absolute path (v2 / v2.1 did that for /work). Inside the jail,
    only jail paths exist; / is the sandbox.

    Args:
        newroot (str): Path of the tmpfs new-root (already mounted).
        sandbox (str): Host path of the sandbox folder.

    Returns:
        str: Real host path of the sandbox.
    """
    sandbox = os.path.realpath(sandbox)
    # Recursive bind so any operator mounts already under the sandbox
    # stay visible; MS_PRIVATE on / earlier stops them leaking out.
    _bind(sandbox, newroot, ro=False, rec=True)
    return sandbox


def _ensure_jail_mountpoints(root):
    """Create reserved mount-point directories on the bound sandbox root.

    Args:
        root (str): Path of the new root (already a bind of the sandbox).

    Returns:
        None.
    """
    for name in JAIL_MOUNTPOINT_NAMES:
        host_ro = "/" + name
        # Skip usrmerge names the host does not have, except "old" and
        # the always-used system dirs (those are not in RO_LINKS only).
        if name in tuple(item.lstrip("/") for item in RO_LINKS) and not os.path.lexists(host_ro):
            continue
        _ensure_dir(os.path.join(root, name), name)


def _extra_binds(root, binds):
    """Mount any extra BIND= entries from mcp.conf into the new root.

    Args:
        root (str): Path of the new root.
        binds: Iterable of (src, dest, writable) triples from Config.binds.

    Returns:
        None.

    Raises:
        JailError: If a configured source cannot be bound.
    """
    for src, dest, writable in binds or ():
        if not dest.startswith("/"):
            dest = "/" + dest
        dst = os.path.join(root, dest.lstrip("/"))
        _bind(src, dst, ro=not writable)


def build_root(sandbox, binds=None, bind_alternatives=True):
    """Create a tmpfs new-root, bind the sandbox at /, and mount the jail.

    The current mount namespace is first marked MS_PRIVATE recursively
    so none of these mounts leak to the host or to other commands.

    Approach (v2.2): a tmpfs is mounted at an ephemeral path, then the
    host sandbox is bind-mounted over it. After pivot_root the AI's /
    is the sandbox. System filesystems are mounted over reserved empty
    directories created in the sandbox (usr, bin, lib, lib64, sbin,
    etc, dev, tmp, proc, run, and a temporary old/). etc, dev, tmp,
    proc and run are private tmpfs or proc mounts, so jail metadata is
    not written back to the host. /usr and the usrmerge paths are
    read-only binds of the host originals.

    Trade-off: the reserved names appear as empty directories in the
    host sandbox. Project files must not be stored under those names
    at the sandbox root (they would be hidden by the mounts). The
    alternative — bind each top-level sandbox entry onto a tmpfs
    root — cannot create *new* top-level files at / in the sandbox,
    which this approach can.

    Args:
        sandbox (str): Host path of the sandbox folder (must exist).
        binds: Optional extra BIND= mounts, as on Config.binds.
        bind_alternatives (bool): If True, bind host /etc/alternatives
            into the jail /etc when the host directory exists.

    Returns:
        tuple[str, str]: (newroot path, real sandbox path). newroot is
        still visible in the current namespace until enter_root() is called.

    Raises:
        JailError: If sandbox is missing or a required mount fails.
    """
    if not sandbox or not os.path.isdir(sandbox):
        raise JailError("sandbox is not a directory: %s" % sandbox)
    sandbox = os.path.realpath(sandbox)

    try:
        # Recursively private: stop mount events propagating to the host.
        libc_mount("none", "/", None, MS_REC | MS_PRIVATE, None)
    except OSError as exc:
        raise JailError("cannot make mounts private: %s" % exc)

    # A directory under /tmp is fine; it lives only in this mount namespace.
    newroot = JAIL_NEWROOT_TEMPLATE % os.getpid()
    os.makedirs(newroot, exist_ok=True)
    _mount("tmpfs", newroot, "tmpfs", MS_NOSUID | MS_NODEV, NEWROOT_TMPFS_DATA)

    # Bind the sandbox over the tmpfs so / becomes the sandbox after pivot.
    _bind_sandbox_as_root(newroot, sandbox)
    _ensure_jail_mountpoints(newroot)

    _setup_usr(newroot)
    _minimal_etc(newroot, bind_alternatives=bind_alternatives)
    _setup_dev(newroot)
    _mount(
        "tmpfs",
        os.path.join(newroot, "tmp"),
        "tmpfs",
        MS_NOSUID | MS_NODEV,
        TMP_TMPFS_DATA,
    )
    _mount(
        "tmpfs",
        os.path.join(newroot, "run"),
        "tmpfs",
        MS_NOSUID | MS_NODEV,
        RUN_TMPFS_DATA,
    )
    _mount(
        "proc",
        os.path.join(newroot, "proc"),
        "proc",
        MS_NOSUID | MS_NOEXEC | MS_NODEV,
        None,
    )
    _extra_binds(newroot, binds)
    return newroot, sandbox


def enter_root(newroot):
    """pivot_root into newroot and detach the old host root.

    After this returns, `/` is the sandbox, `/old` has been unmounted
    (and removed if empty), and the hostname is JAIL_HOSTNAME (best-effort).

    Args:
        newroot (str): Path returned by build_root.

    Returns:
        None.

    Raises:
        JailError: If pivot_root or the follow-up umount of /old fails.
    """
    putold = os.path.join(newroot, JAIL_PIVOT_OLD_NAME)
    _ensure_dir(putold, JAIL_PIVOT_OLD_NAME)
    os.chdir(newroot)
    try:
        # "." is newroot after the chdir; "old" is the put_old directory.
        libc_pivot_root(".", JAIL_PIVOT_OLD_NAME)
    except OSError as exc:
        raise JailError("pivot_root failed: %s" % exc)
    old_path = JAIL_ROOT_PATH + JAIL_PIVOT_OLD_NAME
    try:
        libc_umount2(old_path, MNT_DETACH)
    except OSError as exc:
        raise JailError("umount old root failed: %s" % exc)
    try:
        os.rmdir(old_path)
    except OSError:
        # Leave the directory if it is not empty (should be empty).
        pass
    try:
        libc_sethostname(JAIL_HOSTNAME)
    except OSError:
        pass


def jail_cwd(host_cwd, sandbox):
    """Translate a host path inside the sandbox into a path after enter_root.

    Args:
        host_cwd (str | None): Host working directory. None/empty becomes
            JAIL_WORKSPACE_PATH (`/workspace`).
        sandbox (str): Host path of the sandbox folder.

    Returns:
        str: `/workspace`, `/`, or `/<relative>` under the sandbox. Paths
        that are not under the sandbox fall back to `/workspace` (the
        sandbox is no longer also bound at its host path).
    """
    sandbox = os.path.realpath(sandbox)
    workspace = os.path.realpath(workspace_path(sandbox)) if os.path.isdir(workspace_path(sandbox)) else os.path.join(sandbox, WORKSPACE_DIR_NAME)
    if not host_cwd:
        return JAIL_WORKSPACE_PATH
    host_cwd = os.path.realpath(host_cwd)
    if host_cwd == sandbox:
        return JAIL_ROOT_PATH
    if host_cwd == workspace or host_cwd == os.path.join(sandbox, WORKSPACE_DIR_NAME):
        return JAIL_WORKSPACE_PATH
    if host_cwd.startswith(sandbox + os.sep):
        rel = host_cwd[len(sandbox) + 1:]
        # JAIL_ROOT_PATH is "/"; joining with lstrip keeps a single slash.
        return JAIL_ROOT_PATH + rel.replace("\\", "/")
    return JAIL_WORKSPACE_PATH


def enter(sandbox, cwd=None, binds=None, drop_user=True, bind_alternatives=True):
    """Build the jail, pivot into it, and drop to a mapped non-root uid.

    On success the current process is inside the jail, cwd is set, and
    the effective uid is JAIL_UID (unless drop_user is False).

    Args:
        sandbox (str): Host path of the sandbox folder.
        cwd (str | None): Host working directory to resume inside the jail.
        binds: Optional extra BIND= mounts.
        drop_user (bool): If True (the default), unshare an inner user
            namespace so the command runs as JAIL_UID.
        bind_alternatives (bool): If True (the default), bind host
            /etc/alternatives into the jail /etc when it exists.

    Returns:
        str: The working directory as seen inside the jail.

    Raises:
        JailError: If build, pivot, or the uid drop fails.
    """
    newroot, sandbox = build_root(
        sandbox, binds=binds, bind_alternatives=bind_alternatives
    )
    inner_cwd = jail_cwd(cwd, sandbox)
    enter_root(newroot)
    if drop_user:
        drop_to_mapped_user()
    try:
        os.chdir(inner_cwd)
    except OSError:
        try:
            os.chdir(JAIL_WORKSPACE_PATH)
            inner_cwd = JAIL_WORKSPACE_PATH
        except OSError:
            os.chdir(JAIL_ROOT_PATH)
            inner_cwd = JAIL_ROOT_PATH
    return inner_cwd
