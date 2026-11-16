---
applyTo: "{app/[[]locale[]]/specifications/[[]specificationId[]]/specification-editor-workflow.ts,lib/dal/requirements-specifications.ts,app/api/requirements-specifications/[[]id[]]/needs-references/route.ts,app/api/requirements-specifications/[[]id[]]/items/route.ts,app/api/requirements-specifications/[[]id[]]/deviations/route.ts}"
---

## Bulk Writes

- Preserve operation-specific completion: independent deviation creations,
  atomic bulk needs-reference updates and atomic selected-item removals.
- Preserve identifiable per-item save results when a later refresh fails.
- Distinguish failed saves, committed saves with failed refresh and uncertain
  outcomes; inspect saved state before repeating uncertain work.
- For bulk needs-reference assignment, compare reviewed field values inside
  the write boundary. Any selected-item conflict rejects the complete update.
- Preserve the reviewed baseline; unrelated field edits need not block it.
