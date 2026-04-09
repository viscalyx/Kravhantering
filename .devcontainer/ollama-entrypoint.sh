#!/bin/bash
set -e

# Start Ollama server in the background
ollama serve &

# Wait for Ollama to be ready with a timeout (use ollama CLI — curl is not
# installed in the ollama/ollama image)
MAX_RETRIES="${OLLAMA_START_TIMEOUT:-30}"
ATTEMPT=0
echo "Waiting for Ollama to start (timeout: ${MAX_RETRIES}s)..."
until ollama list > /dev/null 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge "$MAX_RETRIES" ]; then
    echo "ERROR: Ollama failed to start after ${MAX_RETRIES} seconds/attempts" >&2
    exit 1
  fi
  sleep 1
done
echo "Ollama is ready."

# Pull models — respect OLLAMA_MODEL env var when set
if [ -n "${OLLAMA_MODEL:-}" ] && [ "${OLLAMA_MODEL}" != "none" ]; then
  MODELS=("${OLLAMA_MODEL}")
else
  MODELS=("qwen3:1.7b" "qwen3:8b" "qwen3:14b")
fi

for MODEL in "${MODELS[@]}"; do
  if ! ollama list | grep -q "^${MODEL}"; then
    echo "Pulling model ${MODEL} (this may take several minutes)..."
    ollama pull "${MODEL}"
    echo "Model ${MODEL} pulled successfully."
  else
    echo "Model ${MODEL} already available."
  fi
done

# Keep the container alive by waiting on the background Ollama process
wait
