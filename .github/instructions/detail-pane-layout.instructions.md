---
applyTo: "app/[locale]/kravkatalog/[id]/requirement-detail-client.tsx"
---

# Requirement Detail Pane Layout

## Content Order

The detail pane card (both inline and full-page) must render content sections
in this fixed order:

1. Requirement text (description) — always first
2. Acceptance criteria — always second
3. Metadata properties — area (with owner), references, scenarios, and any
   future properties come after the two primary text sections

This order applies to both the inline detail pane expanded inside the
requirements table and the full-page requirement detail view.

## Rationale

Requirement text and acceptance criteria are the primary content a reader needs.
Classification metadata (area, owner, category, type, etc.) is secondary context
and must not push the main content down.

## Area Owner Display

- The area owner is a property of the area, not of the requirement.
- In the inline detail pane, the area and its owner are shown as a metadata
  section after the two primary text sections.
- In the full-page sidebar, the area owner is shown as small text below the
  area name.
- In the requirement create/edit form, the owner is not an editable field.
  Instead, small text below the area dropdown shows the selected area's owner.
- The owner is set on the area itself via the area reference data management
  page.

## Contributor Notes

- Do not move description or acceptance criteria below any metadata section.
- When adding new metadata properties to the detail card, place them after
  acceptance criteria, alongside the existing metadata sections.
- If you change the detail pane layout order, update this instruction file.
