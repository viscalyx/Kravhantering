#!/usr/bin/env bash
set -euo pipefail

PORT=3000
PIDS=()

usage() {
  local code=${1:-0}
  cat <<EOF
Usage: $0 [--port PORT] [--pid PID]...

Options:
  --port PORT    Find and kill processes listening on PORT (default 3000)
  --pid PID      Kill the specified PID (can be used multiple times)
  -h, --help     Show this help
EOF
  exit "$code"
}

if [ "$#" -eq 0 ]; then
  : # use defaults
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      if [ -z "${2-}" ]; then
        echo "Missing value for --port" >&2
        exit 2
      fi
      PORT="$2"
      shift 2
      ;;
    --pid)
      if [ -z "${2-}" ]; then
        echo "Missing value for --pid" >&2
        exit 2
      fi
      PIDS+=("$2")
      shift 2
      ;;
    -h|--help)
      usage 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage 2
      ;;
  esac
done

# If no explicit PIDs given, find by port
if [ "${#PIDS[@]}" -eq 0 ]; then
  # Try lsof first
  if command -v lsof >/dev/null 2>&1; then
    mapfile -t found < <(lsof -iTCP:"${PORT}" -sTCP:LISTEN -Pn -t 2>/dev/null || true)
  else
    found=()
  fi

  if [ "${#found[@]}" -eq 0 ]; then
    # Fallback to ss parsing. Capture full output and extract all pid=NNN occurrences
    if command -v ss >/dev/null 2>&1; then
      raw_ss_output=$(ss -ltnp 2>/dev/null || true)
      if [ -n "$raw_ss_output" ]; then
        if command -v node >/dev/null 2>&1 && [ -f ./scripts/extract-pids.js ]; then
          mapfile -t found < <(printf '%s' "$raw_ss_output" | node ./scripts/extract-pids.js "${PORT}" | sort -u)
        else
          # Fallback: try to join lines and extract pid tokens (may fail on wrapped names)
          mapfile -t found < <(printf '%s' "$raw_ss_output" | tr '\n' ' ' | sed 's/ LISTEN /\nLISTEN /g' | grep ":${PORT}" | grep -oE 'pid=[0-9]+' | grep -oE '[0-9]+' | sort -u || true)
        fi
      else
        found=()
      fi
    fi
  fi

  if [ "${#found[@]}" -eq 0 ]; then
    echo "No process listening on port ${PORT}"
    exit 0
  fi

  PIDS=("${found[@]}")
fi

printf "Found PID(s): %s\n" "${PIDS[*]}"

for pid in "${PIDS[@]}"; do
  # validate numeric
  if ! [[ $pid =~ ^[0-9]+$ ]]; then
    echo "Skipping invalid PID: $pid" >&2
    continue
  fi
  echo "Sending SIGTERM to PID $pid..."
  kill "$pid" 2>/dev/null || true
done

sleep 2

for pid in "${PIDS[@]}"; do
  if ! [[ $pid =~ ^[0-9]+$ ]]; then
    continue
  fi
  if kill -0 "$pid" 2>/dev/null; then
    echo "PID $pid still running - sending SIGKILL..."
    kill -9 "$pid" 2>/dev/null && echo "PID $pid killed"
  else
    echo "PID $pid terminated"
  fi
done

echo "Remaining listeners on port ${PORT}:"
ss -ltnp 2>/dev/null | grep ":${PORT}" || true
