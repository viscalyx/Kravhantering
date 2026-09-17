# Report Generation Developer Workflow

Use this workflow when adding reports, changing their layout or styling, or
changing PDF delivery and packaging. Product-facing report types, field
profiles, CSV contracts, authorization behavior, filenames, and output semantics
live in
[reports.md](../reference/reports.md).

## Architecture

Server-generated PDF is the report delivery mechanism. The server PDF renderer
consumes the shared report model.

```text
Shared Layer (engine-agnostic)
  lib/reports/types.ts              Report model types
  lib/reports/priority.ts           Priority normalization and PDF colors
  lib/reports/text-diff.ts          Word-level diff utility
  lib/reports/data/                 Data fetching helpers
  lib/reports/templates/            Template functions (data -> ReportModel)

Server PDF Engine
  components/reports/pdf/              PdfReportRenderer
  lib/pdf/server-response.tsx          React-PDF Node response helper
  lib/pdf/report-worker-entry.ts       Isolated list/privacy PDF renderer
  lib/pdf/report-worker.ts              Worker lifecycle/error mapping
  app/[locale]/requirements/reports/pdf/       Route handlers
  app/[locale]/specifications/[specificationId]/reports/pdf/[profile]
                                       Specification route handler
  components/generated-output/useGeneratedOutputDownload.tsx
                                       Immediate two-phase client helper
```

Report builders and template functions stay pure. They receive already
authorized report data and do not call the authorization service themselves.
Keep `lib/reports/` independent of React-PDF and `components/reports/`.
Change report content and section order in templates; change PDF styling in
`components/reports/pdf/`. For a new section type, extend the `ReportSection`
union in `lib/reports/types.ts` and its rendering in `PdfReportRenderer.tsx`.

## Data Flow

1. Route/page validates the request and authorizes its base report scope.
2. Shared actor admission runs before the route reads its generation settings
   snapshot and acquires the process-wide PDF capacity slot.
3. The route checks explicit IDs or traverses at most the configured item
   limit plus one before broad enrichment.
4. Route/page collects the admitted report data server-side.
5. Template function converts raw data into a `ReportModel` containing typed
   sections like header, diff, version-summary, and timeline-entry. Priority
   values become a normalized `ReportPriorityIdentity`; invalid colors and icon
   names become `null` before reaching React-PDF.
6. The rendering entrypoint collects allowlisted icon names from the complete
   model and preloads their static vector nodes.
7. Engine-specific renderer consumes the `ReportModel` and produces output.
   The large requirements-list route uses the isolated worker; smaller existing
   report routes keep the direct Node renderer.
8. The capacity slot is released after success, failure, timeout, or
   cancellation. A cancelled direct render keeps its slot until React-PDF has
   settled, so abandoned work cannot exceed the configured concurrency.
9. PDF routes return binary `application/pdf` responses with attachment headers
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
- **Deviation Review**: `.../pdf/deviation-review/[id]?item=...`, where `id`
  identifies the requirement and `item` identifies its library requirement
  application in a specification. Specification-local applications are not
  supported by this route.

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
filters and ordering. It and lifecycle-profile outputs use the shared bounded
server traversal; complete formal output must never depend on browser
loaded-page state. Lifecycle-profile PDFs and structured report JSON use
`collectCompleteSpecificationOutputData()`. Traceability PDF uses
`collectSpecificationTraceabilityData()` to preserve the selected filters and
ordering. Procurement and full CSV use `visitSpecificationOutputPages()` and
serialize each enriched row directly through the bounded CSV runner.

## PDF Rendering

Server PDF uses `@react-pdf/renderer` in Node route handlers and their workers
to render the shared report model to binary PDF. It is the path for delivery,
sharing, and archival output. The browser never imports React-PDF, which keeps
production CSP compatible with strict `script-src` values and avoids
`unsafe-eval`/WebAssembly eval exceptions.

Priority rendering has two PDF-specific variants. `PdfPriorityBadge` is used
for version summaries and old/new metadata values. `PdfPriorityInline` is used
for dense report rows and the deviation card. Both consume
`ReportPriorityIdentity`, format `code – localized name`, share the strict
`#RRGGBB`/neutral policy, and derive foreground colors with at least 4.5:1
contrast against their exact opaque PDF background. Keep these calculations in
`lib/reports/priority.ts`; do not pass raw configured colors to React-PDF or add
fallback icons.

`renderReportModelPdfResponse()` preloads allowlisted icon vector nodes for the
direct renderer. `report-worker-entry.ts` performs the same preload inside the
worker because icon caches are process-local. Icon resolution must remain a
static allowlist operation without network or file loading.

`runSynchronousPdfGeneration()` is the admission boundary for direct PDF
routes. It loads `pdfReportMaxRequirements`,
`pdfReportConcurrencyPerNode`, and `pdfReportTimeoutSeconds`, then supplies the
active capacity token required by `renderPdfResponse()` and
`renderReportModelPdfResponse()`. Direct callers cannot render without this
token. The list-PDF spool acquires capacity from the same process-wide pool
before its bounded traversal and worker render.
Privacy PDF does not use the direct-renderer path: it acquires the same PDF
pool and settings before collection, then renders through the terminable worker
with the configured byte and worker-memory limits.

The item limit counts distinct IDs for combined and selected-list reports;
versions for history, review, and deviation review; versions plus suggestions
for suggestion history; and top-level rendered rows for filtered lists,
specifications, traceability, RFI, access review, and data-subject PDFs. A
`limit + 1` traversal detects broad filtered results before page enrichment. Limit
rejections use `422 output_limit_exceeded`; saturated capacity uses
`429 capacity_busy` with `Retry-After: 5`. Both responses are `no-store`.

The shared client helper opens immediately, shows separate indeterminate
generation and Blob-download phases, supports cancellation, and maps only
stable generated-output error codes. One hook instance permits only one active
CSV, JSON, or PDF operation, including different URLs. User-facing report menu
labels use only the report name for PDF actions, without a download verb or
`(PDF)` suffix.

The large list-PDF and privacy-PDF routes write only to private spool files and
invoke the report worker with their respective structured document models. The
worker client passes the literal
`./lib/pdf/report-worker-entry.ts` filename to `node:worker_threads`.
Next.js Turbopack compiles that entry and its dependencies as part of the normal
Next.js build. Standalone output must retain the emitted worker bootstrap and
traced dependency chunks.

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
Turbopack worker bootstrap and run the endpoint gate against that build.

The worker must report byte-limit and storage failures explicitly. The parent
maps V8 `ERR_WORKER_OUT_OF_MEMORY` separately from an unexpected error/exit,
awaits termination on abort, and must never leak worker text, stack, or paths
to the client.

## Adding a Report Type

1. Create a template in `lib/reports/templates/` that returns a `ReportModel`.
2. Add a route handler under `app/.../reports/pdf/`.
3. Authorize the base report scope, then use `runSynchronousPdfGeneration()`
   for direct rendering. It applies actor admission and process capacity;
   enforce the supplied item limit before collecting broad data. Worker routes
   must wrap their spool workflow with `runWithExportActorQuota()`.
4. Add menu items in the detail view or list view to open the report. PDF menu
   item labels must be the report name only.
5. Add translations to both `messages/en.json` and `messages/sv.json`.
6. Update [reports.md](../reference/reports.md) when the change affects report
   types, field profiles, CSV/export contracts, authorization, filenames, or
   output behavior.
7. Add automated coverage and matching manual cases for the report behavior,
   including authorization and output limits. Run `npm run check`; use the
   production endpoint gate above when changing worker packaging.

## Shared actor admission

See [export and report admission](../operations/export-report-admission.md) for
covered routes, shared actor limits, distinct 429/503 reasons, English and
Swedish messages, privacy handling and coordinated operational tuning.

`runSynchronousPdfGeneration()` already wraps direct PDF work in
`runWithExportActorQuota()`; do not add another actor admission around it.
List and privacy worker outputs use that wrapper around their spool workflow.
Return the wrapper's response so the actor slot remains held until response
delivery completes, fails, or is cancelled. The process PDF capacity slot has
a separate lifetime tied to generation.

HTTP limit messages import the small `messages/service-limits.en.json` and
`messages/service-limits.sv.json` catalogs. Keep their copy aligned with
`generatedOutput.limits` in the main catalogs; the service-limit message tests
compare both surfaces. Importing full catalogs into HTTP helpers also adds
them to browser bundles used by ordinary API requests.

## Selected specification agreement

Specification output routes accept `agreementId`. Resolve the selected agreement
and any due activation before traversing pages, and pass that fixed context to
both membership paging and enrichment. Norms and packages come from the exact
binding version. The report cover and CSV row fields include the agreement
reference, effective date and state. Profile reports and CSV retain their full
set behavior; only traceability inherits the editor filters and ordering.

### Deviation validity in specification outputs

Specification traceability reads supply separate `approved` and `applicable`
counts. Use the selected agreement source and cutoff for both. The management
template and Full CSV share `formatDeviationSignal`; the traceability template
retains outcome counts and calls the formatter with `includeOutcomes: false`
to append only applicability and follow-up state. Approval expiry is evaluated
at read time, including when no request has run since the deadline.
