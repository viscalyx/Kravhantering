# HSA-ID Scoped Privacy Workflows

Status: Accepted on 2026-06-05.

Kravhantering scopes privacy workflows to one verified HSA-ID at a time.
`Radering av personuppgifter` and `Personuppgiftsutdrag` match personal data by
exact HSA-ID only; names, e-mail addresses and display names are treated as
mutable snapshots and are not used to identify the registered person.

Privacy handling is separate from functional archiving and retention
`Gallring`. Erasure may delete, anonymize, skip or switch person-linked fields,
but it must preserve business history, lifecycle traceability, requirement
content, decisions and action-log evidence when those records still need to
exist for Kravhantering's purpose.

The JSON payload is the authoritative machine-readable format for the
`Personuppgiftsutdrag`. PDF is a readable rendering of the same scope, while
platform `Säkerhetslogg` logs, free-text fields that policy says should not
contain personal data, raw action-log details and client IP values remain
outside the app-level access export.

## Considered Options

- Match privacy requests by name or e-mail: rejected because those values can
  change, collide or be anonymized.
- Delete business records wholesale during erasure: rejected because privacy
  rights do not automatically remove requirement history, decisions or
  traceability that must remain for business purposes.
- Reuse retention or archive export for privacy handling: rejected because
  dataskydd rights, retention policy and functional archiving have different
  triggers, mandates and evidence requirements.
