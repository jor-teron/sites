"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/nscompat.py
Purpose:      Linux namespace, mount, pivot_root, prctl and hostname
              syscalls via ctypes, plus a probe for unprivileged user
              namespaces. Python only added os.unshare / os.mount in 3.12;
              this wrapper keeps the server working on 3.8–3.11 as well.
Place:        mcp/nscompat.py — used by jail.py and sandbox.py. Kernel
              flag numbers live here; every other constant lives in
              config.py.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+ standard library only (ctypes, os).
"""
from __future__ import annotations

import ctypes
import ctypes.util
import os

from .config import USERNS_HELP, USERNS_SYSCTL_HINTS


# =============================================================================
# Kernel constants, fixed by Linux
# =============================================================================
# These values come from the Linux UAPI headers (sched.h, mount.h, prctl.h,
# resource.h / asm-generic/resource.h). They are not configuration and must
# not be changed, overridden by mcp.conf, or moved to config.py.

# clone(2) / unshare(2) flags (linux/sched.h)
CLONE_NEWNS = 0x00020000    # new mount namespace
CLONE_NEWUTS = 0x04000000   # new UTS (hostname) namespace
CLONE_NEWIPC = 0x08000000   # new IPC namespace
CLONE_NEWUSER = 0x10000000  # new user namespace
CLONE_NEWPID = 0x20000000   # new PID namespace (takes effect in children)
CLONE_NEWNET = 0x40000000   # new network namespace

# mount(2) flags (linux/fs.h / sys/mount.h)
MS_RDONLY = 1               # remount read-only
MS_NOSUID = 2               # ignore suid/sgid bits
MS_NODEV = 4                # no device files on this mount
MS_NOEXEC = 8               # do not allow execution
MS_REMOUNT = 32             # alter flags of an existing mount
MS_BIND = 4096              # bind-mount a path onto another
MS_REC = 16384              # apply MS_PRIVATE (etc.) recursively
MS_PRIVATE = 1 << 18        # do not propagate mounts to/from this tree
MS_SLAVE = 1 << 19          # receive propagation only (unused; documented)

# umount2(2) flag: detach lazily so busy mounts do not block pivot_root cleanup.
MNT_DETACH = 2

# prctl(2) option numbers (linux/prctl.h)
PR_SET_PDEATHSIG = 1        # deliver this signal when the parent dies
PR_SET_NO_NEW_PRIVS = 38    # the process and its children cannot gain privileges

# rlimit resource numbers (asm-generic/resource.h). Kept for reference;
# sandbox.py applies limits through the Python `resource` module, whose
# names already match these values on Linux.
RLIMIT_CPU = 0
RLIMIT_FSIZE = 1
RLIMIT_DATA = 2
RLIMIT_STACK = 3
RLIMIT_CORE = 4
RLIMIT_NPROC = 6
RLIMIT_NOFILE = 7
RLIMIT_AS = 9
RLIMIT_NICE = 13

# Cached ctypes handle for libc, created on first use by _lib().
_libc = None


def _lib():
    """Return a ctypes libc handle with syscall prototypes configured.

    The handle is cached in _libc so later calls do not re-load the library.
    use_errno=True makes ctypes.get_errno() work after a failed call.

    Returns:
        ctypes.CDLL: The configured libc object.

    Raises:
        OSError: If libc cannot be loaded on this system.
    """
    global _libc
    if _libc is None:
        path = ctypes.util.find_library("c") or "libc.so.6"
        _libc = ctypes.CDLL(path, use_errno=True)
        _libc.unshare.argtypes = [ctypes.c_ulong]
        _libc.unshare.restype = ctypes.c_int
        _libc.mount.argtypes = [
            ctypes.c_char_p,
            ctypes.c_char_p,
            ctypes.c_char_p,
            ctypes.c_ulong,
            ctypes.c_char_p,
        ]
        _libc.mount.restype = ctypes.c_int
        _libc.umount2.argtypes = [ctypes.c_char_p, ctypes.c_int]
        _libc.umount2.restype = ctypes.c_int
        _libc.pivot_root.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
        _libc.pivot_root.restype = ctypes.c_int
        _libc.prctl.argtypes = [
            ctypes.c_int,
            ctypes.c_ulong,
            ctypes.c_ulong,
            ctypes.c_ulong,
            ctypes.c_ulong,
        ]
        _libc.prctl.restype = ctypes.c_int
        _libc.sethostname.argtypes = [ctypes.c_char_p, ctypes.c_size_t]
        _libc.sethostname.restype = ctypes.c_int
    return _libc


def _raise(what):
    """Raise OSError using libc's errno and a short description.

    Args:
        what (str): Label included in the error message (syscall and paths).

    Returns:
        None. Always raises.

    Raises:
        OSError: Always, with errno and strerror from the last libc call.
    """
    err = ctypes.get_errno()
    raise OSError(err, "%s: %s" % (what, os.strerror(err)))


def libc_unshare(flags):
    """unshare(2): move the current process into new namespaces.

    Args:
        flags (int): Bitwise OR of CLONE_NEW* constants from this module.

    Returns:
        None on success.

    Raises:
        OSError: If the syscall fails (for example, user namespaces disabled).
    """
    if _lib().unshare(ctypes.c_ulong(flags)) != 0:
        _raise("unshare")


def libc_mount(src, target, fstype, flags, data=None):
    """mount(2): mount, bind, or remount a filesystem.

    Args:
        src (str | None): Source device or bind path (None for some remounts).
        target (str | None): Mount point.
        fstype (str | None): Filesystem type ("tmpfs", "proc", or None for bind).
        flags (int): Bitwise OR of MS_* constants from this module.
        data (str | None): Filesystem-specific options (for example "mode=755").

    Returns:
        None on success.

    Raises:
        OSError: If the syscall fails.
    """
    c_src = src.encode("utf-8") if src else None
    c_tgt = target.encode("utf-8") if target else None
    c_fs = fstype.encode("utf-8") if fstype else None
    c_data = data.encode("utf-8") if data else None
    if _lib().mount(c_src, c_tgt, c_fs, ctypes.c_ulong(flags), c_data) != 0:
        _raise("mount %s -> %s" % (src, target))


def libc_umount2(target, flags=MNT_DETACH):
    """umount2(2): unmount a path. Defaults to a lazy detach (MNT_DETACH).

    Args:
        target (str): Mount point to unmount.
        flags (int): umount2 flags; MNT_DETACH is the default so a busy
            mount does not block cleanup after pivot_root.

    Returns:
        None on success.

    Raises:
        OSError: If the syscall fails.
    """
    if _lib().umount2(target.encode("utf-8"), flags) != 0:
        _raise("umount %s" % target)


def libc_pivot_root(newroot, putold):
    """pivot_root(2): swap the mount tree so newroot becomes `/`.

    Unlike chroot(2), pivot_root does not block a later unshare of
    CLONE_NEWUSER, which is why the jail uses it (so we can drop from
    namespaced uid 0 to JAIL_UID afterwards).

    Args:
        newroot (str): Path of the new root (usually "." after chdir).
        putold (str): An empty directory under newroot where the old
            root is parked (then detached with umount2).

    Returns:
        None on success.

    Raises:
        OSError: If the syscall fails.
    """
    if _lib().pivot_root(newroot.encode("utf-8"), putold.encode("utf-8")) != 0:
        _raise("pivot_root")


def libc_prctl(option, arg2=0, arg3=0, arg4=0, arg5=0):
    """prctl(2): process-control options such as no_new_privs and PDEATHSIG.

    Args:
        option (int): A PR_* constant from this module.
        arg2, arg3, arg4, arg5: Option-specific arguments (default 0).

    Returns:
        None on success.

    Raises:
        OSError: If the syscall fails.
    """
    if _lib().prctl(option, arg2, arg3, arg4, arg5) != 0:
        _raise("prctl")


def libc_sethostname(name):
    """sethostname(2): set the hostname in the current UTS namespace.

    Args:
        name (str): Hostname to set (JAIL_HOSTNAME in the jail).

    Returns:
        None on success.

    Raises:
        OSError: If the syscall fails.
    """
    raw = name.encode("utf-8")
    if _lib().sethostname(raw, len(raw)) != 0:
        _raise("sethostname")


def write_file(path, text):
    """Write text to an already-existing file (used for /proc uid/gid maps).

    The file is opened with O_WRONLY only — no O_CREAT — because /proc
    map files must already exist and reject creat().

    Args:
        path (str): Destination path (typically /proc/self/uid_map).
        text (str | bytes): Contents to write.

    Returns:
        None.

    Raises:
        OSError: If the open or write fails (EPERM is common for a bad map).
    """
    fd = os.open(path, os.O_WRONLY)
    try:
        data = text.encode("utf-8") if not isinstance(text, bytes) else text
        os.write(fd, data)
    finally:
        os.close(fd)


def userns_available():
    """Probe whether unprivileged user namespaces work on this kernel.

    First reads USERNS_SYSCTL_HINTS; a "0" on a knob that should be
    non-zero is a hard failure. Then forks a child that unshares
    CLONE_NEWUSER and writes a 1-to-1 uid/gid map. The parent waits
    for the child's exit status.

    Returns:
        tuple[bool, str]: (ok, message). The message is either a short
        success note (including any sysctl hints) or USERNS_HELP plus
        the reason the probe failed.
    """
    # Cheap sysctl hints first, then a real probe.
    hints = []
    for path, expect_nonzero in USERNS_SYSCTL_HINTS:
        try:
            with open(path, "r") as fh:
                raw = fh.read().strip()
            hints.append("%s=%s" % (path, raw))
            if expect_nonzero and raw == "0":
                return False, USERNS_HELP + "(%s is 0)\n" % path
        except OSError:
            continue
    pid = os.fork()
    if pid == 0:
        try:
            # After unshare, getuid() is the overflow uid (65534) until the
            # map is written, so capture the host ids first. The map must
            # name the process's real host uid or the write is EPERM.
            host_uid = os.getuid()
            host_gid = os.getgid()
            libc_unshare(CLONE_NEWUSER)
            write_file("/proc/self/setgroups", "deny")
            write_file("/proc/self/uid_map", "0 %d 1\n" % host_uid)
            write_file("/proc/self/gid_map", "0 %d 1\n" % host_gid)
            os._exit(0 if os.getuid() == 0 else 2)
        except Exception:
            os._exit(1)
    _, status = os.waitpid(pid, 0)
    if os.WIFEXITED(status) and os.WEXITSTATUS(status) == 0:
        extra = (" (" + ", ".join(hints) + ")") if hints else ""
        return True, "unprivileged user namespaces work" + extra
    return False, USERNS_HELP + ("probe failed; %s\n" % (", ".join(hints) or "no sysctl hints"))
