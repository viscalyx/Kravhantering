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
- Overlay labels stay English regardless of the active UI locale.
- Clicking a chip copies a deterministic reference string:
  - `context > name: value`
  - `context > name`
  - `name: value`
  - `name`
- Curated `data-developer-mode-*` markers win over fallback heuristics.
- Fallback order is: bespoke `data-*` hooks, ARIA roles, `aria-label`, stable
  visible text, then `data-testid`.

## Packaging

- Generic Developer Mode logic lives in:
  - `packages/developer-mode-core`
  - `packages/developer-mode-react`
- Both packages are repo-internal and marked `private`; they are not published
  to npm.
- Package docs live in:
  - [packages/developer-mode-core/README.md](../packages/developer-mode-core/README.md)
  - [packages/developer-mode-react/README.md](../packages/developer-mode-react/README.md)
- App code should import the marker helper from `@/lib/developer-mode-markers`
  and the app adapter from `components/DeveloperModeProvider`.
- Local development enables Developer Mode automatically.
- Production `build`, `preview`, and `deploy` flows disable Developer Mode by
  default by aliasing the packages to no-op entrypoints.
- Set `ENABLE_DEVELOPER_MODE=true` only when you explicitly want a non-dev build
  to include the real Developer Mode runtime and marker output.

## DOM Contract

Use the marker helper instead of hardcoding these attributes in app code:

- `devMarker({ name, context?, value?, priority? })`
- When Developer Mode is enabled, the helper emits the curated
  `data-developer-mode-*` attributes below.
- When Developer Mode is disabled, the helper returns `{}` so production HTML
  stays clean.

The emitted attributes are:

- `data-developer-mode-name`: canonical English element name
- `data-developer-mode-context`: optional English context string
- `data-developer-mode-value`: optional English or runtime value
  Keep the control `name` stable and move runtime identity into `value`, for
  example `sort button: requirement id`, `filter button: status`, or theme
  state values like `light`, `dark`, and `auto`.
- Requirement package create/edit forms continue to use the `crud form` marker;
  their package-field help toggles are part of that same form surface rather
  than separate developer-mode markers.
- Navigation help triggers use the `navigation` context with button values
  `help toggle open` and `help toggle closed`.
- Requirement package form save errors and package-list load errors stay inside
  the existing `packages` form/table surfaces; they do not add separate
  developer-mode markers.
- Requirement package list filtering exposes `packages > text field: name filter`
  on the Name search input above the table, while the package create trigger
  keeps the existing `packages > create button` marker when it shares that
  toolbar row on wide screens.
- Requirement package detail header edit affordances use the
  `requirement package detail` context with `detail action: edit package`
  on the icon trigger and `crud form: edit` on the opened editor.
- The package-detail header may visually regroup the title, business-needs
  reference, and short metadata summary into a compact layout, including a
  wide-screen variant where the metadata sits beside the title. That layout
  does not introduce any separate developer-mode marker beyond the existing
  edit action.
- The package-detail page no longer renders a separate breadcrumb-style back
  control in that header area; browser navigation is the supported way back
  from this compact header.
- Published requirement detail views expose the package-link control as
  `detail action: add to package` when the currently displayed published
  version is the one that can be added to a package.
- Sticky requirements table headers keep their existing
  `requirements table > column header: ...` references while pinned; the sticky
  state does not introduce a separate developer-mode surface. The scrolling
  data table keeps the semantic header row while the pinned clone remains a
  presentational chrome surface.
- Requirement package detail tables may render the `floating action rail`
  inline inside their sticky title bar; the marker name stays the same in both
  the fixed-right and inline-top layouts.
- On desktop package-detail split views, those inline rails live inside
  independently scrollable table cards; the marker names stay the same even
  though each table now scrolls within its own panel.
- The desktop package-detail split view may expand those list panels into a
  viewport-locked full-width shell, but that layout change does not add any new
  developer-mode markers beyond the existing table surfaces.
- The fixed-right rail on the main requirements catalog can also expose a
  `requirements table` marker for `table action: scroll to top`; it remains the
  last grouped pill in that rail when shown.
- Bulk-add failures from the package-detail available-requirements dialog now
  stay inline inside that existing modal; they do not add a separate
  developer-mode marker beyond the surrounding table and dialog surfaces.
- Help drawer overflow cues and lifecycle illustrations remain part of the
  existing `dialog` surface and do not add separate developer-mode markers.
- Needs-reference controls and inline loading or failure messages inside the
  add-to-package dialog remain part of that same
  `detail action: add to package` flow rather than introducing extra markers,
  including when those controls are temporarily disabled during submission.
- Requirement package list print pages expose `report state` markers with
  values `report-print:error`, `report-print:loading`, and
  `report-print:renderer`.
- Requirement package list PDF pages expose `report state` markers with values
  `report-pdf:error`, `report-pdf:loading`, and `report-pdf:ready`.
- `data-developer-mode-priority`: optional numeric priority;
  higher values win collisions

## Seed Glossary

The current canonical labels include:

- `edge tab`
- `floating action rail`
- `floating pill`
- `floating pill menu`
- `column picker`
- `column picker option`
- `requirements table`
- `table space`
- `column header`
- `sort button`
- `filter button`
- `resize handle`
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
- `create button`
- `crud form`
- `crud table`
- `error banner`
- `text field`
- `table action`
- `report print button`
- `report option`
- `review report pill`
- `report state`
- `row checkbox`

## Testing

Developer Mode is covered by:

- `tests/unit/developer-mode.test.ts`
- `tests/unit/developer-mode-provider.test.tsx`
- `tests/unit/requirement-detail-client.test.tsx`
- `tests/unit/status-stepper.test.tsx`
- `tests/unit/version-history.test.tsx`
- `tests/unit/requirements-table.test.tsx`
- `tests/unit/reference-data-developer-mode.test.tsx`
- `tests/unit/requirement-package-detail-client.test.tsx`
- `tests/unit/navigation.test.tsx`
- `tests/unit/theme-toggle.test.tsx`
- `tests/integration/developer-mode-overlay.spec.ts`
- `tests/integration/requirements-table-column-picker.spec.ts`

## Contributor Guardrails

If you change visible UI elements, labels, roles, or layout surfaces that a
human or AI might need to reference:

- update the relevant `devMarker(...)` calls or scan heuristics
- update this document when the naming model, shortcut, or glossary changes
- update the affected unit and integration tests
- update repo instructions if the maintenance rule itself changes
