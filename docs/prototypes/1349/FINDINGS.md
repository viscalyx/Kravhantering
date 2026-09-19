# Prototype inspection findings

<!-- markdownlint-configure-file {"MD060": {"style": "compact"}} -->

Question: which layout improves norm-reference readability while keeping
useful writing space?

**Confirmed interaction decision:** show package purpose directly with ordinary
checkboxes and no separate acknowledgment. No visual variant is approved.
D explores narrower writing with equal association panels; E moves selection
into dialogs and presents selected items as badges in the form.

## Measured comparison

At 1920 × 1080, collapsed navigation, light theme, using the same data:

<!-- markdownlint-disable MD013 -->
| Variant | Package width | Norm width | Writing width | Norm label lines | Destination row offset |
| :--- | ---: | ---: | ---: | ---: | ---: |
| baseline | 260 | 260 | 662 | 3 | 57 |
| A | 176 | 352 | 662 | 2 | 0 |
| B | 384 | 384 | 822 | 2 | 0 |
| C | 402 | 804 | 1230 | 1 | 0 |
| D | 390 | 390 | 402 | 2 | 0 |
| E.1/E.2 | 603 | 603 | 603 | Dialog | 0 |
<!-- markdownlint-enable MD013 -->

Widths and offsets are CSS pixels. All writing fields in this table remain
100 pixels high. Each of the three representative full norm labels
(EN 301 549, NIS2 and ISO/IEC 25010, including ID and name) has the listed
line count. It is not a claim about every possible norm name.

Baseline keeps its original geometry but also shows package purpose. E.1/E.2 widths
refer to the stacked summary panels; full lists appear in separate dialogs.

- **A:** norm width increases and the writing column stays unchanged.
  The list-top offset decreases from 20 pixels to zero and the footer controls
  share one row. The tradeoff is more wrapping in the narrower package list.
- **B:** norm labels become shorter and the writing column gains 160 pixels.
  Stacked lists have less individual height and require more internal scrolling.
- **C:** the three norm labels fit on one line and writing spans the card.
  Moving associations below the fields adds a separate 320-pixel section plus
  a gap, making the page substantially taller.
- **D:** the writing column is narrower, giving equal space to both lists.
  Purpose is easier to scan than in A; writing wraps earlier.
- **E.1/E.2:** the form shows only selected badges. Searchable dialogs provide more
  room for purpose and names, at the cost of an extra step to change selection.

## Browser inspection

Local Chromium, authenticated development administrator, existing reference
catalogs, Swedish locale. No requirement or norm-reference data is written.

- 56 desktop combinations: seven variants × two viewport sizes
  (1440 × 900 and 1920 × 1080) × two themes × two navigation states.
- All seven variants also inspected at 320-pixel viewport width with long text
  and selected associations. No horizontal page overflow in those checks.
- Long sample text, area selection, package/norm selection and Verifiable
  remain usable. The shared description help opens and closes.
- Field values and selections survive variant changes.
- Left/right keys switch variants outside fields and retain caret behavior
  inside the requirement text field.
- Tab/Space operates the destination selection. Simulated Save reports that
  selection. A temporary norm can be added and selected locally.
- Reload retains the URL variant but clears edited form values.
- The English prototype route renders its localized controls.
- No browser page errors and no API mutation requests occur during these
  exercised interactions.
- 24 E.1 checks cover draft/apply/cancel, search with hidden choices,
  reopening, chip removal, keyboard focus, Escape/close, cross-variant state,
  missing-purpose behavior, English labels and selected-badge wrapping.
- 42 E.2 checks include the same modal behavior plus separate left-aligned
  columns, preserved E.1 selections, the legacy E URL alias, and table width
  at 320/1440/1920 pixels in both themes. Reference IDs retain their gray color.
- Purpose is visible at selection time in every variant. A missing purpose
  is labeled without blocking selection or adding a confirmation step.
- TypeScript type checking, focused Biome checking, Tailwind class checking
  and the target-size guard pass.

See [E.1 modal checks](modal-inspection.json),
[E.2 table checks](table-modal-inspection.json) and
[raw measurements](measurements.json) for geometry in each combination.
Screenshots in the [review guide](README.md) preserve two desktop scenarios
for each alternative, plus the review panel with live state. The
[Swedish guide](GRANSKNING.md) also links modal and selected-badge screenshots.

## Confirmed E.2 grouping behavior

Both dialogs group items by the applied selection at opening. Checking or
unchecking an item leaves its group and row order unchanged. Search filters
both groups. One scroll area keeps the column headings visible. The upper
group is omitted when nothing was selected at opening. Select applies the
draft; reopening rebuilds the groups. Cancel discards the draft.

The user confirmed these decisions during the grilling discussion.
See [group inspection](group-inspection.json) and the Swedish review guide.

## Limits

This is not a complete accessibility audit or production regression suite.
Save, Cancel, New and post-save navigation are simulated. The create route
hosts the experiment; production edit behavior and local-requirement forms
are not changed. Desktop comparisons use blank writing fields, while the
interaction and narrow-viewport inspections use long sample text.

The prototype uses scoped CSS against the current shared component structure.
Rewrite the chosen design as maintainable production code with the required
regression coverage. Do not merge the prototype controls or experiments into
production.
