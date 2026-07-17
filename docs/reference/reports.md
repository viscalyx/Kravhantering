# Report Generation

The report system uses server-generated PDF as the report delivery mechanism.
Report content is modeled in a shared template layer and rendered by the server
PDF renderer.

Implementation architecture and contributor workflow live in
[report-generation-developer-workflow.md](../development/report-generation-developer-workflow.md).

Version summaries include requirement package names when present. Blank or
whitespace-only package names are ignored so report output does not show empty
package entries.

## Report Types

### 1. History Report

Shows the timeline of changes for a specific requirement.

- Available from the report dropdown in the detail view (all statuses)
- Current published version summary at top (if exists)
- Unpublished versions (draft/review) shown after published, clearly marked
- All versions listed in reverse chronological order with status, author,
  timestamps, and requirement text excerpt

### 2. Review Report

Highlights changes made in a Review version compared to the published or
latest archived version.

- Only available when the requirement has Review status
- Shows word-level diffs for requirement text and acceptance criteria
- Shows metadata changes (category, type, quality characteristic, etc.)
- If no published or archived version exists, displays a notice
- **Archiving reviews** (Published → Review → Archive) are visually
  distinct: titled "Arkiveringsförfrågan" / "Archive Request" with a
  subtitle and amber warning banner

### 3. Requirements List

Outputs the requirements currently displayed in the list view as a
formatted table.

- Available from the report dropdown pill (always visible in list view)
- The PDF menu entry is labeled only with the report name:
  `Kravlista` / `Requirements List`
- Shows Requirement ID, requirement text (truncated), requirement area, and
  status columns
- Includes all currently visible requirements (after filtering/sorting)
- Uses the same displayed requirement version and status as the list view, so
  Review rows are included when the current filter includes them
- Does not apply an application-level item-count cap. The list report route
  resolves the full matching requirement set server-side from the active
  filters and sort order instead of relying on the currently loaded client
  page.
- Header shows total count and generation timestamp

### 4. Combined Review Report

Generates a multi-requirement review report from the list view.

- Select requirements using the checkbox column
- The list view's report pill is highlighted when any selected requirement has
  Review status and shows a badge with the number of selected requirements
- The combined report menu item is disabled if any selected requirement is not
  in Review status
- The combined report menu item shows the selected requirement count as a badge
- Does not apply an application-level item-count cap to the selected
  requirements
- Table of contents on the first page, grouped by report type:
  archiving requests first, then review reports
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

Each profile has a server PDF route. The specification detail menu shows only
the profile that matches the lifecycle status. PDF menu entries use only the
profile report name, for example
`Genomföranderapport`, without a download verb or `(PDF)` suffix.

### 6. Requirement Application Traceability

`Tillämpningsspårbarhet` / `Requirement application traceability` is available
from the `Krav i underlaget` report menu for requirements specifications. It is
not lifecycle-scoped and does not replace the profile reports. Instead, it uses
the same filtered requirement applications currently shown in the specification
detail list.

- Includes both library requirement applications (`lib:{id}`) and
  specification-local requirement applications (`local:{id}`)
- Accepts the same normalized filter, locale, sort field, and sort direction as
  the requirements specification item list
- Traverses the complete server-filtered result in database-authoritative order
  with bounded 100-row pages
- Uses the current application data already stored on requirement applications:
  needs reference, usage status, status date, deviations, risk, verifiability,
  verification method, and note
- Does not introduce a separate database model
- Summary shows total requirement applications, library/local distribution,
  usage status distribution, missing needs references, and deviations per
  decision state
- Detail rows show requirement ID, origin, version, area, needs reference,
  usage status, status changed date, deviation state, risk, verification, and
  note
- The detail view keeps traceability available when matching rows have not yet
  been loaded in the browser or the filtered result exceeds 100 items.

The traceability report loads data through
`/api/requirements-specifications/{id}/traceability-items` with the normalized
item-list query parameters. The server applies those filters and ordering to the
complete combined library/specification-local result. It follows opaque
continuations internally with duplicate, progress, cursor-cycle, and maximum
page protection; no browser-side reference enumeration or 100-reference limit
applies.

Lifecycle-profile PDFs, procurement CSV, and full CSV do not inherit editor
filters or loaded-page state. They always traverse the complete requirements
specification in stable Requirement ID order using bounded server pages.

### 7. Improvement Suggestion History

Lists all improvement suggestions grouped under each requirement
version, sorted in descending version order.

- Available from the report dropdown in both normal and
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
- `Prioritet`, `Behovsreferens`, `Kravversionsstatus`, `Version`,
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

- The same internal steering, priority, need, status, package, and improvement
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
- `Kategori`, `Typ`, `Kvalitetsegenskap` with ISO chapter, and `Prioritet`
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
  requirement identity, ownership, status, priority, usage, and traceability view.
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

### Tillämpningsspårbarhet

Cover: specification name, ID, governance object type, implementation type,
lifecycle status, and specification purpose.

Included fields:

- `Krav-ID` identifies each requirement application in the filtered
  kravunderlag list.
- `Ursprung` distinguishes linked library requirements from
  specification-local requirements.
- `Version` shows the pinned library requirement version. Specification-local
  requirements leave the field blank because they are owned directly by the
  specification.
- `Kravområde` shows library ownership. Specification-local requirements use
  `Unikt krav`.
- `Behovsreferens`, `Användningsstatus`, `Status ändrad`, and `Anteckning`
  show how the requirement application is used in this specification.
- `Avstegssignal` shows pending, approved, and rejected deviation counts.
- `Prioritet`, `Verifierbar`, and verification method support follow-up and
  test planning.

Excluded fields:

- Long requirement text, acceptance criteria, norm references, package
  membership, and improvement suggestion history are excluded because this
  report is an application traceability view, not a replacement for the profile
  reports, CSV exports, or dedicated history reports.

### Full CSV-export

Row-based CSV without metadata rows. Always available and intended for internal
analysis and traceability.

Included fields:

- `Krav-ID`, `Kravtext`, `Kravområde`, `Kategori`, `Typ`,
  `Kvalitetsegenskap`, `Prioritet`, `Kravversionsstatus`, `Verifierbar`,
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
- Requirements Library CSV is served only by
  `GET /api/requirements/export`. It applies the requested server filters,
  locale, and database sort, starts from the first page, and accepts no cursor
  or page-size parameter.
- Requirements Library CSV and filtered list PDF collection traverse internal
  200-row pages. They fail rather than return partial output if a page repeats a
  Requirement ID, does not make progress, repeats a cursor, or exceeds 10 000
  pages (two million rows).

## Output Behavior

Server PDF is the report delivery mechanism for report sharing, archival use,
and stable rendering. PDF report menu items are labeled with only the report
name, for example `Kravlista` or `Historikrapport`; the labels do not include
download verbs or a `(PDF)` suffix.

Browser-created JSON evidence downloads use the same UTF-8 BOM download
boundary. API JSON responses remain strict BOM-free JSON.

## Authorization

Server PDF routes authorize before collecting report data. Requirement list
PDFs are available to ordinary authenticated users, but collect only published
requirement versions. History, review, combined review, and suggestion-history
PDFs require history access for each requested requirement before any report
data helper runs. Requirements specification profile PDFs authorize against the
specification before collecting items and reject profiles that do not match the
specification lifecycle status. Requirements specification traceability PDF and
API routes authorize against the specification before collecting item data and
reject selected refs that do not belong to the requested specification.

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
- Requirements specification traceability:
  `{localized label} {specification name} {specification ID}.pdf`
  (e.g., `Tillämpningsspårbarhet Tillgänglighet PKG001.pdf`)
- Improvement Suggestion History:
  `{localized label} {uniqueId}.pdf`
  (e.g., `Förbättringsförslagshistorik ANV0022.pdf`)

## Archiving Reviews

When a requirement transitions from Published to Review for archiving
(`archiveInitiatedAt` is set), the review report uses distinct styling:

- Title: "Arkiveringsförfrågan" / "Archive Request"
- Subtitle: "Kravet granskas för arkivering"
- Amber warning banner instead of blue info notice
- In the combined report TOC, archiving requests are grouped first
