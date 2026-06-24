"""Legal RAG engine (see rag-plan.md).

A pragmatic, dependency-tolerant implementation of the #1–#3 pipelines from the
plan (sparse BM25, dense embeddings + ANN, and hybrid RRF fusion). Everything
degrades gracefully:

    * embeddings  -> sentence-transformers if installed, else an offline hashing
                     vectorizer (no model download required)
    * ANN index   -> FAISS (flat/ivf/hnsw) if installed, else numpy brute-force
    * generation  -> OpenRouter if OPENROUTER_API_KEY is set, else an extractive
                     fallback that stitches the retrieved citations together

This keeps the app runnable out of the box while allowing a drop-in upgrade to
the full stack simply by installing the optional requirements.
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import re
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from ..core.config import settings

# ── Optional heavy deps (loaded lazily / tolerantly) ───────────────────────────
try:  # pragma: no cover - availability depends on environment
    import faiss  # type: ignore

    _HAS_FAISS = True
except Exception:  # noqa: BLE001
    _HAS_FAISS = False

try:  # pragma: no cover
    from rank_bm25 import BM25Okapi  # type: ignore

    _HAS_BM25 = True
except Exception:  # noqa: BLE001
    _HAS_BM25 = False

try:  # pragma: no cover
    from pypdf import PdfReader  # type: ignore

    _HAS_PYPDF = True
except Exception:  # noqa: BLE001
    _HAS_PYPDF = False

# sentence-transformers is the heaviest; only import on demand and cache models.
_ST_MODELS: Dict[str, Any] = {}


# ── Embedding-model registry (drives the frontend dropdowns) ───────────────────
# `st` is the sentence-transformers id; None means the offline hashing backend.
EMBEDDING_MODELS: List[Dict[str, Any]] = [
    {"id": "hashing", "label": "Hashing TF (offline, no download)", "dims": 512, "st": None},
    {"id": "minilm", "label": "all-MiniLM-L6-v2 (fast, 384d)", "dims": 384, "st": "sentence-transformers/all-MiniLM-L6-v2"},
    {"id": "mpnet", "label": "all-mpnet-base-v2 (768d)", "dims": 768, "st": "sentence-transformers/all-mpnet-base-v2"},
    {"id": "bge-small", "label": "BGE-small-en-v1.5 (384d)", "dims": 384, "st": "BAAI/bge-small-en-v1.5"},
    {"id": "bge-m3", "label": "BGE-M3 (multilingual, 1024d)", "dims": 1024, "st": "BAAI/bge-m3"},
]
_MODEL_BY_ID = {m["id"]: m for m in EMBEDDING_MODELS}

PIPELINES = [
    {"id": "bm25", "label": "Sparse lexical (BM25)"},
    {"id": "dense", "label": "Dense embeddings (cosine / ANN)"},
    {"id": "hybrid", "label": "Hybrid (BM25 + dense, RRF fusion)"},
]

INDEX_TYPES = [
    {"id": "flat", "label": "Flat (exact)"},
    {"id": "ivf", "label": "IVF (inverted file, faiss)"},
    {"id": "hnsw", "label": "HNSW (graph, faiss)"},
]

DEFAULT_PARAMS: Dict[str, Any] = {
    "chunk_size": 512,
    "chunk_overlap": 64,
    "top_k": 5,
    "candidate_k": 20,
    "rrf_k": 60,
    "ivf_nlist": 50,
    "hnsw_ef": 64,
}


def available_config() -> Dict[str, Any]:
    """Capabilities + options for the management UI dropdowns."""
    st_ok = _sentence_transformers_available()
    models = []
    for m in EMBEDDING_MODELS:
        models.append(
            {
                "id": m["id"],
                "label": m["label"],
                "dims": m["dims"],
                "available": m["st"] is None or st_ok,
                "kind": "offline" if m["st"] is None else "sentence-transformers",
            }
        )
    index_types = []
    for it in INDEX_TYPES:
        index_types.append({**it, "available": it["id"] == "flat" or _HAS_FAISS})
    return {
        "embedding_models": models,
        "pipelines": PIPELINES,
        "index_types": index_types,
        "default_params": DEFAULT_PARAMS,
        "capabilities": {
            "faiss": _HAS_FAISS,
            "bm25": _HAS_BM25,
            "pypdf": _HAS_PYPDF,
            "sentence_transformers": st_ok,
            "openrouter": bool(settings.openrouter_api_key),
        },
        "openrouter_model": settings.openrouter_model,
        "doc_types": ["statute", "case", "other"],
    }


def _sentence_transformers_available() -> bool:
    try:  # pragma: no cover
        import sentence_transformers  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False


# ── 1. Parsing: source file -> text ────────────────────────────────────────────

def parse_file(filename: str, content_type: str, data: bytes) -> str:
    name = (filename or "").lower()
    ctype = (content_type or "").lower()

    if name.endswith(".pdf") or "pdf" in ctype:
        return _parse_pdf(data)
    if name.endswith(".json") or "json" in ctype:
        return _parse_json(data)
    # default: treat as utf-8 text (txt / md / unknown)
    try:
        return data.decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        return ""


def _parse_pdf(data: bytes) -> str:
    if not _HAS_PYPDF:
        raise RuntimeError("PDF parsing requires 'pypdf' (pip install pypdf).")
    reader = PdfReader(io.BytesIO(data))
    parts: List[str] = []
    for i, page in enumerate(reader.pages):
        try:
            txt = page.extract_text() or ""
        except Exception:  # noqa: BLE001
            txt = ""
        if txt.strip():
            parts.append(txt.strip())
    return "\n\n".join(parts)


def _parse_json(data: bytes) -> str:
    try:
        obj = json.loads(data.decode("utf-8", errors="replace"))
    except Exception:  # noqa: BLE001
        return data.decode("utf-8", errors="replace")

    # Pull human-readable text out of common shapes (string, list, dict).
    def walk(node: Any) -> List[str]:
        out: List[str] = []
        if isinstance(node, str):
            out.append(node)
        elif isinstance(node, (int, float, bool)):
            out.append(str(node))
        elif isinstance(node, list):
            for item in node:
                out.extend(walk(item))
        elif isinstance(node, dict):
            for k, v in node.items():
                sub = walk(v)
                if sub:
                    out.append(f"{k}: " + " ".join(sub) if all(len(s) < 80 for s in sub) else "\n".join(sub))
        return out

    return "\n".join(walk(obj))


# ── 2. Chunking: structure-preserving, header-aware + recursive ────────────────

_HEADER_RE = re.compile(r"^(#{1,6})\s+(.*)$|^(?:Article|Section|Clause|Chapter|Part)\s+[\w.\-]+", re.IGNORECASE)


def chunk_text(text: str, chunk_size: int, overlap: int) -> List[Dict[str, Any]]:
    text = (text or "").strip()
    if not text:
        return []

    # Split into blocks, tracking the most recent heading as a hierarchy hint.
    lines = text.split("\n")
    blocks: List[Tuple[str, str]] = []  # (hierarchy_path, block_text)
    current_heading = ""
    buf: List[str] = []

    def flush():
        if buf:
            blocks.append((current_heading, "\n".join(buf).strip()))
            buf.clear()

    for line in lines:
        m = _HEADER_RE.match(line.strip())
        if m:
            flush()
            current_heading = line.strip().lstrip("#").strip()
        else:
            buf.append(line)
    flush()

    # Recursive size-based split with overlap inside each block.
    chunks: List[Dict[str, Any]] = []
    approx_chars = max(200, chunk_size * 4)  # ~4 chars/token heuristic
    overlap_chars = max(0, overlap * 4)

    for hierarchy, block in blocks:
        if not block:
            continue
        if len(block) <= approx_chars:
            chunks.append({"text": block, "meta": {"hierarchy_path": hierarchy}})
            continue
        start = 0
        while start < len(block):
            end = min(len(block), start + approx_chars)
            # try to break on a sentence boundary
            window = block[start:end]
            last_dot = window.rfind(". ")
            if end < len(block) and last_dot > approx_chars * 0.5:
                end = start + last_dot + 1
                window = block[start:end]
            chunks.append({"text": window.strip(), "meta": {"hierarchy_path": hierarchy}})
            if end >= len(block):
                break
            start = max(end - overlap_chars, start + 1)

    # attach ordinals
    for i, c in enumerate(chunks):
        c["meta"]["ordinal"] = i
    return [c for c in chunks if c["text"]]


# ── 3. Embeddings ──────────────────────────────────────────────────────────────

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokenize(s: str) -> List[str]:
    return _TOKEN_RE.findall((s or "").lower())


def _embed_hashing(texts: List[str], dims: int) -> np.ndarray:
    """Offline hashing term-frequency vectorizer (deterministic, no downloads)."""
    mat = np.zeros((len(texts), dims), dtype=np.float32)
    for i, t in enumerate(texts):
        for tok in _tokenize(t):
            h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
            idx = h % dims
            sign = 1.0 if (h >> 8) % 2 == 0 else -1.0
            mat[i, idx] += sign
    return _l2_normalize(mat)


def _get_st_model(st_id: str):  # pragma: no cover
    from sentence_transformers import SentenceTransformer

    if st_id not in _ST_MODELS:
        _ST_MODELS[st_id] = SentenceTransformer(st_id)
    return _ST_MODELS[st_id]


def embed(model_id: str, texts: List[str]) -> np.ndarray:
    if not texts:
        m = _MODEL_BY_ID.get(model_id) or _MODEL_BY_ID["hashing"]
        return np.zeros((0, m["dims"]), dtype=np.float32)
    spec = _MODEL_BY_ID.get(model_id) or _MODEL_BY_ID["hashing"]
    if spec["st"] is None or not _sentence_transformers_available():
        return _embed_hashing(texts, spec["dims"])
    try:  # pragma: no cover
        model = _get_st_model(spec["st"])
        vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return np.asarray(vecs, dtype=np.float32)
    except Exception:  # noqa: BLE001
        # fall back to offline if the model can't be downloaded/loaded
        return _embed_hashing(texts, spec["dims"])


def _l2_normalize(mat: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return mat / norms


# ── 4. Retrieval ───────────────────────────────────────────────────────────────

def _dense_search(query_vec: np.ndarray, doc_vecs: np.ndarray, index_type: str, params: Dict[str, Any], k: int) -> List[Tuple[int, float]]:
    n = doc_vecs.shape[0]
    if n == 0:
        return []
    k = min(k, n)

    if _HAS_FAISS and index_type in ("ivf", "hnsw") and n >= 4:  # pragma: no cover
        try:
            dim = doc_vecs.shape[1]
            if index_type == "hnsw":
                index = faiss.IndexHNSWFlat(dim, 32)
                index.hnsw.efSearch = int(params.get("hnsw_ef", 64))
            else:
                nlist = max(1, min(int(params.get("ivf_nlist", 50)), n))
                quant = faiss.IndexFlatIP(dim)
                index = faiss.IndexIVFFlat(quant, dim, nlist, faiss.METRIC_INNER_PRODUCT)
                index.train(doc_vecs)
                index.nprobe = min(nlist, 10)
            index.add(doc_vecs)
            scores, idx = index.search(query_vec.reshape(1, -1), k)
            return [(int(i), float(s)) for i, s in zip(idx[0], scores[0]) if i >= 0]
        except Exception:  # noqa: BLE001
            pass

    # numpy brute-force cosine (vectors are L2-normalized -> dot == cosine)
    sims = doc_vecs @ query_vec
    top = np.argsort(-sims)[:k]
    return [(int(i), float(sims[i])) for i in top]


def _bm25_search(query: str, corpus_tokens: List[List[str]], k: int) -> List[Tuple[int, float]]:
    n = len(corpus_tokens)
    if n == 0:
        return []
    q_tokens = _tokenize(query)
    if _HAS_BM25:
        bm25 = BM25Okapi(corpus_tokens)
        scores = bm25.get_scores(q_tokens)
    else:
        # minimal TF-IDF-ish fallback
        df: Dict[str, int] = {}
        for toks in corpus_tokens:
            for w in set(toks):
                df[w] = df.get(w, 0) + 1
        scores = np.zeros(n, dtype=np.float32)
        for i, toks in enumerate(corpus_tokens):
            tf: Dict[str, int] = {}
            for w in toks:
                tf[w] = tf.get(w, 0) + 1
            s = 0.0
            for qw in q_tokens:
                if qw in tf:
                    idf = math.log(1 + n / (1 + df.get(qw, 0)))
                    s += (tf[qw] / (1 + len(toks))) * idf
            scores[i] = s
    order = np.argsort(-np.asarray(scores))[: min(k, n)]
    return [(int(i), float(scores[i])) for i in order if scores[i] > 0]


def _rrf_fuse(rankings: List[List[Tuple[int, float]]], rrf_k: int, k: int) -> List[Tuple[int, float]]:
    fused: Dict[int, float] = {}
    for ranking in rankings:
        for rank, (idx, _score) in enumerate(ranking):
            fused[idx] = fused.get(idx, 0.0) + 1.0 / (rrf_k + rank + 1)
    order = sorted(fused.items(), key=lambda kv: -kv[1])[:k]
    return [(idx, score) for idx, score in order]


def retrieve(
    query: str,
    chunks: List[Dict[str, Any]],
    *,
    model_id: str,
    pipeline: str,
    index_type: str,
    params: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Return ranked chunk dicts with a `score`. Each chunk dict must contain
    `text` and may contain a cached `vector` (list) for the model."""
    if not chunks:
        return []

    top_k = int(params.get("top_k", 5))
    cand_k = max(top_k, int(params.get("candidate_k", 20)))
    texts = [c["text"] for c in chunks]

    dense_hits: List[Tuple[int, float]] = []
    bm25_hits: List[Tuple[int, float]] = []

    if pipeline in ("dense", "hybrid"):
        # use cached vectors when available, embed the rest on the fly
        cached = [c.get("vector") for c in chunks]
        if all(v is not None for v in cached):
            doc_vecs = _l2_normalize(np.asarray(cached, dtype=np.float32))
        else:
            doc_vecs = embed(model_id, texts)
        q_vec = embed(model_id, [query])[0]
        dense_hits = _dense_search(q_vec, doc_vecs, index_type, params, cand_k)

    if pipeline in ("bm25", "hybrid"):
        corpus_tokens = [_tokenize(t) for t in texts]
        bm25_hits = _bm25_search(query, corpus_tokens, cand_k)

    if pipeline == "dense":
        ranked = dense_hits[:top_k]
    elif pipeline == "bm25":
        ranked = bm25_hits[:top_k]
    else:
        ranked = _rrf_fuse([dense_hits, bm25_hits], int(params.get("rrf_k", 60)), top_k)

    results: List[Dict[str, Any]] = []
    for idx, score in ranked:
        c = dict(chunks[idx])
        c["score"] = round(float(score), 4)
        c.pop("vector", None)
        results.append(c)
    return results


# ── 5. Generation (OpenRouter) ─────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are a careful legal research assistant for the CREA3 dispute-resolution "
    "platform. Answer ONLY from the provided context passages. Always cite the "
    "source document and clause/section you relied on, using the bracketed [n] "
    "markers shown with each passage. If the context does not support an answer, "
    "say you couldn't find a supporting provision. Do not invent legal text, and "
    "make clear this is informational, not a substitute for a lawyer."
)


def generate_answer(query: str, contexts: List[Dict[str, Any]], *, mode: str = "auto") -> Dict[str, Any]:
    """Generate an answer from retrieved contexts. Uses OpenRouter when a key is
    configured, otherwise returns an extractive fallback."""
    citations = []
    ctx_lines = []
    for i, c in enumerate(contexts):
        title = c.get("source_doc") or "source"
        path = (c.get("meta") or {}).get("hierarchy_path") or ""
        tag = c.get("doc_type") or ""
        label = f"[{i + 1}] {title}{(' · ' + path) if path else ''}{(' (' + tag + ')') if tag else ''}"
        ctx_lines.append(f"{label}\n{c.get('text','')}")
        citations.append(
            {
                "n": i + 1,
                "source_doc": title,
                "hierarchy_path": path,
                "doc_type": tag,
                "document_id": c.get("document_id"),
                "score": c.get("score"),
            }
        )

    context_block = "\n\n".join(ctx_lines)

    if settings.openrouter_api_key:
        try:
            answer = _openrouter_chat(query, context_block, mode)
            return {"answer": answer, "citations": citations, "generator": "openrouter", "model": settings.openrouter_model}
        except Exception as exc:  # noqa: BLE001
            # fall through to extractive answer, but surface the reason
            fallback = _extractive_answer(query, contexts)
            return {"answer": fallback, "citations": citations, "generator": "fallback", "error": str(exc)}

    return {"answer": _extractive_answer(query, contexts), "citations": citations, "generator": "fallback"}


def _extractive_answer(query: str, contexts: List[Dict[str, Any]]) -> str:
    if not contexts:
        return (
            "I couldn't find a supporting provision in the indexed legal sources for "
            "that question. Try uploading the relevant statute or case file, or "
            "rephrasing. (This is informational, not legal advice.)"
        )
    lines = ["Based on the retrieved sources:"]
    for i, c in enumerate(contexts[:3]):
        snippet = (c.get("text") or "").strip().replace("\n", " ")
        if len(snippet) > 320:
            snippet = snippet[:320] + "…"
        lines.append(f"[{i + 1}] {snippet}")
    lines.append(
        "\n(Generated without an LLM — set OPENROUTER_API_KEY for synthesized "
        "answers. Informational only, not legal advice.)"
    )
    return "\n\n".join(lines)


def _openrouter_chat(query: str, context_block: str, mode: str) -> str:
    import httpx

    user_content = (
        f"Question ({mode}): {query}\n\n"
        f"Context passages:\n{context_block if context_block else '(no passages retrieved)'}"
    )
    payload = {
        "model": settings.openrouter_model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://crea3.eu",
        "X-Title": "CREA3 Legal RAG",
    }
    url = settings.openrouter_base_url.rstrip("/") + "/chat/completions"
    with httpx.Client(timeout=60.0) as client:
        res = client.post(url, json=payload, headers=headers)
    if res.status_code >= 400:
        raise RuntimeError(f"OpenRouter error {res.status_code}: {res.text[:200]}")
    data = res.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("OpenRouter returned no choices")
    return (choices[0].get("message") or {}).get("content") or ""


def general_chat(query: str, *, history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
    """General legal Q&A with no retrieval (used by the public landing widget)."""
    system = (
        "You are a friendly legal information assistant for the CREA3 "
        "dispute-resolution platform. Give clear, general explanations of legal "
        "concepts and the platform's dispute workflow. Always note that this is "
        "general information, not legal advice."
    )
    if not settings.openrouter_api_key:
        return {
            "answer": (
                "The legal assistant isn't fully configured yet (no OPENROUTER_API_KEY). "
                "I can still point you around: CREA3 helps parties resolve disputes "
                "through a structured negotiation workflow (bids/rates), proposals, and "
                "mediation. Ask an administrator to set the API key to enable full answers."
            ),
            "generator": "fallback",
        }
    try:
        import httpx

        messages = [{"role": "system", "content": system}]
        for h in (history or [])[-6:]:
            role = h.get("role") if h.get("role") in ("user", "assistant") else "user"
            messages.append({"role": role, "content": str(h.get("content", ""))})
        messages.append({"role": "user", "content": query})
        payload = {"model": settings.openrouter_model, "messages": messages, "temperature": 0.4}
        headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://crea3.eu",
            "X-Title": "CREA3 Legal RAG",
        }
        url = settings.openrouter_base_url.rstrip("/") + "/chat/completions"
        with httpx.Client(timeout=60.0) as client:
            res = client.post(url, json=payload, headers=headers)
        if res.status_code >= 400:
            raise RuntimeError(f"OpenRouter error {res.status_code}: {res.text[:200]}")
        content = (res.json().get("choices") or [{}])[0].get("message", {}).get("content", "")
        return {"answer": content or "(no response)", "generator": "openrouter", "model": settings.openrouter_model}
    except Exception as exc:  # noqa: BLE001
        return {"answer": f"Sorry, I couldn't reach the model ({exc}).", "generator": "error"}
