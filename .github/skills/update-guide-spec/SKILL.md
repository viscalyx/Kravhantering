---
name: update-guide-spec
description: 'Add or modify steps in the Playwright user-guide generator (tests/guide/generate-guide.spec.ts)'
---

## Updating the Guide Generator

`tests/guide/generate-guide.spec.ts` is a single serial Playwright test that clicks
through the app, takes screenshots, and writes `docs/guide/README.md`.
Run with `npm run generate-guide`.

### Selectors — prefer stable locators

- **Buttons with aria-label**: always use `aria-label` on interactive buttons so
  the guide spec (and other tests) can target them reliably with
  `page.getByLabel(...)` or `button[aria-label="..."]`.
  - Filter buttons already use `aria-label={tc('filterBy', { label })}`.
  - **Sort buttons** were missing `aria-label` — that was added as
    `aria-label={tc('sortBy', { label })}` in `components/RequirementsTable.tsx`.
    Always do the same when adding new interactive column-header controls.
- Use `data-developer-mode-name` / `data-developer-mode-value` attributes as
  fallback selectors when no semantic aria attribute exists (e.g.
  `[data-developer-mode-name="version history toggle"]`).
- To annotate a group of sibling controls with one box, annotate their common
  wrapper instead of individual elements. Column header controls share
  `data-requirement-header-control="{columnId}"` (e.g.
  `[data-requirement-header-control="uniqueId"]` covers both the sort and
  filter buttons for the Krav-ID column).
- Never rely on dynamic `title` attributes for selectors — they change based on
  state (sort direction, etc.).

### `addAnnotation` — safe usage

`addAnnotation(page, selector, options)` draws a red ring + arrow over an element.

- It now includes a 5-second `waitFor({ state: 'visible' })` guard — if the
  element is not found in time it skips silently rather than hanging.
- **Always call `removeAnnotation(page)` after the screenshot** — annotations
  are global fixed-position overlays that will appear in subsequent screenshots
  if not removed.
- Multiple annotations can coexist (each uses CSS class `__guide-annot__`).
- `arrowSide` options: `'left'` | `'right'` | `'top'` | `'bottom'`.

### `snap()` — screenshot options

```typescript
// Full-page screenshot (default)
await snap(page, 'filename', 'Heading', 'Description text')

// Viewport only — required for modals (position:fixed) and split panels
await snap(page, 'filename', 'Heading', 'Description', { fullPage: false })

// Scoped to a specific element
await snap(page, 'filename', 'Heading', 'Description', { selector: '[data-sticky-table-header="true"]' })
```

- Use `{ fullPage: false }` for:
  - Any `role="dialog"` modal (fixed positioning — fullPage pushes them off-screen).
  - Split-panel layouts with inner scroll containers.
  - Any screenshot where the page is very long and you only want the visible area.
- Use `{ selector }` to crop tightly to a single element (e.g. the sticky header).
- If a section below a crop point should be hidden (e.g. improvement suggestions),
  use `page.evaluate` to temporarily set `display: none` before snapping, then
  restore it afterward:
  ```typescript
  await page.evaluate(() => {
    const el = document.querySelector('[data-developer-mode-value="improvement-suggestions"]') as HTMLElement | null
    if (el) el.style.display = 'none'
  })
  await snap(...)
  await page.evaluate(() => {
    const el = document.querySelector('[data-developer-mode-value="improvement-suggestions"]') as HTMLElement | null
    if (el) el.style.display = ''
  })
  ```

### Loading-state guards

The `snap()` helper already waits for:
- `"Hämtar krav"` / `"Fetching requirements"` — table-level fetch spinner.
- `"Laddar..."` — inline detail-panel spinner.

If you add a new async section, add a similar guard in `snap()` or wait explicitly
before calling it.

### Inline-panel row clicks

The sticky table header and resize handles intercept Playwright's normal click
actionability checks. Always use:
```typescript
await row.evaluate(el => (el as HTMLElement).click())
```
instead of `row.click()` or `row.click({ force: true })`.

### Status transitions

- **Draft → Granskning**: no confirmation dialog. Use `waitForResponse` to
  capture the `/api/requirement-transitions/:id` POST and fail fast if the server returns an error.
- **Granskning → Publicerad**: requires a **"Bekräfta"** confirmation dialog.
  Always click it before waiting for the transition to complete.
- After any transition, wait for the `onChange` refresh cycle to settle before
  asserting the new UI state. If the inline panel closes after `onChange`, navigate
  back with `?selected={uniqueId}` to re-open it.

### Text language

All screenshot descriptions and headings must be written in **Swedish**.
Mock data constants (`MOCK_DESCRIPTION`, `MOCK_CRITERIA`, etc.) are also in Swedish.

### DB state

The guide mutates the database (creates requirements, suggestions, deviations).
Run `npm run db:setup` to reset to seed state afterward.
Seeded requirements useful for guide steps:
- `IDN0001` — has multiple improvement suggestions; good for showing suggestion lists.
- `ANV0002` — clean requirement with no suggestions; good for "create first suggestion" demo.
- `/sv/requirement-packages/ETJANSTPLATT` — has package items; good for deviation flow.
