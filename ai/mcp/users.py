"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/users.py
Purpose:      Load the multi-user catalog from a CSV file.
              Columns: uid,user,password,home,enabled,perms
              perms is a pipe-separated list (read|write|run|share).
              v4.1: catalog only. No URL routing or tool checks yet.
Version:      4.1
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+ standard library only.
"""
from __future__ import annotations

import csv
import os


class UserError(ValueError):
    """Raised when the catalog is missing, malformed, or a user is rejected."""


class User(object):
    """One catalog entry.

    Attributes:
        username (str): Login name.
        password (str): Plain password (demo; hashing is later).
        home (str): Home path relative to the rootfs (e.g. home/demo).
        enabled (bool): False rejects the user.
        perms (frozenset[str]): Allowed flags (read, write, run, share).
        uid (int): Numeric user id for this account (jail drop / ownership).
    """

    def __init__(self, username, password, home, enabled, perms, uid):
        self.username = username
        self.password = password
        self.home = home
        self.enabled = enabled
        self.perms = perms
        self.uid = uid

    def has(self, flag):
        """Return True if this user has the named permission flag."""
        return flag in self.perms


def _truthy(value):
    """Return True for common true tokens."""
    return str(value or "").strip().lower() in ("1", "true", "yes", "on")


def load_users(path):
    """Load the user catalog from a CSV file.

    Required columns: uid, user, password, home, enabled, perms.
    perms is split on '|'. uid is an integer. Blank lines are ignored.
    Duplicate users raise UserError.

    Args:
        path (str): Path to the CSV. Missing file yields an empty dict.

    Returns:
        dict[str, User]: username -> User.

    Raises:
        UserError: On a malformed row or a duplicate username.
    """
    users = {}
    if not path or not os.path.isfile(path):
        return users
    with open(path, "r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        if not reader.fieldnames:
            raise UserError("users CSV has no header: %s" % path)
        required = ("uid", "user", "password", "home", "enabled", "perms")
        missing = [name for name in required if name not in reader.fieldnames]
        if missing:
            raise UserError("users CSV missing columns %s: %s" % (missing, path))
        for row in reader:
            username = (row.get("user") or "").strip()
            if not username or username.startswith("#"):
                continue
            if username in users:
                raise UserError("duplicate user %r in %s" % (username, path))
            password = (row.get("password") or "").strip()
            home = (row.get("home") or "").strip()
            if not password or not home:
                raise UserError("user %r needs password and home" % username)
            enabled = _truthy(row.get("enabled"))
            raw_perms = (row.get("perms") or "").strip()
            perms = frozenset(p.strip() for p in raw_perms.split("|") if p.strip())
            raw_uid = (row.get("uid") or "").strip()
            try:
                uid = int(raw_uid)
            except ValueError:
                raise UserError("user %r has invalid uid %r" % (username, raw_uid))
            if uid < 10000:
                raise UserError("user %r uid must be >= 10000 (got %d)" % (username, uid))
            users[username] = User(username, password, home, enabled, perms, uid)
    return users


def get_user(users, username):
    """Return the User or raise UserError if missing or disabled.

    Args:
        users (dict): Result of load_users.
        username (str): Name to look up.

    Returns:
        User: The enabled user.

    Raises:
        UserError: If the user is unknown or enabled is false.
    """
    user = users.get(username)
    if user is None:
        raise UserError("unknown user %r" % username)
    if not user.enabled:
        raise UserError("user %r is disabled" % username)
    return user


def parse_user_path(path):
    """Extract (username, password) from a multi-user URL path.

    Accepts paths that contain the segment sequence
    ``.../mcp/<username>/<password>`` (for example ``/ai/mcp/demo/demo``
    or ``/mcp/demo/demo``). Query strings and fragments are ignored.

    Args:
        path (str | None): The request path.

    Returns:
        tuple[str, str] | None: (username, password) or None if the path
        does not match the multi-user pattern.
    """
    if not path:
        return None
    raw = path.split("?", 1)[0].split("#", 1)[0]
    parts = [p for p in raw.split("/") if p]
    # Look for the 'mcp' segment; the next two are username and password.
    for i, part in enumerate(parts):
        if part == "mcp" and i + 2 < len(parts):
            username = parts[i + 1]
            password = parts[i + 2]
            if username and password:
                return username, password
    return None


# Tool name -> required permission flag.
TOOL_PERMS = {
    "read_file": "read",
    "list_dir": "read",
    "write_file": "write",
    "edit_file": "write",
    "delete_path": "write",
    "move_path": "write",
    "run_command": "run",
}


def tool_allowed(user, tool_name):
    """Return True if the user has the flag required by this tool.

    Unknown tools are refused. A missing user (single-PIN mode) is allowed.
    """
    if user is None:
        return True
    flag = TOOL_PERMS.get(tool_name)
    if not flag:
        return False
    return user.has(flag)


SHARE_DIR_NAME = "home/share"
SHARE_MODE = 0o777
HOME_MODE = 0o700


def ensure_share(root):
    """Create <root>/home/share with mode 0777 if it does not exist.

    Called once at startup. Failures are raised so a bad root is visible.

    Args:
        root (str | None): Sandbox / rootfs path. None or missing is a no-op.

    Returns:
        str | None: The share path, or None if root was empty.
    """
    if not root:
        return None
    path = os.path.join(root, SHARE_DIR_NAME)
    os.makedirs(path, mode=SHARE_MODE, exist_ok=True)
    try:
        os.chmod(path, SHARE_MODE)
    except OSError:
        pass
    return path


def ensure_user_home(cfg, user):
    """Create the user's home directory (mode 0700) if it is missing.

    Called after a successful multi-user login. The parent path is
    created as needed. Returns the host path of the home.

    Args:
        cfg: Config (or UserCfg) with a root attribute.
        user (User): The authenticated user.

    Returns:
        str: Host path of the home directory.
    """
    path = user_root(cfg, user)
    if not path:
        raise UserError("cannot create home: no root")
    os.makedirs(path, mode=HOME_MODE, exist_ok=True)
    try:
        os.chmod(path, HOME_MODE)
    except OSError:
        pass
    return path


def user_root(cfg, user):
    """Return the host path that should be the file-tool root for this user.

    The user's home is <cfg.root>/<user.home>. Callers still need to
    ensure the directory exists (v4.4). For single-PIN mode (user is
    None) the original cfg.root is returned.
    """
    if user is None or not getattr(cfg, "root", None):
        return getattr(cfg, "root", None)
    return os.path.join(cfg.root, user.home)


class UserCfg(object):
    """Shallow view of Config for one authenticated user.

    The jail root stays the real sandbox (cfg.root). Only the working
    directory and the file-tool root change to the user's home, so
    run_command still pivot_roots into sandbox/ and then chdirs into
    home/<user>. file_root is what safepath confines file tools to.
    """

    def __init__(self, cfg, user):
        self._cfg = cfg
        self.mcp_user = user
        # Jail root is unchanged: sandbox/ (or the debootstrap rootfs).
        self.root = cfg.root
        home = user_root(cfg, user)
        self.workspace = home
        self.default_cwd = home
        # File tools are confined to the user's home, not the whole sandbox.
        self.file_root = home

    def __getattr__(self, name):
        return getattr(self._cfg, name)


def authenticate_user(users, path):
    """Return the User if the path carries a valid username/password.

    Args:
        users (dict): Catalog from load_users.
        path (str | None): Request path.

    Returns:
        User | None: The enabled user on success, otherwise None.
    """
    parsed = parse_user_path(path)
    if not parsed:
        return None
    username, password = parsed
    try:
        user = get_user(users, username)
    except UserError:
        return None
    # Constant-time compare via hmac in auth.pins_match would be ideal,
    # but we keep this module free of that import. A direct compare is
    # acceptable for the demo catalog.
    if user.password != password:
        return None
    return user
