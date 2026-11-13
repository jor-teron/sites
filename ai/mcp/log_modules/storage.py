"""Thread-safe append, permissions and rotation for command audit logs."""
from __future__ import annotations
import os
import sys
import threading
from ..config import AUDIT_FILE_MODE, DEFAULT_AUDIT_KEEP, DEFAULT_AUDIT_MAX, default_audit_log

# Serializes append and rotation across the threaded HTTP server.
_audit_lock = threading.Lock()

def rotate_audit_log(path, max_bytes, keep):
    """Rotate path if it exists and is at least max_bytes long.

    path becomes path.1, path.1 becomes path.2, and so on. path.keep
    is removed. A missing file or a non-positive size/keep is a no-op.
    Errors are ignored so rotation can never fail a tool call.

    Args:
        path (str): Current audit log path.
        max_bytes (int): Rotate when the file is at least this large.
        keep (int): Number of numbered backups to retain.

    Returns:
        None.
    """
    if not path or int(max_bytes) <= 0 or int(keep) < 1:
        return
    try:
        size = os.path.getsize(path)
    except OSError:
        return
    if size < int(max_bytes):
        return
    # oldest is the backup that falls off the end of the keep window.
    oldest = "%s.%d" % (path, int(keep))
    try:
        os.unlink(oldest)
    except OSError:
        pass
    # index walks downwards so we never overwrite a backup we still need.
    index = int(keep)
    while index > 1:
        src = "%s.%d" % (path, index - 1)
        dst = "%s.%d" % (path, index)
        try:
            os.replace(src, dst)
        except OSError:
            pass
        index -= 1
    try:
        os.replace(path, path + ".1")
    except OSError:
        pass

def append_audit_line(cfg, line):
    """Append one already-formatted line to the audit log, with rotation.

    Creates parent directories if needed, rotates when the file would
    grow past cfg.audit_max, and sets the file mode to AUDIT_FILE_MODE
    (0600). Write failures are reported on stderr and otherwise ignored.

    Args:
        cfg: Config (or a simple object) exposing audit_log, and
            optionally audit_max and audit_keep.
        line (str): A single audit line, without a trailing newline.

    Returns:
        None.
    """
    path = getattr(cfg, "audit_log", None) or default_audit_log(
        getattr(cfg, "log_file", None)
    )
    if not path:
        return
    # max_bytes and keep come from the config, with defaults for tests
    # that build a minimal object.
    max_bytes = getattr(cfg, "audit_max", DEFAULT_AUDIT_MAX)
    keep = getattr(cfg, "audit_keep", DEFAULT_AUDIT_KEEP)
    # payload is the line plus the newline that belongs in the file.
    payload = line if line.endswith("\n") else (line + "\n")
    try:
        parent = os.path.dirname(path)
        if parent and not os.path.isdir(parent):
            os.makedirs(parent)
        with _audit_lock:
            try:
                current = os.path.getsize(path)
            except OSError:
                current = 0
            if current and current + len(payload.encode("utf-8")) > int(max_bytes):
                rotate_audit_log(path, current, keep)
            flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
            fd = os.open(path, flags, AUDIT_FILE_MODE)
            try:
                try:
                    os.fchmod(fd, AUDIT_FILE_MODE)
                except OSError:
                    pass
                written = os.write(fd, payload.encode("utf-8"))
                if written < len(payload.encode("utf-8")):
                    pass
            finally:
                os.close(fd)
    except OSError as exc:
        sys.stderr.write("command audit log write failed: %s\n" % exc)
