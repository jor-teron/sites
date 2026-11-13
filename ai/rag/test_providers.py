"""Tests for explicit embedding-provider registration and construction."""
import unittest

from rag.embeddings import EmbeddingProvider
from rag.providers import EmbeddingProviderRegistry, create_default_registry


class FakeProvider(EmbeddingProvider):
    def __init__(self, provider_id="test", model_id="tiny-v1"):
        self._provider_id = provider_id
        self._model_id = model_id

    @property
    def provider_id(self):
        return self._provider_id

    @property
    def model_id(self):
        return self._model_id

    def embed(self, texts):
        return [[1.0, 0.0] for _ in texts]


class ProviderRegistryTests(unittest.TestCase):
    def test_default_registry_lists_local_model_without_loading_sdk(self):
        registry = create_default_registry()
        descriptors = registry.list()
        self.assertEqual(len(descriptors), 1)
        self.assertEqual(descriptors[0].provider_id, "local")
        self.assertEqual(
            descriptors[0].model_id,
            "sentence-transformers/all-MiniLM-L6-v2",
        )

    def test_register_list_and_create_exact_provider(self):
        registry = EmbeddingProviderRegistry()
        descriptor = registry.register(
            "local", "tiny-v1", lambda: FakeProvider("local"), "Test-only provider"
        )
        self.assertEqual(descriptor.provider_id, "local")
        self.assertEqual(
            [(item.provider_id, item.model_id) for item in registry.list()],
            [("local", "tiny-v1")],
        )
        provider = registry.create("local", "tiny-v1")
        self.assertEqual((provider.provider_id, provider.model_id), ("local", "tiny-v1"))

    def test_factory_identity_must_match_registration(self):
        registry = EmbeddingProviderRegistry()
        registry.register("local", "tiny-v1", lambda: FakeProvider())
        with self.assertRaisesRegex(ValueError, "identity mismatch"):
            registry.create("local", "tiny-v1")

    def test_default_registry_constructs_lazy_local_provider(self):
        from rag.local_embeddings import LocalSentenceTransformerProvider
        registry = create_default_registry()
        provider = registry.create(
            "local", "sentence-transformers/all-MiniLM-L6-v2"
        )
        self.assertIsInstance(provider, LocalSentenceTransformerProvider)
        self.assertIsNone(provider._model)

    def test_unknown_provider_model_is_not_loaded(self):
        registry = EmbeddingProviderRegistry()
        with self.assertRaisesRegex(LookupError, "not registered"):
            registry.create("local", "missing")

    def test_registration_rejects_invalid_or_duplicate_entries(self):
        registry = EmbeddingProviderRegistry()
        with self.assertRaises(TypeError):
            registry.register("local", "tiny-v1", object())
        registry.register("local", "tiny-v1", lambda: FakeProvider("local"))
        with self.assertRaisesRegex(ValueError, "already registered"):
            registry.register("local", "tiny-v1", lambda: FakeProvider("local"))

    def test_factory_must_return_embedding_provider(self):
        registry = EmbeddingProviderRegistry()
        registry.register("local", "tiny-v1", lambda: object())
        with self.assertRaises(TypeError):
            registry.create("local", "tiny-v1")


if __name__ == "__main__":
    unittest.main()
