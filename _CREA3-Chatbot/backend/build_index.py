"""CLI utility to (re)build the vector knowledge base.

Replaces the previous Streamlit-based `start.py`. Runs the same pipeline:
  1. Ingest the legal JSON corpus from `data/`.
  2. Initialize the embedding model.
  3. Build the unified index (Single ReAct Agent) and the sharded
     per-country indices (Multi-Agent Supervisor).

Usage:
    python build_index.py [--data-dir data/] [--vector-root vector_store]

Requires the relevant provider API key in the environment/.env if the
embedding model needs one (local sentence-transformers models do not).
"""

import argparse
import os
import sys

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from dotenv import load_dotenv

from src.core.config_manager import AppConfig
from src.core.data_ingestion import LegalContentIngestor, EmbeddingFactory
from src.engines.vector_ops import VectorArchivist


def main() -> int:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Build the CREA3 vector knowledge base.")
    parser.add_argument("--data-dir", default="data/", help="Path to the legal JSON corpus")
    parser.add_argument("--vector-root", default=None, help="Output root for FAISS indices")
    args = parser.parse_args()

    cfg = AppConfig()
    cfg.source_corpus_paths = [args.data_dir]
    if args.vector_root:
        cfg.vector_db_root_path = args.vector_root
    # Honour the same embedding configuration the API uses, so a Mistral rebuild
    # (EMBEDDING_BACKEND=mistral, EMBEDDING_MODEL=mistral-embed) is picked up here.
    cfg.embedding_backend = os.getenv("EMBEDDING_BACKEND", cfg.embedding_backend)
    cfg.embedding_model_path = os.getenv("EMBEDDING_MODEL", cfg.embedding_model_path)
    print(f"      Embeddings: backend={cfg.embedding_backend} model={cfg.embedding_model_path}")

    print(f"[1/3] Ingesting legal corpus from: {cfg.source_corpus_paths} ...")
    raw_docs = LegalContentIngestor.ingest_corpus(cfg.source_corpus_paths)
    if not raw_docs:
        print("ERROR: no documents found. Check the data directory path.", file=sys.stderr)
        return 1
    print(f"      Ingested {len(raw_docs)} documents.")

    print("[2/3] Initializing embedding model ...")
    embedder = EmbeddingFactory.create_embedding_model(cfg)

    print("[3/3] Building vector indices ...")
    # A. Unified index (Single ReAct Agent)
    VectorArchivist.create_unified_index(
        raw_docs, embedder, os.path.join(cfg.vector_db_root_path, "merged_legal_index")
    )
    # B. Sharded per-country indices (Multi-Agent Supervisor)
    shards = VectorArchivist.build_sharded_indices(
        raw_docs, embedder, cfg.vector_db_root_path
    )

    print(f"Done. Knowledge base ready with {len(shards) + 1} vector indices "
          f"in '{cfg.vector_db_root_path}'.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
