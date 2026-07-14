---
applyTo: "{app/[[]locale[]]/admin/**/*.tsx,components/Navigation.tsx,app/api/admin/**/*.ts,app/api/privacy/**/*.ts}"
---

# Admin Center

- Treat each tab as an independently authorized panel under
  `app/[locale]/admin/panels/`
- Enforce access on the server before reading data. Show only authorized tabs,
  use the first authorized tab as default, and redirect an unauthorized tab URL
  there with translated feedback.
- Lazy-load only the active panel without prefetching. Keep panel-specific
  state and data loading in that panel; keep navigation, URL state, Help and
  shared accessible loading/error handling in the shell.
- Never put secrets, database data or runtime server/DAL dependencies in client
  chunks. Fetch panel data through an authorized API after activation.
- Give every panel its own focused unit test using the shared contract helper.
  Keep the generic convention, authorization and bundle checks green, and
  update affected Playwright/manual cases.
