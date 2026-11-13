'''Optional local Sentence Transformers embedding provider.

The optional sentence-transformers package and model are loaded only when
embed() is first called. Importing this module never imports that dependency
or downloads a model.
'''
from __future__ import annotations

import threading

from .embeddings import EmbeddingProvider

DEFAULT_MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"


class LocalSentenceTransformerProvider(EmbeddingProvider):
    """Generate embeddings locally with the optional Sentence Transformers SDK."""

    def __init__(self, model_id=DEFAULT_MODEL_ID, *, device=None, batch_size=32,
                 cache_folder=None, local_files_only=False):
        if model_id != DEFAULT_MODEL_ID:
            raise ValueError("unsupported local embedding model: %s" % model_id)
        if device is not None and (
                not isinstance(device, str) or not device.strip() or len(device) > 64):
            raise ValueError("device must be a non-empty string of at most 64 characters")
        if (not isinstance(batch_size, int) or isinstance(batch_size, bool)
                or not 1 <= batch_size <= 256):
            raise ValueError("batch_size must be an integer between 1 and 256")
        if cache_folder is not None and (
                not isinstance(cache_folder, str) or not cache_folder.strip()):
            raise ValueError("cache_folder must be a non-empty path when supplied")
        if not isinstance(local_files_only, bool):
            raise TypeError("local_files_only must be a boolean")
        self._model_id = model_id
        self._device = device.strip() if device else None
        self._batch_size = batch_size
        self._cache_folder = cache_folder
        self._local_files_only = local_files_only
        self._model = None
        self._load_lock = threading.Lock()

    @property
    def provider_id(self):
        return "local"

    @property
    def model_id(self):
        return self._model_id

    def _load_model(self):
        if self._model is not None:
            return self._model
        with self._load_lock:
            if self._model is not None:
                return self._model
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as exc:
                raise RuntimeError(
                    "local embeddings require the optional dependency; install "
                    "with: python3 -m pip install -r rag/requirements-embeddings.txt"
                ) from exc
            options = {
                "device": self._device,
                "cache_folder": self._cache_folder,
                "local_files_only": self._local_files_only,
                "trust_remote_code": False,
            }
            options = {key: value for key, value in options.items() if value is not None}
            try:
                self._model = SentenceTransformer(self._model_id, **options)
            except Exception as exc:
                raise RuntimeError(
                    "could not load local embedding model %s: %s" % (self._model_id, exc)
                ) from exc
            return self._model

    def embed(self, texts):
        if not isinstance(texts, (list, tuple)):
            raise TypeError("texts must be a list or tuple of strings")
        if any(not isinstance(text, str) for text in texts):
            raise TypeError("every embedding input must be a string")
        if not texts:
            return []
        model = self._load_model()
        try:
            vectors = model.encode(
                list(texts), batch_size=self._batch_size, show_progress_bar=False,
                convert_to_numpy=True, normalize_embeddings=True,
            )
            if hasattr(vectors, "tolist"):
                vectors = vectors.tolist()
            return vectors
        except Exception as exc:
            raise RuntimeError("local embedding generation failed: %s" % exc) from exc
