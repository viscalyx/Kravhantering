---
applyTo: "{lib/reports/**/*,components/reports/**/*,app/[locale]/kravkatalog/reports/**/*}"
---

# Reports

## Architecture

- Shared template + dual renderer pattern
- `lib/reports/` is engine-agnostic: no imports from `components/reports/` or `@react-pdf/renderer`
- Each engine is independently removable

## Changing Report Layout

- Edit the template in `lib/reports/templates/`, not the renderers
- Renderers only handle visual styling for their engine

## Changing Report Styling

- Edit `components/reports/print/` for browser print visuals
- Edit `components/reports/pdf/` for react-pdf visuals

## Adding a Section Type

1. Add variant to `ReportSection` union in `lib/reports/types.ts`
2. Add rendering in `components/reports/print/PrintReportRenderer.tsx`
3. Add rendering in `components/reports/pdf/PdfReportRenderer.tsx`

## Adding a Report Type

1. Add template in `lib/reports/templates/`
2. Add route pages under `app/.../reports/print/` and `app/.../reports/pdf/`
3. Add menu items in detail view or list view
4. Add translations to both locale files

## Adding an Engine

1. Create `components/reports/{engine}/` with renderer consuming `ReportModel`
2. Add route folder under `app/.../reports/{engine}/`
3. Add menu items referencing the new engine routes

## Removing an Engine

1. Delete `components/reports/{engine}/`
2. Delete `app/.../reports/{engine}/` routes
3. Remove menu items referencing that engine

## After Changes

- Update `docs/reports.md`
- Add translations to `messages/en.json` and `messages/sv.json`
- Run `npm run check`
