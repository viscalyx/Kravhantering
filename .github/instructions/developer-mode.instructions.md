---
applyTo: '{app/**/*.tsx,components/**/*.tsx,docs/**/*.md,tests/unit/**/*.ts,tests/unit/**/*.tsx,tests/integration/**/*.spec.ts,CONTRIBUTING.md,AGENTS.md,.github/copilot-instructions.md}'
---

# Developer Mode

- Developer Mode is the maintained developer-help surface for visible UI elements.
- If you change visible UI elements, labels, roles, or layout surfaces, update:
  - curated `data-developer-mode-*` markers or scanner heuristics
  - `docs/developer-mode-overlay.md`
  - the relevant unit and integration tests
- Keep Developer Mode labels in English even when the product UI is localized.
- Prefer explicit `data-developer-mode-*` markers (e.g., `data-developer-mode-name`,
  `data-developer-mode-context`, `data-developer-mode-value`,
  `data-developer-mode-priority`) for important product patterns over adding more
  fallback heuristics.
