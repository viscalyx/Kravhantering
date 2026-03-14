---
applyTo: "{components/**/*.tsx,app/[locale]/kravkatalog/**/*.tsx,app/api/**/*.ts,lib/**/*.ts,i18n/**/*.ts,drizzle/{schema.ts,seed.ts},tests/**/*.test.ts,tests/**/*.test.tsx,tests/**/*.spec.ts,tests/**/*.spec.tsx,docs/*.md}"
---

# Add Requirement Column Or Property

## Scope

- Apply this when adding, removing, renaming, or exposing a requirement property in any kravkatalog surface.
- Include list columns, filters, edit form fields, create form fields, inline detail pane content, dedicated requirement detail views, CSV export, and MCP output.

## Column Registry

- If the property is shown as a list column, add the column id to `REQUIREMENT_COLUMN_ORDER` in `lib/requirements/list-view.ts`.
- If the property is shown as a list column, add a `REQUIREMENT_LIST_COLUMNS` entry with `labelKey`, `labelNamespace`, visibility, width, resize, sort, and hide rules.
- Add the column to `REQUIREMENT_SORT_FIELDS` only if backend sorting is implemented.
- Keep `uniqueId` and `description` locked and always visible.

## Admin Defaults

- Treat list order and default visibility as org-managed defaults, not hardcoded UI state.
- Ensure the new column flows through `DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS` via the list-view registry.
- Seed `requirement_list_column_defaults` in `drizzle/seed.ts` with the new column id, `sort_order`, and `is_default_visible`.
- If the column is persisted in the admin API payload, ensure `app/api/admin/requirement-columns/route.ts` still validates the full column set.
- Reset actions must return to admin-managed defaults, not stale local defaults.

## Terminology

- If the property label is one of the admin-configurable term families, add or update the mapping in `lib/ui-terminology.ts`.
- Update both `messages/en.json` and `messages/sv.json` with fallback labels.
- Bind all visible labels to translation keys. Do not hardcode labels in list headers, edit forms, inline detail panes, detail pages, CSV, service output, or MCP HTML.
- If the new column introduces a new configurable term family, add it to:
  - `UI_TERM_KEYS`
  - add default terminology values
  - wire the message bindings
  - update admin terminology UI expectations
  - extend the terminology route tests

## Data Wiring

- Add the field to the correct backend shape. Do not add UI-only properties without real data wiring.
- Wire requirement data through the DAL, service layer, detail/edit payloads, `RequirementRow`, and any form or detail component that shows it.
- Update `components/RequirementForm.tsx` and request payload validation for create/edit flows.
- Update the inline detail pane and dedicated requirement detail view renderers and tests.
- Add the table column config and renderer when the property appears in the list.
- Implement filter state, parsing, clear-on-hide behavior, and UI controls when the property is filterable.
- Implement backend sorting before exposing table sort when the property is sortable.
- Add CSV export handling in `app/api/requirements/route.ts` when needed.
- Update human-text generators in `lib/requirements/service.ts` and `lib/mcp/server.ts` when the property name or value appears there.

## Persistence

- If the new column requires new schema fields or tables, update `drizzle/schema.ts`, generate a migration, and update `drizzle/seed.ts`.
- Run `npm run db:generate` after schema changes.
- Run `npm run db:setup` after schema or seed changes.

## Verification

- Update `tests/unit/requirement-list-view.test.ts` for order, visibility, parsing, reset, and filter-clearing when the property is a list column.
- Update `tests/unit/requirements-table.test.tsx` for list rendering, resize, filter, or popover changes.
- Update `tests/unit/kravkatalog-client.test.tsx` for first render, local overrides, and floating actions when needed.
- Update `tests/unit/requirement-detail-client.test.tsx` when the inline detail pane or detail view changes.
- Update `tests/unit/requirements-route.test.ts` for CSV header or export field changes.
- Update `tests/unit/requirements-service.test.ts` and `tests/unit/mcp-http.test.ts` for service or MCP output changes.
- Update `tests/integration/requirements-table-hydration.spec.ts` when default visible headers change.
- Update `tests/integration/admin-entrypoint.spec.ts` when the admin settings flow changes.
- Update `docs/kravkatalog-ui-behaviour.md` when visible table, form, or inline detail behavior changes.
