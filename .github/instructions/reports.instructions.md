---
applyTo: "{lib/reports/**/*,components/reports/**/*,app/[locale]/requirements/reports/**/*}"
---

# Reports

## Architecture

- Server-generated PDF is the report delivery mechanism.
- Shared template + server PDF renderer pattern.
- `lib/reports/` is engine-agnostic: no imports from `components/reports/` or `@react-pdf/renderer`.
- React-PDF stays server-only to preserve strict CSP compatibility.

## Changing Report Layout

- Edit the template in `lib/reports/templates/`, not the renderers
- Renderers only handle visual styling for their engine

## Changing Report Styling

- Edit `components/reports/pdf/` for react-pdf visuals

## Adding a Section Type

1. Add variant to `ReportSection` union in `lib/reports/types.ts`
2. Add rendering in `components/reports/pdf/PdfReportRenderer.tsx`

## Adding a Report Type

1. Add template in `lib/reports/templates/`
2. Add route handler under `app/.../reports/pdf/`
3. Add menu items in detail view or list view
4. Add translations to both locale files
5. Label PDF report menu items with only the report name.

## Removing an Engine

1. Delete `components/reports/{engine}/`
2. Delete `app/.../reports/{engine}/` routes
3. Remove menu items referencing that engine

## Report Page Rendering

- Report route handlers return binary PDF responses.

## Archiving vs Publishing Reviews

- Templates detect archiving reviews via `archiveInitiatedAt` on the review version
- Archiving reviews use distinct title, subtitle, and warning severity notices
- Combined report TOC groups archive requests before review change reports

## Report URLs

- Detail view PDF actions use locale-prefixed URLs (`/${locale}/requirements/reports/pdf/...`)
- List view PDF actions use locale-prefixed or current-locale-safe PDF route URLs.

## After Changes

- Update `docs/reference/reports.md` for report types, field profiles,
  CSV/export contracts, authorization, filenames, and output behavior.
- Update `docs/development/report-generation-developer-workflow.md` for
  implementation architecture, route patterns, and engine workflow.
- Add translations to `messages/en.json` and `messages/sv.json`
- Run `npm run check`
