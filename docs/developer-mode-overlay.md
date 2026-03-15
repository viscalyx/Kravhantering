# Developer Mode Overlay

Developer Mode is the hidden developer-help overlay for naming visible
UI elements so AI prompts can refer to them consistently.

## Shortcut

- Toggle: `Mod+Alt+Shift+H`
- In a browser, first focus any non-editable part of the page, then press:
  - macOS: `Command+Option+Shift+H`
  - Windows: `Ctrl+Alt+Shift+H`
  - Linux: `Ctrl+Alt+Shift+H`
- `Mod` means `Command` on macOS and `Control` on Windows/Linux.
- On macOS, Developer Mode listens to the physical `H` key
  even if `Option` changes the typed character reported by
  the browser.
- The shortcut is ignored while focus is inside `input`, `textarea`, `select`,
  or `[contenteditable]`.
- State is in-memory only. It survives client-side navigation but resets on a
  hard reload.

## Behavior

- Developer Mode scans only elements currently visible in the viewport.
- Overlay chips stay English regardless of the active UI locale.
- Clicking a chip copies a deterministic reference string:
  - `context > name: value`
  - `context > name`
  - `name: value`
  - `name`
- Curated `data-developer-mode-*` markers win over fallback heuristics.
- Fallback order is: bespoke `data-*` hooks, ARIA roles, `aria-label`, stable
  visible text, then `data-testid`.

## DOM Contract

Use these attributes on curated targets:

- `data-developer-mode-name`: canonical English element name
- `data-developer-mode-context`: optional English context string
- `data-developer-mode-value`: optional English or runtime value
- `data-developer-mode-priority`: optional numeric priority;
  higher values win collisions

## Seed Glossary

The current canonical labels include:

- `edge tab`
- `floating action rail`
- `floating pill`
- `floating pill menu`
- `column picker`
- `requirements table`
- `table space`
- `column header`
- `header chip`
- `table row`
- `inline detail pane`
- `detail section`
- `detail action`
- `reference item`
- `scenario chip`
- `status stepper`
- `status step`
- `version history`
- `version pill`
- `version history toggle`
- `dialog`
- `tab panel`
- `navigation`

## Testing

Developer Mode is covered by:

- `tests/unit/developer-mode.test.ts`
- `tests/unit/developer-mode-provider.test.tsx`
- `tests/unit/requirement-detail-client.test.tsx`
- `tests/unit/status-stepper.test.tsx`
- `tests/unit/version-history.test.tsx`
- `tests/unit/requirements-table.test.tsx`
- `tests/integration/developer-mode-overlay.spec.ts`

## Contributor Guardrails

If you change visible UI elements, labels, roles, or layout surfaces that a
human or AI might need to reference:

- update the relevant curated `data-developer-mode-*` markers or scan heuristics
- update this document when the naming model, shortcut, or glossary changes
- update the affected unit and integration tests
- update repo instructions if the maintenance rule itself changes
