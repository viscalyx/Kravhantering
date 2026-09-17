# Report Generation

This reference is for report consumers and developers checking report scope,
field selection, access requirements, and export formats. Reports are delivered
as server-generated PDFs; CSV exports support spreadsheet analysis and import.

Implementation architecture and contributor workflow live in
[report-generation-developer-workflow.md](../development/report-generation-developer-workflow.md).

## Synchronous PDF Limits

Every synchronous multi-item PDF uses the Admin-managed maximum PDF item
count, and every synchronous PDF uses the per-node concurrency setting. The
item setting defaults to 1,000. The counted unit depends on the report's
top-level repeated content:

<!-- markdownlint-disable MD013 -->
| PDF route or report | Counted unit |
| --- | --- |
| Requirements List | Distinct selected requirements or filtered requirement rows |
| Combined Review | Distinct requirement IDs |
| History and Review | Requirement versions |
| Improvement Suggestion History | Requirement versions plus suggestions |
| Specification profile | Requirement applications |
| Requirement application traceability | Filtered requirement applications |
| RFI question list | RFI questions |
| Access-review export | Access-review assignment rows |
| Data-subject export | Exported personal-data items |
| Deviation Review | Versions of the selected requirement |
<!-- markdownlint-enable MD013 -->

Deviation Review covers one selected application, but its item-limit check
counts the requirement versions loaded to prepare the report. It shares the
PDF concurrency pool.

The exact item limit is accepted. The first item above it returns
`422 output_limit_exceeded` with `Cache-Control: no-store` and no partial PDF.
When all per-node render slots are occupied, the route returns
`429 capacity_busy` with `Retry-After: 5`. Reduce the selected rows or narrow
the active filters before retrying an item-limit rejection.

## Priority Identity in PDF Reports

History, review, combined review, improvement suggestion history, deviation
review, progress, management, and application traceability reports display
priority as `code – localized name`. If the localized name is empty, only the
code is shown. A missing priority produces no badge or replacement label.
Priority text wraps to preserve the complete identity. Missing or invalid
configured colors use a neutral palette; unknown icons are omitted.

## Report Types

### 1. History Report

Shows the timeline of changes for a specific requirement.

- Available from the report dropdown in the detail view (all statuses)
- Current published version summary at top (if exists)
- Unpublished versions (draft/review) shown after published, clearly marked
- All versions listed in descending version order with status, author,
  timestamps, and requirement text excerpt

### 2. Review Report

Highlights changes made in a Review version compared to the published or
latest archived version.

- Only available when the requirement has Review status
- Shows word-level diffs for requirement text and acceptance criteria
- Shows metadata changes (category, type, quality characteristic, etc.)
- Shows previous and new priorities as separate complete priority identities
- If no published or archived version exists, displays a notice

### 3. Requirements List

Outputs the complete matching requirement set from the list view as a
formatted table, including rows not yet loaded in the browser.

- Available from the report dropdown pill (always visible in list view)
- The PDF menu entry is labeled only with the report name:
  `Kravlista` / `Requirements List`
- Shows Requirement ID, requirement text (truncated), requirement area, and
  status columns
- Uses the same displayed requirement version and status as the list view, so
  Review rows are included when the current filter includes them
- Resolves the complete matching requirement set server-side from the active
  filters and sort order instead of relying on the currently loaded client
  page. The Admin-configured PDF item cap applies to the complete result.
- Header shows total count and generation timestamp

### 4. Combined Review Report

Generates a multi-requirement review report from the list view.

- Select requirements using the checkbox column
- The list view's report pill is highlighted when any selected requirement has
  Review status and shows a badge with the number of selected requirements
- The combined report menu item is disabled if any selected requirement is not
  in Review status
- The combined report menu item shows the selected requirement count as a badge
- Applies the Admin-configured PDF item cap to distinct selected requirements
- Table of contents on the first page, grouped by report type:
  archiving requests first, then review reports
- Each TOC entry shows its page number
- Each requirement starts on a new page after the TOC

### 5. Requirements Specification Profile Reports

Requirements specification reports always cover the whole specification, include
both linked library requirements and specification-local requirements, and sort
rows by `Krav-ID` ascending. Library rows use the exact requirement version
linked to the specification item.

Available profiles are lifecycle-driven:

- **Kravbilaga för upphandling** / **Procurement requirements appendix**:
  shown only when the specification lifecycle status is `Upphandling`.
- **Genomföranderapport** / **Progress report**: shown only when the
  specification lifecycle status is `Införande` or `Utveckling`.
- **Förvaltningsrapport** / **Management report**: shown only when the
  specification lifecycle status is `Förvaltning`.

The specification detail menu shows only the profile that matches the lifecycle
status.

### 6. Requirement Application Traceability

`Tillämpningsspårbarhet` / `Requirement application traceability` is available
from the `Krav i underlaget` report menu for requirements specifications. It is
not lifecycle-scoped and does not replace the profile reports. Instead, it uses
the same filtered requirement applications currently shown in the specification
detail list.

- Includes both linked library requirements and specification-local requirements
- Uses the same filters, locale, and sort order as the specification item list
- Includes the complete matching result, even when rows are not yet loaded in
  the browser
- Uses application data for the selected agreement: needs reference, usage
  status, status date, deviations, priority, verifiability, verification method,
  and note
- Summary shows total requirement applications, library/local distribution,
  usage status distribution, missing needs references, and deviations per
  decision state
- Detail rows show requirement ID, origin, version, area, needs reference,
  usage status, status changed date, deviation state, priority, verification,
  and note

Lifecycle-profile PDFs, procurement CSV, and full CSV do not inherit editor
filters or loaded-page state. They always traverse the complete requirements
set in the selected agreement in stable Requirement ID order. Every
specification report identifies the agreement reference, effective date and
state. Historical reports use the preserved follow-up;
draft, upcoming and cancelled agreements retain their explicit state. Before
the first agreement, output identifies the working set as no agreement.

### 7. Improvement Suggestion History

Lists all improvement suggestions grouped under each requirement
version, sorted in descending version order.

- Available from the report dropdown in both normal and
  specification-item detail views
- Each version section shows a version summary followed by
  its suggestions (or an empty-state label)
- Version priorities use the localized PDF priority badge when present
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

- `Avtalsreferens`, `Avtalsdatum` and `Avtalsstatus` identify the selected
  agreement on each row.
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
  requirement identity, ownership, status, priority, usage, and traceability
  view.
- `Avstegssignal` shows whether a requirement has a pending, approved, or
  rejected deviation, without exposing deviation motivation text.
- `Rest från införande` marks rows whose usage status is not `Implementerad`,
  `Verifierad`, or `Ej tillämpbar`. Rows marked `Avviken` therefore remain
  included in this residual signal.

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

- `Avtalsreferens`, `Avtalsdatum` and `Avtalsstatus` identify the selected
  agreement on each row.
- `Krav-ID`, `Kravtext`, `Kravområde`, `Kategori`, `Typ`,
  `Kvalitetsegenskap`, `Prioritet`, `Kravversionsstatus`, `Verifierbar`,
  `Version`, `Behovsreferens`, `Användningsstatus`, `Normreferenser`,
  `Kravpaket`, and `Förbättringsförslag` form a fixed column set for internal
  analysis. `Förbättringsförslag` contains a count, not suggestion text.
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

CSV exports use the following conventions:

- **Separator:** semicolon (`;`) by default for European locale
  compatibility.
- **Line endings:** CRLF (`\r\n`).
- **Escaping:** fields containing the active delimiter, `"`, tab, `\n`, or `\r`
  are wrapped in double-quotes with internal `"` doubled.
- **Formula hardening:** fields beginning with `=`, `+`, `-`, `@`, tab, or
  carriage return are prefixed with `'` and wrapped in double-quotes. Formula
  markers after a leading run of spaces, tabs, or carriage returns receive the
  same treatment without changing the original whitespace.
- **Download encoding:** UTF-8 with BOM at the HTTP/download boundary so
  Windows spreadsheet tools detect Swedish characters correctly.
- Browser-generated requirement-import receipts retain their comma delimiter,
  LF line endings, columns, filename, media type, and UTF-8 BOM while using the
  same shared escaping and formula-hardening contract. They keep every
  non-null field double-quoted for compatibility with existing receipts.
- Requirements specification CSV covers the whole selected agreement and has
  no metadata rows; every data row represents one requirement application.
- Requirements Library CSV is served by `GET /api/requirements/export`. It
  applies the requested filters, locale, and sort order to the complete result
  and accepts no cursor or page-size parameter.
- Action-log CSV is served by `GET /api/admin/audit-events?format=csv` to Admin
  users. It ignores interactive `page` and `pageSize`, excludes entries created
  after export begins, and orders rows by `occurred_at DESC, id DESC`.
  Concurrent privacy erasure can change actor-filter membership during export.
  Zero matches return the localized header only.

## Bounded Synchronous Output

Requirements Library CSV, procurement and full requirements-specification CSV,
Action-log CSV, and the requirements-list PDF are same-request, all-or-error
operations. Item count, file size, time, and per-node capacity limits apply;
no partial output is returned when generation exceeds a limit. CSV operations
share the Admin-managed CSV limits and concurrency pool.

The browser shows `Generating/Preparing` while generation runs and
`Downloading` while receiving the completed output. The server filename takes
precedence over the localized fallback. Filenames preserve Unicode, remove
control and malformed characters, and are limited to 240 UTF-8 bytes.

Stable failures are `output_limit_exceeded` (`422`), `capacity_busy` (`429`,
`Retry-After: 5`), and the `503` timeout, temporary-storage, PDF-memory, or
worker failure codes. Actor quota failures are described under
[export and report actor quota](#export-and-report-actor-quota). The client
shows localized messages instead of raw server error text. A busy response
enables manual retry only after the countdown and never retries automatically.

## Output Behavior

Server PDF is the report delivery mechanism for report sharing, archival use,
and stable rendering. PDF report menu items are labeled with only the report
name, for example `Kravlista` or `Historikrapport`; the labels do not include
download verbs or a `(PDF)` suffix.

Browser-created JSON evidence downloads use the same UTF-8 BOM download
boundary. API JSON responses remain strict BOM-free JSON.

## Authorization

Server PDF routes authorize before collecting report data. Requirement list
PDFs require read access to each included requirement. Filtered reports use the
versions visible to the requesting user, so permitted Review rows can appear.
History, review, combined review, and suggestion-history PDFs require history
access for each requested requirement. Requirements specification profile PDFs
require specification read access and reject profiles that do not match its
lifecycle status. Traceability PDF and API routes require specification read
access and collect the matching items from that specification.
Specification CSV requires specification read access and a valid profile;
procurement CSV also requires the procurement lifecycle status.

## PDF Filenames

- History: `{localized label} {uniqueId}.pdf`
  (e.g., `Historikrapport ANV0022.pdf`)
- Review: `{localized label} {uniqueId}.pdf`
  (e.g., `Granskningsrapport ANV0022.pdf`)
- Requirements List: `{localized label} {YYYY-MM-DD HH.MM}.pdf`
- Deviation Review: `{localized label} {uniqueId}.pdf`
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

When a requirement transitions from Published to Review for archiving,
the review report uses distinct styling:

- Title: "Arkiveringsförfrågan" / "Archive Request"
- Subtitle: "Kravet granskas för arkivering"
- Amber warning banner instead of blue info notice
- In the combined report TOC, archiving requests are grouped first

## Export and report actor quota

See [export and report admission](../operations/export-report-admission.md) for
covered routes, shared actor limits, distinct 429/503 reasons, English and
Swedish messages, privacy handling and coordinated operational tuning.

## Implementing versions in suggestion history

Suggestion history keeps its grouping by the original feedback version. Each
resolved suggestion with implementation evidence also shows the implementing
version number, its current localized publication state, and the evidence date.
Missing status names use the localized unknown-status label.
Deleted versions show unavailable evidence. Motivation-only decisions have no
implementation claim. The PDF history route requires requirement-history read
access; the interactive suggestion link separately enforces version read access.

## RFI assessment evidence in internal outputs

RFI CSV keeps one `Current question` record per current list item and adds
explicitly typed `Assessment history` records for saved assessments. Current
relevance remains in the relevance column; historical outcomes have a separate
assessment-outcome column. Evidence columns include reason, document reference,
link, assessed version, author and time. `Pending confirmation` identifies
previous evidence reused as support for a different adopted version. Such a
question remains unassessed until confirmation. Consumers counting current
questions must filter by record type.

RFI PDF shows the same evidence under each current question and in a separate
history section, including questions removed from the list. Actor names use
localized anonymous display after privacy erasure. CSV cells retain the shared
formula-injection protection. No document is uploaded or fetched by the export.

## Deviation permission and follow-up

The management PDF, application traceability PDF and Full CSV distinguish
recorded approval outcomes from applicable permission. Traceability cells show
each outcome label and count once, followed by applicability and follow-up
state. Dated permission is inclusive in Europe/Stockholm. Pending renewal
grants no extension. An ended approval without replacement shows action
required until the current usage status is Verified. Previous, ended, and
cancelled agreements retain history without current follow-up work.
Selected historical agreements use their preserved cutoff. Compact outputs
exclude full conditions and closure reasons; mandatory archive JSON preserves
these terms. The deviation review report used before a decision keeps its
existing purpose.
