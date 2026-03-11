---
applyTo: "{components/RequirementsTable.tsx,app/[locale]/kravkatalog/**/*.tsx,lib/requirements/list-view.ts,tests/unit/requirements-table.test.tsx,tests/unit/requirement-list-view.test.ts,tests/unit/kravkatalog-client.test.tsx,tests/integration/requirements-table-resize.spec.ts,tests/integration/requirements-table-resize.md,docs/kravkatalog-ui-behaviour.md}"
---

# Kravkatalog Table

## Structure

- Keep the Kravkatalog list as a custom table. Do not replace it with a table library unless explicitly requested.
- Keep `uniqueId` and `description` locked and always visible.
- Default visible columns: `uniqueId`, `description`, `area`, `category`, `type`, `status`.

## Sorting and Filters

- Single-column sort only.
- If a filtered column is hidden, clear that filter immediately.
- If the active sort column is hidden, reset sort to `uniqueId asc`.
- Keep `requiresTesting` filterable but not sortable.

## Widths and Resize

- Version the column-width storage key when width persistence semantics change materially.
- Let `description` absorb spare width only when there are no manual width overrides for the current visible columns.
- Use spreadsheet-style resizing: dragging a divider changes only the column on the left; columns on the right keep width; total table width grows or shrinks.
- Never steal width from the adjacent column automatically during resize.
- On pointer down, use the currently rendered header widths as the drag baseline.
- Do not write parent-controlled width state on every `pointermove`.
- Use imperative or ref-driven preview updates during drag; commit the persisted width map on `pointerup`; restore committed widths on `pointercancel`.
- Do not add a trailing resize divider after the last visible column.

## Verification

- If resize behavior changes, update `tests/unit/requirements-table.test.tsx`, `tests/integration/requirements-table-resize.spec.ts`, `tests/integration/requirements-table-resize.md`, and `docs/kravkatalog-ui-behaviour.md`.
- Resize tests must verify rendered width changes, not only callback payloads.
- Cover both live preview during drag and the final committed state after release.
