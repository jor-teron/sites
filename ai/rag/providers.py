"""Explicit embedding-provider registry and provider construction boundary.

Providers are registered by application code. Importing this module loads no
model, SDK, credentials, network connection, or optional dependency.
"""
from __future__ import annotations

from dataclasses import dataclass

from .embeddings import EmbeddingProvider, validate_identity


@dataclass(frozen=True)
class ProviderDescriptor:
    """Public, non-secret description of one registered provider/model pair."""

    provider_id: str
    model_id: str
    description: str = ""


class EmbeddingProviderRegistry:
    """Small explicit registry; it never discovers or imports plugins implicitly.

    Register a factory for a specific provider/model pair, then request that
    exact pair. The factory is called only by create and must return an
    EmbeddingProvider whose identity matches the registration.
    """

    def __init__(self):
        self._factories = {}

    @staticmethod
    def _validate_identifier(value, field):
        if (not isinstance(value, str) or not value.strip()
                or len(value) > 128
                or any(ord(char) < 32 for char in value)):
            raise ValueError("%s must be a non-empty string of at most 128 characters" % field)
        return value.strip()

    def register(self, provider_id, model_id, factory, description=""):
        provider_id = self._validate_identifier(provider_id, "provider_id")
        model_id = self._validate_identifier(model_id, "model_id")
        if not callable(factory):
            raise TypeError("factory must be callable")
        if not isinstance(description, str) or len(description) > 512:
            raise ValueError("description must be a string of at most 512 characters")
        key = (provider_id, model_id)
        if key in self._factories:
            raise ValueError("embedding provider/model is already registered")
        self._factories[key] = (factory, description)
        return ProviderDescriptor(provider_id, model_id, description)

    def list(self):
        """Return registered provider/model metadata without constructing models."""
        return tuple(
            ProviderDescriptor(provider_id, model_id, description)
            for (provider_id, model_id), (_, description)
            in sorted(self._factories.items())
        )

    def create(self, provider_id, model_id):
        """Construct the exact registered provider/model pair."""
        provider_id = self._validate_identifier(provider_id, "provider_id")
        model_id = self._validate_identifier(model_id, "model_id")
        entry = self._factories.get((provider_id, model_id))
        if entry is None:
            raise LookupError(
                "embedding provider/model is not registered: %s/%s"
                % (provider_id, model_id)
            )
        provider = entry[0]()
        actual = validate_identity(provider)
        if actual != (provider_id, model_id):
            raise ValueError(
                "provider factory identity mismatch: expected %s/%s, received %s/%s"
                % (provider_id, model_id, actual[0], actual[1])
            )
        return provider


def create_default_registry():
    """Return the built-in registry without importing the optional model SDK."""
    from .local_embeddings import (
        DEFAULT_MODEL_ID, LocalSentenceTransformerProvider,
    )

    registry = EmbeddingProviderRegistry()
    registry.register(
        "local", DEFAULT_MODEL_ID,
        lambda: LocalSentenceTransformerProvider(model_id=DEFAULT_MODEL_ID),
        "Local Sentence Transformers model; optional dependency",
    )
    return registry
