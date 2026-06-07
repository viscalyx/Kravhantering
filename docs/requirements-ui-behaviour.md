# Requirements Library UI Behaviour

This document explains the intended behavior of the Requirements Library list
UI so
contributors can change the table without breaking user expectations.

For the admin-managed source of default column settings, see
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

- Header filters are attached to the visible header cells only.
- If a filtered header column is hidden, its filter is cleared immediately.
- Status is filterable and sortable.
- `riskLevel` is filterable and sortable.
- `requiresTesting` is filterable, but not sortable.
- `requirementPackage` is filterable through the requirement-package chip row
  even when the optional, non-sortable table column is hidden.
- Requirement-package chip filters use the package description as a native
  tooltip when a description exists.

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
- Specification-detail split tables keep the same pill order but render the rail
  inline in a sticky top bar above each table instead of as a fixed right rail.

## Sticky Header

- The column header row stays sticky during vertical page scroll.
- Sticky headers pin directly below the `h-16` site navigation using a `top-16`
  offset.
- The sticky table chrome keeps the requirement-package chips visible together with
  the header when those chips are present.
- Sticky requirement-package and norm-reference chip rows stay single-line and
  horizontally scrollable on all viewport sizes so the sticky chrome does not
  cover the table body or inline detail pane.
- Specification-detail split tables also keep their list title bar sticky in that
  same chrome so the left-panel tabs, section actions, and top rail stay visible
  with the headers.
- On `xl` and wider specification-detail layouts, the `Krav i underlaget` and
  `Tillgängliga krav` cards each become their own vertically scrollable region
  and stay pinned below the site navigation while the user scrolls inside a
  list.
- The left specification-detail panel has tabs for `Krav i underlaget` and
  `Behovsreferenser` embedded in the panel's sticky list header rather than in
  a separate row above the list; the tab selection is reflected in the URL
  through `leftTab=needs-references` so a copied link can reopen the
  needs-reference register directly.
- The right specification-detail panel uses the same embedded sticky-list-header
  tab treatment for `Tillgängliga krav` and `Kravurvalsfrågor`; the active tab
  is the panel title, so the right panel does not render a second visible
  heading for either tab.
- The action pills on the right side of that sticky header are contextual:
  `Krav i underlaget` shows requirement-list actions such as local creation,
  column settings, print, export, and selected-row bulk actions, while
  `Behovsreferenser` replaces them with the needs-reference creation action.
- `Behovsreferenser` is a specification-local register. It allows users to
  create and edit labels plus optional descriptions, delete only unused
  references, expand a row to inspect linked requirements, and intentionally
  keep pre-registered references without linked requirements.
- In `Krav i underlaget`, the `Behovsreferens` column is an inline dropdown
  with `Ingen behovsreferens` plus existing register entries only; creating a
  new reference happens in the register tab or in the add-to-specification
  dialog.
- When rows are selected in `Krav i underlaget`, the sticky action rail includes
  a bulk needs-reference dropdown so multiple linked requirements can be
  reassigned or cleared in one mutation.
- In the normal desktop specification-detail state, the page shell itself stays
  viewport-locked so the two list panels fit inside the visible window without
  requiring page-level vertical scrolling.
- Those desktop list panels stretch to the padded page edges and use the full
  available width under the header instead of sitting inside an additional
  inset content column.
- In that desktop split-panel mode, the specification-detail sticky chrome
  uses the
  card’s own top edge instead of the global `top-16` viewport offset so the
  title bar, requirement-package chips, and header stay visually attached to
  the table.
- The specification-detail bulk-add dialog keeps API failures inline inside the
  modal and leaves the current selection in place so the user can adjust the
  needs-reference choice or retry without rebuilding the selection.
- The sticky header lives in a synced header viewport above the horizontal body
  scroll area so row content does not bleed through underneath it.
- Sticky headers use their existing column-header markers and remain part of
  the same table surface; no separate recovery control is shown when the page
  scrolls vertically.
- On the fixed-right rail used by the main requirements library, a scroll-to-top
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
- The list reset action restores the current table context:
  - the admin-managed default visible columns in the requirements library
  - the specification-detail default visible columns in `Krav i underlaget`
    and `Tillgängliga krav`
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

## Usage Status Column

- The `specificationItemStatus` column is hidden by default (`defaultVisible: false`).
- It is **excluded** from the main requirements library and the available-
  requirements panel (right side) in the specification detail view via
  `excludeColumns`. It is only selectable in the specification-items panel (left
  side) of the specification detail view.
- In the **specification detail** left panel (items in specification), the
  column renders
  an inline `<select>` dropdown for each item that has a `specificationItemId`.
  Changing the dropdown value calls `PATCH /api/specifications/{id}/items/{itemId}`
  and applies an optimistic update to the local row state.
- The same inline status control is also available for unique requirements via
  specification-context item refs (`lib:*` / `local:*`) even though unique rows
  do not have a library-backed `requirementsSpecificationItemId`.
- When a requirement is **added** to a specification, including a
  unique requirement, its usage status is automatically set to
  **Included** (ID 1). The user can change it once work on the requirement begins.
- The inline select offers the fixed usage statuses for specification
  items.
- Outside the specification detail context (e.g. the main requirements library),
  the column renders a read-only color dot + label, or an em dash when no
  usage status applies to the row.
- The column supports multi-select filtering via `specificationItemStatusIds`.
- Client-side filtering in the specification detail matches on `specificationItemStatusId`.
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
3. **Requirement area** with owner — shown after the primary text sections
4. **Specification count** — read-only count of how many requirements specifications
   include this requirement (always shown, displays 0 when unused)
5. **References** — if any exist
6. **Requirement packages** — if any exist

Requirement text and acceptance criteria are the primary content. Classification
metadata (area, owner, category, type, etc.) must not push the main content
down.

### Lifecycle Refresh Scroll

- When a requirement version status transition refreshes the inline detail pane
  and the library row, the workflow stepper is kept in view with the smallest
  necessary scroll adjustment.
- The library does not re-center the selected row during this refresh, so the
  page does not jump down to the version history or improvement-suggestion
  sections.
- This applies to transitions such as Draft to Review and Review back to Draft,
  including cases where active library filters require the selected requirement
  to stay pinned in the list.

### Requirement Area Owner

- The requirement area owner is a property of the requirement area, not of the
  requirement itself.
- In the inline pane, the requirement area and its owner are displayed as a
  metadata section after the two primary text sections.
- In the full-page detail sidebar, the requirement area owner is shown as small
  text below the requirement area name.

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
- In the specification-detail left panel, specification-local rows are visually
  marked with a dedicated icon marker so they can be distinguished from
  library requirements pinned into the specification.
- The current marker uses a compact `DiamondPlus` icon without a pill/badge
  container, while the label text remains hidden for accessibility and fallback
  evaluation.
- Hovering the icon shows a tooltip that explains the row is a specification-local
  requirement that exists only in the current specification.
- Specification-local rows use short specification-scoped Krav-ID values such as
  `KRAV0001`; the specification context itself disambiguates them.
- The specification-local inline detail pane now reuses the same core content-card
  layout as the requirements library inline detail view: description first,
  acceptance criteria second, then the shared metadata grid, references, and
  requirement packages.
- When a library requirement is opened from the specification list `Krav i underlaget`,
  its inline detail metadata also includes the specification-specific fields
  **Behovsreferens** and **Användningsstatus** in the same properties grid.
- The specification-local content card uses the same section spacing and card chrome
  as the library requirement detail card in specification context, so the properties
  block reads with the same vertical rhythm and grouping.
- The expanded specification-local inline pane also uses the same outer inline inset
  as the library requirement detail (`px-6 py-4`), so the properties card and
  right-side rail do not sit flush against the expanded row edges.
- The specification-local inline detail pane does not repeat the row's
  specification-local Krav-ID or unique marker icon in its own header area;
  that identity stays in the table row above the expanded pane.
- Unique requirements are not assigned to a requirement area. The Requirement
  area column in the specification-items list therefore renders `-` for unique
  rows, and the create/edit form for a unique requirement does not show the
  Requirement area field.
- Specification-local inline detail now follows the specification-item detail
  chrome more
  closely: deviation pills sit above the card, the right-side action rail
  starts with print and deviation controls, and local edit/delete actions are
  appended in the same vertical rail.
- That unique-requirement action rail also uses the same full-width button
  sizing rhythm as the library requirements specification-item rail, including
  the shared 44px minimum touch target and stacked spacing.
- Edit and Delete for unique requirements are only enabled when
  **Användningsstatus** is **Inkluderad** and there is no pending deviation
  draft or review request. Otherwise the buttons stay disabled and expose a
  tooltip explaining why the action is blocked, while the controls are also
  visually muted so they no longer read as active actions.
- The same specification-local action rail may show **Graduate to library** when
  the actor owns or co-authors at least one requirement area. The action is
  disabled unless **Användningsstatus** is **Inkluderad**. Opening the action
  shows a modal target requirement area picker over a dimmed background,
  including the copy-only outcome text. Pressing the modal's **Graduate**
  action copies the unique requirement into the selected library requirement
  area as a new Draft library
  requirement, navigates to that new requirement's created Draft version, and
  leaves the source unique row and any local deviations unchanged.

## Print List Report Floating Pill

- Always visible in the list view as a Printer icon pill.
- Opens a dropdown with two options:
  - "Print Requirements List" — opens the print engine route
  - "Download Requirements List (PDF)" — downloads the server PDF route
- Passes the IDs of all currently visible rows as `?ids=` query params.
- Does not apply an application-level item-count cap to visible rows, though
  very large selections still use a browser URL.
- The report shows Requirement ID, requirement text, requirement area, and
  status columns.

## Specification Print List Report

- The specification-detail print dropdown uses `?refs=` query params instead of
  `?ids=`.
- Each value is a specification-context item reference:
  - `lib:<specificationItemId>` for a library requirement in the specification
  - `local:<specificationLocalRequirementId>` for a unique requirement
- This allows the report to include both library and unique requirements in one
  specification list export.
- Does not apply an application-level item-count cap to selected refs, though
  very large selections still use a browser URL.
- PDF uses the matching server route
  `/[locale]/specifications/[slug]/reports/pdf/list?refs=...`.
- Specification list reports include the current requirement-selection context
  before the requirement table. Historical saved answers are shown as historical
  context and do not affect filtering or progress. Each context row includes the
  question, answer, active/historical status, latest change timestamp, and actor
  display-name snapshot when available. The specification CSV export remains
  row-only.

## Requirement Selection Question Stewardship

- In `Kravbiblioteksförvaltning` > `Kravurvalsfrågor`, the question form shows
  the selected requirement area's description as small supporting text below
  `Kravområde`.
- `Kravområde` is set when a requirement-selection question is created and stays
  locked when editing the question. The edit form shows the select as disabled,
  exposes a tooltip explaining why it cannot be changed, and keeps the selected
  area's description visible.
- The question form does not expose manual sort-order editing. New questions are
  placed last within the selected requirement area and can be reordered from the
  question list.
- The question form's free-text areas can be resized vertically, but their
  maximum height is capped relative to the viewport so the remaining form
  controls stay reachable inside the modal.
- The question list is grouped by requirement area in the existing
  requirement-area name order. Each group has a sticky heading that shows the
  requirement-area name and prefix and uses a tinted background distinct from
  the question cards.
- Requirement-selection question rows are collapsed by default. The whole
  compact row toggles details through a chevron disclosure and shows the
  question code, requirement area, selection type, status, question text and
  answer count. Help text, question actions, visibility conditions, saved
  answers and `Lägg till svar` appear only after the row is expanded. Searching
  can still match hidden answer text, but matching rows are not auto-expanded.
- Requirement-selection question rows include a drag handle in the compact row.
  The handle reorders questions only within the same requirement area, persists
  the normalized area order without a full reload, and also supports Arrow Up,
  Arrow Down, Home and End. Search text and status filters disable the handle
  with an explanatory tooltip; a requirement-area filter alone still permits
  reordering because the full area order remains visible.
- Questions that participate in a requirement-selection question hierarchy show
  a separate `Hierarki · N` badge in the compact row, where `N` is the number of
  questions in the connected hierarchy. Standalone questions do not show this
  badge. Clicking the badge opens a read-only modal with the connected
  hierarchy around that question, including sibling branches, one node per
  question, a visual highlight on the selected question, and SVG connector lines
  from every parent question to each controlled child question.
- The answer form uses a left-form/right-workspace modal without a visible
  modal title, visible question ID, or close icon. Answer text,
  `Utan kravurval`, description, save and `Avbryt` stay in the left column; the
  right workspace contains compact source controls and the front-and-center
  `Krav i urvalet` preview. `Kravpaket` is selected through a searchable
  checkbox popover, direct krav links are added through a visible Krav-ID /
  kravtext search with chips, and preview rows show source badges for direct
  selections and contributing kravpaket. `Avbryt` closes immediately when the
  answer is unchanged and asks for confirmation before discarding unsaved answer
  changes.
- Clicking a row in the answer form's `Krav i urvalet` preview opens a
  read-only requirement detail card that reuses the same content-card layout,
  padding, font scale, and section spacing as the requirements library inline
  detail. It starts with `Kravtext`, not a repeated Krav-ID heading, and does
  not include lifecycle steppers, action buttons, or version history.
- Saved answer rows show compact source pills for selected `Kravpaket` and
  direct `Krav-ID`. Clicking one or more source pills expands the resulting krav
  list and filters it to the union of all selected sources; clicking an active
  pill removes that source from the filter. The compact count disclosure is
  shown before the source pills, separated by a small divider, and expands or
  collapses the full list. Expanded krav rows show source badges, so a krav that
  is both directly selected and included through a package appears once with
  both `Direktvalt` and package badges.

## Specification Requirement Selection Panel

- The specification detail right panel embeds the `Tillgängliga krav` and
  `Kravurvalsfrågor` tabs in the same sticky panel header pattern as the left
  panel tabs.
- Requirement-selection questions are always optional. Progress counts answered
  active questions against all active questions, both total and per requirement
  area, without blocking save or report actions.
- Requirement-selection questions with visibility conditions are shown only
  when at least one condition group matches the current saved answers in the
  specification. Progress, area summaries, search and unanswered-only filtering
  count only active visible questions.
- Visible questions show an answered or unanswered badge with icon/text and a
  subtle card tone. A parent question that reveals follow-up questions shows
  compact links that scroll to those visible questions in their own requirement
  area group.
- The question tab provides lightweight search/filtering by question text,
  answer text, requirement area, and unanswered state. Questions are grouped by
  requirement area and answer rows show how many published requirements they
  match, plus how many of those are already in the specification.
- Saved answers preserve requirement-selection context for the specification.
  `Tillgängliga krav` starts from all published library requirements that are
  not already in the specification; users opt in with the `Filtrera med
  kravurvalsfrågor` toggle when they want saved answers to filter the list
  through linked requirement packages and explicit published requirements.
- `Utan kravurval` clears other answers for the same question and is exclusive
  even for multiple-choice questions. It counts as answered but contributes no
  requirement filter; if only `Utan kravurval` answers are selected, available
  requirements are not narrowed.
- Historical saved answers remain visible and clearable, but are excluded from
  filters and progress.
- If a question is hidden by visibility conditions but has historical saved
  answers, it is shown as a historical row with the badge
  `Historiskt · villkor inte längre uppfyllt`.
- When changing an answer would hide already answered follow-up questions, the
  user must confirm before saving. Confirming recursively clears the current
  answers on the hidden branch; stewardship-driven visibility changes mark
  affected saved answers as historical instead.
- Saved answers update optimistically with visible saving/error status. When the
  requirement-selection toggle is on, changed answers update the filtered
  `Tillgängliga krav` list immediately; when the toggle is off, changed answers
  remain selection context and the list stays unfiltered by requirement-selection
  answers.
- The `Filtrera med kravurvalsfrågor` toggle is shown as off on a fresh visit.
  If answered questions only contain `Utan kravurval`, the toggle remains off,
  disabled and dimmed with a tooltip that explains that the answered questions
  do not provide a requirement selection. If answered questions provide a
  requirement selection that currently matches zero published requirements, the
  toggle remains enabled and shows the neutral empty-selection warning when
  turned on.
- Turning the requirement-selection toggle on or off preserves the user's
  regular `Tillgängliga krav` filters, search, sort order, selected columns and
  column widths. Requirement-selection filtering is combined with the regular
  list filters rather than replacing or clearing them. Changing this toggle, or
  changing answers while the toggle is on, clears the right-list row selection
  so hidden requirements cannot remain selected.
- The requirement-selection toggle is transient view state. It may remain on
  while the user stays in the same specification detail view and switches
  between right-panel tabs, but it is not persisted across a fresh visit to the
  specification.
- If selected answers should contribute requirements but no published
  requirements match, the specification shows a neutral warning instead of
  treating the state as a validation error.
- `Saknar kravurval` is a health state for active answers without any currently
  matching published requirements. It asks stewardship to repair links but does
  not make the answer historical and does not convert it to `Utan kravurval`.

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
- Print report URLs use `window.open` with the locale prefix.
- PDF report URLs are fetched as blobs from the server route; a temporary
  progress dialog appears only when generation takes longer than two seconds.
- List view print report URLs use `next-intl` `Link` without the locale prefix
  (the router adds it automatically); list view PDF downloads use the shared
  blob download helper.

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

### Requirement Package Column

The requirements list table has an optional `requirementPackage`
column (hidden by default) that shows linked requirement package names
for each requirement in the current locale.

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
