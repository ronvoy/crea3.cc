"""FastAPI backend for CREA3.

Changes in this version:
- Returns retrieved contexts + retrieved file list.
- Returns a *safe* execution trace (no private chain-of-thought).
- Port is configured via environment variable (API_PORT) for Docker/Compose.

Security note:
We intentionally do NOT return raw model chain-of-thought. The returned "trace" is an
execution/provenance log suitable for debugging and UI transparency.
"""

import os
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.core.config_manager import AppConfig
from src.engines.query_router import QueryOrchestrator


load_dotenv()  # loads .env if present

# --- Hard requirement: the selected chat provider must have its key at runtime.
# (Do NOT commit real keys in the repository.)
_LLM_STACK = os.getenv("LLM_TECH_STACK", "mistral").lower()
_STACK_KEY = {
    "mistral": "MISTRAL_API_KEY",
    "openai": "OPENAI_API_KEY",
    "groq": "GROQ_API_KEY",
}.get(_LLM_STACK)
if _STACK_KEY and not os.getenv(_STACK_KEY):
    raise ValueError(
        f"No API key for LLM_TECH_STACK='{_LLM_STACK}'. Set {_STACK_KEY} in the environment/.env."
    )
# Retrieval embeddings need their own key when the OpenAI-compatible backend is
# used (default). This is used ONLY to embed the query — never to generate answers.
_EMBED_BACKEND = os.getenv("EMBEDDING_BACKEND", "openai").lower()
if _EMBED_BACKEND == "openai" and not os.getenv("OPENAI_API_KEY"):
    raise ValueError(
        "EMBEDDING_BACKEND=openai requires OPENAI_API_KEY (retrieval embeddings only). "
        "Set it, or switch to Mistral embeddings (EMBEDDING_BACKEND=mistral) after rebuilding the indices."
    )


# -------------------------
# FastAPI App
# -------------------------
app = FastAPI(title="CREA3 LexAI API", version="2.0")


@app.get("/health")
def health() -> Dict[str, Any]:
    """Liveness/readiness probe used by run_chatbot.sh and _CREA3x."""
    return {
        "status": "ok",
        "provider": os.getenv("LLM_TECH_STACK", "mistral"),
        "model": os.getenv("LLM_MODEL", "ministral-8b-latest"),
        "embeddings": os.getenv("EMBEDDING_BACKEND", "openai"),
    }


# -------------------------
# Config (initialized once)
# -------------------------
config = AppConfig()
config.llm_model_name = os.getenv("LLM_MODEL", "ministral-8b-latest")
config.llm_temperature = float(os.getenv("LLM_TEMPERATURE", "0.0"))
config.retrieval_top_k = int(os.getenv("RETRIEVAL_TOP_K", "4"))
config.llm_tech_stack = os.getenv("LLM_TECH_STACK", "mistral")
config.system_mode = os.getenv("SYSTEM_MODE", "supervisor_agent")
# Retrieval embeddings (independent of the chat model). Defaults to OpenAI
# text-embedding-3-small to match the prebuilt 1536-dim FAISS indices.
config.embedding_backend = os.getenv("EMBEDDING_BACKEND", "openai")
config.embedding_model_path = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
# Bound answer length so streamed replies complete promptly (helps them finish
# within a reverse-proxy/tunnel request cap). Raise for longer answers.
config.llm_max_tokens = int(os.getenv("LLM_MAX_TOKENS", "1400"))

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
config.vector_db_root_path = os.getenv("VECTOR_DB_ROOT") or os.path.join(BASE_DIR, "vector_store")


# -------------------------
# Request/Response models
# -------------------------
class QueryRequest(BaseModel):
    question: str = Field(..., description="User question")
    include_sources: bool = Field(True, description="Include retrieved contexts and files")
    include_trace: bool = Field(True, description="Include execution trace")


def _serialize_docs(docs: List[Any]) -> List[Dict[str, Any]]:
    """Make LangChain Document objects JSON-serializable."""
    out: List[Dict[str, Any]] = []
    for i, doc in enumerate(docs or []):
        meta = getattr(doc, "metadata", {}) or {}
        out.append(
            {
                "id": i + 1,
                "page_content": getattr(doc, "page_content", "") or "",
                "metadata": meta,
            }
        )
    return out


def _summarize_files(serialized_contexts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Aggregate retrieved contexts by file (filename/source)."""
    buckets: Dict[str, Dict[str, Any]] = {}

    for ctx in serialized_contexts:
        meta = ctx.get("metadata") or {}
        filename = meta.get("filename") or os.path.basename(str(meta.get("source", ""))) or "Unknown"
        key = f"{meta.get('country','')}/{filename}"

        if key not in buckets:
            buckets[key] = {
                "country": meta.get("country"),
                "legal_domain": meta.get("legal_domain"),
                "filename": filename,
                "source": meta.get("source"),
                "chunks": 0,
                "sample_excerpt": "",
            }

        buckets[key]["chunks"] += 1

        # Save a short excerpt for preview
        if not buckets[key]["sample_excerpt"]:
            text = (ctx.get("page_content") or "").strip()
            buckets[key]["sample_excerpt"] = text[:240] + ("…" if len(text) > 240 else "")

    # Stable ordering: country then filename
    return sorted(buckets.values(), key=lambda x: (str(x.get("country") or ""), str(x.get("filename") or "")))


def _safe_trace(
    *,
    mode: str,
    latency_ms: int,
    session_id: Optional[str],
    accept_language: Optional[str],
    source_count: int,
    raw_engine_trace: Optional[str],
) -> Dict[str, Any]:
    """Create a safe, UI-friendly trace.

    We intentionally avoid returning private model chain-of-thought.
    If the engine returns verbose logs, we sanitize them.
    """

    trace: Dict[str, Any] = {
        "mode": mode,
        "latency_ms": latency_ms,
        "session_id": session_id,
        "accept_language": accept_language,
        "retrieved_context_count": source_count,
    }

    if raw_engine_trace:
        # Sanitize: drop any lines that look like chain-of-thought.
        cleaned_lines: List[str] = []
        for line in raw_engine_trace.splitlines():
            low = line.strip().lower()
            if low.startswith("**thought") or low.startswith("thought"):
                continue
            cleaned_lines.append(line)

        cleaned = "\n".join(cleaned_lines).strip()
        # Keep size bounded
        max_chars = int(os.getenv("TRACE_MAX_CHARS", "12000"))
        if len(cleaned) > max_chars:
            cleaned = cleaned[:max_chars] + "\n…(truncated)"

        trace["log"] = cleaned

    return trace


@app.post("/chat")
async def chat(request: QueryRequest, http_request: Request):
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    # Optional headers for correlation
    session_id = http_request.headers.get("X-Session-ID")
    accept_language = http_request.headers.get("Accept-Language")

    try:
        t0 = time.time()

        # We enable engine trace only if asked.
        response_text, source_docs, engine_trace = QueryOrchestrator.dispatch_request(
            user_query=request.question,
            settings=config,
            trace_reasoning=bool(request.include_trace),
        )

        latency_ms = int((time.time() - t0) * 1000)

        payload: Dict[str, Any] = {
            "answer": response_text,
        }

        if request.include_sources:
            contexts = _serialize_docs(source_docs)
            payload["retrieved_contexts"] = contexts
            payload["retrieved_files"] = _summarize_files(contexts)
        else:
            payload["retrieved_contexts"] = []
            payload["retrieved_files"] = []

        if request.include_trace:
            payload["trace"] = _safe_trace(
                mode=config.system_mode,
                latency_ms=latency_ms,
                session_id=session_id,
                accept_language=accept_language,
                source_count=len(payload.get("retrieved_contexts") or []),
                raw_engine_trace=engine_trace,
            )
        else:
            payload["trace"] = None

        return payload

    except Exception as e:
        print("[API Error]", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Streaming RAG endpoint (fast first token; used by _CREA3x as the primary).
#
# The multi-step agents (react/supervisor) make several LLM calls before the
# final answer, so first-token latency is high. For the streaming path we do a
# DIRECT naive RAG: one retrieval over the merged index, then stream the Mistral
# answer token-by-token. This keeps the connection continuously fed (so tunnels
# don't drop it) and shows progressive output.
# =============================================================================

_RAG_SYSTEM = (
    "You are CREA3 LexAI, a precise legal assistant for EU family- and "
    "inheritance-law questions across Italy, Estonia, Slovenia, Belgium, Croatia "
    "and Lithuania. Answer using the CONTEXT below when it is relevant, citing the "
    "country and article. If the context is insufficient, use general legal "
    "knowledge and say so briefly. "
    "Be CONCISE and get to the point: prefer compact tables/lists with only the "
    "essential rows, avoid long preambles and repetition, and finish within a few "
    "hundred words so the answer completes quickly."
)


def _retrieve_context(query: str, k: int) -> str:
    """Retrieve top-k chunks from the merged index and format them as context."""
    from src.core.data_ingestion import EmbeddingFactory
    from src.engines.vector_ops import VectorArchivist

    path = os.path.join(config.vector_db_root_path, "merged_legal_index")
    if not os.path.exists(path):
        return ""
    embedder = EmbeddingFactory.create_embedding_model(config)
    vs = VectorArchivist.load_index(path, embedder)
    if vs is None:
        return ""
    try:
        docs = vs.similarity_search(query, k=k)
    except Exception as exc:  # retrieval must never hard-fail the answer
        print("[chat/stream] retrieval error:", repr(exc))
        return ""
    blocks = []
    for d in docs:
        meta = getattr(d, "metadata", {}) or {}
        tag = meta.get("country") or meta.get("source_country") or "?"
        blocks.append(f"[{tag}] {getattr(d, 'page_content', '')[:1200]}")
    return "\n\n".join(blocks)


class StreamRequest(BaseModel):
    question: str = Field(..., description="User question")
    lang: Optional[str] = Field(None, description="Preferred answer language (ISO code)")


@app.post("/chat/stream")
def chat_stream(request: StreamRequest):
    from src.core.llm_factory import LLMFactory
    from langchain_core.messages import SystemMessage, HumanMessage

    q = (request.question or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    context = _retrieve_context(q, int(config.retrieval_top_k))
    lang_note = f"\n\nAnswer in this language: {request.lang}." if request.lang else ""
    llm = LLMFactory.create_llm(config)
    messages = [
        SystemMessage(content=_RAG_SYSTEM),
        HumanMessage(content=f"CONTEXT:\n{context or '(no documents retrieved)'}\n\nQUESTION: {q}{lang_note}"),
    ]

    def generate():
        try:
            for chunk in llm.stream(messages):
                text = getattr(chunk, "content", "") or ""
                if text:
                    yield text
        except Exception as exc:
            print("[chat/stream] generation error:", repr(exc))
            # Surface as stream content so the caller can decide to fall back.
            yield ""

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")
