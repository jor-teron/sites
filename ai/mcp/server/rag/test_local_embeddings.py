'''Tests for the optional local Sentence Transformers adapter.'''
import sys
import types
import unittest
from unittest.mock import Mock, patch

from rag.local_embeddings import DEFAULT_MODEL_ID, LocalSentenceTransformerProvider


class LocalEmbeddingProviderTests(unittest.TestCase):
    def test_identity_and_lazy_loading(self):
        provider = LocalSentenceTransformerProvider()
        self.assertEqual(provider.provider_id, "local")
        self.assertEqual(provider.model_id, DEFAULT_MODEL_ID)
        self.assertIsNone(provider._model)

    def test_empty_batch_does_not_load_optional_dependency(self):
        provider = LocalSentenceTransformerProvider()
        with patch.dict(sys.modules, {"sentence_transformers": None}):
            self.assertEqual(provider.embed([]), [])
        self.assertIsNone(provider._model)

    def test_missing_optional_dependency_has_install_instructions(self):
        provider = LocalSentenceTransformerProvider()
        with patch.dict(sys.modules, {"sentence_transformers": None}):
            with self.assertRaisesRegex(RuntimeError, "requirements-embeddings.txt"):
                provider.embed(["hello"])

    def test_loads_model_once_and_normalizes_embeddings(self):
        model = Mock()
        model.encode.return_value = [[1.0, 0.0], [0.0, 1.0]]
        sentence_transformers = types.ModuleType("sentence_transformers")
        sentence_transformers.SentenceTransformer = Mock(return_value=model)
        provider = LocalSentenceTransformerProvider(batch_size=8, device="cpu")
        with patch.dict(sys.modules, {"sentence_transformers": sentence_transformers}):
            first = provider.embed(["one", "two"])
            second = provider.embed(["three"])
        self.assertEqual(first, [[1.0, 0.0], [0.0, 1.0]])
        self.assertEqual(second, [[1.0, 0.0], [0.0, 1.0]])
        sentence_transformers.SentenceTransformer.assert_called_once_with(
            DEFAULT_MODEL_ID, device="cpu", local_files_only=False,
            trust_remote_code=False
        )
        self.assertEqual(model.encode.call_count, 2)
        self.assertTrue(model.encode.call_args.kwargs["normalize_embeddings"])

    def test_model_load_failure_is_actionable(self):
        sentence_transformers = types.ModuleType("sentence_transformers")
        sentence_transformers.SentenceTransformer = Mock(side_effect=OSError("offline"))
        provider = LocalSentenceTransformerProvider(local_files_only=True)
        with patch.dict(sys.modules, {"sentence_transformers": sentence_transformers}):
            with self.assertRaisesRegex(RuntimeError, "could not load local embedding model"):
                provider.embed(["hello"])

    def test_rejects_bad_inputs_and_options(self):
        with self.assertRaises(ValueError):
            LocalSentenceTransformerProvider(model_id="unknown")
        with self.assertRaises(ValueError):
            LocalSentenceTransformerProvider(batch_size=0)
        with self.assertRaises(TypeError):
            LocalSentenceTransformerProvider(local_files_only=1)
        provider = LocalSentenceTransformerProvider()
        with self.assertRaises(TypeError):
            provider.embed("not a list")
        with self.assertRaises(TypeError):
            provider.embed(["valid", 42])


if __name__ == "__main__":
    unittest.main()
