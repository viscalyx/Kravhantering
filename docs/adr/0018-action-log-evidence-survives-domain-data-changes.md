# Action Log Evidence Survives Domain Data Changes

Status: Accepted on 2026-06-05.

Kravhantering stores `Åtgärdslogg` evidence in `action_audit_events` as
durable snapshot rows, not as relational children of requirements,
specifications, ownership assignments or other domain rows. Action-log rows
intentionally do not have foreign keys to live domain tables; they carry
logical target identifiers, actor snapshots, request IDs and correlation IDs so
the evidence survives lifecycle deletion, retention `Gallring`, archive cleanup
and privacy erasure or switching of person fields.

The surprising part is the deliberate loss of relational integrity for this
table. Action-log reads cannot depend on joining back to the current domain row
for meaning, and writers must capture bounded, stable, non-sensitive evidence
at event time. In return, action-log evidence is not deleted by cascades, does
not block legitimate domain cleanup, and remains reviewable after the target
object has changed or disappeared from active Kravhantering.

## Considered Options

- Add foreign keys from `action_audit_events` to each target table: rejected
  because retention, draft deletion, archive cleanup and privacy erasure would
  either delete evidence or be blocked by evidence rows.
- Cascade-delete action-log rows with their targets: rejected because important
  action and authorization evidence would disappear with the business object.
- Store full before/after business payloads in the action log: rejected because
  requirement text, prompts, comments, names, HSA-IDs, e-mail addresses and
  other free text would make privacy and retention harder to control.
