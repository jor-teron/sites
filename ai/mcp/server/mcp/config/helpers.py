"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/config/helpers.py
Purpose:      Path, size, and utility helpers.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
"""
from __future__ import annotations

import os
from .constants import *
from .client_text import *

def install_dir():
    """Return the directory that holds mcp.sh, mcp.conf and sandbox/.

    That directory is the parent of this package (mcp/). The value is
    resolved to a real path so later comparisons are symlink-safe.

    helpers.py lives at <install>/mcp/config/helpers.py, so two levels
    up from its directory reaches the install root.

    Returns:
        str: Absolute real path of the install directory.
    """
    return os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def default_sandbox():
    """Return the default chroot / file-tool root: <install_dir>/sandbox.

    Returns:
        str: Absolute path (not required to exist until Config.validate).
    """
    return os.path.join(install_dir(), SANDBOX_DIR_NAME)


def root_is_unsafe(root):
    """Return a reason string if root would expose the install dir or is too shallow.

    A root is unsafe when:
    - the install directory is equal to or under the root (the AI would see
      mcp.conf, the PIN and the server code), or
    - the root has fewer than 3 path components (e.g. /, /home, /home/www),
      which makes common host paths visible inside the jail.

    Args:
        root (str): Candidate MCP_ROOT path (already realpath'd).

    Returns:
        str | None: A short reason if unsafe, otherwise None.
    """
    if not root:
        return None
    root = os.path.realpath(root)
    inst = install_dir()
    # Install dir equal to or under the sandbox root.
    if root == inst or inst.startswith(root + os.sep):
        return "MCP_ROOT (%s) contains the install directory (%s)" % (root, inst)
    # Too shallow: fewer than 3 components after the leading slash.
    parts = [p for p in root.split(os.sep) if p]
    if len(parts) < 3:
        return "MCP_ROOT (%s) is above a safe depth (need at least 3 path components)" % root
    return None


def workspace_path(root):
    """Return the host path of the default working directory under a sandbox.

    Args:
        root (str): Host path of the sandbox folder (MCP_ROOT).

    Returns:
        str: <root>/<WORKSPACE_DIR_NAME>, or empty string if root is empty.
    """
    if not root:
        return ""
    return os.path.join(root, WORKSPACE_DIR_NAME)


def default_conf_path():
    """Return the default mcp.conf path: <install_dir>/mcp.conf.

    Returns:
        str: Absolute path, which may not exist.
    """
    return os.path.join(install_dir(), CONF_FILENAME)


# =============================================================================
# Config file and environment resolution
# =============================================================================
# Every override of a default is resolved in this section. Other modules
# must read the resulting Config object (or the defaults above), never
# parse mcp.conf or MCP_* environment variables themselves.


class ConfigError(Exception):
    """Raised when a configuration value is missing, empty, or inconsistent.

    Caught by the server entry point and printed as a one-line error.
    """


def _truthy(val):
    """Return True if val is a recognised true flag string.

    Args:
        val: Any value; it is converted to a stripped, lower-cased string.

    Returns:
        bool: True if the value is one of TRUTHY_VALUES, else False.
    """
    return str(val or "").strip().lower() in TRUTHY_VALUES




def format_size(n):
    """Format a byte count for client-facing descriptions.

    Uses KiB or MiB only when the value is an exact multiple of that unit,
    so the number in the text matches the config constant.

    Args:
        n (int): Size in bytes.

    Returns:
        str: For example '200 KiB', '64 MiB', or '500 bytes'.
    """
    n = int(n)
    if n >= BYTES_PER_TIB and n % BYTES_PER_TIB == 0:
        return "%d TiB" % (n // BYTES_PER_TIB)
    if n >= BYTES_PER_GIB and n % BYTES_PER_GIB == 0:
        return "%d GiB" % (n // BYTES_PER_GIB)
    if n >= BYTES_PER_MIB and n % BYTES_PER_MIB == 0:
        return "%d MiB" % (n // BYTES_PER_MIB)
    if n >= BYTES_PER_KIB and n % BYTES_PER_KIB == 0:
        return "%d KiB" % (n // BYTES_PER_KIB)
    return "%d bytes" % n


def format_size_short(n):
    """Format a byte count as a compact size, for status lines.

    Uses 1024-based units with one decimal place for values that are
    not a whole number of the chosen unit (for example 2.0G, 12M).

    Args:
        n (int): Size in bytes.

    Returns:
        str: A short size such as '2.0G', '16M', '512K', or '100B'.
    """
    n = int(n)
    # units is a list of (suffix, byte count) from large to small.
    units = (
        ("T", BYTES_PER_TIB),
        ("G", BYTES_PER_GIB),
        ("M", BYTES_PER_MIB),
        ("K", BYTES_PER_KIB),
    )
    for suffix, unit in units:
        if n >= unit:
            whole = n // unit
            # remainder used only to decide whether to print a decimal.
            rest = n % unit
            if rest == 0:
                if unit >= BYTES_PER_GIB:
                    return "%d.0%s" % (whole, suffix)
                return "%d%s" % (whole, suffix)
            # One decimal of the chosen unit, rounded to nearest tenth.
            tenths = int(round((n * 10.0) / unit))
            return "%d.%d%s" % (tenths // 10, tenths % 10, suffix)
    return "%dB" % n


def parse_size(value):
    """Parse a human size string or integer into a byte count.

    Accepts a bare integer (bytes) or an integer followed by K, M, G or T.
    A trailing i, B or iB is ignored, so '2G', '2g', '2GB' and '2GiB' are
    the same 1024-based size. Spaces inside the value are ignored.

    Args:
        value: A string such as '2G' or an int already in bytes.

    Returns:
        int: Size in bytes (may be 0).

    Raises:
        ValueError: If the value is empty or the suffix is not recognised.
    """
    if isinstance(value, bool):
        # bool is a subclass of int; reject it so True is not "1 byte".
        raise ValueError("size must be a number or a string such as '2G'")
    if isinstance(value, int):
        if value < 0:
            raise ValueError("size must not be negative")
        return value
    text = str(value).strip().replace(" ", "")
    if not text:
        raise ValueError("size is empty")
    # Split leading digits from the optional suffix.
    index = 0
    length = len(text)
    while index < length and text[index].isdigit():
        index += 1
    if index == 0:
        raise ValueError("unrecognised size %r" % (value,))
    number = int(text[:index])
    suffix = text[index:].upper()
    # Allow "MiB", "MB", "M", "Mi".
    if suffix.endswith("B"):
        suffix = suffix[:-1]
    if suffix.endswith("I"):
        suffix = suffix[:-1]
    if suffix not in SIZE_SUFFIX_BYTES:
        raise ValueError("unrecognised size %r" % (value,))
    return number * SIZE_SUFFIX_BYTES[suffix]


def pin_is_weak(pin):
    """Return True if pin is the default, too short, or a short numeric PIN.

    Used by the self-test (and documented for install.sh). The running
    server does not refuse these values.

    Args:
        pin: Candidate PIN (any type; it is converted to a string).

    Returns:
        bool: True if the PIN is DEFAULT_PIN / WEAK_PIN (compared case-
        insensitively), shorter than MIN_PIN_LEN, or all digits and
        shorter than MIN_DIGIT_PIN_LEN. An empty PIN is weak.
    """
    text = "" if pin is None else str(pin)
    if not text:
        return True
    if text.lower() == str(WEAK_PIN).lower():
        return True
    if len(text) < MIN_PIN_LEN:
        return True
    if text.isdigit() and len(text) < MIN_DIGIT_PIN_LEN:
        return True
    return False


def default_audit_log(log_file=None):
    """Return the default human-readable audit log path.

    The file sits next to the JSON event log: same directory as log_file,
    filename AUDIT_LOG_FILENAME. When log_file is empty, DEFAULT_AUDIT_LOG
    is used.

    Args:
        log_file (str | None): The JSON log path (cfg.log_file).

    Returns:
        str: Path of the audit log file.
    """
    if log_file:
        parent = os.path.dirname(log_file)
        if parent:
            return os.path.join(parent, AUDIT_LOG_FILENAME)
        return AUDIT_LOG_FILENAME
    return DEFAULT_AUDIT_LOG


