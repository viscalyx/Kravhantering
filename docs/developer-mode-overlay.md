# Developer Mode Overlay

Developer Mode is the hidden developer-help overlay for naming visible
UI elements so AI prompts can refer to them consistently.

The overlay runtime, keyboard shortcut, marker contract, and scanner
fallback rules are defined and maintained upstream in
[`viscalyx/developer-mode`](https://github.com/viscalyx/developer-mode):

- `@viscalyx/developer-mode-core` — marker authoring helpers, target
  scanning, copy-text and chip-label formatting, shortcut constants. See
  the [core README][upstream-core].
- `@viscalyx/developer-mode-react` — the React provider, overlay portal,
  hover outline, badge, chip, and copy toast. See the
  [react README][upstream-react].

This document is the **consumer-side spec** for how Kravhantering wires
those packages in, which marker names are canonical for our UI surfaces,
and which tests cover the integration.

## Activation

Toggle with the upstream shortcut `Mod+Alt+Shift+H` (macOS:
`Command+Option+Shift+H`; Windows/Linux: `Ctrl+Alt+Shift+H`). Focus a
non-editable part of the page first. The shortcut is ignored inside
inputs, textareas, selects, and `[contenteditable]` regions, and the
enabled state survives client-side navigation but resets on a hard
reload. See the [core README's "Shortcut Contract"][upstream-core] for
the full contract.

## Build wiring

- Local development enables Developer Mode automatically.
- Non-development builds alias both packages to first-party noop stubs in
  [`lib/runtime/`](../lib/runtime/) so neither the overlay runtime nor
  any reference to the upstream packages is shipped to clients.
- Tailwind v4 source detection ignores `node_modules`; the overlay's
  utility classes are opted back in by importing the published
  `@viscalyx/developer-mode-react/safelist.css` artifact from
  [`app/globals.css`](../app/globals.css). See the upstream
  [safelist guide][upstream-safelist] for how the artifact is generated.
  Because the import is resolved during `next build`, the package must
  be present at build time. The `@viscalyx/developer-mode-*` packages
  stay in `devDependencies` and `npm prune --omit=dev` is safe **after**
  the build completes — `safelist.css` has no JavaScript surface and
  Tailwind inlines the needed utilities into the emitted CSS bundle.
  The dedicated `test-prodlike-pruned` job in
  [`.github/workflows/integration-tests.yml`](../.github/workflows/integration-tests.yml)
  exercises this build → prune → start sequence using the
  [`start:prodlike-pruned`](../package.json) script, which avoids the
  dev-only `dotenv-cli` / `cross-env` wrappers.
- Set `ENABLE_DEVELOPER_MODE=true` only when you explicitly want a
  non-development build to include the real Developer Mode runtime.

For the full wiring rationale, two alias-swap strategies, and the
drift-guard test pattern, see the upstream
[production-noop-guide][upstream-noop-guide].

## App contract

- App code creates markers through [`lib/developer-mode-markers.ts`](../lib/developer-mode-markers.ts)
  rather than calling the package's `devMarker(...)` directly. This
  keeps a single host-side place for naming policy and any future no-op
  behavior. See the upstream [Marker API][upstream-core] for the field
  shapes (`name`, `context?`, `value?`, `priority?`) and the four
  emitted `data-developer-mode-*` attributes.
- The provider is wrapped by
  [`components/DeveloperModeProvider.tsx`](../components/DeveloperModeProvider.tsx),
  which supplies the English `badge`, `copied`, and `copyFailed` labels
  and a route-derived `navigationKey`.
- Overlay labels stay English regardless of the active UI locale, even
  when the visible product label is localized.
- Copied chip text follows the upstream
  [Copy Text Fallback Ladder][upstream-core] (`context > name: value`,
  `context > name`, `name: value`, `name`).
- Curated `data-developer-mode-*` markers always win over fallback
  heuristics. Prefer adding curated coverage for important product
  surfaces over expanding the scanner's fallback set.

## App-specific marker rules

These rules describe how curated markers map onto Kravhantering's UI
surfaces. They extend the generic Marker API with consumer policy and
should be updated alongside the relevant `devMarker(...)` call sites.

- Keep the control `name` stable and move runtime identity into `value`,
  for example `sort button: requirement id`, `filter button: status`, or
  theme state values like `light`, `dark`, and `auto`.
- Requirement package create/edit forms continue to use the `crud form`
  marker; their package-field help toggles are part of that same form
  surface rather than separate developer-mode markers.
- Reference-data CRUD forms may use shared field help toggles; those
  triggers stay inside the existing `crud form` surface rather than
  adding separate developer-mode markers.
- Navigation help triggers use the `navigation` context with button
  values `help toggle open` and `help toggle closed`.
- Auth account-detail rows keep their developer-mode values in English
  as `user info name`, `user info email`, `user info subject`, and
  `user info session expires` even when the visible labels are
  localized.
- Auth logout failures use the stable `text: logout error` marker so the
  localized alert text does not become the developer-mode identifier.
- Requirement package form save errors and package-list load errors stay
  inside the existing `packages` form/table surfaces; they do not add
  separate developer-mode markers.
- Shared CRUD admin panel load/delete errors expose
  `crud-admin-visible-error` in the affected admin page context so
  scanner checks can distinguish the visible banner from row/form
  controls.
- Requirement package list filtering exposes
  `packages > text field: name filter` on the Name search input above
  the table, while the package create trigger keeps the existing
  `packages > create button` marker when it shares that toolbar row on
  wide screens.
- Requirement package list requirement-area labels render as compact,
  non-interactive pills inside the existing `packages > crud table`
  surface; they do not add separate developer-mode marker names.
- Requirement package list edit and delete row actions render as icon-only
  buttons, but keep the existing `packages > table action: edit` and
  `packages > table action: delete` markers.
- Requirement package list requirement-area overflow toggles use
  `packages > table action: expand requirement areas` and
  `packages > table action: collapse requirement areas`.
- Requirement package detail header edit affordances use the
  `requirements specification detail` context with
  `detail action: edit package` on the icon trigger and
  `crud form: edit` on the opened editor.
- Requirement package detail left-panel create affordance for
  specification-local requirements uses the `requirements specification detail`
  context with `table action: create local requirement`.
- Specification-local inline detail views in package context use the
  `requirements specification detail` context with
  `detail pane: specification-local requirement`.
- The shared requirement-content card inside both catalog requirement
  details and specification-local inline details exposes the same
  `detail section` markers for requirement text, acceptance criteria,
  metadata, references, and scenarios. Specification-local scenario and
  reference chips also inherit the same marker naming pattern as the
  catalog detail card.
- Specification-local inline detail views also expose the same
  `report print button` surface on the right-side action rail as the
  package-item detail layout, while their local edit/delete controls
  continue to use `detail action`.
- Specification-local inline detail actions now use `detail action` markers
  for the right-side edit and delete buttons, mirroring the catalog
  detail-card action column pattern.
- The specification-local right-side action rail now mirrors the package-item
  rail's stacked button sizing and spacing, but it does not introduce
  any new developer-mode marker names beyond the existing
  print/deviation/detail action surfaces.
- Those existing specification-local edit/delete `detail action` controls may
  render disabled when usage status is not Included or when a deviation
  is still pending. In that state they are visually muted, but this
  state change does not add any new developer-mode markers.
- Specification-local inline details now also use the same outer inset as the
  catalog inline detail surface; this is a layout-only alignment change
  and does not add any new developer-mode markers.
- Package-context catalog requirement details expose the package report
  trigger as `report print button: package reports`. Its package menu
  entries use `report option` values `print history`,
  `download history pdf`, `print suggestion history`,
  `download suggestion history pdf`, `print deviation review`, and
  `download deviation review pdf` when those report paths are available.
- Package-context catalog requirement details may expose the extra
  `detail section` values `needs reference` and `package item status`
  when the requirement is opened from `Krav i kravunderlag`.
- The package-detail header may visually regroup the title,
  business-needs reference, and short metadata summary into a compact
  layout, including a wide-screen variant where the metadata sits
  beside the title. That layout does not introduce any separate
  developer-mode marker beyond the existing edit action.
- The package-detail page no longer renders a separate breadcrumb-style
  back control in that header area; browser navigation is the supported
  way back from this compact header.
- Published requirement detail views expose the package-link control as
  `detail action: add to package` when the currently displayed
  published version is the one that can be added to a package.
- Sticky requirements table headers keep their existing
  `requirements table > column header: ...` references while pinned;
  the sticky state does not introduce a separate developer-mode
  surface. The scrolling data table keeps the semantic header row while
  the pinned clone remains a presentational chrome surface. Existing
  `resize handle` markers continue to describe the shared live divider
  positions while the sticky header and scrolling body stay aligned
  during drag preview.
- Requirement package detail tables may render the
  `floating action rail` inline inside their sticky title bar; the
  marker name stays the same in both the fixed-right and inline-top
  layouts. On narrow screens, that sticky title bar and inline rail may
  wrap across multiple lines without changing marker names.
- On desktop package-detail split views, those inline rails live inside
  independently scrollable table cards; the marker names stay the same
  even though each table now scrolls within its own panel.
- The desktop package-detail split view may expand those list panels
  into a viewport-locked full-width shell, but that layout change does
  not add any new developer-mode markers beyond the existing table
  surfaces.
- The fixed-right rail on the main requirements catalog can also expose
  a `requirements table` marker for `table action: scroll to top`; it
  remains the last grouped pill in that rail when shown.
- Bulk-add failures from the package-detail available-requirements
  dialog now stay inline inside that existing modal; they do not add a
  separate developer-mode marker beyond the surrounding table and
  dialog surfaces.
- Help drawer overflow cues and lifecycle illustrations remain part of
  the existing `dialog` surface and do not add separate developer-mode
  markers.
- Requirement Types cards use the `requirement types` context with:
  - `type card: <type name>` on the card container
  - `iso badge` on the ISO/IEC 25010:2023 badge span
  - `quality heading` on the quality-characteristics section heading
- Needs-reference controls and inline loading or failure messages
  inside the add-to-package dialog remain part of that same
  `detail action: add to package` flow rather than introducing extra
  markers, including when those controls are temporarily disabled
  during submission.
- Requirement package list print pages expose `report state` markers
  with values `report-print:error`, `report-print:loading`, and
  `report-print:renderer`.
- Requirement package list PDF pages expose `report state` markers with
  values `report-pdf:error`, `report-pdf:loading`, and
  `report-pdf:ready`.
- AI Requirement Generator dialog uses the `ai-requirement-generator`
  context with `dialog: ai-requirement-generator` on the modal
  container, `dialog title` on the heading,
  `button: model selector` on the model dropdown trigger,
  `button: generate` / `button: create` / `button: close` /
  `button: cancel` on the footer actions, and `side panel` on the
  thinking trace / raw output pane.

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
- `dialog title`
- `side panel`
- `tab panel`
- `navigation`
- `create button`
- `crud form`
- `crud table`
- `crud-admin-visible-error`
- `error banner`
- `text field`
- `table action`
- `type card`
- `iso badge`
- `quality heading`
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
- `tests/unit/requirement-types-client.test.tsx`
- `tests/unit/requirement-package-detail-client.test.tsx`
- `tests/unit/navigation.test.tsx`
- `tests/unit/theme-toggle.test.tsx`
- `tests/unit/ai-requirement-generator-dev-markers.test.tsx`
- `tests/integration/developer-mode-overlay.spec.ts`
- `tests/integration/requirements-table-column-picker.spec.ts`

## Contributor Guardrails

If you change visible UI elements, labels, roles, or layout surfaces
that a human or AI might need to reference:

- update the relevant `devMarker(...)` calls or app-specific marker
  rules above
- update this document when the naming model, app-specific rules, or
  glossary changes
- update the affected unit and integration tests
- update repo instructions if the maintenance rule itself changes

[upstream-core]: https://github.com/viscalyx/developer-mode/blob/main/packages/developer-mode-core/README.md
[upstream-react]: https://github.com/viscalyx/developer-mode/blob/main/packages/developer-mode-react/README.md
[upstream-noop-guide]: https://github.com/viscalyx/developer-mode/blob/main/docs/production-noop-guide.md
[upstream-safelist]: https://github.com/viscalyx/developer-mode/blob/main/docs/safelist.md
