"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tool_modules/binary.py
Purpose:      Binary file transfer tools (upload, download, info, chunked).
Version:      4.9
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.

Supports Base64-encoded binary content for images, PDFs, archives, etc.
Preserves exact bytes. Uses temporary files + atomic rename.
Restricted to the configured sandbox root via safepath.
"""
from __future__ import annotations

import base64
import hashlib
import ipaddress
import mimetypes
import os
import socket
import stat
import time
import urllib.error
import urllib.parse
import urllib.request

from .. import safepath
from ..config import MAX_BODY
from .common import check_workspace_space
import secrets

# Maximum binary file size (50 MiB). Larger files should use chunked transfer.
MAX_BINARY_BYTES = 50 * 1024 * 1024

# Temporary prefix for atomic writes.
BINARY_TMP_PREFIX = ".aimcp-bin-"


def _atomic_write_binary(parent_fd, name, data):
    """Atomically write raw bytes to a file in a pinned directory."""
    temp = BINARY_TMP_PREFIX + secrets.token_hex(12)
    fd = None
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0), 0o600, dir_fd=parent_fd)
        with os.fdopen(fd, "wb") as stream:
            fd = None
            stream.write(data)
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


def _is_public_ip(ip_text):
    """Return True only for a globally routable IP."""
    try:
        ip = ipaddress.ip_address(ip_text)
    except ValueError:
        return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _assert_safe_url(url):
    """Reject non-HTTPS and any host that resolves to a non-public IP.

    Raises:
        ValueError: If the URL is not allowed.
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise ValueError("only https URLs are allowed")
    host = parsed.hostname
    if not host:
        raise ValueError("URL has no host")
    # Literal IP in the URL.
    try:
        if not _is_public_ip(host):
            raise ValueError("URL host is not a public address")
        return
    except ValueError as exc:
        if "public address" in str(exc):
            raise
    # Hostname: resolve and reject private results (SSRF).
    try:
        infos = socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("cannot resolve URL host") from exc
    if not infos:
        raise ValueError("cannot resolve URL host")
    for info in infos:
        addr = info[4][0]
        if not _is_public_ip(addr):
            raise ValueError("URL resolves to a non-public address")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuse redirects so a public URL cannot bounce to an internal host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("redirects are not allowed")


def _download_url(url, max_bytes):
    """Stream an HTTPS URL into memory, enforcing max_bytes.

    Redirects are refused (a redirect could point at an internal host).

    Returns:
        tuple[bytes, str]: (data, content-type)
    """
    _assert_safe_url(url)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "ai-mcp-upload/5.4"},
        method="GET",
    )
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=30) as resp:
            ctype = resp.headers.get("Content-Type", "application/octet-stream")
            ctype = ctype.split(";", 1)[0].strip() or "application/octet-stream"
            chunks = []
            total = 0
            while True:
                block = resp.read(64 * 1024)
                if not block:
                    break
                total += len(block)
                if total > max_bytes:
                    raise ValueError("download exceeds %d byte limit" % max_bytes)
                chunks.append(block)
    except urllib.error.HTTPError as exc:
        raise ValueError("download failed: HTTP %s" % exc.code) from exc
    except urllib.error.URLError as exc:
        raise ValueError("download failed: %s" % exc.reason) from exc
    return b"".join(chunks), ctype


def tool_upload_file_from_url(args, cfg):
    """Download an HTTPS URL and save it inside the sandbox.

    Args:
        args (dict): url, path, overwrite, create_parents, max_bytes.
        cfg: Config object.

    Returns:
        dict: path, bytes, sha256, mime, overwritten.

    Raises:
        ValueError: On bad URL, SSRF, size limit, or path errors.
    """
    url = args.get("url")
    path = args.get("path")
    overwrite = bool(args.get("overwrite", False))
    create_parents = bool(args.get("create_parents", False))
    max_bytes = args.get("max_bytes", MAX_BINARY_BYTES)

    if not isinstance(url, str) or not url.strip():
        raise ValueError("url is required")
    try:
        max_bytes = int(max_bytes)
    except (TypeError, ValueError):
        raise ValueError("max_bytes must be an integer")
    if max_bytes < 1 or max_bytes > MAX_BINARY_BYTES:
        raise ValueError("max_bytes must be between 1 and %d" % MAX_BINARY_BYTES)

    data, mime = _download_url(url.strip(), max_bytes)

    root, parts, norm_path = safepath.path_parts(path, cfg)
    if not parts:
        raise ValueError("cannot write MCP_ROOT")

    root_fd = safepath.open_root(root)
    try:
        parent, name = safepath.open_parent(root_fd, parts, create=create_parents)
        try:
            check_workspace_space(norm_path, len(data), cfg, parent_fd=parent)
            existing = safepath.stat_at(parent, name)
            if existing is not None:
                if stat.S_ISLNK(existing.st_mode):
                    raise ValueError("symlink destination refused")
                if not stat.S_ISREG(existing.st_mode):
                    raise ValueError("destination is not a regular file")
                if not overwrite:
                    raise ValueError("file exists and overwrite is false")
            _atomic_write_binary(parent, name, data)
            return {
                "path": norm_path,
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "mime": mime,
                "overwritten": existing is not None,
            }
        finally:
            os.close(parent)
    except safepath.UnsafePathError as exc:
        raise ValueError(str(exc)) from exc
    except FileNotFoundError as exc:
        raise ValueError("parent directory does not exist") from exc
    finally:
        os.close(root_fd)


def tool_upload_file(args, cfg):
    """Upload a binary file from Base64 content.

    Args:
        args (dict): path (str), content (base64 str), overwrite (bool, default False),
                     create_parents (bool, default False).
        cfg: Config object.

    Returns:
        dict: path, bytes, sha256, overwritten (bool).

    Raises:
        ValueError: On invalid input, path issues, size limits, or overwrite refusal.
    """
    path = args.get("path")
    content_b64 = args.get("content")
    overwrite = bool(args.get("overwrite", False))
    create_parents = bool(args.get("create_parents", False))

    if not isinstance(content_b64, str):
        raise ValueError("content must be a base64 string")

    try:
        data = base64.b64decode(content_b64, validate=True)
    except Exception as exc:
        raise ValueError("invalid base64 content") from exc

    if len(data) > MAX_BINARY_BYTES:
        raise ValueError("file exceeds %d byte limit" % MAX_BINARY_BYTES)

    root, parts, norm_path = safepath.path_parts(path, cfg)
    if not parts:
        raise ValueError("cannot write MCP_ROOT")

    root_fd = safepath.open_root(root)
    try:
        parent, name = safepath.open_parent(root_fd, parts, create=create_parents)
        try:
            check_workspace_space(norm_path, len(data), cfg, parent_fd=parent)
            existing = safepath.stat_at(parent, name)
            if existing is not None:
                if stat.S_ISLNK(existing.st_mode):
                    raise ValueError("symlink destination refused")
                if not stat.S_ISREG(existing.st_mode):
                    raise ValueError("destination is not a regular file")
                if not overwrite:
                    raise ValueError("file exists and overwrite is false")

            # Atomic write of raw bytes (binary mode).
            _atomic_write_binary(parent, name, data)
            sha = hashlib.sha256(data).hexdigest()
            return {
                "path": norm_path,
                "bytes": len(data),
                "sha256": sha,
                "overwritten": existing is not None,
            }
        finally:
            os.close(parent)
    except safepath.UnsafePathError as exc:
        raise ValueError(str(exc)) from exc
    except FileNotFoundError as exc:
        raise ValueError("parent directory does not exist") from exc
    finally:
        os.close(root_fd)


def tool_download_file(args, cfg):
    """Download a binary file as Base64.

    Args:
        args (dict): path (str).
        cfg: Config object.

    Returns:
        dict: path, content (base64), bytes, sha256, mime.

    Raises:
        ValueError: On path issues or size limits.
    """
    root, parts, path = safepath.path_parts(args.get("path"), cfg)
    if not parts:
        raise ValueError("not a regular file")

    root_fd = safepath.open_root(root)
    try:
        fd = safepath.open_file(root_fd, parts)
        with os.fdopen(fd, "rb") as raw:
            st = os.fstat(raw.fileno())
            if not stat.S_ISREG(st.st_mode):
                raise ValueError("not a regular file")
            if st.st_size > MAX_BINARY_BYTES:
                raise ValueError("file exceeds %d byte limit" % MAX_BINARY_BYTES)
            data = raw.read()
            if len(data) != st.st_size:
                raise ValueError("short read")
            sha = hashlib.sha256(data).hexdigest()
            mime, _ = mimetypes.guess_type(path)
            return {
                "path": path,
                "content": base64.b64encode(data).decode("ascii"),
                "bytes": len(data),
                "sha256": sha,
                "mime": mime or "application/octet-stream",
            }
    except safepath.UnsafePathError as exc:
        raise ValueError(str(exc)) from exc
    except FileNotFoundError as exc:
        raise ValueError("path does not exist") from exc
    finally:
        os.close(root_fd)


def tool_get_file_info(args, cfg):
    """Return metadata for a file without transferring content.

    Args:
        args (dict): path (str).
        cfg: Config object.

    Returns:
        dict: path, size, mime, sha256, mtime.
    """
    root, parts, path = safepath.path_parts(args.get("path"), cfg)
    if not parts:
        raise ValueError("not a regular file")

    root_fd = safepath.open_root(root)
    try:
        fd = safepath.open_file(root_fd, parts)
        with os.fdopen(fd, "rb") as raw:
            st = os.fstat(raw.fileno())
            if not stat.S_ISREG(st.st_mode):
                raise ValueError("not a regular file")
            # Compute SHA-256 without loading the whole file if large.
            h = hashlib.sha256()
            while True:
                chunk = raw.read(1024 * 1024)
                if not chunk:
                    break
                h.update(chunk)
            mime, _ = mimetypes.guess_type(path)
            return {
                "path": path,
                "size": st.st_size,
                "mime": mime or "application/octet-stream",
                "sha256": h.hexdigest(),
                "mtime": int(st.st_mtime),
            }
    except safepath.UnsafePathError as exc:
        raise ValueError(str(exc)) from exc
    except FileNotFoundError as exc:
        raise ValueError("path does not exist") from exc
    finally:
        os.close(root_fd)


# =============================================================================
# Chunked transfer (v4.9)
# =============================================================================

# In-memory store for incomplete chunked uploads.
# upload_id -> {path, total, chunks, overwrite, create_parents, created}
_UPLOADS = {}

# Max chunk size (4 MiB).
MAX_CHUNK_BYTES = 4 * 1024 * 1024

# Drop abandoned uploads older than this (seconds).
UPLOAD_TTL = 3600


def _cleanup_uploads():
    """Remove uploads older than UPLOAD_TTL."""
    now = time.time()
    expired = [uid for uid, e in _UPLOADS.items() if now - e.get("created", now) > UPLOAD_TTL]
    for uid in expired:
        _UPLOADS.pop(uid, None)


def tool_upload_chunk(args, cfg):
    """Upload one chunk of a large file.

    Args:
        args: upload_id (str), chunk_index (int), total_chunks (int),
              content (base64), path (str, required on first chunk),
              overwrite (bool).
        cfg: Config.

    Returns:
        dict: status, received, complete (bool), and on complete: path, bytes, sha256.
    """
    upload_id = args.get("upload_id")
    if not upload_id or not isinstance(upload_id, str):
        raise ValueError("upload_id required")
    try:
        idx = int(args.get("chunk_index", -1))
        total = int(args.get("total_chunks", 0))
    except (TypeError, ValueError):
        raise ValueError("chunk_index and total_chunks must be integers")
    if idx < 0 or total < 1 or idx >= total:
        raise ValueError("invalid chunk_index or total_chunks")

    content_b64 = args.get("content")
    if not isinstance(content_b64, str):
        raise ValueError("content must be base64")
    try:
        data = base64.b64decode(content_b64, validate=True)
    except Exception as exc:
        raise ValueError("invalid base64") from exc
    if len(data) > MAX_CHUNK_BYTES:
        raise ValueError("chunk exceeds %d bytes" % MAX_CHUNK_BYTES)

    _cleanup_uploads()
    if upload_id not in _UPLOADS:
        path = args.get("path")
        if not path:
            raise ValueError("path required for first chunk of a new upload_id")
        _UPLOADS[upload_id] = {
            "path": path,
            "total": total,
            "chunks": {},
            "overwrite": bool(args.get("overwrite", False)),
            "create_parents": bool(args.get("create_parents", False)),
            "created": time.time(),
        }
    entry = _UPLOADS[upload_id]
    if entry["total"] != total:
        raise ValueError("total_chunks mismatch")
    entry["chunks"][idx] = data

    if len(entry["chunks"]) < total:
        return {"upload_id": upload_id, "received": len(entry["chunks"]), "complete": False}

    # All chunks present — reassemble in order.
    full = b"".join(entry["chunks"][i] for i in range(total))
    if len(full) > MAX_BINARY_BYTES * 4:
        del _UPLOADS[upload_id]
        raise ValueError("reassembled file too large")

    # Reuse upload_file logic for the final write.
    result = tool_upload_file({
        "path": entry["path"],
        "content": base64.b64encode(full).decode("ascii"),
        "overwrite": entry["overwrite"],
        "create_parents": entry["create_parents"],
    }, cfg)
    del _UPLOADS[upload_id]
    result["upload_id"] = upload_id
    result["complete"] = True
    return result


def tool_download_chunk(args, cfg):
    """Download one chunk of a file.

    Args:
        args: path (str), chunk_index (int), chunk_size (int, optional).
        cfg: Config.

    Returns:
        dict: path, chunk_index, total_chunks, content (base64), bytes.
    """
    root, parts, path = safepath.path_parts(args.get("path"), cfg)
    if not parts:
        raise ValueError("not a regular file")
    try:
        idx = int(args.get("chunk_index", 0))
        chunk_size = int(args.get("chunk_size", MAX_CHUNK_BYTES))
    except (TypeError, ValueError):
        raise ValueError("chunk_index and chunk_size must be integers")
    chunk_size = max(1, min(chunk_size, MAX_CHUNK_BYTES))

    root_fd = safepath.open_root(root)
    try:
        fd = safepath.open_file(root_fd, parts)
        with os.fdopen(fd, "rb") as raw:
            st = os.fstat(raw.fileno())
            if not stat.S_ISREG(st.st_mode):
                raise ValueError("not a regular file")
            total_chunks = (st.st_size + chunk_size - 1) // chunk_size
            if idx < 0 or idx >= total_chunks:
                raise ValueError("chunk_index out of range")
            raw.seek(idx * chunk_size)
            data = raw.read(chunk_size)
            return {
                "path": path,
                "chunk_index": idx,
                "total_chunks": total_chunks,
                "content": base64.b64encode(data).decode("ascii"),
                "bytes": len(data),
                "file_size": st.st_size,
            }
    except safepath.UnsafePathError as exc:
        raise ValueError(str(exc)) from exc
    except FileNotFoundError as exc:
        raise ValueError("path does not exist") from exc
    finally:
        os.close(root_fd)


def tool_upload_status(args, cfg):
    """Report progress of an in-progress chunked upload.

    Args:
        args: upload_id (str).
        cfg: Config (unused).

    Returns:
        dict: upload_id, received, total, complete, path, age_seconds.
    """
    _cleanup_uploads()
    upload_id = args.get("upload_id")
    if not upload_id or upload_id not in _UPLOADS:
        raise ValueError("unknown or expired upload_id")
    entry = _UPLOADS[upload_id]
    return {
        "upload_id": upload_id,
        "path": entry["path"],
        "received": len(entry["chunks"]),
        "total": entry["total"],
        "complete": len(entry["chunks"]) >= entry["total"],
        "age_seconds": int(time.time() - entry.get("created", time.time())),
    }
