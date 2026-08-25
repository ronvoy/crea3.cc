# Legal RAG System (API-only): Italy, Estonia, Slovenia

## Project Overview
This project implements a **Retrieval-Augmented Generation (RAG)** system applied to the domain of Civil Law, focusing on **Italy, Estonia, and Slovenia**. It is exposed as a **headless FastAPI service** (no user interface): clients interact with it via the `POST /chat` endpoint.

Two architectural strategies handle multi-jurisdictional legal queries:

1.  **Task A: Single ReAct Agent** - A monolithic agent that uses reasoning (Thought/Action/Observation) to decide when to retrieve information from a unified legal corpus.
2.  **Task B: Multi-Agent Supervisor** - A hierarchical architecture where a Supervisor Agent routes queries to specialized sub-agents (e.g., "Italy Agent", "Estonia Agent") based on the jurisdiction. Selected via `SYSTEM_MODE=supervisor_agent`.

## Repository Structure

├── data/                  # Legal Corpora (Italy, Estonia, Slovenia + Belgium, Croatia, Lithuania)
├── logs/                  # Interaction logs for audit & evaluation
├── vector_store/          # Pre-built FAISS indices (unified + per-country shards)
├── src/                   # Core Application Logic
│   ├── core/              # Config, Data Ingestion, LLM Factory, Guardrails, Session Logger
│   ├── engines/           # RAG Logic (ReAct, Supervisor, Query Router, Vector Ops)
│   └── metrics/           # Evaluation utilities
├── main.py                # FastAPI entry point (POST /chat)
├── build_index.py         # CLI to (re)build the vector knowledge base
├── Dockerfile             # Container configuration
├── requirements.txt       # Python dependencies
└── .env                   # API Keys (not included in repo)

## Running

```bash
# 1. Configure keys
cp ../.env.example ../.env   # then set OPENAI_API_KEY or GROQ_API_KEY

# 2. (Optional) rebuild the vector indices from data/
python build_index.py

# 3. Start the API
uvicorn main:app --host 0.0.0.0 --port 8094
# or, from the repository root:
docker compose up --build
```

## API

`POST /chat`

```json
{
  "question": "...",
  "include_sources": true,
  "include_trace": true
}
```

Response: `answer`, `retrieved_contexts`, `retrieved_files`, `trace` (safe execution/provenance log, no chain-of-thought).
