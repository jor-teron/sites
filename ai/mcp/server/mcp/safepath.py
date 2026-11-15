"""Descriptor-relative filesystem operations confined to a trusted root.

Every path component is opened with O_NOFOLLOW. Once a directory is open,
operations are relative to that descriptor, so replacing a checked pathname
with a symlink cannot redirect the operation outside the root.
"""
from __future__ import annotations

import errno
import os
import secrets
import stat


class UnsafePathError(ValueError):
    """A path is invalid, escapes the root, or traverses a symlink."""


def path_parts(path, cfg):
    """Map a user path to normalized components beneath the configured root."""
    if path is None or str(path) == "":
        raise UnsafePathError("path is required")
    value = os.path.expanduser(str(path))
    # file_root (set by UserCfg) confines file tools to the user's home.
    # Fall back to cfg.root so single-PIN mode is unchanged.
    root = os.path.realpath(getattr(cfg, "file_root", None) or cfg.root)
    if os.path.isabs(value):
        # Preserve the established convention: host-absolute paths already
        # under MCP_ROOT are accepted; other absolute paths are jail paths.
        candidate = os.path.abspath(value)
        try:
            inside = os.path.commonpath((root, candidate)) == root
        except ValueError:
            inside = False
        if not inside:
            candidate = os.path.abspath(os.path.join(root, value.lstrip(os.sep)))
    else:
        candidate = os.path.abspath(os.path.join(cfg.default_cwd, value))
    try:
        if os.path.commonpath((root, candidate)) != root:
            raise UnsafePathError("path is outside MCP_ROOT")
    except ValueError:
        raise UnsafePathError("path is outside MCP_ROOT")
    rel = os.path.relpath(candidate, root)
    parts = [] if rel == "." else rel.split(os.sep)
    if any(part in ("", ".", "..") for part in parts):
        raise UnsafePathError("path is outside MCP_ROOT")
    hidden = getattr(cfg, "server_dir", None)
    if hidden:
        hidden = os.path.abspath(hidden)
        try:
            if os.path.commonpath((hidden, candidate)) == hidden:
                raise UnsafePathError("path is inside the hidden server directory")
        except ValueError:
            pass
    return root, parts, candidate


def _flags(directory=False):
    """Build safe open flags, optionally requiring a directory."""
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    if directory:
        flags |= getattr(os, "O_DIRECTORY", 0)
    return flags


def open_root(root):
    """Open the trusted sandbox root as a directory descriptor."""
    return os.open(root, _flags(True))


def open_dir(root_fd, parts, create=False, mode=0o755):
    """Walk directory components relative to root_fd without following symlinks."""
    fd = os.dup(root_fd)
    try:
        for part in parts:
            try:
                nxt = os.open(part, _flags(True), dir_fd=fd)
            except FileNotFoundError:
                if not create:
                    raise
                os.mkdir(part, mode, dir_fd=fd)
                nxt = os.open(part, _flags(True), dir_fd=fd)
            except OSError as exc:
                if exc.errno in (errno.ELOOP, errno.ENOTDIR):
                    raise UnsafePathError("symlink or non-directory path component refused") from exc
                raise
            os.close(fd)
            fd = nxt
        return fd
    except Exception:
        os.close(fd)
        raise


def open_parent(root_fd, parts, create=False):
    """Return a descriptor for the parent and the final path component."""
    if not parts:
        raise UnsafePathError("operation on MCP_ROOT itself is not allowed")
    return open_dir(root_fd, parts[:-1], create=create), parts[-1]


def stat_at(parent_fd, name):
    """Return lstat-style metadata for a child entry, or None if absent."""
    try:
        return os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        return None


def open_file(root_fd, parts, flags=os.O_RDONLY, mode=0o600):
    """Open a file relative to root_fd while refusing final symlinks."""
    parent, name = open_parent(root_fd, parts)
    try:
        fd = os.open(name, flags | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NONBLOCK", 0), mode, dir_fd=parent)
    except OSError as exc:
        if exc.errno == errno.ELOOP:
            raise UnsafePathError("path is outside MCP_ROOT or traverses a symlink") from exc
        raise
    finally:
        os.close(parent)
    return fd


def atomic_write_at(parent_fd, name, content, prefix=".aimcp-tmp-"):
    """Atomically replace a child entry in an already-pinned directory."""
    temp = prefix + secrets.token_hex(12)
    fd = None
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0), 0o600, dir_fd=parent_fd)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            fd = None
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, name, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
    except Exception:
        if fd is not None:
            os.close(fd)
        try:
            os.unlink(temp, dir_fd=parent_fd)
        except OSError:
            pass
        raise


def atomic_write(root_fd, parts, content, prefix=".aimcp-tmp-"):
    """Atomically replace a file after safely opening its parent directory."""
    parent, name = open_parent(root_fd, parts, create=False)
    try:
        atomic_write_at(parent, name, content, prefix)
    finally:
        os.close(parent)


def list_tree(root_fd, parts, recursive, max_depth, max_entries, hidden_parts=()):
    """Collect directory entries without traversing symbolic links."""
    start = open_dir(root_fd, parts)
    entries = []
    truncated = False

    def walk(fd, relparts, depth):
        """Walk one already-open directory descriptor."""
        nonlocal truncated
        try:
            names = sorted(os.listdir(fd))
        except OSError as exc:
            raise ValueError("cannot list directory: %s" % exc)
        for name in names:
            if len(entries) >= max_entries:
                truncated = True
                return
            child = relparts + [name]
            if hidden_parts and child[:len(hidden_parts)] == list(hidden_parts):
                continue
            try:
                st = os.stat(name, dir_fd=fd, follow_symlinks=False)
            except OSError:
                continue
            if stat.S_ISLNK(st.st_mode):
                kind = "symlink"
            elif stat.S_ISDIR(st.st_mode):
                kind = "dir"
            elif stat.S_ISREG(st.st_mode):
                kind = "file"
            else:
                kind = "other"
            entries.append({"name": name, "path": os.path.join(*(["/"] + child)), "type": kind, "size": st.st_size, "depth": depth})
            if recursive and kind == "dir" and depth < max_depth:
                try:
                    child_fd = os.open(name, _flags(True), dir_fd=fd)
                except OSError:
                    continue
                try:
                    walk(child_fd, child, depth + 1)
                finally:
                    os.close(child_fd)
                if truncated:
                    return

    try:
        walk(start, parts, 1)
    finally:
        os.close(start)
    return entries, truncated


def delete_tree_at(parent_fd, name):
    """Recursively unlink entries using pinned directory descriptors."""
    st = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    if not stat.S_ISDIR(st.st_mode):
        os.unlink(name, dir_fd=parent_fd)
        return
    child_fd = os.open(name, _flags(True), dir_fd=parent_fd)
    try:
        for item in os.listdir(child_fd):
            delete_tree_at(child_fd, item)
    finally:
        os.close(child_fd)
    os.rmdir(name, dir_fd=parent_fd)
