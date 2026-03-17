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

### 3. Combined Review Report

Generates a multi-requirement review report from the list view.

- Select requirements using the checkbox column
- A floating pill appears when any selected requirement has Review status
- The pill is disabled if any selected requirement is not in Review status
- Each requirement gets its own section with page breaks between them
- Includes a table of contents

## Architecture

```text
Shared Layer (engine-agnostic)
  lib/reports/types.ts              Report model types
  lib/reports/text-diff.ts          Word-level diff utility
  lib/reports/data/                 Data fetching helpers
  lib/reports/templates/            Template functions (data -> ReportModel)

Browser Print Engine
  components/reports/print/         PrintReportRenderer + CSS
  app/[locale]/kravkatalog/reports/print/   Route pages

react-pdf Engine
  components/reports/pdf/           PdfReportRenderer + download hook
  app/[locale]/kravkatalog/reports/pdf/     Route pages
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
- **Combined**: `.../print/review-combined?ids=…` |
  `.../pdf/review-combined?ids=…`

All routes are prefixed with `/[locale]/kravkatalog/reports`.

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
