---
applyTo: "{lib/requirements/lifecycle.ts,lib/requirements/status-constants.mjs,lib/dal/requirements.ts,lib/requirements/service*.ts,app/api/requirements/**/*.ts,app/api/requirement-transitions/**/*.ts}"
---

# Requirement Lifecycle Policy

- Treat lifecycle policy extraction as incremental workflow work, not
  standalone cleanup.
- When changing edit, archiving, transition, restore, reactivate, or
  delete-draft behavior, add or extend pure helpers in
  `lib/requirements/lifecycle.ts` for the affected decision only.
- Keep `lib/requirements/status-constants.mjs` as the source of requirement
  lifecycle status IDs.
- Keep SQL locks, transactions, and conditional writes in
  `lib/dal/requirements.ts`.
- Do not move transaction guards or conditional writes into route handlers or
  service code.
- Do not add service reads solely to duplicate DAL preconditions. Add
  service-level validation only for shared workflow decisions or user-facing
  behavior.
- Keep route handlers responsible for HTTP parsing, status codes, and response
  shaping.
- Update focused lifecycle tests when changing lifecycle helper behavior.
