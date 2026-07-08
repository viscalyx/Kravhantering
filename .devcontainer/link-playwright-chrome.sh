#!/usr/bin/env bash
set -euo pipefail

browser_root="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
chrome_bin=""
if [[ -d "$browser_root" ]]; then
  chrome_bin="$(
    find "$browser_root" \
      \( -path '*/chrome-linux/chrome' -o -path '*/chrome-linux64/chrome' \) \
      -type f 2>/dev/null |
      sort -V |
      tail -n 1
  )"
fi

if [[ -z "$chrome_bin" ]]; then
  for candidate in chromium-browser chromium google-chrome chrome; do
    if candidate_path="$(command -v "$candidate" 2>/dev/null)"; then
      resolved_path="$(readlink -f "$candidate_path" 2>/dev/null || printf '%s' "$candidate_path")"
      if [[ -x "$resolved_path" && "$resolved_path" != "/opt/google/chrome/chrome" ]]; then
        chrome_bin="$resolved_path"
        break
      fi
    fi
  done
fi

if [[ -z "$chrome_bin" ]]; then
  echo "[playwright-chrome] Could not find a Playwright or system Chromium executable" >&2
  exit 1
fi

if command -v sudo >/dev/null 2>&1; then
  sudo install -d /opt/google/chrome
  sudo ln -sf "$chrome_bin" /opt/google/chrome/chrome
else
  install -d /opt/google/chrome
  ln -sf "$chrome_bin" /opt/google/chrome/chrome
fi

echo "[playwright-chrome] Linked /opt/google/chrome/chrome -> $chrome_bin"
/opt/google/chrome/chrome --version
