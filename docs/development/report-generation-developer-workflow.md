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
  lib/pdf/report-worker-entry.ts        Isolated list-PDF renderer entry
  lib/pdf/report-worker.ts              Worker lifecycle/error mapping
  app/[locale]/requirements/reports/pdf/       Route handlers
  app/[locale]/specifications/[specificationId]/reports/pdf/[profile]
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
   The large requirements-list route uses the isolated worker; smaller existing
   report routes keep the direct Node renderer.
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
`/[locale]/specifications/[specificationId]/reports`:

- **Procurement requirements appendix**:
  `.../pdf/procurement`
- **Progress report**:
  `.../pdf/progress`
- **Management report**:
  `.../pdf/management`
- **Requirement application traceability**:
  `.../pdf/traceability?locale=sv&sortBy=uniqueId&sortDirection=asc`

The traceability route accepts the normalized requirements specification item
filters and ordering. It and lifecycle-profile/CSV collectors use the shared
bounded server traversal; complete formal output must never depend on browser
loaded-page state.

## PDF Rendering

Server PDF uses `@react-pdf/renderer` only from Node route handlers to render
the shared report model to binary PDF. It is the path for report delivery,
sharing, and archival output. The browser never imports React-PDF, which keeps
production CSP compatible with strict `script-src` values and avoids
`unsafe-eval`/WebAssembly eval exceptions.

The shared client helper opens immediately, shows separate indeterminate
generation and Blob-download phases, supports cancellation, and maps only
stable generated-output error codes. User-facing report menu labels use only
the report name for PDF actions, without a download verb or `(PDF)` suffix.

The large list-PDF route writes only to a private spool file and invokes
`renderReportInWorker()`. It passes the literal
`./lib/pdf/report-worker-entry.ts` filename to `node:worker_threads`.
Next.js 16.2.10 Turbopack compiles that entry and its TSX renderer, project
aliases, translations, privacy formatting, React-PDF graph, and icon allowlist
as part of the normal Next.js build. Standalone output retains the emitted
worker bootstrap and traced dependency chunks without a generated root-level
worker artifact or PDF-specific postbuild step.

The production gate starts the built or prodlike runtime and exercises the
real list-PDF endpoint. The gate requires a successful `application/pdf`
response and covers the configured private spool filesystem through the same
route used by clients. `KRAVHANTERING_EXPORT_TEMP_DIR` keeps its blank-value
fallback and absolute-path requirement. An explicit directory must already
exist and grant the non-root operating-system account under which the Node.js
process runs read, write, and search access while remaining inaccessible to
other users.

When changing the worker entry or renderer dependencies, run:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000 npm run build:local-prod
npm run test:integration:prodlike -- \
  tests/integration/00-report-pdf/authorization-boundaries.spec.ts
```

Before accepting a packaging change, inspect `.next/standalone` for the
Turbopack worker bootstrap and run the endpoint gate without a legacy
`bundled/pdf-report-worker.cjs` file.

The worker must report byte-limit and storage failures explicitly. The parent
maps V8 `ERR_WORKER_OUT_OF_MEMORY` separately from an unexpected error/exit,
awaits termination on abort, and must never leak worker text, stack, or paths
to the client.

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
