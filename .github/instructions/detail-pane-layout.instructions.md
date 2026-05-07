---
applyTo: "app/[locale]/requirements/[id]/requirement-detail-client.tsx"
---

# Requirement Detail Pane Layout

## Content Order

The inline detail pane and the full-page requirement detail view share the same single-column layout. Sections render in this fixed order:

1. Requirement text (description) — always first
2. Acceptance criteria — always second
3. Metadata grid (2–3 columns) — area (with owner), category, type, quality
   characteristic, requires testing, verification method, specification count
4. References (if any)
5. Scenarios

- No sidebar. All metadata lives inside the card's metadata grid.

## Area Owner Display

- The area owner is a property of the area, not of the requirement.
- In both inline and full-page views, the area and its owner are shown inside
  the metadata grid after the two primary text sections.
- In the requirement create/edit form, the owner is not an editable field.
  Instead, small text below the area dropdown shows the selected area's owner.
- The owner is set on the area itself via the area reference data management
  page.

## Contributor Notes

- Do not move description or acceptance criteria below any metadata section.
- When adding new metadata properties to the detail card, place them after
  acceptance criteria, alongside the existing metadata sections in the grid.
- The inline and full-page views share the same card layout.
- If you change the detail pane layout order, update this instruction file.
