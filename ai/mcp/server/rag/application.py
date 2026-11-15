"""Explicit startup integration for the optional RAG application module.

This helper is called by a server entry point, never at import time. RAG is
inert by default. Enabling it requires an explicitly configured storage path;
only then is the database initialized. No embedding provider is selected.
"""
from __future__ import annotations

import os

from rag.config import RAGRuntime
from rag.settings import load_effective_settings
from storage import StorageConfig, StorageError


def initialize_application_runtime(environ=None):
    """Return ``(runtime, database)`` for a server process.

    Disabled RAG returns an inactive runtime and ``None`` without reading
    storage settings or creating any files. Enabled RAG requires
    ``AI_STORAGE_PATH`` and explicitly initializes that database.
    """
    config = load_effective_settings(environ)
    env = os.environ if environ is None else environ
    if not config.enabled:
        return RAGRuntime.create(config), None

    storage_config = StorageConfig.from_env(environ)
    if not storage_config.enabled:
        raise ValueError(
            "AI_RAG_ENABLED requires AI_STORAGE_PATH to select the RAG database"
        )
    database = storage_config.database().initialize()
    runtime = RAGRuntime.create(config, database)
    return runtime, database
