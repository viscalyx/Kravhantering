# Report Generation Developer Workflow

This document covers implementation architecture and contributor workflow for
report generation. Product-facing report types, field profiles, CSV contracts,
authorization behavior, filenames, and output semantics live in
[reports.md](../reference/reports.md).

## Architecture

Server-generated PDF is the report delivery mechanism. The server PDF renderer
consumes the shared report model.

```text
Shared Layer (engine-agnostic)
  lib/reports/types.ts              Report model types
  lib/reports/text-diff.ts          Word-level diff utility
  lib/reports/data/                 Data fetching helpers
  lib/reports/templates/            Template functions (data -> ReportModel)

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

PDF routes live under `.../reports/pdf/`.

- **History**: `.../pdf/history/[id]`
- **Review**: `.../pdf/review/[id]`
- **List**: `.../pdf/list?sortBy=...&sortDirection=...&statuses=...` for the
  requirement rows resolved server-side from the list view's current filters and
  sort order. The route still accepts `ids=...` for explicit direct calls.
- **Combined**: `.../pdf/review-combined?ids=...`
- **Improvement Suggestion History**: `.../pdf/suggestion-history/[id]`

All routes above are prefixed with `/[locale]/requirements/reports`.

Requirements specification reports use a separate prefix
`/[locale]/specifications/[slug]/reports`:

- **Procurement requirements appendix**:
  `.../pdf/procurement`
- **Progress report**:
  `.../pdf/progress`
- **Management report**:
  `.../pdf/management`
- **Requirement application traceability**:
  `.../pdf/traceability?refs=lib:31,local:41`

The detail view must keep traceability PDF menu actions hidden when the
filtered requirement application list exceeds that cap.

## PDF Rendering

Server PDF uses `@react-pdf/renderer` only from Node route handlers to render
the shared report model to binary PDF. It is the path for report delivery,
sharing, and archival output. The browser never imports React-PDF, which keeps
production CSP compatible with strict `script-src` values and avoids
`unsafe-eval`/WebAssembly eval exceptions.

The client helper fetches the route as a blob, shows a temporary
"Generating PDF..." modal after two seconds, and closes it as soon as the PDF
file handoff is triggered. User-facing report menu labels use only the report
name for PDF actions, without a download verb or `(PDF)` suffix.

## Adding a Report Type

1. Create a template in `lib/reports/templates/` that returns a `ReportModel`.
2. Add a route handler under `app/.../reports/pdf/`.
3. In server PDF handlers, authorize the report scope before collecting data.
4. Add menu items in the detail view or list view to open the report. PDF menu
   item labels must be the report name only.
5. Add translations to both `messages/en.json` and `messages/sv.json`.
6. Update [reports.md](../reference/reports.md) when the change affects report
   types, field profiles, CSV/export contracts, authorization, filenames, or
   output behavior.
