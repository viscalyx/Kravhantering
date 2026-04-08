#!/bin/bash
set -e

# Start Ollama server in the background
ollama serve &

# Wait for Ollama to be ready (use ollama CLI — curl is not
# installed in the ollama/ollama image)
echo "Waiting for Ollama to start..."
until ollama list > /dev/null 2>&1; do
  sleep 1
done
echo "Ollama is ready."

# Auto-pull Qwen3 models if not already present
MODELS=("qwen3:1.7b" "qwen3:8b" "qwen3:14b")
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
