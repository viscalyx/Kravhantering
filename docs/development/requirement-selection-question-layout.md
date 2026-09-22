# Requirement selection question layout

This guide is for developers maintaining the question list or coordinating
related stewardship layout work. Issue #1355 selects prototype B: question
text on the left, facts on the right, and a shared bordered list per requirement
area. The production list and drag preview use the same `QuestionSummary`.

## Layout contract

- Question text uses 15px semibold type and wraps without truncation. Facts use
  12px type with secondary foreground colors in both themes.
- Above 1100px, the facts column takes 38% of the summary width, with a 15rem
  minimum and a dividing border. At narrower widths, facts follow the text.
- Active, unarchived questions use the original green badge with a check icon
  in both the list and drag preview. Inactive and archived questions retain
  their distinct text and icons without green active styling. Each disclosure
  has a persistent, visually hidden sibling status region for announcements.
  Loaded rows stay mounted during refresh so the region receives updates.
- Summary padding is 8px vertically and 12px horizontally. The reorder handle
  is 32px wide with a 40px minimum height. Hierarchy buttons remain at least
  36px high, within a reserved 8rem slot.
- At 600px and below, hierarchy controls follow the summary. Empty hierarchy
  slots take no space in this stacked layout.
- Each requirement area has one rounded border. Adjacent question rows have
  dividers and no individual shadows or gaps. Focus and selection rings sit
  inside the shared surface.
- Expansion, filtering, permissions, visibility conditions, hierarchy and
  persistent question/answer ordering retain their existing behavior. Expanded
  answer controls and the RFI list have separate scope in #1356 and #1357.

Developer Mode identifies the area question list, question text, metadata, status,
reorder handle, disclosure and hierarchy slot. Metadata also supplies the
accessible description of the disclosure button.

## Visual comparison

The comparison uses the same 13-question development dataset, no filters,
collapsed questions, scroll at the top and browser zoom at 100%. Each result
holds for both themes and both navigation states. A complete row must fit
within the viewport; there is no prototype switcher covering the page.

<!-- markdownlint-disable MD013 -->

| Viewport    | Original first row | Compact first row | Original full rows | Compact full rows |
| ----------- | ------------------ | ----------------- | ------------------ | ----------------- |
| 1440 × 900  | 90px               | 52px              | 5                  | 7                 |
| 1920 × 1080 | 90px               | 52px              | 6                  | 9                 |

<!-- markdownlint-enable MD013 -->

These are comparison measurements, not fixed row-height requirements. Longer
text, additional facts and different data can increase row height.

Run the focused browser checks with the existing development SQL Server and
Keycloak services:

```sh
npx playwright test \
  tests/integration/requirement-selection/questions-detail.spec.ts \
  tests/integration/requirement-selection/answer-dnd.spec.ts
```

The tests cover split and stacked summaries, long text at desktop, 768px and
320px widths, hierarchy access, keyboard disclosure, target sizes, drag preview
geometry and saved pointer/keyboard ordering. Functional manual cases are
REQ-14b and REQ-14e in the
[manual test catalog](../governance/manuella-testfall.md).
