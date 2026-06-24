# Legal RAG Chatbot — Implementation Plan

A practical, build-ready plan for a legal Retrieval-Augmented Generation chatbot with a web frontend. Optimized for a FastAPI backend + Vue/React frontend, with hybrid retrieval and reranking as the target architecture.

---

## 0. Core principle

> **Never index raw PDF/TXT for legal data.** Legal text lives and dies on structure — article/clause numbers, cross-references, definitions, schedules. That structure is your **citation backbone**. Normalize everything into a structure-preserving intermediate (Markdown) wrapped in a metadata envelope (JSON) *before* you chunk and index.

A legal bot without verifiable citations is a liability, not a feature.

---

## 1. Data format strategy

The question isn't "JSON vs TXT vs HTML" — it's a normalization pipeline where each format plays a role.

| Rank | Format | Role | Why | Watch out |
|------|--------|------|-----|-----------|
| 1 | **JSON** | Final indexed store | One object per chunk + rich metadata (`article_no`, `section`, `jurisdiction`, `date`, `source_doc`, `hierarchy_path`) → metadata filtering + clean citations | Garbage metadata in, garbage out |
| 2 | **Markdown** | Chunking intermediate | Heading hierarchy (`#`, `##`) maps directly to header-aware splitting; human-readable; keeps tables | Loses fine layout (footnotes, multi-column) |
| 3 | **HTML** | Source (web law) | Semantic tags (`<h2>`, `<li>`, `<table>`) preserve structure | Noisy boilerplate; needs cleaning |
| 4 | **DOCX** | Source (drafted docs) | `python-docx`/mammoth → structure via styles/headings | Inconsistent author styling breaks heading detection |
| 5 | **PDF** | Most common source | The reality of legal data; extraction is the hard part | Multi-column, scanned (OCR), mangled tables |
| 6 | **TXT** | **Avoid** | Zero structure → no clause boundaries, no citations | Don't index legal text as flat TXT |

**Canonical ingestion flow:**

```
PDF / DOCX / HTML
      │  layout-aware parse (Docling / PyMuPDF4LLM / Unstructured)
      ▼
Markdown (structure-preserving)
      │  header-aware + recursive split, parent-child
      ▼
Chunks
      │  attach metadata
      ▼
JSON  { "text": "<md chunk>", "metadata": { ... } }
      │  embed
      ▼
Vector + sparse index
```

---

## 2. The five indexing + similarity pipelines (chronological)

| # | Era | Pipeline | Indexing technique | Similarity / scoring | Stack | Legal strength | Weakness |
|---|-----|----------|-------------------|---------------------|-------|---------------|----------|
| 1 | ~1994 | **Sparse lexical (BM25 / TF-IDF)** | Inverted index | BM25 term weighting (exact tokens) | OpenSearch/Elasticsearch, `rank_bm25`, Tantivy | Nails exact statute names, citations, defined terms | No semantics — misses paraphrase |
| 2 | 2019–20 | **Dense embeddings + ANN** | Vector index (Flat / IVF / **HNSW**) | Cosine / dot-product | FAISS, Qdrant, Weaviate, Milvus + BGE-M3 / E5 / Legal-BERT | Captures intent & paraphrase | Misses exact terms; hallucination-prone if chunks poor |
| 3 | 2021 | **Hybrid (sparse + dense fusion)** | BM25 index **+** vector index in parallel | **RRF** or weighted score fusion | Qdrant/Weaviate/Milvus native hybrid, OpenSearch hybrid | Exact-match *and* semantic — best default | Two indices; fusion weights need tuning |
| 4 | 2020–22 | **Hybrid + cross-encoder rerank** | Stage 1 hybrid top-k → Stage 2 rerank | Cross-encoder relevance (query×doc jointly) | + `bge-reranker-v2-m3`, ms-marco MiniLM, Cohere/Jina Rerank | Big precision jump — wrong clause = wrong advice | Added latency/cost |
| 5 | 2020 / 2024 | **Late-interaction (ColBERT) / GraphRAG** | Multi-vector token index **or** knowledge graph of clauses/cases/cross-refs | MaxSim late interaction **or** graph traversal + vector | RAGatouille/ColBERTv2, PLAID; or LlamaIndex/Neo4j | Token-level match + follows cross-references | Heaviest to build/operate |

---

## 3. Recommended architecture (what to actually deploy)

Target the **#3 → #4** sweet spot: ship hybrid first, add reranking once the base is solid.

| Layer | Choice | Note |
|-------|--------|------|
| Parse | Docling or PyMuPDF4LLM → Markdown | Layout-aware, free, good tables |
| Chunk | Header-aware + recursive, ~512 tokens, 10–15% overlap, **parent-child** | Retrieve small, feed parent context to LLM |
| Embed | **BGE-M3** (multilingual; dense + sparse in one) | One model gives hybrid for free |
| Index | **Qdrant** (native hybrid + metadata filters) | Filter by jurisdiction/date at query time |
| Rerank | `bge-reranker-v2-m3` over top-20 → top-5 | Add after base hybrid works |
| Generate | LLM with citation-forcing prompt | Must cite `source_doc` + `article_no` |
| Serve | FastAPI `/query` → Vue/React chat UI, token streaming | Always return citations |

---

## 4. Non-negotiables for *legal*

1. **Always surface citations** to the source clause. Every answer maps back to a verifiable provision.
2. **Metadata filtering matters as much as similarity.** Retrieving a *repealed* or wrong-jurisdiction provision is worse than retrieving nothing. Filter by `jurisdiction`, `effective_date`, `document_type` *before* similarity.
3. **Date awareness.** Tag effective/repeal dates; never present superseded law as current.
4. **Refusal over hallucination.** If retrieval confidence is low, the bot says "I couldn't find a supporting provision" — it does not improvise legal text.
5. **No legal-advice framing.** Surface sources and summaries; make clear it is not a substitute for a lawyer.

---

## 5. Chunk JSON schema (reference)

```json
{
  "id": "uuid",
  "text": "## Section 12. Liability of directors\n...",
  "metadata": {
    "source_doc": "Companies Act 2063.pdf",
    "jurisdiction": "NP",
    "document_type": "statute",
    "hierarchy_path": "Part III > Chapter 2 > Section 12",
    "article_no": "12",
    "section": "12",
    "effective_date": "2007-08-03",
    "repeal_date": null,
    "parent_id": "uuid-of-parent-chunk",
    "lang": "en"
  }
}
```

---

## 6. Build phases

| Phase | Goal | Deliverable | Pipeline level |
|-------|------|-------------|----------------|
| P0 | Ingestion | Parse → Markdown → JSON chunks with metadata | — |
| P1 | Baseline retrieval | BM25 + dense, evaluate separately | #1, #2 |
| P2 | Hybrid | RRF fusion, metadata filters wired | #3 |
| P3 | Precision | Add cross-encoder reranker | #4 |
| P4 | Generation + UI | FastAPI `/query`, streaming Vue/React chat, citation panel | — |
| P5 | Evaluation | Gold legal Q&A set; measure recall@k, MRR, citation accuracy, faithfulness | — |
| P6 (optional) | Cross-reference chasing | GraphRAG / ColBERT only if corpus is heavily interlinked | #5 |

---

## 7. Evaluation (don't skip)

Wire pipelines #1–#4 behind one common interface and **benchmark on your own legal Q&A set** — the best embedder/reranker for a given jurisdiction and language is empirical, not a default.

Metrics to track:
- **Retrieval:** Recall@k, MRR, nDCG
- **Citation accuracy:** % of answers whose cited clause actually supports the claim
- **Faithfulness / groundedness:** answer fully supported by retrieved context (RAGAS-style)
- **Refusal correctness:** does it decline when nothing relevant is retrieved?
- **Latency:** end-to-end p95, with and without reranker

---

## 8. When to reach for #5

Skip late-interaction / GraphRAG unless cross-reference chasing ("subject to the provisions of clause 7.2", "notwithstanding section 4") is a **core** requirement. The build and storage cost only pays off when the corpus is densely interlinked — common in contracts and codified statutes, less so in scattered case summaries.

---

## 9. Frontend (web) notes

- **Chat endpoint:** `POST /query` → streamed tokens (SSE or chunked) so the UI feels responsive.
- **Citations panel:** render each cited clause as a clickable card (`source_doc` + `hierarchy_path`) that opens the source text — this is the trust layer.
- **Filters in UI:** expose jurisdiction / date / document-type as user-facing filters mapped straight to Qdrant metadata filters.
- **Confidence signal:** show retrieval/rerank score or a low-confidence banner so users know when to verify manually.