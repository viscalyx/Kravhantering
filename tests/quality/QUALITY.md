# Quality Constitution: Kravhantering

## Purpose

Kravhantering is a Next.js and TypeScript application built on
SQL Server + TypeORM. Quality in this project means every surface tells the
same lifecycle truth: REST, MCP, package views, exports, and admin defaults
must agree on what is draft, under review, published, archived, deviated, or
pending review. A route returning `200` is not enough if it exposes the wrong
version or lets package status drift from the audit trail.

Deming applies here as "quality is built into the workflow." The shared
service in `lib/requirements/service.ts`, the lifecycle DAL in
`lib/dal/requirements.ts`. Juran applies as
"fitness for use": a requirement register is fit only when lifecycle dates,
effective status, package inclusion, and decision history stay trustworthy
under editing, publishing, archiving, exporting, and lookup fallback paths.
Crosby applies because the cost of defining these invariants now is far lower
than debugging a quietly wrong compliance report or a leaked draft later.

Source basis for this constitution: `README.md`, `docs/`, and the current code.
No exported incident history was available, so every `[Req: inferred — ...]`
item below should be treated as a strong code-grounded inference rather than a
recorded production incident.

## Coverage Targets

<!-- markdownlint-disable MD013 -->
| Subsystem | Target | Why |
| --- | --- | --- |
| `lib/dal/requirements.ts` | 92-95% | Lifecycle transitions, effective status, delete/restore, and auto-archive rules are the core register invariants. A regression here can make the same requirement appear published, draft, or archived depending on the surface. |
| `lib/dal/requirement-packages.ts` | 90-95% | Package linking, needs-reference ownership, package-local sequencing, and deviation gating determine what compliance reports say about real work. Silent drift here produces plausible but wrong package status. |
| `lib/requirements/service.ts` and `app/api/requirements/[id]/route.ts` | 88-92% | These are the public truth layer for REST and MCP. The highest-risk failure is published-detail reads leaking draft or review content. |
| `lib/dal/deviations.ts` and `lib/dal/improvement-suggestions.ts` | 88-92% | These modules hold the project's write-once audit trail. Mutability after approval, rejection, resolution, or dismissal breaks traceability instead of throwing obvious errors. |
| `lib/requirements/list-view.ts` and requirements-table UI consumers | 82-88% | Admin defaults, visible-column persistence, filter clearing, and width clamps are fail-safe logic. Bad fallback behavior leaves the UI looking normal while applying stale filters. |
| `lib/mcp/http.ts`, `lib/mcp/server.ts`, and `lib/export-csv.ts` | 80-85% | These are outward-facing contracts. Wrong method handling, malformed MCP fields, or CSV escaping defects break integrations and downstream reporting even when the app UI still works. |
<!-- markdownlint-enable MD013 -->

## Coverage Theater Prevention

The following do **not** count as meaningful coverage for this project:

- Checking a requirements route returned `200` without asserting that published
  detail excluded newer draft or review data.
- Checking a package link call returned a count without verifying
  `packageItemStatusId` defaulting, needs-reference trimming, or orphan cleanup.
- Rendering the requirements table and only asserting headers are visible
  without proving hidden-column filters were cleared.
- Mocking deviation or suggestion approval paths so the test never exercises
  the "must be approved" or "must be submitted for review" guards.
- Verifying CSV export created a string without asserting
  semicolon/quote escaping behavior.
- Calling the MCP handler and only asserting "no exception" instead of the
  actual JSON-RPC error or payload fields.
- Testing archived behavior through a single boolean flag without checking the
  effective status rules that drive list visibility.

## Fitness-to-Purpose Scenarios

### Scenario 1: Published Detail Never Leaks Draft Content

**Requirement tag:** `[Req: formal — docs/mcp-server-contributor-guide.md "requirements_get_requirement"]`

**What happened:** The shared service deliberately selects the highest-numbered
published version for `view: "detail"` in
`lib/requirements/service.ts:1088-1147`. If that selection ever falls back to
the newest draft or review row, MCP and REST consumers can act on unpublished
edits, attach the wrong package state to a requirement, or quote future text as
current truth.

**The requirement:** Default detail reads must expose only the latest published
version. Draft, review, and archived versions are visible only through
explicit `history` or `version` reads.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 1: published detail never leaks draft content"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 2: Pending Replacement Blocks Archiving

**Requirement tag:** `[Req: formal — docs/lifecycle-workflow.md "Initiate archiving"]`

**What happened:** `initiateArchiving()` explicitly rejects archiving when a
newer draft or review version exists in
`lib/dal/requirements.ts:1107-1129`. Without that guard, a requirement can be
marked archived while replacement work is still open, causing non-archived
views to lose the active item and leaving the lifecycle story contradictory.

**The requirement:** Published versions can enter archiving review only when no
newer draft or review version exists for the same requirement.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 2: pending replacement blocks archiving"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 3: Publishing A Successor Auto-Archives Its Predecessor

**Requirement tag:** `[Req: formal — docs/lifecycle-workflow.md "Review -> Published"]`

**What happened:** `transitionStatus()` sets `publishedAt` for the new version
and auto-archives any older published version in the same path at
`lib/dal/requirements.ts:1452-1468`. If those actions ever drift apart, the
register can temporarily show two published versions or no published version at
all, which breaks package linking and external reads.

**The requirement:** A requirement may have exactly one published version at a
time, and publishing a successor must archive the predecessor atomically from
the caller's perspective.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 3: publishing a successor auto-archives its predecessor at the same instant"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 4: Review And Archived Versions Are Immutable Until The State Changes

**Requirement tag:**

<!-- markdownlint-disable MD013 -->
```text
[Req: formal — docs/lifecycle-workflow.md "Published -> Draft : New version created"]
```
<!-- markdownlint-enable MD013 -->

**What happened:** `editRequirement()` rejects edits against review and
archived versions after stale edit preconditions at
`lib/dal/requirements.ts:832-845`. If those rows are edited in place, the
project loses the meaning of approval, publication, and archival timestamps
because the historical record itself mutates.

**The requirement:** Draft versions may be edited in place. Published edits
must create a new draft. Review content must return to draft before editing.
Archived content must be restored or reactivated before editing.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 4: review and archived versions are immutable until the state changes"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 5: Archived Requirements Stay Visible While A Replacement Draft Exists

**Requirement tag:**
`[Req: formal — docs/version-lifecycle-dates.md "Effective Status"]`

**What happened:** The effective-status SQL in
`lib/dal/requirements.ts:63-85` gives archived requirements higher priority
than replacement draft or review work while `requirements.isArchived` stays
true. If draft or review ever outranks archived in this window, archived items
vanish from archive-oriented reporting exactly when users are preparing a
replacement.

**The requirement:** While a previously archived requirement is being replaced,
its effective status must remain archived until a new published version exists.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 5: archived requirements stay visible while a replacement draft exists"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 6: Deviated Status Requires An Approved Deviation

**Requirement tag:**

<!-- markdownlint-disable MD013 -->
```text
[Req: formal — docs/lifecycle-workflow.md "Deviation Effect on Package Item Status"]
```
<!-- markdownlint-enable MD013 -->

**What happened:** Both `updatePackageItemFields()` and
`updatePackageLocalRequirementFields()` block `packageItemStatusId = 5`
without an approved deviation at
`lib/dal/requirement-packages.ts:1860-2001`. If the UI or API can set
"Deviated" directly, package dashboards and reports imply an approved risk
exception that never happened.

**The requirement:** Library items and package-local requirements may enter the
Deviated state only after an approved deviation decision exists for that exact
item kind.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 6: deviated status requires an approved deviation for both library and package-local items"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 7: Needs-Reference Linking Never Leaks Orphan Metadata

**Requirement tag:**
`[Req: inferred — from linkRequirementsToPackageAtomically() cleanup path]`

**What happened:** `linkRequirementsToPackageAtomically()` trims
`needsReferenceText`, creates or reuses the metadata row, and deletes a newly
created row when no package items were actually inserted at
`lib/dal/requirement-packages.ts:1447-1512`. Without that cleanup, the package
administration views accumulate business-need entries that look real but are
not attached to any requirement.

**The requirement:** `package_needs_references` rows must exist only when at
least one linked package item still points at them.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 7: needs-reference linking never leaks orphan metadata"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 8: Suggestion Resolution Is Impossible Without Review

**Requirement tag:**
`[Req: formal — docs/lifecycle-workflow.md "Improvement Suggestion Lifecycle"]`

**What happened:** `recordResolution()` requires
`isReviewRequested === 1`, and `requestReview()` /
`revertToDraft()` are the only state toggles in
`lib/dal/improvement-suggestions.ts:208-269` and
`lib/dal/improvement-suggestions.ts:372-449`. If draft suggestions can resolve
directly, the audit trail stops telling users whether a reviewer ever saw the
change.

**The requirement:** Suggestions are editable only in draft, may enter review
explicitly, and may be resolved or dismissed only from the submitted state.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 8: suggestion resolution is impossible without review"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 9: Deviation Decisions Are Write-Once Audit Events

**Requirement tag:**

```text
[Req: formal — docs/lifecycle-workflow.md "Deviation Lifecycle"]
```

**What happened:** Both library and package-local deviation decisions
are guarded by `isReviewRequested` checks in
`lib/dal/deviations.ts:521-693`. Decisions can only be recorded
when a deviation has been submitted for review
(`isReviewRequested === 1`). After a decision is recorded, further
edits, deletes, or second decisions are blocked by conflict guards.
Deviations in review-requested state cannot be edited or deleted.

**The requirement:** After a deviation decision is recorded, further
edits, deletes, or second decisions must fail with a conflict.
Decisions require prior review submission.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 9: deviation decisions are write-once audit events"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 10: MCP Tool Inventory Matches Documentation

**Requirement tag:**
`[Req: formal — docs/mcp-server-contributor-guide.md "Server Contract"]`

**What happened:** The 2026-04-16 spec audit discovered that
`lib/mcp/server.ts` registered 11 tools while both MCP guides still
documented 10. The `requirements_generate_requirements` tool was added to
code without updating the contributor guide tool count, the user guide tool
inventory, or the Copilot coding-agent allowlist examples.

**The requirement:** The number of `server.registerTool()` calls in
`lib/mcp/server.ts` must equal the `Exposed MCP tools` count in the
contributor guide and the number of tool entries listed in the user guide.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 10: MCP tool inventory matches documentation"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 11: stale draft edits are rejected before replacing latest content

**Requirement tag:** `[Req: formal — docs/lifecycle-workflow.md "Draft"]`

**What happened:** Draft content is intentionally editable in place, but
`editRequirement()` now requires the caller's `baseVersionId` and
`baseRevisionToken` to match the latest draft row before it updates the row or
rewrites its scenario and norm reference joins at
`lib/dal/requirements.ts:805-895`. The shared service requires both base
fields and adds the latest snapshot to stale conflict responses at
`lib/requirements/service.ts:1317-1364`. If those guards are removed, a second
editor can silently replace the first editor's saved content while still
receiving a successful response.

**The requirement:** Editing a draft must be conditional on the version ID and
opaque revision token captured when editing started. A stale edit must fail with
a conflict and must leave the latest saved version content unchanged.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 11: stale draft edits are rejected before replacing latest content"
```
<!-- markdownlint-enable MD013 -->

## AI Session Quality Discipline

1. Read `tests/quality/QUALITY.md` before changing lifecycle, package, MCP,
   report, or admin-default code.
1. When editing lifecycle or package logic, run
   `npm exec -- vitest run tests/quality/functional.test.ts` before declaring done.
1. Treat `docs/` as the current spec source. If code disagrees, document
   whether the defect is in code, documentation, or an inferred requirement.
1. Add or update tests for every new lifecycle branch, package-status rule, or
   outward-facing contract change.
1. Preserve audit immutability: decisions, resolutions, and archived history
   should become more traceable over time, never less.
1. Update this file whenever a new silent-failure mode is discovered.

## The Human Gate

- Decide whether new lifecycle behavior changes the business meaning of
  "published," "archived," or "deviated."
- Approve wording changes that affect Swedish or English policy terminology.
- Review any change that alters authorization policy defaults or enables MCP
  route authentication in production.
- Confirm report-column expectations when exports or admin defaults change.
- Validate whether an inferred requirement should be promoted to a formal one
  in `docs/`.
