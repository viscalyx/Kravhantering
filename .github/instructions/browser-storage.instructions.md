---
applyTo: "{app/**/*.{ts,tsx},components/**/*.tsx,lib/auth/**/*.ts,lib/locale-preference.ts,lib/runtime/build-target.ts,i18n/**/*.ts,proxy.ts,docs/security-privacy/auth-how-it-works.md,docs/governance/requirements-ui-behaviour.md,docs/governance/admin-center.md}"
---

## Browser Storage Information

- When adding, changing or removing cookies, `localStorage` or `sessionStorage`
  entries, update affected documentation and user guidance in the same change.
- For authentication cookies, follow
  `.github/instructions/auth-docs.instructions.md`; keep cookie details in
  `docs/security-privacy/auth-how-it-works.md`.
- For browser preferences, update affected behavior in
  `docs/governance/requirements-ui-behaviour.md` and affected Admin Center
  controls in `docs/governance/admin-center.md`.
- Cover changes to names, HTTPS variants, purpose, category, provider,
  persistence, lifetime, renewal, withdrawal and cleanup. Distinguish browser
  storage lifetime from server access limits and server retention.
- For storage governed by a consent mechanism, synchronize its disclosures,
  assess whether purpose changes require renewed consent, and keep purpose
  versions separate from text corrections and publication dates.
- When disclosed information or observable behavior changes, use
  `maintain-manual-tests` for affected manual cases and integration tests;
  update affected unit test expectations.
- When persistence, consent or transition behavior changes, use
  `operator-upgrade-notes` to assess operator impact.
- Before finishing, compare every affected entry across its documentation and UI
  against the implementation. Resolve stale names, missing properties and
  conflicting times or purposes.
