# Admin Center

This document describes the contributor-facing admin center for UI
terminology, default requirement-list columns, recurring access review,
privacy erasure and data portability, archiving retention, and reference-data
entrypoints. Admin users also get an action-log entrypoint for
database-backed mutation and authorization-denial review.

For requirement-list interaction details such as resizing, sorting, and
filtering, see [requirements-ui-behaviour.md](./requirements-ui-behaviour.md).

## Purpose

The admin center lets maintainers change human-facing UI names and
organization-wide list defaults without changing route slugs, API field names,
or MCP tool identifiers.

The current entrypoint is the global header settings icon, which links to
`/{locale}/admin`.

Reference-data links no longer live in the header dropdown. They are grouped in
the admin center instead.

## Tabs

The admin center currently has six tabs for core administration:

- `Terminology`
- `Columns`
- `Reference data`
- `Access review`
- `Archiving`
- `Privacy`

Admins also see an `Action log` tab. The tab renders the action-log
filters, table, pagination, and CSV export directly in the Admin Center.

## Action Log

The action log is available at `/{locale}/admin/audit-log` for users with
the `Admin` role, and also inline from the Admin Center `Action log` tab
at `/{locale}/admin?tab=actionAuditLog`. It reads `action_audit_events`, shows
the latest 50 events by default, supports filters for actor HSA-ID, action,
target, decision, and date range, plus client IP when a validated
`X-Forwarded-For` value was available, and exports the filtered result as CSV.

The database action log is separate from the platform `security-audit`
JSON stream. The database log is intended for application action review and
privacy/data-subject workflows; the platform stream remains the operational
security telemetry channel. Reading the action log, including CSV export, does
not create another action-log row.

## Terminology

Terminology is stored in the database and loaded per request.

The source of truth is:

- table: `ui_terminology`
- DAL: `lib/dal/ui-settings.ts`
- message overlay: `lib/ui-terminology.ts`

Each term key stores six values:

- Swedish singular
- Swedish plural
- Swedish definite plural
- English singular
- English plural
- English definite plural

The admin UI currently manages the configured term families used by the app,
CSV export, and MCP human-readable output.

Changes made in `Terminology` are applied to:

- app navigation and page labels
- requirement list headers and detail labels
- reference-data headings
- CSV export headers
- MCP catalog and requirement detail text

The underlying routes, REST payload fields, and MCP tool names remain stable.

## Columns

The `Columns` tab controls organization-wide default behavior for the
requirements list.

The source of truth is:

- table: `requirement_list_column_defaults`
- DAL: `lib/dal/ui-settings.ts`
- list helpers: `lib/requirements/list-view.ts`

Admin-managed column settings include:

- default order
- default visibility

`uniqueId` and `description` are locked columns:

- they are always visible
- they still participate in the admin-managed order

## Precedence Rules

The requirements list combines admin-managed defaults with per-browser
preferences.

Admin center controls:

- default column order
- default visible column set

Browser `localStorage` controls:

- each user’s visible subset of columns
- each user’s width overrides

The list always applies the admin-managed order first. If a user already has a
saved visible subset, that subset is re-rendered in the current admin-managed
order.

## Reset Behavior

There are two different reset concepts in this feature area.

Admin center reset:

- reverts the unsaved admin form state to the last successfully saved server
  state

Requirements list reset:

- clears the user’s local visibility overrides
- restores the admin-managed default visible columns and order
- restores the default width model for widths

## Privacy

The `Privacy` tab is available at `/{locale}/admin?tab=privacy`. It supports
GDPR Article 17 erasure handling for actor identities and live assignments.
After a successful preview it also supports GDPR Article 20 data portability
export for the previewed HSA-ID.

Access is intentionally narrow:

- canonical role: `PrivacyOfficer`
- Swedish display label: `Dataskyddshandläggare`
- the role may preview and execute privacy-erasure workflows
- the role does not grant unrelated Admin powers

Users without `PrivacyOfficer` still see the `Privacy` / `Dataskydd` tab in
the Admin Center navigation, but it is dimmed, disabled, and carries a tooltip
explaining that the role is required. The API routes remain the authoritative
server-side guard, so manipulating the client cannot preview or execute erasure.
In the dev realm, use `ada.admin` for combined admin + privacy testing and
`only.admin` for Admin-only permission checks.

The global Help button switches to Dataskydd-specific guidance while the
Privacy tab is active. The guidance explains permissions, HSA-ID matching,
replacement handling, preview rows, action choices, execution status, audit
logging, and limits. Each privacy form field also has inline help behind a
question-mark icon so an operator can understand the expected input without
leaving the workflow.

The workflow matches by HSA-ID only. The UI accepts a replacement display name,
optional explicit first/last name values, and optional replacement email address
when a replacement person is supplied, but target matching never uses names or
email addresses and name-only erasure requests are rejected. Explicit first/last
name values are used only for owner rows when owner assignments are switched;
otherwise the owner name falls back to the replacement display name.

Local seed data includes two users named `Kalle Svensson` with different
HSA-IDs. The second identity resolves an improvement suggestion so UI tests can
verify that erasing one HSA-ID does not match the other person by name.

<!-- cspell:ignore linneab -->

Seed data also gives `SE5560000001-linneab` coverage across every privacy
preview group: owner rows, requirement-area and package owner assignments, requirement
versions, deviation creator and decision fields, improvement-suggestion creator
and resolver fields, specification lead, and requirement-area/specification
co-author assignment rows, plus access-review creator, reviewer, completer,
reviewed-principal, decision snapshots, and action-audit actor snapshots. The
access-review fixture includes two completed reviews: one created by the Linnéa
HSA identity and one created by another user where the Linnéa HSA identity is
the reviewer. This lets the privacy UI be tested end-to-end with one HSA-ID.

The preview groups HSA-ID occurrences by object and field, shows the affected
objects by name or stable identifier, shows the current actor display snapshot,
recommends an action, and allows only policy-approved overrides. Live
assignments are usually switched to a replacement HSA-ID.
Historical creator, decision, and resolution fields are usually anonymized
instead of reassigned. Decision fields include stronger warning copy because
switching a historical decision changes accountability semantics.
The `Switch` action is never offered when no complete replacement HSA-ID/name
has been supplied; explicit first/last names and replacement email are optional.
If the replacement identity is cleared after preview, switch options disappear
from the visible dropdowns before execution.
The execute action is only shown after a preview with at least one occurrence,
and it appears below the preview rows so the handler reviews the exact rows
before running the erasure.
After a successful erasure the preview remains visible as a receipt: executed
rows are marked green, skipped rows stay neutral, and the execute action is
hidden. If execution fails with a safe row key, only that row is marked red;
stale previews and unexpected failures remain global errors because no row has
been changed.

After preview, the handler can export the same HSA-ID scope as JSON or PDF.
The JSON payload is the authoritative machine-readable format and uses schema
version `privacy-data-subject-export.v1`; the PDF is rendered server-side and
returned as `application/pdf` with attachment headers. Download filenames use a
non-reversible target fingerprint and date, not the raw HSA-ID. The export
route checks authorization server-side:
the signed-in user may export their own HSA-ID, while cross-user export requires
`PrivacyOfficer`.

Owner rows have an extra live-assignment guard. If an owner is assigned to one
or more requirement areas and no replacement HSA-ID/name is supplied, the owner
row is disabled and its affected-objects column lists the blocking assignments;
the warning text stays generic. Requirement area owner rows are still shown in
the preview as greyed informational rows, but their action is controlled by the
owner row. Requirement package leads are direct HSA-ID/display-name snapshots
and are switched by their own package-lead rows. With a replacement supplied,
the owner row only allows `Switch` or `Skip`; choosing `Switch` changes linked
requirement areas to the replacement owner in the same transaction. `Anonymize`
and `Delete` are rejected for that owner while requirement areas are linked. If
no requirement area references the owner, the owner row only allows
`Delete` or `Skip`; `Switch` and `Anonymize` are not valid owner actions in
that state.

If no replacement person is supplied, display snapshots are anonymized with the
internal sentinel `no-user`, shown through localization as `Anonym` in Swedish
and `Anonymous` in English. HSA-ID fields that can be cleared become `NULL`;
the app never writes a fake HSA-ID.

Description and other free-text fields are not scanned or rewritten by this
workflow. Their help text tells users not to enter names or other details that
can identify a living person.

The execution endpoint recomputes matches in a single transaction and rejects
stale previews. Privacy execution emits both the platform security-log event
and a database action-audit event. Platform security logs are outside this
privacy matrix, but `action_audit_events.actor` is included: erasure preserves
the row and may anonymize or switch only the actor HSA-ID/display-name
snapshot. Those events include request id, action counts, and a non-reversible
target fingerprint; they do not log the raw target HSA-ID in details. Client IP
values in `action_audit_events.client_ip` are not handled by the Privacy
workflow in this slice.
Retention or redaction of handler identity in external security logs is handled
by the platform logging policy, because removing it can reduce traceability.

Signed-in users can export their own data at `/{locale}/privacy`. That
self-service path sends no target HSA-ID in the request body; the server derives
the subject from the verified session HSA-ID and includes current session claims
only for that self-export.

## Archiving

The `Archiving` tab is available at `/{locale}/admin?tab=archiving`. Archive
and retention work is separated from the GDPR erasure and data portability
flows. Retention is also separate from the requirement lifecycle's functional
`Archived` state.

A `PrivacyOfficer` can load documented retention policies, preview rows whose
policy age and status criteria have passed, create row-level exceptions for
legal hold or documented operational need, export archive evidence, and execute
the accepted preview through `/api/admin/archiving/*`.

V1 supports direct deletion after preview and confirmation for:

- orphaned owner rows with no active requirement-area assignment
- unused requirement areas with no current library requirements, and unused
  requirement packages or norm references with no current library or unique
  requirement links, older than the policy age
- old requirement versions with no current or historical requirements
  specification dependency
- archived requirement-selection questions and answers older than one year
  when no saved requirements-specification answers still reference them

Local seed data includes deterministic `RETENTION-SEED` fixtures for every
active policy source and the main exclusion cases, so a freshly seeded
development database can be used to verify previews, export confirmation and
deletion behavior from this tab.

Requirement-version deletion removes package and norm-reference join rows first,
then the version row. If no versions remain, the requirement row is deleted as
well. Versions that have ever been linked to a requirements specification are
excluded by `has_specification_item_history`.

Archived requirement-selection deletion uses the `archived_at` timestamp on the
question or answer as its age basis. Saved answers in
`specification_requirement_selection_answers` block deletion so requirements
specification history remains intact.

Requirements specifications outside `Förvaltning` and older than the policy age
require an anonymized JSON archive export before deletion. The export includes
the specification metadata, needs references, unique requirements, linked
library requirements, the pinned requirement-version properties, taxonomy
labels, packages, norm references and deviations. Person fields in the export
are written as `null`; the database is not anonymized by this flow.

The retention run emits security-audit events with policy key, counts, request
id and export confirmation fingerprint, but not raw target HSA-ID values or
free-text payloads. Export responses and mutation responses use
`Cache-Control: no-store`.

## Access Review

The `Access review` tab is available at `/{locale}/admin?tab=accessReview`.
It supports the recurring authorization review required by the information
security action plan. The feature inventories app-managed assignments, stores a
point-in-time review run, assigns newly created runs to the signed-in actor from
the verified IdP session, lets the assigned reviewer decide each item, lets
Admin cancel mistaken pending runs without deleting evidence, and lets Admin
export the review evidence as structured JSON or a PDF rendering of the same
payload.

The in-app scope is deliberately limited to permissions Kravhantering owns:

- requirement-area owner references
- requirement-area co-authors
- specification lead
- specification co-authors
- the assignment-bound AI flags on those co-author/responsible rows

Global IdP roles such as `Admin`, `Reviewer`, and `PrivacyOfficer`, source-code
repository access, and externally provisioned MCP/client access are reviewed in
the administration tools where those permissions are assigned. The access
review run has an external evidence reference field so the in-app review can
point to that external record.

Access is role-aware:

- `Admin` can create, list, cancel, complete, and export access review runs.
- The assigned reviewer can open their assigned run and decide items by
  matching the verified session HSA-ID to the run reviewer HSA-ID.
- Other users receive a server-side authorization error even if they manipulate
  the client.

New runs default to an annual period and a due date 30 days after creation. Only
one `draft` or `in_review` access review may exist at a time; the Admin UI
disables creation while a run is open, and the create route enforces the same
rule server-side. The create route does not accept a manual reviewer payload;
the reviewer snapshot is derived from the same verified actor ticket that
created the request. Each item starts as `pending` and must be changed to
`approved`,
`revoke_required`, `changed`, or `not_applicable` before the run can be
completed. Decision updates record the deciding actor, timestamp, and optional
comment. Completion is blocked while any item remains pending. Cancelling a run
marks it as `cancelled` and keeps the snapshot rows as historical evidence
instead of hard-deleting them.

The JSON export uses schema version `access-review-export.v1` and is the
authoritative evidence payload. The PDF button requests a server-rendered PDF
of the same payload for human review. Export responses use
`Cache-Control: no-store`; PDF delivery returns `application/pdf` with
attachment headers.
Action-log events are emitted for run creation, item decisions, cancellation,
completion, and export. Action-log detail contains review id, counts, delivery,
decision, and status
where relevant; it does not contain the raw list of reviewed HSA-IDs.

## Reference Data

The `Reference data` tab is the curated navigation surface for the existing
reference-data pages.

It links to the existing stable routes for:

- areas (including owner assignment)
- types
- norm references
- requirement version statuses
- usage statuses
- risk levels
- quality characteristics
- governance object types
- implementation types

The admin center does not rename or move those routes. It only centralizes how
users reach them. Requirement packages are managed from
`/requirements/stewardship` together with requirement-selection questions, since
package leads and requirement-area stewards can work there without needing
Admin Center access.

The fixed system rows for requirement version statuses, usage statuses, and risk
levels can also carry a nullable icon selected from the installed
Lucide icon catalog through the shared status-icon allowlist. The admin pages
keep the label visible and use the icon only as a decorative cue in tables,
badges, steppers, and reports. Existing rows without an icon continue to render
with text-only labels until an admin selects one.

### Requirement Area Owner

Each requirement area can have an assigned owner. The owner is selected from
an external owners list when creating or editing a requirement area in the
requirement area reference-data page. The owner name is displayed:

- in the requirement area reference data table
- as small text under the requirement area dropdown in the requirement
  create/edit form
- in the requirement detail pane (inline and full-page sidebar)

## Contributor Notes

If you change any of the following, update this document:

- admin tab behavior
- terminology persistence or scope
- column default precedence
- access-review scope, role gating, decisions, or evidence export
- privacy-erasure or data-portability policy, actions, or role gating
- admin entrypoint navigation
- reference-data navigation structure
- status, usage-status, or risk-level icon behavior

If you add a new requirement column or property, also update
[.github/instructions/add-requirement-column.instructions.md](../.github/instructions/add-requirement-column.instructions.md).
