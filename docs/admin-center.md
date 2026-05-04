# Admin Center

This document describes the contributor-facing admin center for UI
terminology, default requirement-list columns, and reference-data entrypoints.

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

The admin center currently has three tabs:

- `Terminology`
- `Columns`
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

## Reference Data

The `Reference data` tab is the curated navigation surface for the existing
reference-data pages.

It links to the existing stable routes for:

- areas (including owner assignment)
- types
- requirement packages
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
- admin entrypoint navigation
- reference-data navigation structure

If you add a new requirement column or property, also update
[.github/instructions/add-requirement-column.instructions.md](../.github/instructions/add-requirement-column.instructions.md).
