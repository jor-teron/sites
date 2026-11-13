"""Domain-specific operational constants for the MCP server."""
from __future__ import annotations

from ..constants import *  # noqa: F401,F403

# Jail layout (layer 1)
# =============================================================================

# Namespaced uid commands see after the inner user namespace is applied.
# 1000 is a regular unprivileged user, never 0, so setuid helpers cannot
# usefully target "root inside the jail".
JAIL_UID = 1000

# Namespaced gid that pairs with JAIL_UID.
JAIL_GID = 1000

# Hostname set inside the UTS namespace after pivot_root.
JAIL_HOSTNAME = "mcp"

# The sandbox folder is mounted as the jail's root, so the AI's "/" is
# the host sandbox/ directory. Kept as a named constant so path joins stay
# explicit in jail.py rather than using a bare "/".
JAIL_ROOT_PATH = "/"

# Default working directory, HOME and PWD inside the jail. On the host this
# is <sandbox>/workspace (WORKSPACE_DIR_NAME).
JAIL_WORKSPACE_PATH = "/" + WORKSPACE_DIR_NAME

# Private temporary directory inside the jail (a tmpfs, not the host /tmp).
JAIL_TMP_PATH = "/tmp"

# Shell used to run commands (bash -lc). The jail binds host /usr read-only,
# which must provide this binary.
JAIL_SHELL = "/bin/bash"

# Account name written to the jail's /etc/passwd and used in the jail env.
JAIL_USER_NAME = "user"

# Login shell recorded for the jail root account (not used to run commands).
JAIL_NOLOGIN = "/sbin/nologin"

# Traditional nobody uid/gid, and the overflow id Linux uses in an unmapped
# user namespace. Used in the jail passwd/group files.
NOBODY_UID = 65534

# Traditional nobody account name in the jail passwd/group files.
NOBODY_NAME = "nobody"

# Template for the ephemeral new-root directory (filled with the helper pid).
# Lives under /tmp and exists only in the command's mount namespace.
JAIL_NEWROOT_TEMPLATE = "/tmp/mcp-jail-%d"

# Directories that must exist at the sandbox root as mount points for
# system filesystems. They are created empty on the host if missing
# (unavoidable, because the sandbox itself is bound at /). Inside the
# jail they are covered by read-only or private mounts, so their on-host
# contents are hidden from commands. Do not store project files under
# these names at the sandbox root; use /workspace instead.
# "old" is only created for pivot_root and is removed afterwards, so it
# is listed here for documentation but is not pre-created at server start.
JAIL_PERSISTENT_MOUNTPOINTS = (
    "usr", "bin", "lib", "lib64", "sbin", "etc", "dev", "tmp", "proc", "run",
)

# pivot_root put_old directory name, created under the new root just before
# the pivot and rmdir'd after the old root is detached.
JAIL_PIVOT_OLD_NAME = "old"

# Union of persistent mount points plus the temporary pivot_root directory,
# used when the jail is built.
JAIL_MOUNTPOINT_NAMES = JAIL_PERSISTENT_MOUNTPOINTS + (JAIL_PIVOT_OLD_NAME,)

# Host paths that, if present as directories or usrmerge symlinks, are
# reproduced read-only inside the jail so /bin/bash and friends resolve.
RO_LINKS = ("/bin", "/lib", "/lib64", "/sbin")

# Device node names bind-mounted from the host /dev. mknod is not allowed
# in an unprivileged user namespace, so we reuse the host nodes.
DEV_NODES = ("null", "zero", "full", "random", "urandom", "tty")

# Symlinks created under the jail /dev, as (name, target) pairs.
DEV_SYMLINKS = (
    ("fd", "/proc/self/fd"),
    ("stdin", "/proc/self/fd/0"),
    ("stdout", "/proc/self/fd/1"),
    ("stderr", "/proc/self/fd/2"),
    ("ptmx", "pts/ptmx"),
)

# Host /etc entries bind-mounted read-only into the jail (never the whole
# of /etc, which would leak host users, shadow, and ssh keys).
ETC_BIND_FILES = (
    "ld.so.cache",
    "ld.so.conf",
    "localtime",
    "hosts",
    "nsswitch.conf",
    "resolv.conf",
    "ssl",
    "ca-certificates",
    "ssl/certs",
    "pki",
)

# Host directory of Debian update-alternatives symlinks (awk, vi, editor,
# pager, and so on). The jail's private /etc does not include this, so
# /usr/bin/awk -> /etc/alternatives/awk would otherwise be a dangling
# link. Bound read-only into the jail /etc when present and enabled.
HOST_ALTERNATIVES_PATH = "/etc/alternatives"

# Directory name of that bind, under the jail's /etc.
JAIL_ALTERNATIVES_NAME = "alternatives"

# Default for MCP_ALTERNATIVES. "1" binds host /etc/alternatives read-only
# into the jail when the host directory exists.
DEFAULT_BIND_ALTERNATIVES = "1"

# Fallback nsswitch.conf written when the host file is not bind-mounted.
JAIL_NSSWITCH = "passwd: files\ngroup: files\nshadow: files\nhosts: files dns\n"

# Mode of placeholder files created as bind-mount targets, and of files
# written into the jail /etc.
PLACEHOLDER_FILE_MODE = 0o644

# mount(2) data for the jail /dev tmpfs. 64 KiB is enough for a handful of
# bind-mounted device nodes and the pts mount point.
DEV_TMPFS_DATA = "mode=755,size=65536"

# mount(2) data for a private devpts instance (optional; ignored if it fails).
DEVPTS_DATA = "newinstance,ptmxmode=0666,mode=0620"

# mount(2) data for /dev/shm. 64 MiB is a typical shm size for short commands.
SHM_TMPFS_DATA = "mode=1777,size=67108864"

# mount(2) data for the jail /tmp. 128 MiB caps scratch files per command.
TMP_TMPFS_DATA = "mode=1777,size=134217728"

# mount(2) data for the new-root tmpfs itself (0755, size left to default).
# The sandbox is then bound over this tmpfs; the tmpfs is only a scaffold.
NEWROOT_TMPFS_DATA = "mode=755"

# mount(2) data for a private /etc tmpfs. 1 MiB holds passwd, group, hostname
# and a gitconfig without writing those files into the host sandbox/etc.
ETC_TMPFS_DATA = "mode=755,size=1048576"

# mount(2) data for a private /run tmpfs (small; nothing should persist there).
RUN_TMPFS_DATA = "mode=755,size=1048576"

# Prefix of the worker job JSON file passed to `python3 -m mcp.sandbox --worker`.
JOB_FILE_PREFIX = "mcp-job-"

# Suffix of the worker job JSON file.
JOB_FILE_SUFFIX = ".json"

# Mode of the worker job file (owner read/write only). The file holds the
# command string and paths, and must stay outside the sandbox folder.
JOB_FILE_MODE = 0o600

# Exit status when jail setup or exec fails in the sandbox child.
SANDBOX_FAIL_EXIT = 127

# Exit status of `python3 -m mcp.sandbox` when it is invoked without --worker.
SANDBOX_USAGE_EXIT = 2

# Exit status used when the sandbox child sees its parent already gone
# (PPID == 1) before PR_SET_PDEATHSIG can take effect.
SANDBOX_ORPHAN_EXIT = 1

# Signal-exit offset: 128 + signal number, matching POSIX shell convention.
SIGNAL_EXIT_OFFSET = 128

# Exit status stored in a command result when the process timed out or no
# wait status was collected.
TIMEOUT_EXIT_CODE = -1


# =============================================================================
