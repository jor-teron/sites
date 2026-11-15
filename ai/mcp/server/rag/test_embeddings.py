"""Tests for the provider-neutral embedding interface and vector math."""
import math
import unittest

from rag.embeddings import (
    EmbeddingProvider, cosine_similarity, validate_identity, validate_vectors,
)


class TinyProvider(EmbeddingProvider):
    @property
    def provider_id(self):
        return "test"

    @property
    def model_id(self):
        return "tiny-v1"

    def embed(self, texts):
        vectors = []
        for text in texts:
            value = text.lower()
            if "garden" in value or "plants" in value:
                vectors.append([0.0, 1.0, 0.0])
            else:
                vectors.append([1.0, 0.0, 0.0])
        return vectors


class EmbeddingContractTests(unittest.TestCase):
    def test_provider_contract_and_identity(self):
        provider = TinyProvider()
        self.assertEqual(validate_identity(provider), ("test", "tiny-v1"))
        self.assertEqual(provider.embed(["network"]), [[1.0, 0.0, 0.0]])

    def test_provider_must_implement_interface(self):
        with self.assertRaises(TypeError):
            validate_identity(object())

    def test_vector_validation_normalizes_numeric_values(self):
        self.assertEqual(validate_vectors([[1, 2.5]], 1), [[1.0, 2.5]])

    def test_vector_validation_rejects_wrong_count(self):
        with self.assertRaises(ValueError):
            validate_vectors([[1.0, 2.0]], expected_count=2)

    def test_vector_validation_rejects_mixed_dimensions(self):
        with self.assertRaises(ValueError):
            validate_vectors([[1.0, 2.0], [1.0]])

    def test_vector_validation_rejects_non_finite_and_zero_values(self):
        for vector in ([[float("nan")]], [[float("inf")]], [[0.0, 0.0]]):
            with self.subTest(vector=vector):
                with self.assertRaises(ValueError):
                    validate_vectors(vector)

    def test_vector_validation_rejects_boolean_and_non_numeric_values(self):
        with self.assertRaises(TypeError):
            validate_vectors([[True]])
        with self.assertRaises(TypeError):
            validate_vectors([["1"]])

    def test_cosine_similarity(self):
        self.assertAlmostEqual(cosine_similarity([1, 0], [2, 0]), 1.0)
        self.assertAlmostEqual(cosine_similarity([1, 0], [0, 1]), 0.0)
        self.assertAlmostEqual(cosine_similarity([1, 0], [-1, 0]), -1.0)

    def test_cosine_similarity_handles_large_finite_values(self):
        self.assertAlmostEqual(
            cosine_similarity([1e308, 0.0], [1e308, 0.0]), 1.0
        )

    def test_cosine_similarity_rejects_dimension_mismatch(self):
        with self.assertRaises(ValueError):
            cosine_similarity([1.0], [1.0, 2.0])


if __name__ == "__main__":
    unittest.main()
