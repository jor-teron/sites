"""Explicit feature switches and lifecycle boundary for optional RAG modules.

Importing this module reads no environment variables and initializes no
storage. Call ``RAGConfig.from_env`` and ``RAGRuntime.create`` explicitly.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from storage import Database, StorageError

from .store import RAGStore
from .ingest import ingest_document


class RAGDisabledError(RuntimeError):
    """Raised when a caller uses a feature that is switched off."""


def _parse_bool(value, name):
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in ("1", "true", "yes", "on", "enabled"):
        return True
    if normalized in ("0", "false", "no", "off", "disabled", ""):
        return False
    raise ValueError("%s must be a boolean (true/false, 1/0, yes/no, on/off)" % name)


@dataclass(frozen=True)
class RAGConfig:
    """Validated feature switches; both modules are disabled by default."""

    enabled: bool = False
    embeddings_enabled: bool = False
    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None

    def __post_init__(self):
        enabled = _parse_bool(self.enabled, "AI_RAG_ENABLED")
        embeddings = _parse_bool(self.embeddings_enabled, "AI_RAG_EMBEDDINGS_ENABLED")
        if embeddings and not enabled:
            raise ValueError("AI_RAG_EMBEDDINGS_ENABLED requires AI_RAG_ENABLED")
        provider = self._optional_identifier(
            self.embedding_provider, "AI_RAG_EMBEDDING_PROVIDER"
        )
        model = self._optional_identifier(
            self.embedding_model, "AI_RAG_EMBEDDING_MODEL"
        )
        if (provider is None) != (model is None):
            raise ValueError(
                "AI_RAG_EMBEDDING_PROVIDER and AI_RAG_EMBEDDING_MODEL must be set together"
            )
        if provider is not None and not embeddings:
            raise ValueError(
                "embedding provider/model selection requires AI_RAG_EMBEDDINGS_ENABLED"
            )
        object.__setattr__(self, "enabled", enabled)
        object.__setattr__(self, "embeddings_enabled", embeddings)
        object.__setattr__(self, "embedding_provider", provider)
        object.__setattr__(self, "embedding_model", model)

    @staticmethod
    def _optional_identifier(value, name):
        if value is None or value == "":
            return None
        if (not isinstance(value, str) or not value.strip() or len(value) > 128
                or any(ord(char) < 32 for char in value)):
            raise ValueError("%s must be a non-empty string of at most 128 characters" % name)
        return value.strip()

    @classmethod
    def from_env(cls, environ=None):
        """Read feature switches only when explicitly requested by the caller."""
        env = os.environ if environ is None else environ
        return cls(
            enabled=_parse_bool(env.get("AI_RAG_ENABLED", "false"), "AI_RAG_ENABLED"),
            embeddings_enabled=_parse_bool(
                env.get("AI_RAG_EMBEDDINGS_ENABLED", "false"),
                "AI_RAG_EMBEDDINGS_ENABLED",
            ),
            embedding_provider=env.get("AI_RAG_EMBEDDING_PROVIDER") or None,
            embedding_model=env.get("AI_RAG_EMBEDDING_MODEL") or None,
        )


class RAGRuntime:
    """Application-level gate for optional RAG and embedding functionality.

    The runtime never creates or initializes a database. When RAG is disabled,
    a supplied database is ignored and no RAGStore is constructed. When enabled,
    callers must supply an already initialized Database. Embedding methods
    additionally require the embedding switch and an explicit provider.
    """

    def __init__(self, config, store=None):
        if not isinstance(config, RAGConfig):
            raise TypeError("config must be a RAGConfig instance")
        if config.enabled and not isinstance(store, RAGStore):
            raise TypeError("enabled RAG runtime requires a RAGStore")
        if not config.enabled and store is not None:
            raise ValueError("disabled RAG runtime must not have a store")
        self.config = config
        self._store = store

    @classmethod
    def create(cls, config, database=None):
        """Create an inactive runtime or bind an explicitly initialized DB."""
        if not isinstance(config, RAGConfig):
            raise TypeError("config must be a RAGConfig instance")
        if not config.enabled:
            return cls(config)
        if not isinstance(database, Database):
            raise TypeError("enabled RAG requires an explicit storage.Database")
        if not database.initialized:
            raise StorageError("storage is not initialized; call initialize() explicitly")
        return cls(config, RAGStore(database))

    @property
    def enabled(self):
        return self.config.enabled

    @property
    def embeddings_enabled(self):
        return self.config.embeddings_enabled

    def _require_rag(self):
        if not self.enabled:
            raise RAGDisabledError("RAG is disabled; set AI_RAG_ENABLED=true to enable it")
        return self._store

    def _require_embeddings(self):
        store = self._require_rag()
        if not self.embeddings_enabled:
            raise RAGDisabledError(
                "embeddings are disabled; set AI_RAG_EMBEDDINGS_ENABLED=true to enable them"
            )
        return store

    def initialize_search(self):
        return self._require_rag().initialize_search()

    def ingest(self, source, content, **kwargs):
        """Ingest and persist one document when the RAG module is enabled."""
        store = self._require_rag()
        document = ingest_document(source, content, **kwargs)
        store.save(document)
        return document

    def save(self, document):
        return self._require_rag().save(document)

    def get(self, document_id):
        return self._require_rag().get(document_id)

    def list_documents(self, limit=None, offset=0):
        return self._require_rag().list_documents(limit=limit, offset=offset)

    def count_documents(self):
        return self._require_rag().count_documents()

    def find_by_content_hash(self, content_sha256):
        return self._require_rag().find_by_content_hash(content_sha256)

    def delete(self, document_id):
        return self._require_rag().delete(document_id)

    def search(self, query, limit=10, **kwargs):
        return self._require_rag().search(query, limit=limit, **kwargs)

    def create_embedding_provider(self, registry):
        """Construct the configured provider from an explicitly supplied registry."""
        self._require_embeddings()
        if self.config.embedding_provider is None:
            raise RAGDisabledError(
                "no embedding provider/model is configured"
            )
        from .providers import EmbeddingProviderRegistry
        if not isinstance(registry, EmbeddingProviderRegistry):
            raise TypeError("registry must be an EmbeddingProviderRegistry")
        return registry.create(
            self.config.embedding_provider, self.config.embedding_model
        )

    def index_embeddings(self, document_id, provider):
        return self._require_embeddings().index_embeddings(document_id, provider)

    def embedding_status(self, provider):
        return self._require_embeddings().embedding_status(provider)

    def index_all_embeddings(self, provider, *, force=False):
        return self._require_embeddings().index_all_embeddings(provider, force=force)

    def search_hybrid(self, query, provider=None, limit=10, **kwargs):
        store = self._require_rag()
        if not self.embeddings_enabled:
            provider = None
        return store.search_hybrid(query, provider, limit=limit, **kwargs)

    def search_semantic(self, query, provider, limit=10, **kwargs):
        return self._require_embeddings().search_semantic(
            query, provider, limit=limit, **kwargs
        )
