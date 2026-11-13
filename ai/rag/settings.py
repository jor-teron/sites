"""Atomic, secret-free persistence for optional RAG feature settings."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from .config import RAGConfig


def default_settings_path(environ=None):
    env = os.environ if environ is None else environ
    explicit = env.get("AI_RAG_CONFIG_PATH")
    if explicit and explicit.strip():
        return os.path.abspath(os.path.expanduser(explicit.strip()))
    home = env.get("HOME") or str(Path.home())
    return os.path.join(home, ".config", "ai-mcp", "rag.json")


def config_to_dict(config):
    if not isinstance(config, RAGConfig):
        raise TypeError("config must be a RAGConfig instance")
    return {
        "enabled": config.enabled,
        "embeddings_enabled": config.embeddings_enabled,
        "embedding_provider": config.embedding_provider,
        "embedding_model": config.embedding_model,
    }


def config_from_dict(value):
    if not isinstance(value, dict):
        raise ValueError("RAG settings must be a JSON object")
    allowed = {"enabled", "embeddings_enabled", "embedding_provider", "embedding_model"}
    unknown = set(value) - allowed
    if unknown:
        raise ValueError("unknown RAG setting(s): %s" % ", ".join(sorted(unknown)))
    return RAGConfig(
        enabled=value.get("enabled", False),
        embeddings_enabled=value.get("embeddings_enabled", False),
        embedding_provider=value.get("embedding_provider"),
        embedding_model=value.get("embedding_model"),
    )


def load_effective_settings(environ=None):
    """Prefer persisted settings; read environment defaults only when no file exists."""
    env = os.environ if environ is None else environ
    path = default_settings_path(env)
    if os.path.exists(path):
        return load_settings(path)
    return RAGConfig.from_env(env)


def load_settings(path, fallback=None):
    """Load a validated settings file, or return fallback when it does not exist."""
    if not os.path.exists(path):
        return fallback if fallback is not None else RAGConfig()
    try:
        with open(path, "r", encoding="utf-8") as handle:
            value = json.load(handle)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("could not read RAG settings: %s" % exc) from exc
    return config_from_dict(value)


def save_settings(path, config):
    """Write validated settings atomically with owner-only file permissions."""
    payload = json.dumps(config_to_dict(config), indent=2, sort_keys=True) + "\n"
    target = os.path.abspath(os.path.expanduser(path))
    directory = os.path.dirname(target)
    os.makedirs(directory, mode=0o700, exist_ok=True)
    try:
        os.chmod(directory, 0o700)
    except OSError:
        pass
    fd, temporary = tempfile.mkstemp(prefix=".rag-settings-", dir=directory, text=True)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
        try:
            os.chmod(target, 0o600)
        except OSError:
            pass
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise
    return config
