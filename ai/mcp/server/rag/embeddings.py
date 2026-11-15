"""Provider-neutral embedding contracts and vector validation.

This module deliberately contains no provider SDKs, credentials, network calls,
or default embedding implementation. Applications supply a provider explicitly.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
import math


class EmbeddingProvider(ABC):
    """Minimal interface implemented by an embedding service or local model.

    ``provider_id`` identifies the implementation/vendor and ``model_id``
    identifies the exact model/version. ``embed`` accepts a sequence of text
    strings and returns one numeric vector per input, in the same order.
    Implementations should batch efficiently and raise their own clear errors.
    """

    @property
    @abstractmethod
    def provider_id(self):
        """Stable provider identifier, e.g. ``local`` or ``openai``."""

    @property
    @abstractmethod
    def model_id(self):
        """Stable model identifier including a version when available."""

    @abstractmethod
    def embed(self, texts):
        """Return one vector for each input text, preserving input order."""


def validate_identity(provider):
    """Return validated provider/model identifiers from an implementation."""
    if not isinstance(provider, EmbeddingProvider):
        raise TypeError("provider must implement rag.embeddings.EmbeddingProvider")
    identity = []
    for field in ("provider_id", "model_id"):
        value = getattr(provider, field)
        if (not isinstance(value, str) or not value.strip() or len(value) > 128
                or any(ord(char) < 32 for char in value)):
            raise ValueError("provider.%s must be a non-empty string of at most 128 characters" % field)
        identity.append(value.strip())
    return tuple(identity)


def validate_vectors(vectors, expected_count=None):
    """Normalize provider output to finite, non-zero float vectors.

    Dimensions must be consistent within a batch and are bounded to avoid
    accidentally persisting pathological payloads.
    """
    if not isinstance(vectors, (list, tuple)):
        raise TypeError("embedding output must be a list or tuple of vectors")
    if expected_count is not None and len(vectors) != expected_count:
        raise ValueError("embedding provider returned %d vectors for %d inputs" %
                         (len(vectors), expected_count))
    normalized = []
    dimension = None
    for vector in vectors:
        if not isinstance(vector, (list, tuple)) or not vector:
            raise ValueError("each embedding must be a non-empty numeric vector")
        if dimension is None:
            dimension = len(vector)
            if dimension > 8192:
                raise ValueError("embedding dimension must not exceed 8192")
        elif len(vector) != dimension:
            raise ValueError("embedding dimensions must be consistent")
        values = []
        for value in vector:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise TypeError("embedding values must be numeric")
            try:
                number = float(value)
            except (OverflowError, ValueError) as exc:
                raise ValueError("embedding values must be finite numbers") from exc
            if not math.isfinite(number):
                raise ValueError("embedding values must be finite")
            values.append(number)
        if not any(value != 0.0 for value in values):
            raise ValueError("zero-length embeddings cannot be used for cosine similarity")
        normalized.append(values)
    return normalized


def cosine_similarity(left, right):
    """Return cosine similarity in [-1, 1] for validated vectors."""
    if len(left) != len(right):
        raise ValueError("embedding dimensions do not match")
    left_norm = math.hypot(*left)
    right_norm = math.hypot(*right)
    if left_norm == 0.0 or right_norm == 0.0:
        raise ValueError("zero-length embeddings cannot be compared")
    similarity = sum((a / left_norm) * (b / right_norm)
                     for a, b in zip(left, right))
    return max(-1.0, min(1.0, similarity))
