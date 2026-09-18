# Prototype inspection findings

<!-- markdownlint-configure-file {"MD060": {"style": "compact"}} -->

Question: which layout improves norm-reference readability while keeping
useful writing space?

**Provisional recommendation: start the design discussion with A.** It fixes
the two reported layout problems with the smallest structural change.
This is a measured design option, not a user-approved implementation decision.

## Measured comparison

At 1920 × 1080, collapsed navigation, light theme, using the same data:

<!-- markdownlint-disable MD013 -->
| Variant | Package width | Norm width | Writing width | Norm label lines | Destination row offset |
| :--- | ---: | ---: | ---: | ---: | ---: |
| baseline | 260 | 260 | 662 | 3 | 57 |
| A | 176 | 352 | 662 | 2 | 0 |
| B | 384 | 384 | 822 | 2 | 0 |
| C | 402 | 804 | 1230 | 1 | 0 |
<!-- markdownlint-enable MD013 -->

Widths and offsets are CSS pixels. All writing fields in this table remain
100 pixels high. Each of the three representative full norm labels
(EN 301 549, NIS2 and ISO/IEC 25010, including ID and name) has the listed
line count. It is not a claim about every possible norm name.

- **A:** norm width increases and the writing column stays unchanged.
  The list-top offset decreases from 20 pixels to zero and the footer controls
  share one row. The tradeoff is more wrapping in the narrower package list.
- **B:** norm labels become shorter and the writing column gains 160 pixels.
  Stacked lists have less individual height and require more internal scrolling.
- **C:** the three norm labels fit on one line and writing spans the card.
  Moving associations below the fields adds a separate 320-pixel section plus
  a gap, making the page substantially taller.

## Browser inspection

Local Chromium, authenticated development administrator, existing reference
catalogs, Swedish locale. No requirement or norm-reference data is written.

- 32 desktop combinations: four variants × two viewport sizes
  (1440 × 900 and 1920 × 1080) × two themes × two navigation states.
- All four variants also inspected at 320-pixel viewport width with long text
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
- TypeScript type checking, focused Biome checking, Tailwind class checking
  and the target-size guard pass.

See [raw measurements](measurements.json) for geometry in each combination.
Screenshots in the [review guide](README.md) preserve two desktop scenarios
for each alternative, plus the review panel with live state.

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
