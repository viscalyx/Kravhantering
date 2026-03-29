---
applyTo: '{app/**/*.tsx,components/**/*.tsx,docs/**/*.md,tests/unit/**/*.ts,tests/unit/**/*.tsx,tests/integration/**/*.spec.ts,CONTRIBUTING.md,AGENTS.md,.github/copilot-instructions.md}'
---

# Developer Mode

- Developer Mode is the maintained developer-help surface for visible UI elements.
- If you change visible UI elements, labels, roles, or layout surfaces, update:
  - curated `devMarker(...)` calls or scanner heuristics
  - `docs/developer-mode-overlay.md`
  - the relevant unit and integration tests
- Keep Developer Mode labels in English even when the product UI is localized.
- In app code, prefer `devMarker(...)` from `@/lib/developer-mode-markers`
  instead of hardcoding `data-developer-mode-*` attributes directly.
- Prefer curated marker coverage for important product patterns over adding more
  fallback heuristics.
- Developer Mode packages are aliased to no-op entrypoints outside development
  unless `ENABLE_DEVELOPER_MODE=true` is set for the build.
