---
applyTo: '{app/[locale]/requirements/**/*.tsx,components/RequirementDetail*.tsx,components/RequirementAreaInfo.tsx,components/SpecificationLocalRequirementDetailClient.tsx}'
---

# Requirement Detail Pane Layout

## Content Order

- Use the shared card in expanded rows, split details, standalone details,
  specification-local details and requirement-selection previews.
- Render sections in this order:
  1. Requirement text, with compact process steps beside its heading when used.
  2. Acceptance criteria.
  3. Verification method, shown once with the same heading and body styles.
  4. Metadata grid: area, category, type, quality characteristic, priority,
     verifiable, specification count and applicable specification fields.
  5. Norm references and requirement packages, with compact empty information.
- Give the three text blocks the full inner card width, including beneath
  process steps. Preserve stored line breaks and wrap long unbroken text.
- Use 12 px property headings, 16 px primary text and compact card spacing.
- Size process arrows to 24 px high with 6 px points. Preserve configured
  labels, icons, colors and current-step semantics. Wrap the stepper below the
  heading when needed and retain access to long configured labels.
- Use neutral available-filter-option styling for package pills: rounded ends,
  at least 24 px height, 10 px text and a 2 px gray border in both themes.
- Keep metadata inside the card; size its columns to available card width.
- Preserve existing actions, version history and suggestion error presentation.

## Area Information

- Show an info button beside the area name. Open its description and owner
  with mouse or keyboard; dismiss with Escape or an outside click.
- Keep loading, empty-description and read-error states inside the panel.
- Treat the owner as a property of the area. Keep owner editing in area
  management and the read-only owner hint below the create/edit area selector.
