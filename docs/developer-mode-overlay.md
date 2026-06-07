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
those specifications in, which marker names are canonical for our UI surfaces,
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
- Production builds (`NODE_ENV=production`, including prodlike builds) always
  alias both specifications to first-party noop stubs in
  [`lib/runtime/`](../lib/runtime/) so neither the overlay runtime nor
  any reference to the upstream specifications is shipped to clients.
  `ENABLE_DEVELOPER_MODE=true` is ignored in production and logs a build-time
  warning.
- Non-production builds outside local development may set
  `ENABLE_DEVELOPER_MODE=true` for explicit local experiments.
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
For the full wiring rationale, two alias-swap strategies, and the
drift-guard test pattern, see the upstream
[production-noop-guide][upstream-noop-guide].

## App contract

- App code creates markers through [`lib/developer-mode-markers.ts`](../lib/developer-mode-markers.ts)
  rather than calling the specification's `devMarker(...)` directly. This
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
- Requirements specification create/edit forms continue to use the `crud form`
  marker; their specification-field help toggles are part of that same form
  surface rather than separate developer-mode markers.
- Reference-data CRUD forms may use shared field help toggles; those
  triggers stay inside the existing `crud form` surface rather than
  adding separate developer-mode markers.
- Admin Center Dataskydd field help toggles stay inside the existing
  `tab panel: privacy` surface rather than adding separate developer-mode
  markers.
- Admin Center Behörighetsöversyn controls stay inside the existing
  `tab panel: access review` surface. Individual review rows, decision
  selectors, comments, field help toggles, cancel buttons, and export buttons
  and error popups do not add separate developer-mode marker names unless a
  later scanner needs to distinguish one control family.
- Admin Center Åtgärdslogg controls stay inside the existing
  `tab panel: action log` surface. Filters, pagination, CSV export, and
  table cells do not add separate developer-mode marker names unless a later
  scanner needs to distinguish one control family.
- Navigation help triggers use the `navigation` context with button
  values `help toggle open` and `help toggle closed`.
- The app title link in the navigation uses `navigation > link: app title`
  and carries the build-version tooltip when generated metadata is available.
- The `Kravbiblioteksförvaltning` navigation disclosure uses
  `navigation > stewardship disclosure: open|closed`, and its inline submenu
  uses `navigation > stewardship submenu: inline row`. The separate decorative
  desktop backgrounds behind the disclosure and submenu belong to that same
  submenu surface and do not add separate markers.
- The delayed stewardship route change spinner uses
  `navigation > transition mask: stewardship` only when navigation takes longer
  than two seconds.
- Auth account-detail rows keep their developer-mode values in English
  as `user info name`, `user info email`, `user info subject`, and
  `user info session expires` even when the visible labels are
  localized.
- Auth data-export navigation uses `link: data export` in both the desktop
  account popover and the mobile signed-in menu. The self-service privacy page
  uses `page: privacy data export` for the main export surface.
- Auth logout failures use the stable `text: logout error` marker so the
  localized alert text does not become the developer-mode identifier.
- Auth expiry and expired-authentication warnings use the shared
  `dialog` marker from `ConfirmModal`; they do not add a separate auth-specific
  developer-mode surface.
- Auth callback failures expose the `authentication` context with
  `auth callback error: <code>` on the public `/auth/error` surface. The retry
  control uses `link: retry sign in`.
- Requirements specification form save errors and specification-list load errors
  stay
  inside the existing `specifications` form/table surfaces; they do not add
  separate developer-mode markers.
- Shared CRUD admin panel load/delete errors expose
  `crud-admin-visible-error` in the affected admin page context so
  scanner checks can distinguish the visible banner from row/form
  controls.
- App Router error recovery pages expose the `error boundary` context with
  `error recovery: locale`, `error recovery: root`, or
  `error recovery: global` on the visible fallback surface. Their retry
  control uses `button: retry`, and safe navigation links use
  `link: requirements recovery` or `link: admin recovery`.
- Requirements specification list filtering exposes
  `specifications > text field: name filter` on the Name search input above
  the table. Its create trigger lives in the fixed `floating action rail`
  as `specifications > floating pill: new specification`.
- Requirements packages expose their create trigger in the fixed
  `floating action rail` as
  `requirementPackages > floating pill: new requirement package`. The new
  package form opens in the shared `dialog: new requirement package` surface;
  editing opens the same modal surface as `dialog: edit requirement package`.
  The package name-or-description search field renders as
  `requirementPackages > text field: name or description filter`. Package list
  row actions render as icon-only buttons and keep their developer-mode markers
  as
  `requirementPackages > table action: edit`, `archive`, `reactivate`, and
  `delete`.
- Requirement selection questions expose their create trigger in the fixed
  `floating action rail` as
  `requirementSelectionQuestions > floating pill: new requirement selection question`.
  The new question form opens in the shared
  `dialog: new requirement selection question` surface.
  Requirement-area group headers render as
  `requirementSelectionQuestions > requirement area heading: <prefix>`, and
  compact question rows render as
  `requirementSelectionQuestions > question disclosure: <question code>`.
  Question row drag handles render as
  `requirementSelectionQuestions > question reorder handle: <question code>`.
  Hierarchy badges for questions that participate in visibility-condition
  hierarchies render as
  `requirementSelectionQuestions > hierarchy badge: <question code>`. The
  read-only hierarchy modal renders as
  `dialog: requirement selection question hierarchy` and marks its inner graph
  surfaces as `requirementSelectionQuestions > hierarchy dialog: <question
  code>`, `hierarchy graph: <question code>`, and `hierarchy node: <question
  code>`.
  Each question renders its contextual answer-create trigger as
  `requirementSelectionQuestions > button: new requirement selection answer`.
  New and edited answer forms open as `dialog: new requirement selection answer`
  and `dialog: edit requirement selection answer`. The answer modal exposes
  `requirementSelectionQuestions > answer form column: fields`,
  `requirementSelectionQuestions > answer form column: source workspace`,
  `requirementSelectionQuestions > answer form workspace: source selection`,
  and
  `requirementSelectionQuestions > answer form workspace: requirements in selection`;
  the answer fields column omits the visible modal title, visible question ID,
  close icon, and manual answer sort-order editing because answer order is
  managed from the answer list. Rows in `Krav i urvalet` render under
  `requirementSelectionQuestions > answer form > requirements in selection`
  as `requirement in selection: <ID>`, and the read-only detail card reuses the
  library inline-detail card layout while rendering as `matched requirement
  detail`. Saved answer rows keep the count disclosure before the compact
  source pills with a small separator; those pills filter the expanded answer
  requirement list. Expanded rows show direct and package source
  badges without adding separate Developer Mode markers.
  Search, area/status filters, edit buttons, question-form requirement-area
  descriptions and lock hints, answer row reorder handles, and health badges
  render inside the existing `requirementSelectionQuestions` form/list surfaces.
- Requirements specification list requirement-area labels render as compact,
  non-interactive pills inside the existing `specifications > crud table`
  surface; they do not add separate developer-mode marker names.
- Requirements specification list responsible-person metadata renders inside the
  existing `specifications > crud table` surface, and the create/edit controls
  stay inside the existing `specifications > crud form` surface.
- Requirements specification list edit and delete row actions render as icon-only
  buttons, but keep the existing `specifications > table action: edit` and
  `specifications > table action: delete` markers.
- Requirements specification list requirement-area overflow toggles use
  `specifications > table action: expand requirement areas` and
  `specifications > table action: collapse requirement areas`.
- Requirements specification detail header edit affordances use the
  `requirements specification detail` context with
  `detail action: edit specification` on the icon trigger and
  `crud form: edit` on the opened editor.
- Requirements specification detail left-panel create affordances use the
  `requirements specification detail` context with `table action` values
  `create local requirement` and `create needs reference`. They live in the
  sticky list header beside the embedded left-panel tabs.
- Requirements specification detail right-panel tabs cover both available
  requirements and requirement-selection questions and live in the sticky panel
  header, matching the left-panel tab treatment. The
  `Filtrera med kravurvalsfrågor` switch is a regular product control in the
  available-requirements sticky action area and does not introduce a separate
  Developer Mode marker. The question controls reuse the existing form/table
  control markers; search/filter controls, optimistic save status, match
  summaries, and `Saknar kravurval` badges do not introduce separate marker
  names. No mandatory-question marker exists because requirement-selection
  questions are always optional.
- Specification-local inline detail views in specification context use the
  `requirements specification detail` context with
  `detail pane: specification-local requirement`.
- The shared requirement-content card inside both library requirement
  details and specification-local inline details exposes the same
  `detail section` markers for requirement text, acceptance criteria,
  metadata, references, and requirement packages. Specification-local
  requirement-package and reference chips also inherit the same marker naming
  pattern as the library detail card.
- Specification-local inline detail views also expose the same
  `report print button` surface on the right-side action rail as the
  specification-item detail layout, while their local edit/delete controls
  continue to use `detail action`.
- Specification-local inline detail actions now use `detail action` markers
  for the right-side edit, delete, and graduate-to-library buttons, mirroring
  the library detail-card action column pattern.
- The specification-local right-side action rail now mirrors the specification-item
  rail's stacked button sizing and spacing. Opening the graduation target-area
  picker adds the shared `dialog` marker with value
  `graduate-local-requirement`; the rail itself keeps the existing
  print/deviation/detail action marker surfaces.
- Those existing specification-local edit/delete `detail action` controls may
  render disabled when usage status is not Included or when a deviation is still
  pending. The graduation action is disabled when usage status is not Included.
  In either disabled state the controls are visually muted, but this
  state change does not add any new developer-mode markers.
- Specification-local inline details now also use the same outer inset as the
  library inline detail surface; this is a layout-only alignment change
  and does not add any new developer-mode markers.
- Specification-context library requirement details expose the specification report
  trigger as `report print button: specification reports`. Its specification menu
  entries use `report option` values `print history`,
  `download history pdf`, `print suggestion history`,
  `download suggestion history pdf`, `print deviation review`, and
  `download deviation review pdf` when those report paths are available.
- Specification-context library requirement details may expose the extra
  `detail section` values `needs reference` and `usage status`
  when the requirement is opened from `Krav i kravunderlag`.
- The specification-detail header may visually regroup the title,
  specification purpose, specification lead, and short metadata summary into
  a compact layout where the metadata row sits to the right of the title on
  wide screens and the metadata cards stay on one horizontal row. That layout
  does not introduce any separate developer-mode marker beyond the existing edit
  action.
- The specification-detail page no longer renders a separate breadcrumb-style
  back control in that header area; browser navigation is the supported
  way back from this compact header.
- Published requirement detail views expose the specification-link control as
  `detail action: add to specification` when the currently displayed
  published version is the one that can be added to a specification.
- Sticky requirements table headers keep their existing
  `requirements table > column header: ...` references while pinned;
  the sticky state does not introduce a separate developer-mode
  surface. The scrolling data table keeps the semantic header row while
  the pinned clone remains a presentational chrome surface. Existing
  `resize handle` markers continue to describe the shared live divider
  positions while the sticky header and scrolling body stay aligned
  during drag preview.
- Requirements specification detail tables may render the
  `floating action rail` inline inside their sticky title bar; the
  marker name stays the same in both the fixed-right and inline-top
  layouts. On narrow screens, that sticky title bar and inline rail may
  wrap across multiple lines without changing marker names.
- On desktop specification-detail split views, those inline rails live inside
  independently scrollable table cards; the marker names stay the same
  even though each table now scrolls within its own panel.
- The desktop specification-detail split view may expand those list panels
  into a viewport-locked full-width shell, but that layout change does
  not add any new developer-mode markers beyond the existing table
  surfaces.
- The fixed-right rail on the main requirements library can also expose
  a `requirements table` marker for `table action: scroll to top`; it
  remains the last grouped pill in that rail when shown.
- Bulk-add failures from the specification-detail available-requirements
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
- Needs-reference controls and inline loading or failure messages inside the
  add-to-specification dialog remain part of that same
  `detail action: add to specification` flow rather than introducing extra
  markers, including when those controls are temporarily disabled during
  submission.
- Status and risk icon pickers on Admin status and risk forms remain inside the
  existing `crud form` and `crud table` surfaces. They do not introduce new
  developer-mode markers; verify visible behavior through the surrounding
  status, usage-status, or risk-level page marker.
- Admin CRUD empty-state rows use the current page context with `empty state`.
  When the table supports creation, the inline empty-state CTA uses
  `empty state create button` and opens the same create form as the page header.
- Requirements specification list print pages expose `report state` markers
  with values `report-print:error`, `report-print:loading`, and
  `report-print:renderer`.
- PDF downloads use the shared modal marker `dialog` with values
  `Generating PDF` and `PDF download error`; specification list PDFs no longer
  render an intermediate client-side PDF page.
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
  - Admin Center uses this marker for all top tabs, including privileged tabs
    that render disabled when the current user lacks the required role.
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
- `requirement package chip`
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
- `empty state`
- `empty state create button`
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
- `tests/unit/requirement-specification-detail-client.test.tsx`
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

[upstream-core]: https://github.com/viscalyx/developer-mode/blob/main/specifications/developer-mode-core/README.md
[upstream-react]: https://github.com/viscalyx/developer-mode/blob/main/specifications/developer-mode-react/README.md
[upstream-noop-guide]: https://github.com/viscalyx/developer-mode/blob/main/docs/production-noop-guide.md
[upstream-safelist]: https://github.com/viscalyx/developer-mode/blob/main/docs/safelist.md
