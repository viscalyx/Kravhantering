# Developer Mode Overlay

Developer Mode is a hidden developer-help overlay that gives visible UI
surfaces stable names. It exists so contributors, tests, and AI agents can refer
to the same control without depending on Swedish UI text, DOM shape, or CSS
classes.

This document is the app-side contributor guide for Developer Mode in
Kravhantering. The exact marker set lives in code and tests; this document
defines the naming policy, update checklist, and runtime wiring.

## Who Should Read This

Read this when you change visible UI surfaces, labels, roles, layout surfaces,
or controls that tests or AI prompts may need to reference.

You normally do not need this document for:

- pure styling changes where existing markers still describe the same surface
- internal data or service changes with no visible UI impact
- one-off product copy changes where no marker names change

## Why We Keep It

Developer Mode markers are an internal contract. They are used by:

- Playwright and unit tests that locate stable UI surfaces
- contributors who need to describe a UI element precisely in reviews or tasks
- AI-assisted workflows that need durable references to controls and panels

Renaming a marker is therefore similar to renaming a test selector. It can be
valid, but it should be intentional and covered by the same code, docs, and
test update.

## Activation

Local development enables Developer Mode automatically. Toggle the overlay with
the upstream shortcut:

- macOS: `Command+Option+Shift+H`
- Windows/Linux: `Ctrl+Alt+Shift+H`

Focus a non-editable part of the page first. The shortcut is ignored inside
inputs, textareas, selects, and `[contenteditable]` regions. Enabled state
survives client-side navigation and resets on hard reload.

## Runtime Wiring

The runtime comes from upstream packages:

- `@viscalyx/developer-mode-core`: marker helpers, target scanning, copy-text
  formatting, and shortcut constants. See the [core README][upstream-core].
- `@viscalyx/developer-mode-react`: provider, overlay portal, hover outline,
  badge, chip, and copy toast. See the [react README][upstream-react].

App wiring:

- App code creates markers through
  [`lib/developer-mode-markers.ts`](../../lib/developer-mode-markers.ts), not by
  calling the upstream package directly.
- [`components/DeveloperModeProvider.tsx`](../../components/DeveloperModeProvider.tsx)
  supplies the English overlay labels and route-derived navigation key.
- Production builds, including prodlike builds, alias the upstream packages to
  first-party noop stubs in [`lib/runtime/`](../../lib/runtime). The overlay
  runtime and marker attributes are not shipped when `NODE_ENV=production`.
- `ENABLE_DEVELOPER_MODE=true` is ignored in production and logs a build-time
  warning. Non-production builds outside local development may use it for
  explicit experiments.
- Tailwind includes the overlay utility classes through the published
  `@viscalyx/developer-mode-react/safelist.css` import in
  [`app/globals.css`](../../app/globals.css). See the upstream
  [safelist guide][upstream-safelist].

For the production alias rationale, see the upstream
[production noop guide][upstream-noop-guide].

## Marker Contract

`devMarker(...)` emits these attributes:

- `data-developer-mode-context`
- `data-developer-mode-name`
- `data-developer-mode-value`
- `data-developer-mode-priority`

Copied chip text follows the upstream fallback ladder:

- `context > name: value`
- `context > name`
- `name: value`
- `name`

Curated markers win over fallback scanner output. Prefer a curated marker for
important product surfaces instead of expanding generic scanner heuristics.

## Naming Rules

Use stable English names for the marker contract, even when the visible product
UI is localized.

- Use `context` for the page, panel, table, or workflow area, for example
  `requirements table`, `navigation`, or `requirements specification detail`.
- Use `name` for the stable control or surface type, for example
  `filter button`, `dialog`, `crud form`, `detail section`, or `table action`.
- Use `value` for the specific instance, state, or domain identifier, for
  example `requirement id`, `edit`, `INT0001`, or `specification reports`.
- Keep `name` stable when runtime identity changes. Put runtime identity in
  `value`.
- Prefer existing marker names before introducing a new one.
- Mark durable surfaces, not every decorative child element.
- Do not use localized visible labels as marker names. Values may contain a
  domain value when that is the clearest stable identifier.
- Add a new marker only when a human, test, or AI workflow must distinguish that
  surface from its surrounding context.

Examples:

```ts
devMarker({
  context: 'requirements table',
  name: 'filter button',
  value: 'requirement id',
})
```

```ts
devMarker({
  context: 'requirements specification detail',
  name: 'detail action',
  value: 'edit specification',
})
```

## Common Marker Names

These names are intentionally reused across the app. Check nearby code and tests
before adding another variant.

Core layout:

- `navigation`
- `tab panel`
- `dialog`
- `dialog title`
- `side panel`
- `floating action rail`
- `floating pill`
- `floating pill menu`

Tables and lists:

- `requirements table`
- `table space`
- `column header`
- `sort button`
- `filter button`
- `resize handle`
- `header chip`
- `table row`
- `row checkbox`
- `column picker`
- `column picker option`

Detail views:

- `inline detail pane`
- `detail section`
- `detail action`
- `reference item`
- `requirement package chip`
- `version history`
- `version pill`
- `version history toggle`

Forms and admin:

- `create button`
- `crud form`
- `crud table`
- `crud-admin-visible-error`
- `empty state`
- `empty state create button`
- `error banner`
- `text field`
- `table action`
- `edge tab`

Status, reports, and cards:

- `status stepper`
- `status step`
- `type card`
- `iso badge`
- `quality heading`
- `report button`
- `report option`
- `report state`

## Update Checklist

When changing visible UI surfaces that are covered by Developer Mode:

1. Update the relevant `devMarker(...)` call sites or scanner heuristics.
2. Reuse the naming rules and common names above.
3. Update unit tests that assert marker attributes.
4. Update integration tests when overlay behavior, copied chip text, or
   cross-page persistence changes.
5. Update this document only when the naming policy, runtime wiring, common
   vocabulary, or contributor checklist changes.
6. Update repo instructions only when the maintenance rule itself changes.

Do not update this document for every new individual marker. The code and tests
are the source of truth for exact current coverage.

## Tests

Developer Mode coverage is split between marker-contract tests and overlay
behavior tests.

Core tests:

- `tests/unit/developer-mode.test.ts`
- `tests/unit/developer-mode-provider.test.tsx`
- `tests/unit/next-config.test.ts`
- `tests/integration/developer-mode/overlay.spec.ts`

Representative marker coverage:

- `tests/unit/requirements-table.test.tsx`
- `tests/unit/requirement-detail-client.test.tsx`
- `tests/unit/requirements-specification-detail-client.test.tsx`
- `tests/unit/reference-data-developer-mode.test.tsx`
- `tests/unit/navigation.test.tsx`
- `tests/unit/theme-toggle.test.tsx`
- `tests/unit/status-stepper.test.tsx`
- `tests/unit/version-history.test.tsx`
- `tests/unit/ai-requirement-generator-dev-markers.test.tsx`

The integration flow documentation lives in
`tests/integration/developer-mode/overlay.spec.ts`.

[upstream-core]: https://github.com/viscalyx/developer-mode/blob/main/specifications/developer-mode-core/README.md
[upstream-react]: https://github.com/viscalyx/developer-mode/blob/main/specifications/developer-mode-react/README.md
[upstream-noop-guide]: https://github.com/viscalyx/developer-mode/blob/main/docs/production-noop-guide.md
[upstream-safelist]: https://github.com/viscalyx/developer-mode/blob/main/docs/safelist.md
