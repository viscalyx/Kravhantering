# Report Generation

The report system generates PDF reports for requirements using two rendering
engines in parallel. Both engines share a template layer so report layout
changes apply to both.

## Report Types

### 1. History Report

Shows the timeline of changes for a specific requirement.

- Available from the print dropdown in the detail view (all statuses)
- Current published version summary at top (if exists)
- Unpublished versions (draft/review) shown after published, clearly marked
- All versions listed in reverse chronological order with status, author,
  timestamps, and description excerpt

### 2. Review Change Report

Highlights changes made in a Review version compared to the published or
latest archived version.

- Only available when the requirement has Review status
- Shows word-level diffs for description and acceptance criteria
- Shows metadata changes (category, type, quality characteristic, etc.)
- If no published or archived version exists, displays a notice
- **Archiving reviews** (Published → Review → Archive) are visually
  distinct: titled "Arkiveringsförfrågan" / "Archive Request" with a
  subtitle and amber warning banner

### 3. Requirements List Report

Prints the requirements currently displayed in the list view as a
formatted table.

- Available from the print dropdown pill (always visible in list view)
- Shows Krav-ID, description (truncated), area, and status columns
- Includes all currently visible requirements (after filtering/sorting)
- Header shows total count and generation timestamp

### 4. Combined Review Report

Generates a multi-requirement review report from the list view.

- Select requirements using the checkbox column
- A floating pill appears when any selected requirement has Review status
- The pill is disabled if any selected requirement is not in Review status
- Table of contents on the first page, grouped by report type:
  archiving requests first, then review change reports
- Each TOC entry shows its page number
- Each requirement starts on a new page after the TOC

### 5. Package List Report

Prints the requirements contained in a specific requirement package as a
formatted table.

- Available from the print dropdown in the package detail view
- Includes package metadata in the header: package name, unique ID,
  responsibility area, implementation type, and business needs reference
- Shows Krav-ID, description (truncated), area, and status columns
- Print opens a dedicated route; PDF is generated inline in the package
  detail view (not via a separate route page)

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
  app/[locale]/requirement-packages/[slug]/reports/print/
                                       Package route pages

react-pdf Engine
  components/reports/pdf/              PdfReportRenderer + download hook
  app/[locale]/requirements/reports/pdf/       Route pages
  (package PDF generated inline in requirement-package-detail-client)
```

### Data Flow

1. Route page fetches requirement data via API
2. Template function converts raw data into a `ReportModel` (array of typed
   sections like header, diff, version-summary, timeline-entry, etc.)
3. Engine-specific renderer consumes the `ReportModel` and produces output

### Adding a New Report Type

1. Create a template in `lib/reports/templates/` that returns a `ReportModel`
2. Add route pages under both `app/.../reports/print/` and
   `app/.../reports/pdf/`
3. Add menu items in the detail view or list view to open the report
4. Add translations to both `messages/en.json` and `messages/sv.json`

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

All routes above are prefixed with `/[locale]/requirements/reports`.

Package list reports use a separate prefix
`/[locale]/requirement-packages/[slug]/reports`:

- **Package List**: `.../print/list?ids=…`
  (PDF is generated inline — no separate PDF route)

## Engines

### Browser Print

Opens a dedicated route in a new tab, renders the report as HTML/CSS, and
triggers `window.print()`. The user saves as PDF via the browser's print
dialog. Uses `@media print` CSS for page margins, page breaks, and hiding
screen-only elements.

### react-pdf

Uses `@react-pdf/renderer` to generate a PDF blob client-side. The route
page fetches data, builds the model, then triggers a download. Uses the
library's `Document`, `Page`, `View`, `Text` primitives with `StyleSheet`.

## PDF Filenames

- History: `{localized label} {uniqueId}.pdf`
  (e.g., `Historikrapport ANV0022.pdf`)
- Review: `{localized label} {uniqueId}.pdf`
  (e.g., `Granskningsrapport ANV0022.pdf`)
- Combined: `{localized label} {YYYY-MM-DD HH.MM}.pdf`
  (e.g., `Kombinerad granskningsrapport 2026-03-17 16.35.pdf`)
- List (package): `{localized label} {package name} {package ID}.pdf`
  (e.g., `Kravlista Tillgänglighet PKG001.pdf`)

## Report Page Rendering

- Report routes are wrapped in a layout that forces light mode
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
