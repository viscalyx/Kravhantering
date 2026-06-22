---
applyTo: "{docs/security-privacy/informationsmangder-kravhantering.md,docs/governance/admin-center.md,docs/reference/database-schema.md,lib/typeorm/**/*.ts,typeorm/migrations/**/*.mjs,typeorm/seed*.mjs,lib/archiving/**/*.ts,app/api/admin/archiving/**/*.ts,app/[[]locale[]]/admin/**/*.tsx,tests/unit/archiving-retention*.test.ts}"
---

# Information Assets Retention

## New Information Assets

- Treat a new persistent business data category, table, document section,
  export payload, or stored file as a new information asset.
- For every new information asset, decide whether the app must delete it,
  require JSON export before deletion, anonymize it only in export, or keep it
  without app-level retention because a documented exception applies.
- Document the decision in `docs/security-privacy/informationsmangder-kravhantering.md`.
- If the app handles retention, add or update the Admin > Arkivering policy,
  preview source, deletion/export execution path, seed fixture, and focused
  tests in the same change.
- If app-level retention is not needed, document the exception, owner, and
  operational boundary in `docs/security-privacy/informationsmangder-kravhantering.md`.
- Do not add a persisted person-related or specification-related information
  asset without either retention handling or an explicit documented exception.
- Keep Dataskydd/GDPR erasure separate from Arkivering/Gallring unless the
  user explicitly asks to change both surfaces.
- Include representative positive and negative seed fixtures with a recognizable
  prefix when adding a new Admin > Arkivering policy source.
