---
applyTo: '{app/**/*.tsx,components/**/*.tsx,docs/**/*.md,tests/unit/**/*.ts,tests/unit/**/*.tsx,tests/integration/**/*.spec.ts,CONTRIBUTING.md}'
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
- Non-development builds alias the upstream Developer Mode packages to
  first-party noop stubs in `lib/runtime/` unless `ENABLE_DEVELOPER_MODE=true`
  is set for the build. See the upstream
  [production-noop guide](https://github.com/viscalyx/developer-mode/blob/main/docs/production-noop-guide.md)
  for the wiring rationale and alias-swap strategies.
