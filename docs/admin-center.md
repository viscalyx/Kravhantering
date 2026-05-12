# Admin Center

This document describes the contributor-facing admin center for UI
terminology, default requirement-list columns, privacy erasure, and
reference-data entrypoints.

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

The admin center currently has four tabs:

- `Terminology`
- `Columns`
- `Privacy`
- `Reference data`

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

Seed data also gives `SE2321000032-linneab` coverage across every privacy
preview group: owner rows, area and package owner assignments, requirement
versions, deviation creator and decision fields, improvement-suggestion creator
and resolver fields, specification responsibility, and area/specification
co-author assignment rows. This lets the privacy UI be tested end-to-end with
one HSA-ID.

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

Owner rows have an extra live-assignment guard. If an owner is assigned to one
or more requirement areas and no replacement HSA-ID/name is supplied, the owner
row is disabled and its affected-objects column lists the requirement areas;
the warning text stays generic. Requirement area rows are still shown in the
preview as greyed informational rows, but their action is controlled by the
owner row. With a replacement supplied, the owner row only allows `Switch` or
`Skip`; choosing `Switch` changes the linked requirement areas to the
replacement owner in the same transaction. `Anonymize` and `Delete` are
rejected for that owner while requirement areas are linked. Requirement package
owner rows also require a replacement before switching; without a replacement
they are disabled and limited to `Skip`, with the package names shown in the
affected-objects column. If no requirement area references the owner, the owner
row only allows `Delete` or `Skip`; `Switch` and `Anonymize` are not valid
owner actions in that state.

If no replacement person is supplied, display snapshots are anonymized with the
internal sentinel `no-user`, shown through localization as `Anonym` in Swedish
and `Anonymous` in English. HSA-ID fields that can be cleared become `NULL`;
the app never writes a fake HSA-ID.

Description and other free-text fields are not scanned or rewritten by this
workflow. Their help text tells users not to enter names or other details that
can identify a living person.

The execution endpoint recomputes matches in a single transaction and rejects
stale previews. Privacy audit events are emitted to the platform security-log
stream, not stored in the application database, so they are not part of the
preview matrix and are not rewritten by this workflow. Those events include the
handler identity, request id, action counts, and a non-reversible target
fingerprint; they do not log the raw target HSA-ID. Retention or redaction of
handler identity in security logs is handled by the platform logging policy,
because removing it can reduce traceability.

## Reference Data

The `Reference data` tab is the curated navigation surface for the existing
reference-data pages.

It links to the existing stable routes for:

- areas (including owner assignment)
- types
- requirement packages
- norm references
- statuses
- quality characteristics
- business objects
- implementation types

The admin center does not rename or move those routes. It only centralizes how
users reach them.

### Area Owner

Each requirement area can have an assigned owner. The owner is selected from an
external owners list when creating or editing an area in the area reference data
page. The owner name is displayed:

- in the area reference data table
- as small text under the area dropdown in the requirement create/edit form
- in the requirement detail pane (inline and full-page sidebar)

## Contributor Notes

If you change any of the following, update this document:

- admin tab behavior
- terminology persistence or scope
- column default precedence
- privacy-erasure policy, actions, or role gating
- admin entrypoint navigation
- reference-data navigation structure

If you add a new requirement column or property, also update
[.github/instructions/add-requirement-column.instructions.md](../.github/instructions/add-requirement-column.instructions.md).
