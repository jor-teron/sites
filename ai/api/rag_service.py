"""HTTP-facing operations for the optional keyword and hybrid RAG runtime."""
from __future__ import annotations

import os

from rag.config import RAGConfig, RAGDisabledError
from storage import StorageError
from rag.providers import create_default_registry
from rag.application import initialize_application_runtime
from rag.settings import default_settings_path, load_effective_settings, save_settings, config_to_dict


def status(runtime):
    return {
        "enabled": bool(runtime and runtime.enabled),
        "embeddings_enabled": bool(runtime and runtime.embeddings_enabled),
        "keyword_search": bool(runtime and runtime.enabled),
        "semantic_search": bool(runtime and runtime.enabled and runtime.embeddings_enabled),
        "hybrid_search": bool(runtime and runtime.enabled),
    }



def get_settings(environ=None, runtime=None):
    env = os.environ if environ is None else environ
    config = load_effective_settings(env)
    active = config_to_dict(runtime.config) if runtime is not None else config_to_dict(RAGConfig())
    return {
        "settings": config_to_dict(config),
        "persisted": os.path.exists(default_settings_path(env)),
        "active_settings": active,
        "api_restart_required": active != config_to_dict(config),
    }


def apply_settings(server):
    """Build a candidate runtime, then atomically swap the API's active reference."""
    runtime, database = initialize_application_runtime()
    server.rag_runtime = runtime
    server.rag_database = database
    return {
        "applied": True,
        "active_settings": config_to_dict(runtime.config),
        "runtime": status(runtime),
        "mcp_restart_required": True,
        "message": "API runtime applied. Restart the MCP process separately to apply its settings.",
    }


def put_settings(value, environ=None):
    env = os.environ if environ is None else environ
    from rag.settings import config_from_dict
    config = config_from_dict(value)
    save_settings(default_settings_path(env), config)
    return {"settings": config_to_dict(config), "persisted": True, "restart_required": True}


def _require(runtime):
    if runtime is None or not runtime.enabled:
        raise RAGDisabledError("RAG is disabled; set AI_RAG_ENABLED=true to enable it")
    return runtime


def list_documents(runtime, limit=50, offset=0):
    runtime = _require(runtime)
    total = runtime.count_documents()
    documents = runtime.list_documents(limit=limit, offset=offset)
    return {
        "documents": documents,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": total,
            "returned": len(documents),
            "has_more": offset + len(documents) < total,
        },
    }


def get_document(runtime, document_id):
    document = _require(runtime).get(document_id)
    if document is None:
        raise KeyError("document not found")
    return document


def search(runtime, query, limit=10, offset=0, source=None,
           deduplicate=False, snippet_chars=240, mode="keyword",
           keyword_weight=0.5, semantic_weight=0.5):
    runtime = _require(runtime)
    if mode not in ("keyword", "hybrid"):
        raise ValueError("mode must be keyword or hybrid")
    # Fetch one extra row to report whether another page exists.
    if mode == "keyword":
        results = runtime.search(
            query, limit=limit + 1, offset=offset, source=source,
            deduplicate=deduplicate, snippet_chars=snippet_chars,
        )
    else:
        if offset + limit > 49:
            raise ValueError("hybrid search supports offset plus limit up to 49")
        provider = None
        if runtime.embeddings_enabled and runtime.config.embedding_provider:
            provider = runtime.create_embedding_provider(create_default_registry())
        results = runtime.search_hybrid(
            query, provider=provider, limit=limit + 1, offset=offset,
            source=source, deduplicate=deduplicate,
            snippet_chars=snippet_chars, keyword_weight=keyword_weight,
            semantic_weight=semantic_weight,
        )
    has_more = len(results) > limit
    return {
        "results": results[:limit],
        "pagination": {
            "limit": limit,
            "offset": offset,
            "returned": min(len(results), limit),
            "has_more": has_more,
        },
    }


def ingest(runtime, source, content, content_type=None, title=None):
    document = _require(runtime).ingest(
        source, content, content_type=content_type, title=title
    )
    return document.metadata


def delete_document(runtime, document_id):
    return _require(runtime).delete(document_id)


__all__ = [
    "RAGDisabledError", "StorageError", "status", "get_settings", "put_settings",
    "apply_settings", "list_documents",
    "get_document", "search", "ingest", "delete_document",
]
