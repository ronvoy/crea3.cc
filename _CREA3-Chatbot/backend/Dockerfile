# syntax=docker/dockerfile:1.4
FROM python:3.11-slim

WORKDIR /app

# System deps (optional but helps some libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Network resilience: large wheels over a slow or flaky link used to abort the
# whole build with "Connection broken: BrokenPipeError". Retry and be patient
# instead of failing on the first hiccup.
ENV PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt .
# The pip cache is kept in a build cache mount, so a retry resumes from what was
# already downloaded instead of starting the multi-hundred-MB pull from zero.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# Optional local-AI stack (torch / transformers / sentence-transformers), only
# needed for EMBEDDING_BACKEND=huggingface:
#   docker build --build-arg WITH_LOCAL_AI=1 .
# torch comes from the CPU index — ~200 MB instead of the ~900 MB CUDA wheel.
ARG WITH_LOCAL_AI=0
COPY requirements-local-ai.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ "$WITH_LOCAL_AI" = "1" ]; then \
      pip install --index-url https://download.pytorch.org/whl/cpu torch==2.9.1 && \
      pip install -r requirements-local-ai.txt; \
    else \
      echo "Skipping the optional local-AI stack (WITH_LOCAL_AI=0)."; \
    fi

COPY . .

# Default (can be overridden in .env / docker-compose)
ENV API_HOST=0.0.0.0
ENV API_PORT=8094

EXPOSE 8094

CMD ["sh", "-c", "uvicorn main:app --host ${API_HOST} --port ${API_PORT}"]
