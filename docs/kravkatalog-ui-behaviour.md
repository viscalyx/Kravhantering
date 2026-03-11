# Kravkatalog UI Behaviour

This document explains the intended behavior of the Kravkatalog list UI so
contributors can change the table without breaking user expectations.

## Scope

The behaviors below apply to the requirement list rendered by:

- `app/[locale]/kravkatalog/kravkatalog-client.tsx`
- `components/RequirementsTable.tsx`
- `lib/requirements/list-view.ts`

## Table Structure

- The table is a custom implementation.
  Do not replace it with a table library unless there is a clear product
  decision to do so.
- `uniqueId` and `description` are locked columns. They are always visible.
- The default visible columns are:
  - `uniqueId`
  - `description`
  - `area`
  - `category`
  - `type`
  - `status`
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
- `requiresTesting` is filterable, but not sortable.

## Column Visibility

- Column visibility is controlled from the columns popover.
- Visibility preferences are persisted in `localStorage`.
- The reset action restores:
  - the default visible column set
  - the default width model

## Width Model

- Column widths are persisted in `localStorage`.
- The width storage key is versioned.
  When the resize model changes materially, bump the storage key version to
  avoid reusing incompatible old width data.
- `description` is the only grow column in the default layout.
- If there are no manual width overrides for the currently visible columns,
  `description` absorbs spare horizontal space.
- During pointer drag, the live width preview is applied imperatively to the
  rendered table DOM.
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
  - `tests/unit/kravkatalog-client.test.tsx`
