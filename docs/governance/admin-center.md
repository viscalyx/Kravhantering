# Admin Center

This document describes the contributor-facing admin center for default
requirement-list columns, HSA-id prefix guidance, recurring access review,
personal data erasure and data subject access export, archiving retention, and
taxonomy/status entrypoints. Admin users also get an action-log entrypoint for
database-backed mutation and authorization-denial review.

For requirement-list interaction details such as resizing, sorting, and
filtering, see [requirements-ui-behaviour.md](./requirements-ui-behaviour.md).
For the cross-application role matrix, see
[behörigheter.md](./behörigheter.md).

## Purpose

The admin center lets maintainers change organization-wide list defaults,
reach app-owned taxonomy and status administration, and run privileged admin
workflows without changing route slugs, API field names, or MCP tool
identifiers.

The global side navigation contains the settings item that links to
`/{locale}/admin`.

Taxonomy and status links are grouped in the Admin Center.

## Tabs

The admin center currently has eight tabs for core administration:

- `Columns`
- `Identity`
- `Taxonomy`
- `Statuses and workflows`
- `Access review`
- `Archiving`
- `Privacy`
- `Action log`

The `Action log` tab renders the action-log filters, table, pagination, and
CSV export directly in the Admin Center for users with `Admin`.
Users without the required role still see privileged tabs, but disabled tabs
are dimmed, cannot be selected, and explain the missing role in a tooltip.

## Action Log

The action log is available at `/{locale}/admin/audit-log` for users with
the `Admin` role, and also inline from the Admin Center `Action log` tab
at `/{locale}/admin?tab=actionAuditLog`. It reads `action_audit_events`, shows
the latest 50 events by default, supports filters for actor HSA-id, action,
target, decision, and date range, plus client IP when a validated
`X-Forwarded-For` value was available, and exports the filtered result as CSV.
The CSV export follows the active locale for column headers and decision values,
uses UTF-8 with BOM for Windows spreadsheet compatibility, and keeps action
names, target kinds, request IDs and details JSON as stored evidence
identifiers.

The database action log is separate from the platform `security-audit`
JSON stream. The database log is intended for application action review and
privacy/data-subject workflows; the platform stream remains the operational
security telemetry channel. Reading the action log, including CSV export, does
not create another action-log row.

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

## Identity

The `Identity` tab is available for users with `Admin`. It manages
HSA-id-prefix rows that are offered as UI guidance when users edit HSA-id
assignments.

The source of truth is:

- table: `hsa_id_prefixes`
- DAL: `lib/dal/ui-settings.ts`
- admin API: `GET/PUT /api/admin/hsa-id-prefixes`
- form API: `GET /api/hsa-id-prefixes`

Admin-managed prefix settings include:

- prefix value, written as two uppercase letters followed by ten digits
- optional display label
- whether the prefix is visible in user-facing HSA-id prefix lists
- which visible prefix is the default for new empty HSA-id fields

The prefix list is UI support, not HSA policy. Server-side HSA-id validation and
existing API fields still accept any syntactically valid HSA-id. Editable
HSA-id fields compose the selected HSA-id-prefix and the entered
HSA-id-suffix into the existing full HSA-id value before calling existing APIs.
Read-only HSA-id values remain full values.

If no HSA-id-prefix row exists, editable HSA-id suffix fields are locked and
explain that an administrator must configure a prefix. Once a prefix list has
been configured, at least one prefix must remain visible. If an existing
assignment uses a hidden prefix, that prefix is shown only for that row so the
current value remains editable without reintroducing the prefix for new empty
fields.

Used prefixes cannot be removed because they may exist in active or historical
HSA-id fields. They can be hidden from user-facing lists. Unused prefixes can be
removed. A non-empty prefix list must have at least one visible prefix and
exactly one visible prefix must be default. An empty prefix list has no default.

Demo seed data contains `SE5560000001` as the visible default prefix. Required
seed data intentionally does not create any HSA-id-prefix rows, so a clean
installation starts without organization-specific prefix policy.

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
- keeps the primary save button disabled until the normalized admin form payload
  differs from that saved state

Requirements list reset:

- clears the user’s local visibility overrides
- restores the admin-managed default visible columns and order
- restores the default width model for widths

## Privacy

The `Privacy` tab is available at `/{locale}/admin?tab=privacy` for users with
`PrivacyOfficer`. It supports GDPR Article 17 erasure handling for actor
identities and live assignments.
After a successful preview it also supports data subject access export for the
previewed HSA-id. JSON is the machine-readable authoritative payload, and PDF
is a readable report of the same scope.

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
Privacy tab is active. The guidance explains permissions, HSA-id matching,
replacement handling, preview rows, action choices, execution status, audit
logging, and limits. Each privacy form field also has inline help behind a
question-mark icon so an operator can understand the expected input without
leaving the workflow.

The workflow matches by HSA-id only. The UI accepts a replacement display name,
optional explicit first/last name values, and optional replacement email address
when a replacement person is supplied, but target matching never uses names or
email addresses and name-only erasure requests are rejected. Requirement-area
owner switches update `requirement_areas.owner_hsa_id` directly. Requirement
package lead switches update the package lead HSA-id and display-name snapshot.

Local seed data includes two users named `Kalle Svensson` with different
HSA-id values. The second identity resolves an improvement suggestion so UI
tests can verify that erasing one HSA-id does not match the other person by
name.

<!-- cspell:ignore linneab -->

Seed data also gives `SE5560000001-linneab` coverage across every privacy
preview group: requirement-area `owner_hsa_id` assignments, requirement package
lead assignments, requirement versions, deviation creator and decision fields,
improvement-suggestion creator and resolver fields, specification lead, and
requirement-area/specification co-author assignment rows, plus access-review
creator, reviewer, completer, reviewed-principal, decision snapshots, and
action-audit actor snapshots. The access-review fixture includes two completed
reviews: one created by the Linnéa HSA identity and one created by another user
where the Linnéa HSA identity is
the reviewer. This lets the privacy UI be tested end-to-end with one HSA-id.

The preview groups HSA-id occurrences by object and field, shows the affected
objects by name or stable identifier, shows the current actor display snapshot,
recommends an action, and allows only policy-approved overrides. Live
assignments are usually switched to a replacement HSA-id.
Historical creator, decision, and resolution fields are usually anonymized
instead of reassigned. Decision fields include stronger warning copy because
switching a historical decision changes accountability semantics.
The `Switch` action is never offered when no complete replacement HSA-id/name
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

After preview, the handler can export the same HSA-id scope as JSON or PDF.
The JSON payload is the authoritative machine-readable format and uses schema
version `privacy-data-subject-export.v1`; the PDF is rendered server-side and
returned as `application/pdf` with attachment headers. The PDF is a localized
human-readable report in Swedish or English. It explains the collected personal
data in plain terms and does not show raw database fields, table names, schema
keys, relation keys, or target fingerprints. Download filenames use a
non-reversible target fingerprint and date, not the raw HSA-id. JSON downloads
use UTF-8 with BOM for Windows text-tool compatibility, while API JSON responses
remain BOM-free. The export route checks authorization server-side:
the signed-in user may export their own HSA-id, while cross-user export requires
`PrivacyOfficer`.

Requirement-area ownership is direct HSA-id data on
`requirement_areas.owner_hsa_id`, not a separate owner catalog. Preview rows for
requirement areas are shown as greyed informational rows; their available
actions are governed by the requirement-area owner assignment. Requirement
package leads remain separate HSA-id/display-name snapshot rows governed by
their package-lead rows.

When one or more requirement areas reference the target HSA-id, the
requirement-area owner assignment allows only `Switch` or `Skip`. `Switch`
updates the linked requirement areas to the replacement `owner_hsa_id` in one
transaction. `Anonymize` and `Delete` are rejected while those requirement-area
references exist. When no requirement area references the target HSA-id, there
is no requirement-area owner assignment to change; only unrelated rows can keep
their own valid actions, and `Switch`/`Anonymize` are not valid for a
non-existent requirement-area owner assignment. There is no standalone
owner-catalog fallback action for unreferenced owner rows.

If no replacement person is supplied, display snapshots are anonymized with the
internal sentinel `no-user`, shown through localization as `Anonym` in Swedish
and `Anonymous` in English. HSA-id fields that can be cleared become `NULL`;
the app never writes a fake HSA-id.

Description and other free-text fields are not scanned or rewritten by this
workflow. Their help text tells users not to enter names or other details that
can identify a living person.

The execution endpoint recomputes matches in a single transaction and rejects
stale previews. Privacy execution emits both the platform security-log event
and a database action-audit event. Platform security logs are outside this
privacy matrix, but `action_audit_events.actor` is included: erasure preserves
the row and may anonymize or switch only the actor HSA-id/display-name
snapshot. Those events include request id, action counts, and a non-reversible
target fingerprint; they do not log the raw target HSA-id in details. Client IP
values in `action_audit_events.client_ip` are not handled by the Privacy
workflow in this slice.
Retention or redaction of handler identity in external security logs is handled
by the platform logging policy, because removing it can reduce traceability.

Signed-in users can export their own data at `/{locale}/privacy`. That
self-service path sends no target HSA-id in the request body; the server derives
the subject from the verified session HSA-id and includes current session claims
only for that self-export. The self-service PDF uses the same readable report
presentation as the Admin Center export.

## Archiving

The `Archiving` tab is available at `/{locale}/admin?tab=archiving` for users
with `PrivacyOfficer`. Archive and retention work is separated from personal
data erasure and data subject access export flows. Retention is also separate
from the requirement lifecycle's functional `Archived` state.

A `PrivacyOfficer` can load documented retention policies, preview rows whose
policy age and status criteria have passed, create row-level exceptions for
legal hold or documented operational need, export archive evidence, and execute
the accepted preview through `/api/admin/archiving/*`.

V1 supports direct deletion after preview and confirmation for:

- unused requirement areas with no current library requirements, and unused
  requirement packages or norm references with no current library or unique
  requirement links, older than the policy age
- old requirement versions with no current or historical requirements
  specification dependency
- archived requirement-selection questions and answers older than one year
  when no saved requirements-specification answers still reference them
- historical RFI question versions and archived RFI questions older than two
  years when no specification RFI-list rows or RFI question suggestions still
  reference them
- unassigned requirement responsibility people older than the policy age when
  no live requirement area, specification or package assignment references
  their HSA-id

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

RFI retention deletes historical RFI question versions by their `updated_at`
timestamp and archived RFI questions by their `archived_at` timestamp. Any
`specification_rfi_question_items` reference blocks deletion, including unlocked
lists that still use a historical version to show that a newer version exists.
RFI question suggestions block deletion of the archived RFI question they refer
to. RFI candidates do not require a separate archive export because those
references keep active specification history intact.

Requirements specifications outside `Förvaltning` and older than the policy age
require an anonymized JSON archive export before deletion. The export includes
the specification metadata, needs references, unique requirements, linked
library requirements, the pinned requirement-version properties, taxonomy
labels, packages, norm references and deviations. Person fields in the export
are written as `null`; the database is not anonymized by this flow. Browser
downloads use UTF-8 with BOM and locale-specific ASCII-safe filenames beginning
with `arkivexport` or `archive-export`.

The retention run emits security-audit events with policy key, counts, request
id and export confirmation fingerprint, but not raw target HSA-id values or
free-text payloads. Export responses and mutation responses use
`Cache-Control: no-store`.

## Access Review

The `Access review` tab is available at
`/{locale}/admin?tab=accessReview` for users with `Admin` or
`PrivacyOfficer`. It supports the recurring authorization review required by
the information security action plan. The feature inventories app-managed
assignments, stores a point-in-time review run, assigns newly created runs to
the signed-in actor from the verified IdP session, lets authorized handlers
decide each item, cancel mistaken pending runs without deleting evidence, and
export the review evidence as structured JSON or a PDF rendering of the same
payload.

The in-app scope is deliberately limited to permissions Kravhantering owns:

- requirement-area owner references
- requirement-area co-authors
- specification lead
- specification co-authors
- requirement-package leads
- requirement-package co-authors

Global IdP roles such as `Admin`, `Reviewer`, and `PrivacyOfficer`, source-code
repository access, and externally provisioned MCP/client access are reviewed in
the administration tools where those permissions are assigned. The access
review run has an external evidence reference field so the in-app review can
point to that external record.

Access is role-aware:

- `Admin` and `PrivacyOfficer` can create, list, decide, cancel, complete, and
  export access review runs.
- `Reviewer` alone does not grant access-review management, even when the
  user's HSA-id appears as the stored reviewer snapshot on a run.
- Other users receive a server-side authorization error even if they manipulate
  the client.

New runs default to an annual period and a due date 30 days after creation. Only
one `draft` or `in_review` access review may exist at a time; the Admin Center
UI disables creation while a run is open, and the create route enforces the
same rule server-side. The create route does not accept a manual reviewer
payload; the reviewer snapshot is derived from the same verified actor ticket
that created the request. Each item starts as `pending` and must be changed to
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
Browser-downloaded JSON evidence uses UTF-8 with BOM, while API JSON responses
remain BOM-free. JSON and PDF filenames follow the active locale with
ASCII-safe stems.
Action-log events are emitted for run creation, item decisions, cancellation,
completion, and export. Action-log detail contains review id, counts, delivery,
decision, and status
where relevant; it does not contain the raw list of reviewed HSA-id values.

## Taxonomy And Statuses

The `Taxonomy` tab is the curated navigation surface for classification pages
used for filtering, reporting and AI support. It links to the existing stable
routes for:

- requirement areas (including owner assignment)
- categories
- types
- risk levels
- quality characteristics
- governance object types
- implementation types

The `Statuses and workflows` tab is the curated navigation surface for status
catalogs that control lifecycle and use-state behavior. It links to the
existing stable routes for:

- requirement version statuses
- specification lifecycle statuses
- usage statuses

The admin center does not rename or move those child routes. It only changes
how users reach them from `/admin`: `?tab=taxonomy` and
`?tab=statusesAndWorkflows` are the supported tab query values.
Requirement packages and the norm library are managed from
`/requirements/stewardship` together with requirement-selection questions,
since package leads and requirement-area stewards can work there without
needing Admin Center access.

The fixed system rows for requirement version statuses, usage statuses, and risk
levels can also carry a nullable icon selected from the installed
Lucide icon catalog through the shared status-icon allowlist. The admin pages
keep the label visible and use the icon only as a decorative cue in tables,
badges, steppers, and reports. Existing rows without an icon continue to render
with text-only labels until an admin selects one.

### Requirement Area Owner

Each requirement area must have an assigned owner HSA-id. A new requirement area
is created in a modal with an editable HSA-id field. When an existing
requirement area is edited, the modal contains metadata and the read-only
current owner HSA-id. The icon button next to the owner opens the owner-change
dialog where admins enter the replacement HSA-id and confirm with `Byt ägare`.
Requirement area co-authors are managed separately from the list row with
`Hantera medförfattare`, which opens a dedicated co-author dialog with the add
field above the saved co-author table.

- as HSA-id in the requirement area taxonomy table
- as HSA-id under the requirement area dropdown in the requirement
  create/edit form
- as HSA-id in the requirement detail pane (inline and full-page sidebar)

## Contributor Notes

If you change any of the following, update this document:

- admin tab behavior
- column default precedence
- access-review scope, role gating, decisions, or evidence export
- privacy-erasure or data subject access export policy, actions, or role gating
- admin entrypoint navigation
- taxonomy and status/workflow navigation structure
- status, usage-status, or risk-level icon behavior

If you add a new requirement column or property, also update
[.github/instructions/add-requirement-column.instructions.md](../../.github/instructions/add-requirement-column.instructions.md).
