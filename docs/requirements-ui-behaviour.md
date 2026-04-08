# Kravkatalog UI Behaviour

This document explains the intended behavior of the Kravkatalog list UI so
contributors can change the table without breaking user expectations.

For the admin-managed source of terminology and default column settings, see
[admin-center.md](./admin-center.md).

## Scope

The behaviors below apply to the requirement list rendered by:

- `app/[locale]/requirements/requirements-client.tsx`
- `components/RequirementsTable.tsx`
- `lib/requirements/list-view.ts`

## Table Structure

- The table is a custom implementation.
  Do not replace it with a table library unless there is a clear product
  decision to do so.
- `uniqueId` and `description` are locked columns. They are always visible.
- The organization-wide default column order and default visible column set are
  loaded from admin-managed settings.
- `uniqueId` and `description` remain locked, but their relative order still
  follows the admin-managed default order.
- Optional columns can be shown from the columns popover.
- The current last visible column does not render an extra resize divider
  after its right edge.

## Sorting

- Sorting is single-column only.
- Sort is triggered directly from the header button.
- Clicking the active sort toggles `asc` and `desc`.
- Sort state is not persisted between sessions.
- If the active sort column is hidden, sort resets to the default:
  - `uniqueId asc`

## Filters

- Filters are attached to the visible header cells only.
- If a filtered column is hidden, its filter is cleared immediately.
- Status is filterable and sortable.
- `riskLevel` is filterable and sortable.
- `requiresTesting` is filterable, but not sortable.

## Column Visibility

- Column visibility is controlled from the columns popover.
- Default visibility is controlled by admin-managed settings.
- Per-browser visibility preferences are persisted in `localStorage`.
- The first visible table render waits for persisted column visibility and
  locale-specific width preferences to hydrate from `localStorage`.

## Floating Rail

- The requirements table actions live in a floating rail outside the table.
- When possible, the rail aligns with the table’s top edge with a slight
  downward offset.
- Once the table top scrolls under the sticky navigation, the rail stays fixed
  below the navigation while its table remains in view.
- The rail uses a short motion-safe top/left transition with subpixel
  positioning so the handoff between those two positions tracks scrolling
  smoothly.
- The rail hides once the table has scrolled fully out of view.
- The rail order is:
  - `beforeColumns` floating actions
  - the columns pill
  - trailing floating actions
- Package-detail split tables keep the same pill order but render the rail
  inline in a sticky top bar above each table instead of as a fixed right rail.

## Sticky Header

- The column header row stays sticky during vertical page scroll.
- Sticky headers pin directly below the `h-16` site navigation using a `top-16`
  offset.
- The sticky table chrome keeps the usage-scenario chips visible together with
  the header when those chips are present.
- Package-detail split tables also keep their list title bar sticky in that
  same chrome so the section title and top rail stay visible with the headers.
- On `xl` and wider package-detail layouts, the `Krav i paketet` and
  `Tillgängliga krav` cards each become their own vertically scrollable region
  and stay pinned below the site navigation while the user scrolls inside a
  list.
- In the normal desktop package-detail state, the page shell itself stays
  viewport-locked so the two list panels fit inside the visible window without
  requiring page-level vertical scrolling.
- Those desktop list panels stretch to the padded page edges and use the full
  available width under the header instead of sitting inside an additional
  inset content column.
- In that desktop split-panel mode, the package-detail sticky chrome uses the
  card’s own top edge instead of the global `top-16` viewport offset so the
  title bar, scenario chips, and header stay visually attached to the table.
- The package-detail bulk-add dialog keeps API failures inline inside the
  modal and leaves the current selection in place so the user can adjust the
  needs-reference choice or retry without rebuilding the selection.
- The sticky header lives in a synced header viewport above the horizontal body
  scroll area so row content does not bleed through underneath it.
- Sticky headers use their existing column-header markers and remain part of
  the same table surface; no separate recovery control is shown when the page
  scrolls vertically.
- On the fixed-right rail used by the main requirements catalog, a scroll-to-top
  pill appears as its own final action group once the table top has moved above
  the sticky offset. Selecting it scrolls the page back to the table top.

## Admin Defaults vs Personal Overrides

- Admin settings define the organization-wide baseline for:
  - column order
  - default visible columns
- Browser `localStorage` defines each user’s personal overrides for:
  - visible column subset
  - column widths
- If a user has saved visibility preferences, the list still displays those
  columns in the current admin-managed order.
- The list reset action restores:
  - the admin-managed default visible columns
  - the admin-managed default order
  - the default width model

## Width Model

- Column widths are persisted in `localStorage`.
- The width storage key is versioned.
  When the resize model changes materially, bump the storage key version to
  avoid reusing incompatible old width data.
- On initial page load and hard refresh, the list stays in a card-level loading
  state until both the persisted width model is hydrated and the first rows
  request resolves.
- `description` is the only grow column in the default layout.
- If there are no manual width overrides for the currently visible columns,
  `description` absorbs spare horizontal space.
- During pointer drag, the live width preview is applied imperatively to the
  rendered table DOM.
- That live preview must keep the sticky header chrome and the scrolling body
  table in sync so the visible column boundaries stay aligned while dragging.
- The persisted width map is committed only when the drag ends successfully on
  `pointerup`.

## Spreadsheet-Style Resize Rules

- Resize behaviour follows a spreadsheet model.
- Dragging a divider changes only the column on the left side of that divider.
- Columns on the right keep their widths.
- When the left column gets wider:
  - the columns to the right shift right
  - the total table width increases
  - horizontal scrolling is used if the table becomes wider than the viewport
- When the left column gets narrower:
  - the columns to the right shift left
  - the total table width decreases
  - right-side column widths do not change
- Resizing must never steal width from the adjacent column automatically.

## Freeze-on-First-Resize

- Before the user resizes a divider, the table may still be using the
  auto-fill layout where `description` consumes spare space.
- On pointer down, the drag baseline is taken from the currently rendered
  visible header widths, not just the default metadata widths.
- This is important because a user may resize from a visually expanded
  `description` column.
  The drag baseline must match what the user sees.

## Drag Lifecycle

- Dragging must remain active across multiple pointer move events.
- Re-renders during a drag must not cancel the drag session.
- Pointer capture should stay with the active divider handle while dragging.
- Pointer-move updates should not write to the parent-controlled width state on
  every event.
- Live drag preview should be throttled to animation frames and applied directly
  to the rendered table widths.
- The previewed sticky header widths and the scrolling body widths should move
  together during drag; neither surface should wait for `pointerup` to realign.
- All visible resize-divider lines should stay aligned with the previewed
  column boundaries during drag, not snap into place only after drag end.
- Cleanup should happen only when the drag actually ends:
  - pointer up
  - pointer cancel
- `pointerup` commits the final width override map.
- `pointercancel` restores the last committed widths and discards the preview.
- Scroll-fade and resize-handle offset state updates should stay out of the hot
  drag path.

## Double Click and Keyboard Resize

- Double-clicking a divider resets the left column to its default width.
- Keyboard resize is supported on the divider handle:
  - `ArrowLeft` narrows the left column
  - `ArrowRight` widens the left column
  - `Shift + Arrow` uses a larger step
- Keyboard resize follows the same Excel-style rules as pointer drag.

## Scroll Affordance

- Horizontal overflow is indicated with subtle left and right fade overlays.
- The right fade appears when more content exists off-screen to the right.
- The left fade appears after the user has scrolled horizontally.
- The fades must remain subtle enough to act as a cue, not as a primary visual element.

## Package Item Usage Status Column

- The `packageItemStatus` column is hidden by default (`defaultVisible: false`).
- It is **excluded** from the main requirements catalog and the available-
  requirements panel (right side) in the package detail view via
  `excludeColumns`. It is only selectable in the package-items panel (left
  side) of the package detail view.
- In the **package detail** left panel (items in package), the column renders
  an inline `<select>` dropdown for each item that has a `packageItemId`.
  Changing the dropdown value calls `PATCH /api/requirement-packages/{id}/items/{itemId}`
  and applies an optimistic update to the local row state.
- When a requirement is **added** to a package, its usage status is
  automatically set to **Included** (ID 1). The user can change it once
  work on the requirement begins.
- Outside the package detail context (e.g. the main requirements catalog),
  the column renders a read-only color dot + label or an em dash if unset.
- The column supports multi-select filtering via `packageItemStatusIds`.
- Client-side filtering in the package detail matches on `packageItemStatusId`.
- Sorting is disabled for this column (`canSort: false`).
- Each status has an optional **definition** (bilingual `description_sv` /
  `description_en`), editable from the admin panel under Usage Statuses.
- The definition is shown as a native `title` tooltip on the cell (both
  the inline `<select>` and the read-only display). Individual `<option>`
  elements also carry the definition as a `title` attribute.

## Inline Detail Pane

The inline detail pane is expanded inside the requirements table when a row is
clicked.

### Content Order

The detail card renders sections in this fixed order:

1. **Requirement text** (description) — always first
2. **Acceptance criteria** — always second
3. **Area** with owner — shown after the primary text sections
4. **Package count** — read-only count of how many requirement packages
   include this requirement (always shown, displays 0 when unused)
5. **References** — if any exist
6. **Scenarios** — if any exist

Requirement text and acceptance criteria are the primary content. Classification
metadata (area, owner, category, type, etc.) must not push the main content
down.

### Area Owner

- The area owner is a property of the area, not of the requirement itself.
- In the inline pane, the area and its owner are displayed as a metadata section
  after the two primary text sections.
- In the full-page detail sidebar, the area owner is shown as small text below
  the area name.

## Loading and Empty State

- The empty state is rendered only after a list request finishes with zero rows.
- While the first rows request is pending, the table is not mounted yet and the
  card-level loading state is shown instead.
- During later filter or sort refreshes, the current rows stay visible and the
  delayed in-table spinner may appear if the refresh lasts long enough.

## Row Selection

- When `selectable` is true, a checkbox column appears as the first column.
- The checkbox column has a fixed width of 36px and is not resizable.
- The 36px is subtracted from the available grow space so default columns
  still fit without horizontal scrolling.
- A header checkbox toggles select-all for visible rows.
- Individual row checkboxes toggle selection without triggering row click.
- Selection is cleared when filters change.
- Selection state is managed in `requirements-client.tsx` via `selectedIds`.

## Print List Report Floating Pill

- Always visible in the list view as a Printer icon pill.
- Opens a dropdown with two options:
  - "Print Requirements List" — opens the print engine route
  - "Download Requirements List (PDF)" — opens the PDF engine route
- Passes the IDs of all currently visible rows as `?ids=` query params.
- The report shows Krav-ID, description, area, and status columns.

## Combined Review Report Floating Pill

- Appears when at least one selected requirement has a version in Review status
  (either as the current version or as a pending version).
- Disabled (greyed out) if any selected requirement lacks a Review version.
- Shows a badge with the number of selected requirements.
- Uses the Review status color (`#eab308`) as a visual indicator.
- Opens a dropdown with options to print or download the combined report.
- Tooltip explains why the pill is disabled when applicable.

## Print Dropdown in Detail View

- A print dropdown button appears in the action buttons column before the
  share button.
- Always shows "Print History Report" and "Download History Report (PDF)".
- Shows "Print Review Report" and "Download Review Report (PDF)" only when
  the current version has Review status.
- Detail view report URLs use `window.open` with the locale prefix.
- List view report URLs use `next-intl` `Link` without the locale prefix
  (the router adds it automatically).

For report architecture details, see [reports.md](./reports.md).

## Improvement Suggestion Section

The requirement detail view contains an "Improvement suggestions" section
displayed after version history. It shows all improvement suggestions
linked to the requirement.

### Suggestion List

Each suggestion item shows:

- A `SuggestionStepper` indicating lifecycle state (Draft →
  Review requested → Resolved/Dismissed)
- A `SuggestionPill` with the suggestion content, creation info,
  and resolution details (if resolved)
- Contextual action buttons based on current state

### Suggestion Actions

- **Draft:** Edit, Delete, Request review
- **Review requested:** Revert to draft, Resolve/Dismiss
- **Resolved/Dismissed:** No actions (terminal states)

### Suggestion Count Column

The requirements list table has an optional `suggestionCount`
column (hidden by default) that shows the total number of
improvement suggestions for each requirement as a badge.

## Contributor Guardrails

- If you change resize behaviour, update both:
  - `tests/unit/requirements-table.test.tsx`
  - this document
- If you change resize behaviour materially, also update:
  - `tests/integration/requirements-table-resize.spec.ts`
  - `tests/integration/requirements-table-resize.md`
- Table resize tests should verify rendered widths or table width changes,
  not only callback payloads.
- Table resize tests should cover both:
  - live preview during drag
  - a single committed width update when the drag ends
- If you change width persistence semantics, update:
  - `lib/requirements/list-view.ts`
  - `tests/unit/requirement-list-view.test.ts`
  - `tests/unit/requirements-client.test.tsx`
- If you change table labels, named table surfaces, floating pills, or the
  inline detail pane used by Developer Mode, also update:
  - `docs/developer-mode-overlay.md`
  - `tests/unit/developer-mode.test.ts`
  - `tests/unit/developer-mode-provider.test.tsx`
  - `tests/unit/requirements-table.test.tsx`
  - `tests/integration/developer-mode-overlay.spec.ts`
