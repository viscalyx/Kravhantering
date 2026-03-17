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

## Report Page Rendering

- Report routes force light mode via `force-light-mode` class in the reports layout
- Navigation and footer are hidden on report pages (both screen and print)
- Styles are in `components/reports/print/print-styles.css`, imported by the reports layout

## Archiving vs Publishing Reviews

- Templates detect archiving reviews via `archiveInitiatedAt` on the review version
- Archiving reviews use distinct title, subtitle, and warning severity notices
- Combined report TOC groups archive requests before review change reports

## Report URLs

- Detail view uses `window.open` with locale prefix (`/${locale}/kravkatalog/reports/...`)
- List view floating pill uses `next-intl` `Link` without locale prefix (`/kravkatalog/reports/...`)
- Do not mix these patterns — `Link` auto-prefixes, `window.open` does not

## After Changes

- Update `docs/reports.md`
- Add translations to `messages/en.json` and `messages/sv.json`
- Run `npm run check`
