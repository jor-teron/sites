"""Opt-in RAG ingestion, persistence and retrieval primitives."""
from .chunk import TextChunk, chunk_text
from .extract import ExtractionError, extract_text
from .ingest import IngestedDocument, ingest_document
from .store import RAGStore
from .embeddings import EmbeddingProvider, cosine_similarity
from .providers import EmbeddingProviderRegistry, ProviderDescriptor, create_default_registry
from .config import RAGConfig, RAGDisabledError, RAGRuntime
from .application import initialize_application_runtime

__all__ = [
    "TextChunk", "chunk_text", "ExtractionError", "extract_text",
    "IngestedDocument", "ingest_document", "RAGStore",
    "EmbeddingProvider", "cosine_similarity", "EmbeddingProviderRegistry",
    "ProviderDescriptor", "create_default_registry", "RAGConfig",
    "RAGDisabledError", "RAGRuntime", "initialize_application_runtime",
]
