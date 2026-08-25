FROM python:3.11-slim

WORKDIR /app

# System deps (optional but helps some libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default (can be overridden in .env / docker-compose)
ENV API_HOST=0.0.0.0
ENV API_PORT=8094

EXPOSE 8094

CMD ["sh", "-c", "uvicorn main:app --host ${API_HOST} --port ${API_PORT}"]
