"""Workspace file-operation tool implementations."""
from __future__ import annotations

import os
import stat

from .. import safepath
from ..config import (
    DEFAULT_LIST_DEPTH,
    DEFAULT_LIST_DEPTH_RECURSIVE,
    MAX_LIST_ENTRIES,
    MAX_READ,
    MAX_WALK_DEPTH,
    WRITE_TMP_PREFIX,
)
from .common import check_workspace_space


def tool_read_file(args, cfg):
    """Read a UTF-8 regular file through a no-follow descriptor."""
    root, parts, path = safepath.path_parts(args.get("path"), cfg)
    if not parts:
        raise ValueError("not a regular file")
    try:
        max_bytes = int(args.get("max_bytes", MAX_READ))
    except (TypeError, ValueError):
        raise ValueError("max_bytes must be an integer")
    max_bytes = max(1, min(max_bytes, MAX_READ))
    offset, limit = args.get("offset"), args.get("limit")
    root_fd = safepath.open_root(root)
    try:
        fd = safepath.open_file(root_fd, parts)
        with os.fdopen(fd, "rb") as raw:
            if not stat.S_ISREG(os.fstat(raw.fileno()).st_mode):
                raise ValueError("not a regular file")
            if offset is None and limit is None:
                data = raw.read(max_bytes + 1)
                return {"path": path, "content": data[:max_bytes].decode("utf-8", errors="replace"), "truncated": len(data) > max_bytes}
            try:
                start = max(0, int(offset or 0))
                max_lines = None if limit is None else int(limit)
            except (TypeError, ValueError):
                raise ValueError("offset and limit must be integers")
            if max_lines is not None and max_lines < 0:
                raise ValueError("limit must not be negative")
            raw.seek(0)
            lines, size, truncated = [], 0, False
            for index, line in enumerate(raw):
                if index < start:
                    continue
                if max_lines is not None and len(lines) >= max_lines:
                    truncated = True
                    break
                decoded = line.decode("utf-8", errors="replace")
                room = MAX_READ - size
                if room <= 0:
                    truncated = True
                    break
                if len(decoded) > room:
                    lines.append(decoded[:room]); truncated = True; break
                lines.append(decoded); size += len(decoded)
            return {"path": path, "content": "".join(lines), "truncated": truncated, "offset": start, "limit": max_lines}
    except safepath.UnsafePathError as exc:
        raise ValueError(str(exc)) from exc
    except FileNotFoundError as exc:
        raise ValueError("path does not exist") from exc
    finally:
        os.close(root_fd)

def tool_write_file(args, cfg):
    """Atomically write a UTF-8 file using a pinned parent directory."""
    if "content" not in args or not isinstance(args.get("content"), str):
        raise ValueError("content must be a string")
    root, parts, path = safepath.path_parts(args.get("path"), cfg)
    if not parts:
        raise ValueError("cannot write MCP_ROOT")
    content = args["content"]
    nbytes = len(content.encode("utf-8"))
    root_fd = safepath.open_root(root)
    try:
        parent, name = safepath.open_parent(root_fd, parts, create=bool(args.get("create_parents")))
        try:
            check_workspace_space(path, nbytes, cfg, parent_fd=parent)
            existing = safepath.stat_at(parent, name)
            if existing is not None and stat.S_ISLNK(existing.st_mode):
                raise ValueError("symlink destination refused")
            if existing is not None and not stat.S_ISREG(existing.st_mode):
                raise ValueError("destination is not a regular file")
            safepath.atomic_write_at(parent, name, content, prefix=WRITE_TMP_PREFIX)
        finally:
            os.close(parent)
    except safepath.UnsafePathError as exc:
        raise ValueError(str(exc)) from exc
    except FileNotFoundError as exc:
        raise ValueError("parent directory does not exist") from exc
    finally:
        os.close(root_fd)
    return {"path": path, "bytes": nbytes}

def tool_edit_file(args, cfg):
    """Replace text in a regular file without following path symlinks."""
    old, new = args.get("old_string"), args.get("new_string")
    if not isinstance(old, str) or old == "": raise ValueError("old_string is required")
    if not isinstance(new, str): raise ValueError("new_string must be a string")
    root, parts, path = safepath.path_parts(args.get("path"), cfg)
    root_fd = safepath.open_root(root)
    try:
        fd = safepath.open_file(root_fd, parts)
        with os.fdopen(fd, "r", encoding="utf-8", errors="replace") as fh:
            opened_stat = os.fstat(fh.fileno())
            if not stat.S_ISREG(opened_stat.st_mode): raise ValueError("not a regular file")
            text = fh.read(MAX_READ + 1)
        if len(text) > MAX_READ: raise ValueError("file is too large to edit safely")
        count = text.count(old)
        if count == 0: raise ValueError("old_string not found")
        replace_all = bool(args.get("replace_all"))
        if count > 1 and not replace_all:
            raise ValueError("old_string is ambiguous (%d matches); set replace_all or use more context" % count)
        updated = text.replace(old, new) if replace_all else text.replace(old, new, 1)
        parent, name = safepath.open_parent(root_fd, parts)
        try:
            # Recheck the directory entry without following it immediately
            # before atomic replacement; the parent descriptor cannot drift.
            st = safepath.stat_at(parent, name)
            if st is None or not stat.S_ISREG(st.st_mode) or (st.st_dev, st.st_ino) != (opened_stat.st_dev, opened_stat.st_ino):
                raise ValueError("file changed during edit")
            check_workspace_space(path, len(updated.encode("utf-8")), cfg, parent_fd=parent)
            safepath.atomic_write_at(parent, name, updated, prefix=WRITE_TMP_PREFIX)
        finally:
            os.close(parent)
        return {"path": path, "replacements": count if replace_all else 1}
    except safepath.UnsafePathError as exc:
        raise ValueError(str(exc)) from exc
    except FileNotFoundError as exc:
        raise ValueError("path does not exist") from exc
    finally:
        os.close(root_fd)

def tool_list_dir(args, cfg):
    """List entries using pinned directory descriptors; never recurse symlinks."""
    root, parts, path = safepath.path_parts(args.get("path") or ".", cfg)
    recursive = bool(args.get("recursive"))
    try:
        max_depth = int(args.get("max_depth", DEFAULT_LIST_DEPTH_RECURSIVE if recursive else DEFAULT_LIST_DEPTH))
    except (TypeError, ValueError):
        raise ValueError("max_depth must be an integer")
    max_depth = max(1, min(max_depth, MAX_WALK_DEPTH))
    hidden_parts = ()
    hidden = getattr(cfg, "server_dir", None)
    if hidden:
        try:
            rel = os.path.relpath(os.path.abspath(hidden), root)
            if rel != "." and not rel.startswith(".." + os.sep) and rel != "..": hidden_parts = tuple(rel.split(os.sep))
        except ValueError: pass
    root_fd = safepath.open_root(root)
    try:
        entries, truncated = safepath.list_tree(root_fd, parts, recursive, max_depth, MAX_LIST_ENTRIES, hidden_parts)
        for entry in entries:
            entry["path"] = os.path.join(root, *entry["path"].lstrip("/").split("/"))
        return {"path": path, "entries": entries, "truncated": truncated}
    except safepath.UnsafePathError as exc:
        raise ValueError(str(exc)) from exc
    except FileNotFoundError as exc:
        raise ValueError("path does not exist") from exc
    finally:
        os.close(root_fd)

def tool_delete_path(args, cfg):
    """Delete a path relative to pinned directory descriptors; symlinks are unlinked, never followed."""
    root, parts, path = safepath.path_parts(args.get("path"), cfg)
    if not parts: raise ValueError("refusing to delete MCP_ROOT")
    root_fd = safepath.open_root(root)
    try:
        parent, name = safepath.open_parent(root_fd, parts)
        try:
            st = safepath.stat_at(parent, name)
            if st is None: raise ValueError("path does not exist")
            if stat.S_ISDIR(st.st_mode):
                if args.get("recursive"):
                    safepath.delete_tree_at(parent, name)
                else:
                    os.rmdir(name, dir_fd=parent)
            elif stat.S_ISREG(st.st_mode) or stat.S_ISLNK(st.st_mode):
                os.unlink(name, dir_fd=parent)
            else: raise ValueError("unsupported path type")
        finally: os.close(parent)
    except safepath.UnsafePathError as exc:
        raise ValueError(str(exc)) from exc
    except FileNotFoundError as exc:
        raise ValueError("path does not exist") from exc
    finally: os.close(root_fd)
    return {"path": path, "deleted": True}

def tool_move_path(args, cfg):
    """Move/rename an entry with source and destination parents pinned."""
    root, src_parts, src_path = safepath.path_parts(args.get("src") or args.get("path"), cfg)
    root2, dst_parts, dst_path = safepath.path_parts(args.get("dest"), cfg)
    if root != root2: raise ValueError("source and destination roots differ")
    if not src_parts or not dst_parts: raise ValueError("cannot move MCP_ROOT")
    root_fd = safepath.open_root(root)
    try:
        src_parent, src_name = safepath.open_parent(root_fd, src_parts)
        try:
            st = safepath.stat_at(src_parent, src_name)
            if st is None: raise ValueError("source does not exist")
            dst_parent, dst_name = safepath.open_parent(root_fd, dst_parts)
            try:
                # Rename operates on the directory entries themselves. A
                # symlink is moved as a symlink, never dereferenced.
                os.rename(src_name, dst_name, src_dir_fd=src_parent, dst_dir_fd=dst_parent)
            finally: os.close(dst_parent)
        finally: os.close(src_parent)
    except safepath.UnsafePathError as exc:
        raise ValueError(str(exc)) from exc
    except FileNotFoundError as exc:
        raise ValueError("source or destination parent does not exist") from exc
    finally: os.close(root_fd)
    return {"src": src_path, "dest": dst_path}
