# RFI question layout

This guide is for developers maintaining the stewardship RFI question list.
Issue #1357 selects prototype A: question text on the left, metadata on the
right, and one bordered list per requirement area. The requirement
specification's RFI list is a separate surface.

## Layout contract

- Question text uses 15px semibold type and wraps, including long unbroken
  values. Rows grow with their content; there is no truncation or fixed height.
- At 1100px and wider, the metadata column takes 38% of the summary width,
  with a 15rem minimum and a dividing border. Narrower screens stack metadata
  below the question. Code, RFI question version, status and area stay visible.
- Each area has one rounded border and row dividers. Disclosure padding is
  8px vertically and 12px horizontally. Direct edit/archive actions are 32px
  square and remain separate from disclosure. At 600px and below, actions
  follow the summary.
- The four filter controls fill the row. At 1100px and wider, search takes
  the remaining width beside 220px, 180px and 180px filters. From 768px,
  search occupies a full row above three filters; smaller screens stack them.
  Keep the arbitrary breakpoint units consistent so Tailwind generates the
  intended cascade.
- Active questions retain the original green badge, explicit text and check
  icon in both themes. Archived questions retain their amber badge and archive
  icon. Persistent, visually hidden status regions after the disclosure buttons
  announce updates with `role="status"` and `aria-live="polite"`. Loaded rows
  stay mounted during refresh so the existing regions receive status changes.
- Area grouping, existing display order, expansion, editing, suggestions and
  permissions retain their behavior. RFI questions have no business ordering
  or hierarchy controls.

Developer Mode identifies the filter row, area question list, question text,
metadata, status, disclosure and actions. Selection-question status styling
uses the shared summary in its list and drag preview; see the
[selection-question layout guide](requirement-selection-question-layout.md).

## Comparison and verification

The comparison uses the same 32 development questions for both implementations,
no filters, collapsed details, scroll at the top and browser zoom at 100%.
The original is commit `e486c01f`. Both themes and both navigation states give
the same measurements below. Complete rows fit fully inside the viewport;
there is no prototype switcher covering the list.

<!-- markdownlint-disable MD013 -->

| Viewport | Original first row | A first row | Original full rows | A full rows |
| --- | --- | --- | --- | --- |
| 1440 × 900 | 90px | 60.5px | 5 | 7 |
| 1920 × 1080 | 90px | 53px | 6 | 9 |

<!-- markdownlint-enable MD013 -->

The filter's unused width is 202px in the original and zero in A. Computed
active-badge background, foreground, padding, corner radius, font size, font
weight and icon match the original in both themes. These measurements describe
this dataset, not fixed row-height requirements.

Run the focused checks using the existing development SQL Server and Keycloak
services:

```sh
npx playwright test \
  tests/integration/stewardship/rfi-layout.spec.ts \
  tests/integration/stewardship/navigation.spec.ts \
  tests/integration/requirement-selection/questions-detail.spec.ts \
  tests/integration/requirement-selection/answer-dnd.spec.ts
```

The checks cover desktop geometry, long text at 1440px, 768px and 320px,
keyboard disclosure, independent row actions, filters, suggestion handling,
status styling and selection-question drag previews. Functional manual cases
are SPEC-16c, SPEC-16d and REQ-14e in the
[manual test catalog](../governance/manuella-testfall.md).
