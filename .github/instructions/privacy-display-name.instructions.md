---
applyTo: "{app/**/*.tsx,components/**/*.tsx,lib/reports/**/*,tests/unit/**/*.ts,tests/unit/**/*.tsx,tests/integration/**/*.spec.ts}"
---

# Privacy Display Names

- When rendering actor/person display names in UI, reports, PDFs, print views,
  or user-facing test assertions, keep the internal `no-user` sentinel out of
  visible output.
- When the active locale is available, use:
  `import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'`
  and render with `formatActorDisplayNameForLocale(value, locale)`.
- Apply this to actor snapshots and user-facing identity labels such as
  `createdBy`, `decidedBy`, `resolvedBy`, owner, responsible user, co-author,
  handler, assignee, reviewer, and similar personal display-name fields.
- Use `formatActorDisplayName(value, anonymousActorLabel)` only in components
  that already receive the localized anonymous label from translations.
- Never render `DELETED_USER_INTERNAL_NAME`, `no-user`, or raw sentinel values
  directly in UI, report, PDF, print, CSV-visible output, or user-facing tests.
- Do not use display-name formatting for HSA-ID matching, durable identity,
  privacy execution, audit fingerprints, or internal logs.
- Add or update tests when adding a new user-facing actor display field,
  including coverage that `no-user` is shown as `Anonym` / `Anonymous`.
