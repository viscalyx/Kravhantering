# Report Generation

The report system generates requirement reports through two rendering engines:
browser print HTML and server-side PDF rendering. Both engines share a template
layer so report content changes apply to both.

Version summaries include requirement package names when present. Blank or
whitespace-only package names are ignored so report output does not show empty
package entries.

## Report Types

### 1. History Report

Shows the timeline of changes for a specific requirement.

- Available from the print dropdown in the detail view (all statuses)
- Current published version summary at top (if exists)
- Unpublished versions (draft/review) shown after published, clearly marked
- All versions listed in reverse chronological order with status, author,
  timestamps, and requirement text excerpt

### 2. Review Change Report

Highlights changes made in a Review version compared to the published or
latest archived version.

- Only available when the requirement has Review status
- Shows word-level diffs for requirement text and acceptance criteria
- Shows metadata changes (category, type, quality characteristic, etc.)
- If no published or archived version exists, displays a notice
- **Archiving reviews** (Published → Review → Archive) are visually
  distinct: titled "Arkiveringsförfrågan" / "Archive Request" with a
  subtitle and amber warning banner

### 3. Requirements List Report

Prints the requirements currently displayed in the list view as a
formatted table.

- Available from the print dropdown pill (always visible in list view)
- Shows Requirement ID, requirement text (truncated), requirement area, and
  status columns
- Includes all currently visible requirements (after filtering/sorting)
- Does not apply an application-level item-count cap; visible rows are carried
  through the existing `ids` query string, subject to practical URL length
  limits
- Server PDF output uses the latest published version for each included
  requirement and omits requirements without a published version
- Header shows total count and generation timestamp

### 4. Combined Review Report

Generates a multi-requirement review report from the list view.

- Select requirements using the checkbox column
- A floating pill appears when any selected requirement has Review status
- The pill is disabled if any selected requirement is not in Review status
- Does not apply an application-level item-count cap to the selected
  requirements
- Table of contents on the first page, grouped by report type:
  archiving requests first, then review change reports
- Each TOC entry shows its page number
- Each requirement starts on a new page after the TOC

### 5. Requirements Specification Profile Reports

Requirements specification reports always cover the whole specification, include
both linked library requirements and specification-local requirements, and sort
rows by `Krav-ID` ascending. Library rows use the exact
`requirement_version_id` linked to the specification item, not the latest
requirement version.

Available profiles are lifecycle-driven:

- **Kravbilaga för upphandling** / **Procurement requirements appendix**:
  shown only when the specification lifecycle status is `Upphandling`.
- **Genomföranderapport** / **Progress report**: shown only when the specification
  lifecycle status is `Införande` or `Utveckling`.
- **Förvaltningsrapport** / **Management report**: shown only when the
  specification lifecycle status is `Förvaltning`.

Each profile has both a browser print route and a server PDF route. The
specification detail menu shows only the profile that matches the lifecycle
status.

### 6. Improvement Suggestion History Report

Lists all improvement suggestions grouped under each requirement
version, sorted in descending version order.

- Available from the print dropdown in both normal and
  specification-item detail views
- Each version section shows a version summary followed by
  its suggestions (or an empty-state label)
- Suggestion cards display status badge, content, author,
  date, and resolution details when applicable
- Status colors: Draft (blue), Review Requested (yellow),
  Resolved (green), Dismissed (red)

## Requirements Specification Field Profiles

### Kravbilaga för upphandling

Cover: specification name and specification ID.

Included fields:

- `Krav-ID` identifies the requirement unambiguously for suppliers and
  evaluation teams.
- `Kravtext` states what must be fulfilled.
- `Kvalitetsegenskap` with ISO/IEC 25010 chapter provides the relevant quality
  model trace without exposing internal classification.
- `Normreferenser` shows applicable standards and controls by name or ID.

Excluded fields:

- `Kravområde`, `Kategori`, and `Typ` are internal library classification and
  ownership aids; they do not state supplier obligations.
- `Risknivå`, `Behovsreferens`, `Kravversionsstatus`, `Version`,
  `Verifierbar`, and `Användningsstatus` are internal steering, traceability, or
  follow-up fields.
- `Kravpaket` and `Förbättringsförslag` are library stewardship data, not part
  of the external procurement appendix.
- Raw norm URI values are excluded from the report because the appendix should
  be readable as a human-facing document; URI values belong in the tender CSV.

### Anbuds-CSV

Row-based CSV without metadata rows. Available only for `Upphandling`.

Included fields:

- `Krav-ID`, `Kravtext`, `Kvalitetsegenskap`, and `Normreferenser` match the
  procurement appendix so the CSV and PDF describe the same supplier-facing
  obligations.
- `Norm-URI` is added as a separate field so spreadsheet and import flows can
  preserve machine-usable norm linking.

Excluded fields:

- The same internal steering, risk, need, status, package, and improvement
  fields excluded from the procurement appendix are excluded from the tender
  CSV.
- Metadata rows are excluded so the file can be imported as a plain tabular
  tender artifact.

### Genomföranderapport

Cover: specification name, ID, governance object type, implementation type,
lifecycle status, and specification purpose.

Included fields:

- `Krav-ID`, `Version`, and `Kravtext` identify the exact requirement version
  being followed up.
- `Kravområde` shows ownership; specification-local requirements use
  `Unikt krav`.
- `Kategori`, `Typ`, `Kvalitetsegenskap` with ISO chapter, and `Risknivå`
  support internal prioritization and analysis.
- `Kravversionsstatus` shows the library lifecycle state of the linked
  requirement version.
- `Verifierbar`, `Behovsreferens`, and `Användningsstatus` support execution
  follow-up, traceability, and status review.
- `Normreferenser` preserves standard/control traceability without a raw URI
  column.

Excluded fields:

- `Kravpaket` is excluded because the report is about the active specification
  work, not reusable library packaging.
- `Förbättringsförslag` is excluded because improvement history has a separate
  report and would make the Genomföranderapport a data archive rather than a
  follow-up report.

### Förvaltningsrapport

The management report reuses the Genomföranderapport fields and adds management
signals.

Included fields:

- All Genomföranderapport fields remain because management needs the same
  requirement identity, ownership, status, risk, usage, and traceability view.
- `Avstegssignal` shows whether a requirement has a pending, approved, or
  rejected deviation, without exposing deviation motivation text.
- `Rest från införande` marks rows whose usage status is not `Implementerad`,
  `Verifierad`, or `Ej tillämpbar`; `Avviken` is handled separately by the
  deviation signal.

Excluded fields:

- `Kravpaket` and `Förbättringsförslag` remain excluded for the same reason as
  in the Genomföranderapport.
- Long deviation motivation, acceptance criteria, verification method, and
  improvement text are excluded because management reporting should show
  remaining work and deviation state, not replace deviation or improvement
  history reports.

### Full CSV-export

Row-based CSV without metadata rows. Always available and intended for internal
analysis and traceability.

Included fields:

- `Krav-ID`, `Kravtext`, `Kravområde`, `Kategori`, `Typ`,
  `Kvalitetsegenskap`, `Risknivå`, `Kravversionsstatus`, `Verifierbar`,
  `Version`, `Behovsreferens`, `Användningsstatus`, `Normreferenser`,
  `Kravpaket`, and `Förbättringsförslag` preserve the current configurable
  column set for internal analysis.
- `ISO-kapitel`, `Norm-URI`, and `Avstegssignal` add machine-friendly
  traceability and management signals that are useful in spreadsheet analysis.

Excluded fields:

- Long free-text details from deviations, acceptance criteria, verification
  method, and improvement suggestions are excluded because the export is an
  analysis extract, not a raw text archive or a substitute for dedicated
  history reports.
- Specification metadata rows are excluded so every row represents one
  requirement application and the file remains easy to import.

## CSV Export Format

The `exportToCsv()` function in `lib/export-csv.ts` produces
CSV with the following conventions:

- **Separator:** semicolon (`;`) — European locale
  compatibility.
- **Line endings:** CRLF (`\r\n`).
- **Escaping:** fields containing `;`, `"`, `\n`, or `\r`
  are wrapped in double-quotes with internal `"` doubled.
- **Formula hardening:** fields beginning with `=`, `+`, `-`, `@`,
  tab, or carriage return are prefixed with `'` and wrapped in
  double-quotes.
- **Download encoding:** UTF-8 with BOM at the HTTP/download boundary so
  Windows spreadsheet tools detect Swedish characters correctly.
- `exportToCsv()` itself returns plain CSV text without a BOM; callers add
  the download BOM.
- Requirements specification CSV exports are generated server-side from the
  whole specification, stay row-oriented, do not include metadata rows, and are
  returned with a UTF-8 BOM at the HTTP boundary.

Browser-created JSON evidence downloads use the same UTF-8 BOM download
boundary. API JSON responses remain strict BOM-free JSON.

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

### Data Flow

1. Route/page authorizes the requested report scope
1. Route/page collects report data server-side
1. Template function converts raw data into a `ReportModel` (array of typed
   sections like header, diff, version-summary, timeline-entry, etc.)
1. Engine-specific renderer consumes the `ReportModel` and produces output
1. PDF routes return binary `application/pdf` responses with attachment
   headers and `Cache-Control: no-store`

### Authorization

Server PDF routes authorize before collecting report data. Requirement list
PDFs are available to ordinary authenticated users, but collect only published
requirement versions. History, review, combined review, and suggestion-history
PDFs require history access for each requested requirement before any report
data helper runs. Requirements specification profile PDFs authorize against the
specification before collecting items and reject profiles that do not match the
specification lifecycle status.

Report builders and template functions stay pure. They receive already
authorized report data and do not call the authorization service themselves.

### Adding a New Report Type

1. Create a template in `lib/reports/templates/` that returns a `ReportModel`
2. Add route pages/handlers under both `app/.../reports/print/` and
   `app/.../reports/pdf/`
3. In server PDF handlers, authorize the report scope before collecting data
4. Add menu items in the detail view or list view to open the report
5. Add translations to both `messages/en.json` and `messages/sv.json`

### Adding or Removing an Engine

To remove: delete `components/reports/{engine}/` and
`app/.../reports/{engine}/` routes, then remove the corresponding menu items.

To add: create `components/reports/{engine}/` with a renderer that consumes
`ReportModel`, add route pages under `app/.../reports/{engine}/`.

## Route URL Patterns

Print engine routes live under `.../reports/print/`, PDF engine routes
under `.../reports/pdf/`.

- **History**: `.../print/history/[id]` | `.../pdf/history/[id]`
- **Review**: `.../print/review/[id]` | `.../pdf/review/[id]`
- **List**: `.../print/list?ids=…` | `.../pdf/list?ids=…`
- **Combined**: `.../print/review-combined?ids=…` |
  `.../pdf/review-combined?ids=…`
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

## Engines

### Browser Print

Opens a dedicated route in a new tab, renders the report as HTML/CSS, and
triggers `window.print()`. The user saves as PDF via the browser's print
dialog. Uses `@media print` CSS for page margins, page breaks, and hiding
screen-only elements.

### Server PDF

Uses `@react-pdf/renderer` only from Node route handlers to render the shared
report model to binary PDF. The browser never imports React-PDF, which keeps
production CSP compatible with strict `script-src` values and avoids
`unsafe-eval`/WebAssembly eval exceptions. The client download helper fetches
the route as a blob, shows a temporary "Generating PDF..." modal after two
seconds, and closes it as soon as the blob download is triggered.

## PDF Filenames

- History: `{localized label} {uniqueId}.pdf`
  (e.g., `Historikrapport ANV0022.pdf`)
- Review: `{localized label} {uniqueId}.pdf`
  (e.g., `Granskningsrapport ANV0022.pdf`)
- Combined: `{localized label} {YYYY-MM-DD HH.MM}.pdf`
  (e.g., `Kombinerad granskningsrapport 2026-03-17 16.35.pdf`)
- Requirements specification profile report:
  `{localized profile label} {specification name} {specification ID}.pdf`
  (e.g., `Genomföranderapport Tillgänglighet PKG001.pdf`)
- Suggestion History:
  `{localized label} {uniqueId}.pdf`
  (e.g., `Ändringsförslagshistorik ANV0022.pdf`)

## Print Report Page Rendering

- Print report routes are wrapped in a layout that forces light mode
  rendering regardless of the app's dark mode setting.
- The app navigation and footer are hidden on report pages, both on
  screen and in print.
- Styles are in `components/reports/print/print-styles.css` which is
  imported by the reports layout.

## Archiving Reviews

When a requirement transitions from Published to Review for archiving
(`archiveInitiatedAt` is set), the review report uses distinct styling:

- Title: "Arkiveringsförfrågan" / "Archive Request"
- Subtitle: "Kravet granskas för arkivering"
- Amber warning banner instead of blue info notice
- In the combined report TOC, archiving requests are grouped first
