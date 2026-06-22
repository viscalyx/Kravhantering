# Report Generation Developer Workflow

This document covers implementation architecture and contributor workflow for
report generation. Product-facing report types, field profiles, CSV contracts,
authorization behavior, filenames, and output semantics live in
[reports.md](../governance/reports.md).

## Architecture

```text
Shared Layer (engine-agnostic)
  lib/reports/types.ts              Report model types
  lib/reports/text-diff.ts          Word-level diff utility
  lib/reports/data/                 Data fetching helpers
  lib/reports/templates/            Template functions (data -> ReportModel)

Browser Print Engine
  components/reports/print/            PrintReportRenderer + CSS
  app/[locale]/requirements/reports/print/     Route pages
  app/[locale]/specifications/[slug]/reports/print/
                                       Specification route pages

Server PDF Engine
  components/reports/pdf/              PdfReportRenderer
  lib/pdf/server-response.tsx          React-PDF Node response helper
  app/[locale]/requirements/reports/pdf/       Route handlers
  app/[locale]/specifications/[slug]/reports/pdf/[profile]
                                       Specification route handler
  components/reports/pdf/useServerPdfDownload.tsx
                                       Delayed client download UX
```

Report builders and template functions stay pure. They receive already
authorized report data and do not call the authorization service themselves.

## Data Flow

1. Route/page authorizes the requested report scope.
2. Route/page collects report data server-side.
3. Template function converts raw data into a `ReportModel`, an array of typed
   sections like header, diff, version-summary, and timeline-entry.
4. Engine-specific renderer consumes the `ReportModel` and produces output.
5. PDF routes return binary `application/pdf` responses with attachment headers
   and `Cache-Control: no-store`.

## Route URL Patterns

Print engine routes live under `.../reports/print/`, PDF engine routes live
under `.../reports/pdf/`.

- **History**: `.../print/history/[id]` | `.../pdf/history/[id]`
- **Review**: `.../print/review/[id]` | `.../pdf/review/[id]`
- **List**: `.../print/list?ids=...` | `.../pdf/list?ids=...`
- **Combined**: `.../print/review-combined?ids=...` |
  `.../pdf/review-combined?ids=...`
- **Suggestion History**:
  `.../print/suggestion-history/[id]` |
  `.../pdf/suggestion-history/[id]`

All routes above are prefixed with `/[locale]/requirements/reports`.

Requirements specification reports use a separate prefix
`/[locale]/specifications/[slug]/reports`:

- **Procurement requirements appendix**:
  `.../print/procurement` | `.../pdf/procurement`
- **Progress report**:
  `.../print/progress` | `.../pdf/progress`
- **Management report**:
  `.../print/management` | `.../pdf/management`

Detail view uses `window.open` with the locale prefix, for example
`/${locale}/requirements/reports/...`. The list view floating pill uses
`next-intl` `Link` without a locale prefix, for example
`/requirements/reports/...`.

## Engines

### Browser Print

Browser print opens a dedicated route in a new tab, renders the report as
HTML/CSS, and triggers `window.print()`. The user saves as PDF via the browser's
print dialog. It uses `@media print` CSS for page margins, page breaks, and
hiding screen-only elements.

Print report routes are wrapped in a layout that forces light mode rendering
regardless of the app's dark mode setting. The app navigation and footer are
hidden on report pages, both on screen and in print. Styles are in
`components/reports/print/print-styles.css`, which is imported by the reports
layout.

### Server PDF

Server PDF uses `@react-pdf/renderer` only from Node route handlers to render
the shared report model to binary PDF. The browser never imports React-PDF,
which keeps production CSP compatible with strict `script-src` values and
avoids `unsafe-eval`/WebAssembly eval exceptions.

The client download helper fetches the route as a blob, shows a temporary
"Generating PDF..." modal after two seconds, and closes it as soon as the blob
download is triggered.

## Adding a Report Type

1. Create a template in `lib/reports/templates/` that returns a `ReportModel`.
2. Add route pages/handlers under both `app/.../reports/print/` and
   `app/.../reports/pdf/`.
3. In server PDF handlers, authorize the report scope before collecting data.
4. Add menu items in the detail view or list view to open the report.
5. Add translations to both `messages/en.json` and `messages/sv.json`.
6. Update [reports.md](../governance/reports.md) when the change affects report
   types, field profiles, CSV/export contracts, authorization, filenames, or
   output behavior.

## Adding or Removing an Engine

To add an engine, create `components/reports/{engine}/` with a renderer that
consumes `ReportModel`, then add route pages under
`app/.../reports/{engine}/`.

To remove an engine, delete `components/reports/{engine}/` and
`app/.../reports/{engine}/` routes, then remove the corresponding menu items.
