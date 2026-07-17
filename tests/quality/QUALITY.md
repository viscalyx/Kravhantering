# Quality Constitution: Kravhantering

## Purpose

Kravhantering is a Next.js and TypeScript application built on
SQL Server + TypeORM. Quality in this project means every surface tells the
same lifecycle truth: REST, MCP, specification views, exports, and admin defaults
must agree on what is draft, under review, published, archived, deviated, or
pending review. A route returning `200` is not enough if it exposes the wrong
version or lets specification status drift from recorded decision history.

Deming applies here as "quality is built into the workflow." The shared
service in `lib/requirements/service.ts`, the lifecycle DAL in
`lib/dal/requirements.ts`. Juran applies as
"fitness for use": a requirement register is fit only when lifecycle dates,
effective requirement status, specification inclusion, and decision history
stay trustworthy under editing, publishing, archiving, exporting, and lookup
fallback paths.
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
| `lib/dal/requirements.ts` | 92-95% | Lifecycle transitions, effective requirement status, delete/restore, and auto-archive rules are the core register invariants. A regression here can make the same requirement appear published, draft, or archived depending on the surface. |
| `lib/dal/requirements-specifications.ts` | 90-95% | Specification linking, needs-reference ownership, specification-local sequencing, and deviation gating determine what compliance reports say about real work. Silent drift here produces plausible but wrong specification status. |
| `lib/requirements/service.ts` and `app/api/requirements/[id]/route.ts` | 88-92% | These are the public truth layer for REST and MCP. The highest-risk failure is published-detail reads leaking draft or review content. |
| `lib/dal/deviations.ts` and `lib/dal/improvement-suggestions.ts` | 88-92% | These modules hold the project's write-once decision history. Mutability after approval, rejection, resolution, or dismissal breaks traceability instead of throwing obvious errors. |
| `lib/audit/action-audit.ts` and `app/api/admin/audit-events/route.ts` | 88-92% | The action log is fail-closed review evidence for mutations and denials. A regression here can make a valid business change untraceable or leak personal/free-text data into action-log details. |
| `lib/requirements/list-view.ts` and requirements-table UI consumers | 82-88% | Admin defaults, visible-column persistence, filter clearing, and width clamps are fail-safe logic. Bad fallback behavior leaves the UI looking normal while applying stale filters. |
| `lib/mcp/http.ts`, `lib/mcp/server.ts`, `lib/export-csv.ts`, and `lib/reports/specification-*.ts` | 80-85% | These are outward-facing contracts. Wrong method handling, malformed MCP fields, CSV escaping defects, or lifecycle/report-profile drift break integrations and downstream reporting even when the app UI still works. |
<!-- markdownlint-enable MD013 -->

## Coverage Theater Prevention

The following do **not** count as meaningful coverage for this project:

- Checking a requirements route returned `200` without asserting that published
  detail excluded newer draft or review data.
- Checking a specification link call returned a count without verifying
  `specificationItemStatusId` defaulting, needs-reference trimming, or orphan cleanup.
- Rendering the requirements table and only asserting headers are visible
  without proving hidden-column filters were cleared.
- Mocking deviation or suggestion approval paths so the test never exercises
  the "must be approved" or "must be submitted for review" guards.
- Verifying CSV export created a string without asserting
  semicolon/quote escaping behavior.
- Calling the MCP handler and only asserting "no exception" instead of the
  actual JSON-RPC error or payload fields.
- Testing archived behavior through a single boolean flag without checking the
  effective requirement status rules that drive list visibility.

## Fitness-to-Purpose Scenarios

### Scenario 1: published detail never leaks draft content

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — docs/integrations/mcp-server-contributor-guide.md "requirements_get_requirement"]`

**What happened:** The shared service deliberately selects the highest-numbered
published version for `view: "detail"` in
`lib/requirements/service.ts:1088-1147`. If that selection ever falls back to
the newest draft or review row, MCP and REST consumers can act on unpublished
edits, attach the wrong specification state to a requirement, or quote future
text as current truth.

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

### Scenario 2: pending replacement blocks archiving

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — docs/governance/lifecycle-workflow.md "Initiate archiving"]`

**What happened:** `initiateArchiving()` explicitly rejects archiving when a
newer draft or review version exists in
`lib/dal/requirements.ts:960-971`. Without that guard, a requirement can be
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

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 3: publishing a successor auto-archives its predecessor at the same instant

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — docs/governance/lifecycle-workflow.md "Review -> Published"]`

**What happened:** `transitionStatus()` sets `publishedAt` for the new version
and auto-archives any older published version in the same path at
`lib/dal/requirements.ts:1196-1207`. If those actions ever drift apart, the
register can temporarily show two published versions or no published version at
all, which breaks specification linking and external reads.

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

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 20: publishing a successor replaces requirement-package membership

**Requirement tag:**

<!-- markdownlint-disable MD013 -->
```text
[Req: formal — docs/adr/0031-kravpaket-ersatter-kravversion-vid-publicering.md]
```
<!-- markdownlint-enable MD013 -->

**What happened:** Kravpaket representerar aktuellt medlemskap för krav i
kravbiblioteket, inte historik över tidigare kravversioner. Publicering av en
efterträdare måste därför arkivera föregångaren och flytta
kravpaketsmedlemskapet till den nya publicerade kravversionen i samma
publiceringsflöde. Kravpaketets egna listor och räkningar måste samtidigt
behandla bara publicerade kravversioner som aktuellt paketmedlemskap, så att
ett utkast med ändrade paketval inte syns som paketets nuvarande innehåll.

**The requirement:** När en ny kravversion publiceras ska den ersätta den
tidigare publicerade kravversionen i alla kravpaket där kravet används.
Kravpaketskopplingar ska inte ligga kvar som historik på den arkiverade
föregångaren, och kravpaketets aktuella listor ska inte visa opublicerade
utkast som paketmedlemmar.

**Scenario 20 code coverage:** Publiceringens flytt av
kravpaketsmedlemskap finns i `transitionStatus()` i
`lib/dal/requirements.ts:1120-1141`, där föregångaren arkiveras och äldre
paketkopplingar för samma krav tas bort. Kravpaketets aktuella list- och
räkneytor filtrerar publicerade kravversioner i
`lib/dal/requirement-packages.ts:252-312`. Den körbara kontrollen i
`tests/quality/functional.test.ts:1093-1170` skapar en publicerad version i ett
kravpaket, förbereder ett utkast med nytt paketval, verifierar att
paketlistan fortfarande visar den publicerade versionen, publicerar utkastet
och kontrollerar att bara den nya publicerade versionens paketkoppling finns
kvar.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 20: publishing a successor replaces requirement-package membership"
```
<!-- markdownlint-enable MD013 -->

---

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 21: archiving without successor preserves package history but excludes practical use

**Requirement tag:**

<!-- markdownlint-disable MD013 -->
```text
[Req: formal — docs/adr/0031-kravpaket-ersatter-kravversion-vid-publicering.md]
```
<!-- markdownlint-enable MD013 -->

**What happened:** Arkivering utan efterträdare är inte samma sak som att
publicera en ersättande kravversion. I det fallet ska kravpaketskopplingen få
ligga kvar som historik över att den arkiverade kravversionen har ingått i
paketet. Samtidigt får praktisk kravpaketsanvändning, till exempel urval till
kravunderlag, inte använda arkiverade kravversioner.

**The requirement:** När en publicerad kravversion arkiveras utan efterträdare
ska paketkopplingen bevaras för historik, men kravpaketets praktiska
medlemskapslistor och urval ska exkludera den arkiverade versionen och bara
behandla publicerade kravversioner som användbara paketmedlemmar.

**Scenario 21 code coverage:** Arkiveringsflödet i
`lib/dal/requirements.ts:801-920` markerar den publicerade kravversionen för
arkivering och godkänner arkiveringen utan att radera kravpaketskopplingen när
ingen ny publicerad efterträdare ersätter den. Kravpaketets praktiska list- och
räkneytor i `lib/dal/requirement-packages.ts:252-312` filtrerar till
publicerade kravversioner. Den körbara kontrollen i
`tests/quality/functional.test.ts:1172-1213` arkiverar ett paketerat krav utan
efterträdare, kontrollerar att paketkopplingen finns kvar på den arkiverade
versionen och verifierar att kravpaketets praktiska lista inte returnerar
kravet.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 21: archiving without successor preserves package history but excludes practical use"
```
<!-- markdownlint-enable MD013 -->

---

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 22: package filters keep archived history out of specifications but available in the library

**Requirement tag:**

<!-- markdownlint-disable MD013 -->
```text
[Req: formal — docs/adr/0031-kravpaket-ersatter-kravversion-vid-publicering.md]
```
<!-- markdownlint-enable MD013 -->

**What happened:** Samma kravpaketskoppling kan behöva läsas i två olika
sammanhang. Kravunderlag och kravurval använder kravpaket för att föra in
användbara krav och måste därför bara se publicerade kravversioner. I
kravbiblioteket är kravpaket däremot ett sökfilter över den statusmängd
användaren har valt; om användaren uttryckligen filtrerar på arkiverade krav
ska arkiverade krav med historisk paketkoppling kunna visas.

**The requirement:** Kravunderlagets paketurval ska exkludera arkiverade
kravversioner även när deras historiska paketkoppling finns kvar. Kravbibliotekets
kravpaketsfilter ska inte i sig dölja arkiverade kravversioner; de visas när
användaren inkluderar status `Arkiverad` i listans statusfilter.

**Scenario 22 code coverage:** Kravunderlagets urval via
`listRequirementSelectionMatchedRequirements()` i
`lib/dal/requirement-selection-questions.ts:721-815` filtrerar paketträffar
till publicerade kravversioner. Kravbibliotekets lista via `listRequirements()`
i `lib/dal/requirements.ts:159-237` anropar SQL-byggaren där statusfiltret
finns i `lib/dal/requirements-list-sql.mjs:92-95` och kravpaketsfiltret finns
i `lib/dal/requirements-list-sql.mjs:135-142`. Den körbara kontrollen i
`tests/quality/functional.test.ts:1215-1265` skapar ett publicerat och ett
arkiverat krav i samma kravpaket, verifierar att kravunderlagets
paketmatchning bara ger det publicerade kravet och att kravbibliotekets
paketfilter kan visa det arkiverade kravet när status `Arkiverad` väljs.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 22: package filters keep archived history out of specifications but available in the library"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 4: review and archived versions are immutable until the state changes

**Requirement tag:**

<!-- markdownlint-disable MD013 -->
```text
[Req: formal — docs/governance/lifecycle-workflow.md "Published -> Draft : New version created"]
```
<!-- markdownlint-enable MD013 -->

**What happened:** `editRequirement()` rejects edits against review and
archived versions after stale edit preconditions at
`lib/dal/requirements.ts:832-845`. If those rows are edited in place, the
project loses the meaning of approval, publication, and archival timestamps
because the historical record itself mutates.

**The requirement:** Draft versions may be edited in place. Published edits
must create a new draft. Review content must return to draft before editing.
Archived content must be restored before editing.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 4: review and archived versions are immutable until the state changes"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 5: archived requirements stay visible while a replacement draft exists

**Requirement tag:**
<!-- markdownlint-disable-next-line MD013 -->
`[Req: formal — docs/reference/version-lifecycle-dates.md "Effective Requirement Status"]`

**What happened:** The effective requirement status SQL in
`lib/dal/requirements.ts:63-85` gives archived requirements higher priority
than replacement draft or review work while `requirements.isArchived` stays
true. If draft or review ever outranks archived in this window, archived items
vanish from archive-oriented reporting exactly when users are preparing a
replacement.

**The requirement:** While a previously archived requirement is being replaced,
its effective requirement status must remain archived until a new published
version exists.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 5: archived requirements stay visible while a replacement draft exists"
```
<!-- markdownlint-enable MD013 -->

---

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 6: deviated status requires an approved deviation for both library and specification-local items

**Requirement tag:**

<!-- markdownlint-disable MD013 -->
```text
[Req: formal — docs/governance/lifecycle-workflow.md "Deviation Effect on Usage Status"]
```
<!-- markdownlint-enable MD013 -->

**What happened:** Both `updateSpecificationItemFields()` and
`updateSpecificationLocalRequirementFields()` block
`specificationItemStatusId = 5` without an approved deviation at
`lib/dal/requirements-specifications.ts:1860-2001`. If the UI or API can set
"Deviated" directly, specification dashboards and reports imply an approved risk
exception that never happened.

**The requirement:** Library items and unique requirements
may enter the Deviated state only after an approved deviation decision
exists for that exact item kind.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 6: deviated status requires an approved deviation for both library and specification-local items"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 7: needs-reference linking never leaks orphan metadata

**Requirement tag:**
`[Req: inferred — from linkRequirementsToSpecificationAtomically() cleanup path]`

**What happened:** `linkRequirementsToSpecificationAtomically()` trims
`needsReferenceText`, creates a metadata row for new add-to-specification
payloads, and deletes that newly created row when no requirement applications were
actually inserted at `lib/dal/requirements-specifications.ts:1459-1529`.
Without that cleanup, failed or duplicate-only add flows accumulate
business-need entries that look real but were never used by any added
requirement. User-managed needs references are different: the
specification-local register intentionally allows pre-registered unused rows.

**The requirement:** Add-to-specification flows must not leave newly created
needs-reference rows behind when no requirements are added. Explicitly
pre-registered needs references may exist before any requirement points at
them.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 7: needs-reference linking never leaks orphan metadata"
```
<!-- markdownlint-enable MD013 -->

---

### Scenario 8: suggestion resolution is impossible without review

**Requirement tag:**
`[Req: formal — docs/governance/lifecycle-workflow.md "Improvement Suggestion Lifecycle"]`

**What happened:** `recordResolution()` requires
`isReviewRequested === 1`, and `requestReview()` /
`revertToDraft()` are the only state toggles in
`lib/dal/improvement-suggestions.ts:208-269` and
`lib/dal/improvement-suggestions.ts:372-449`. If draft suggestions can resolve
directly, the decision history stops telling users whether a reviewer ever saw the
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

### Scenario 9: deviation decisions are write-once audit events

**Requirement tag:**

```text
[Req: formal — docs/governance/lifecycle-workflow.md "Deviation Lifecycle"]
```

**What happened:** Both library and specification-local deviation mutations
use atomic SQL Server guards in `lib/dal/deviations.ts:196-275` and
`lib/dal/deviations.ts:671-1106`. Decisions can only be recorded
when a deviation has been submitted for review (`isReviewRequested === 1`).
After a decision is recorded, further edits, deletes, or second decisions
are blocked by conflict guards. Deviations in review-requested state cannot
be edited or deleted.

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

### Scenario 10: MCP tool inventory matches documentation

**Requirement tag:**
`[Req: formal — docs/integrations/mcp-server-contributor-guide.md "Server Contract"]`

**What happened:** The 2026-04-16 spec audit discovered that
`lib/mcp/server.ts` registered 11 tools while both MCP guides still
documented 10. A new MCP tool had been added to code without updating the
contributor guide tool count, the user guide tool inventory, or the Copilot
coding-agent allowlist examples.

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

**Requirement tag:** `[Req: formal — docs/governance/lifecycle-workflow.md "Draft"]`

**What happened:** Draft content is intentionally editable in place, but
`editRequirement()` now requires the caller's `baseVersionId` and
`baseRevisionToken` to match the latest draft row before it updates the row or
rewrites its requirement-package and norm-reference joins at
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

---

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 12a: concurrent initiateArchiving attempts are atomic and strictly targeted

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — docs/governance/lifecycle-workflow.md "Two-Step Archiving"]`

**What happened:** `initiateArchiving()` in `lib/dal/requirements.ts` runs its
precondition reads and writes inside a single `SERIALIZABLE` transaction with
`UPDLOCK, HOLDLOCK` precondition selects and a conditional `UPDATE … WHERE`
guarded by an affected-row check. Without that, two concurrent admin requests
can both pass the precondition select before either `UPDATE` runs and produce
contradictory state.

**The requirement:** Concurrent `initiateArchiving` attempts on the same
requirement are serialized: at most one succeeds; the loser fails with a
`conflict` error and the requirement is left in a consistent lifecycle state.
The database also rejects duplicate archiving-in-progress rows for the same
requirement.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 12a: concurrent initiateArchiving attempts are atomic and strictly targeted"
```
<!-- markdownlint-enable MD013 -->

---

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 12b: concurrent approveArchiving attempts are atomic and strictly targeted

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — docs/governance/lifecycle-workflow.md "Two-Step Archiving"]`

**What happened:** `approveArchiving()` uses the same `SERIALIZABLE` +
`UPDLOCK, HOLDLOCK` + conditional-update pattern and additionally targets
**only the single version that has `archive_initiated_at` set**. Without
serialization, two approvers can both believe they completed the archival.

**The requirement:** Concurrent `approveArchiving` attempts on the same
requirement are serialized: at most one succeeds, and the archived flag plus
`archivedAt` are set exactly once on the formerly-published version.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 12b: concurrent approveArchiving attempts are atomic and strictly targeted"
```
<!-- markdownlint-enable MD013 -->

---

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 12c: concurrent approveArchiving vs cancelArchiving are atomic and strictly targeted

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — docs/governance/lifecycle-workflow.md "Two-Step Archiving"]`

**What happened:** When `approveArchiving()` and `cancelArchiving()` race for
the same requirement, the same serialization guards ensure exactly one
operation wins and `archive_initiated_at` is cleared on the targeted version.
Without the guards, the requirement could end up archived but still flagged as
"archive in progress", or vice versa.

**The requirement:** A concurrent approve/cancel pair on the same requirement
must produce a single consistent outcome: either Archived (with
`isArchived = 1`) or Published (with `isArchived = 0`); the other call must
fail with a `conflict` error and `archive_initiated_at` must be cleared.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 12c: concurrent approveArchiving vs cancelArchiving are atomic and strictly targeted"
```
<!-- markdownlint-enable MD013 -->

---

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 12d: strict-target behavior with manual state manipulation

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — docs/governance/lifecycle-workflow.md "Two-Step Archiving"]`

**What happened:** `approveArchiving()` and `cancelArchiving()` filter on
`archive_initiated_at IS NOT NULL`, so even if a newer Draft or Review version
exists for the same requirement (a state that the public API now rejects in
`initiateArchiving()`, but which can exist after manual data changes), only
the version that was put into archiving review is touched. The newer Draft or
Review version is never silently flipped to Archived or Published.

**The requirement:** Approve and cancel target strictly the version with
`archive_initiated_at` set; a newer Draft or Review version on the same
requirement is never the target and its status, content, and revision token
remain untouched. Filtered unique indexes make duplicate Published or
archiving-in-progress targets invalid at the storage layer.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 12d: strict-target behavior with manual state manipulation"
```
<!-- markdownlint-enable MD013 -->

---

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 12e: storage constraints reject duplicate archiving targets

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — docs/governance/lifecycle-workflow.md "Two-Step Archiving"]`

**What happened:** A filtered unique index on `requirement_versions` prevents
more than one row for the same requirement from having
`archive_initiated_at IS NOT NULL`.

**The requirement:** Even direct SQL or manual data manipulation cannot create
two archiving-in-progress targets for one requirement.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 12e: storage constraints reject duplicate archiving targets"
```
<!-- markdownlint-enable MD013 -->

---

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 12f: storage constraints reject duplicate Published versions

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — docs/governance/lifecycle-workflow.md "Two-Step Archiving"]`

**What happened:** A filtered unique index on `requirement_versions` prevents
more than one row for the same requirement from having
`requirement_status_id = Published`.

**The requirement:** Even direct SQL or manual data manipulation cannot create
two Published targets for one requirement.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 12f: storage constraints reject duplicate Published versions"
```
<!-- markdownlint-enable MD013 -->

---

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 13: specification-local graduation is copy-only into a draft library requirement

**Requirement tag:** `[Req: formal — issue #96 copy-only graduation workflow]`

**What happened:** `graduateSpecificationLocalRequirementToLibrary()` in
`lib/dal/requirements-specifications.ts` locks the source
specification-local row, allows any usage status, creates a new library
requirement and Draft version in the selected target requirement area, copies
supported classification, verification, requirement-package and norm-reference
joins, and leaves the original local row untouched. Without this fitness
scenario, an implementation could silently replace or relink the source,
add a status gate, or move or delete evidence from the source specification.

**The requirement:** Graduation must be copy-only and independent of usage
status. The source unique requirement, its usage status, note, and local
deviations remain unchanged; the target library requirement is a new Draft in
the chosen requirement area.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 13: specification-local graduation is copy-only into a draft library requirement"
```
<!-- markdownlint-enable MD013 -->

### Scenario 14: action-log rows fail closed with the business transaction

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — docs/security-privacy/audit-log.md "Failure Mode"]`

**What happened:** The application action log is now database-backed and
fail-closed. If an implementation writes action-log rows after the business
transaction commits, an audit failure can leave a mutation without durable
review evidence. If details are not filtered, prompts or submitted free text
can leak into audit metadata.

**The requirement:** Mutating workflows that own a transaction must write the
action-log row before the transaction resolves. Action-log write failure must
roll back the logical mutation, and `details_json` must keep only bounded
structured metadata. Validated `client_ip` values should persist as first-class
audit metadata rather than being placed inside `details_json`.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 14: action-log rows fail closed with the business transaction"
```
<!-- markdownlint-enable MD013 -->

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 15: configurable status and priority icons use an allowlist and stay additive

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — docs/governance/admin-center.md "Taxonomy And Statuses"]`

**What happened:** Status and priority icons are admin-configurable presentation
data. If unchecked icon strings reach the DAL, reports or client rendering can
receive arbitrary component names. If the API replaces old fields instead of
adding `iconName`, MCP and REST clients can break.

**The requirement:** Requirement version statuses, usage statuses, and priority
levels may carry nullable `icon_name` values only from the shared
allowlist generated from the installed Lucide icon catalog. REST and MCP output
must expose icon data as additive `iconName` fields while keeping existing
names/colors, and the migration must not backfill customer rows outside clean
seed data.

**Coverage/code:**

- Allowlist and icon-node loading:
  `lib/icons/status-icon-allowlist.ts:21-94`.
- Additive list/detail API output:
  `lib/requirements/service-requirements.ts:140-160` and
  `lib/requirements/service-requirements.ts:232-240`.
- Renderer allowlist handling:
  `lib/icons/status-icon-components.ts:1-14` and
  `components/StatusBadge.tsx:23-49`.
- Migration checks:
  `typeorm/migrations/0014_status_and_risk_icons.mjs:1-10` and
  `typeorm/migrations/0038_priority_levels.mjs:17-40`.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 15: configurable status and priority icons use an allowlist and stay additive"
```
<!-- markdownlint-enable MD013 -->

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 16: requirement application usage status cannot be cleared once assigned

**Requirement tag:**

<!-- markdownlint-disable MD013 -->
```text
[Req: formal — issue #147 prevent clearing usage status]
```
<!-- markdownlint-enable MD013 -->

**What happened:** Requirement applications default to Included when they are
added to a requirements specification, but the editable Usage status control
and PATCH/DAL update path previously allowed callers to clear
`specification_item_status_id` back to null. That makes filtering, reports, and
deviation follow-up ambiguous.

**The requirement:** Library requirement applications and specification-local
requirements must always have a real usage status. They may change among real
usage statuses, but explicit null status updates must be rejected by update
paths and by the database schema.

**Scenario 16 code coverage:** `lib/specification-item-status-constants.ts:1-5`
defines the Included default. Library item linking sets the default in
`lib/dal/requirements-specifications.ts:1800-1837`; specification-local
creation does the same in
`lib/dal/requirements-specifications.ts:1316-1388`. The status picker sends
only numeric status IDs from
`app/[locale]/specifications/[specificationId]/requirements-specification-detail-client.tsx:722-752`,
and the PATCH schema accepts only positive integer status IDs in
`app/api/requirements-specifications/[id]/items/[itemId]/route.ts:44-57`. DAL updates
validate allowed status IDs in
`lib/dal/requirements-specifications.ts:2363-2387` and reject null clearing in
`lib/dal/requirements-specifications.ts:2394-2477` before any SQL update. The
ORM/database boundary is pinned by
`lib/typeorm/entities/requirements-specification-item.ts:130-142`,
`lib/typeorm/entities/specification-local-requirement.ts:200-212`, and
`typeorm/migrations/0015_require_specification_item_status.mjs:1-65`.
`tests/quality/functional.test.ts:820-873` is the executable Scenario 16 check.

**Required Vitest fragment:**

<!-- markdownlint-disable MD013 -->
```ts
await expect(
  updateSpecificationItemFields(appDb(), libraryItem.id, {
    specificationItemStatusId: null,
  } as unknown as Parameters<typeof updateSpecificationItemFields>[2]),
).rejects.toMatchObject({
  code: 'validation',
  message: 'Usage status cannot be cleared',
})

await expect(
  updateSpecificationLocalRequirementFields(appDb(), localItem.id, {
    specificationItemStatusId: null,
  } as unknown as Parameters<typeof updateSpecificationLocalRequirementFields>[2]),
).rejects.toMatchObject({
  code: 'validation',
  message: 'Usage status cannot be cleared',
})
```
<!-- markdownlint-enable MD013 -->

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 16: requirement application usage status cannot be cleared once assigned"
```
<!-- markdownlint-enable MD013 -->

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 17: requirements specification MCP tools enforce identifiers and mutation outcomes

**Requirement tag:** `[Req: formal — issue #166 specification MCP tools]`

**What happened:** Requirements specification tools are an agent-facing MCP
contract. `lib/mcp/server.ts:1456-1856` validates the tool inputs and maps them
to the shared service, while
`lib/requirements/service-specifications.ts:146-705` owns the service behavior
for listing specifications, reading linked items, graduation target lookup,
graduation, adding links, and removing links. If these layers drift, an MCP
client could send a kravunderlag code where a numeric `specificationId` is
required, receive an unlocalized or unexpected response shape, or believe a
requirement was linked or removed when the database state says otherwise.

**The requirement:** Requirements specification MCP tools must reject malformed
locale, response format, non-numeric `specificationId`, and ID-array inputs
before service delegation. `specificationCode` is display/search metadata, not
an accepted identifier for mutations or item lookup. Valid calls must pass
default and explicit locale/response format values through to the matching
service method. Add/remove tools must report actual mutation outcomes:
unpublished requirements are skipped and returned in `skippedIds`, removed
counts reflect actual unlinks, and unlinking never deletes the underlying
requirements.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 17: requirements specification MCP tools enforce identifiers and mutation outcomes"
```
<!-- markdownlint-enable MD013 -->

### Scenario 18: HSA-id prefixes stay UI guidance with a visible default rule

**Requirement tag:** `[Req: formal — docs/governance/admin-center.md "Identity"]`

**What happened:** HSA-id-prefixes are admin-managed UI guidance, not HSA
catalog data and not a server-side allowlist. If the prefix table became
required seed data, if hidden defaults were allowed, if used prefixes could be
deleted, or if editable HSA-id fields stopped composing the existing full
HSA-id value, the Admin Center would either block clean installations or make
responsibility assignment state drift from historical HSA-id values.

**The requirement:** Required seed data must not create organization-specific
HSA-id-prefixes. Demo/test seed may provide `SE5560000001` as a visible default.
The migration must backfill prefix rows from existing active assignments and
choose the most-used prefix as default, with alphabetical tie-break. Admin
updates must allow one visible default when visible prefixes exist, reject
hidden defaults, forbid deleting or changing prefixes that occur in active or
historical HSA-id fields, and audit successful saves. Editable HSA-id fields
must use the visible prefix list only as UI guidance and continue to compose a
full `{prefix}-{suffix}` HSA-id for existing APIs.

**Scenario 18 code coverage:** Migration
`typeorm/migrations/0032_hsa_id_prefixes.mjs:1-81` creates the table,
constraints, indexes, active-assignment backfill, and default tie-break.
Demo seed coverage is in `typeorm/seed.mjs:18-18` and
`typeorm/seed.mjs:533-548`; `typeorm/seed-required.mjs` intentionally contains
no `hsa_id_prefixes` seed rows. DAL loading, sorting, visible/default
validation, usage checks, delete/change protection, transactional writes, and
audit callback execution are in `lib/dal/ui-settings.ts:99-280` and
`lib/dal/ui-settings.ts:345-435`. The admin route validates input, requires
Admin for the admin list, uses `adminMutationPolicy()`, records privileged
audit, and maps used-prefix conflicts to `409` in
`app/api/admin/hsa-id-prefixes/route.ts:24-132`. The editable field loads
`/api/hsa-id-prefixes`, preserves hidden current prefixes, disables suffix entry
when no visible prefix exists, and composes the full HSA-id in
`components/HsaPersonVerifyField.tsx:93-168` and
`components/HsaPersonVerifyField.tsx:239-289`.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 18: HSA-id prefixes stay UI guidance with a visible default rule"
```
<!-- markdownlint-enable MD013 -->

### Scenario 19: assignment RBAC denies hidden broad access

**Requirement tag:** `[Req: formal — docs/adr/0012-uppdragsbaserad-rbac.md]`

**What happened:** The old authorization boundary could fall back to broad
allow-all behavior for requirement workflows. With assignment RBAC, decisions
must resolve the target resource in the database, ordinary authenticated users
must see only published library content and assigned requirements
specifications, non-admin AI calls must provide one authorized authoring scope,
and `Admin` must not replace `Reviewer` for review decisions.

**The requirement:** Unknown or unresolved requirement actions fail closed.
`Admin` may bypass authoring scope, including live AI scope, but not
Reviewer-only decisions. Requirement-area and specification assignments are the
source of authoring authority. Ordinary users with no assigned requirements
specifications receive an empty list, unauthorized existing resources return
403 and produce denial audit evidence, and missing resources return 404.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/unit/requirements-assignment-authorization.test.ts
```
<!-- markdownlint-enable MD013 -->

### Scenario 24: Admin Center AI generation disablement is globally effective

**Requirement tag:** `[Req: formal — docs/governance/admin-center.md "AI"]`

**What happened:** AI requirement generation can now be disabled by an
administrator without changing deployment configuration, while
`AI_REQUIREMENT_GENERATION_DISABLED` remains a higher-precedence hard override
for DAST scans and production operation. The same Admin Center panel also owns
the MCP request payload limit and DB-backed AI safety-rule terms. If the
persisted generation setting were
treated as only a UI preference, REST callers could still reach OpenRouter. If
the MCP limit stayed hard-coded, operators could not lower it during incident
response or raise it within the agreed safety envelope for legitimate clients.
If safety terms lived only in code or failed open when the database was
unavailable, administrators could not tune the standard rule set safely and
provider calls could proceed without the expected filter.
If Admin Center could override the environment guard, security scans and
operator-driven shutdowns would lose their fail-closed behavior.

**The requirement:** The `ai_settings` table must be a singleton with
AI-assisted generation and forensic AI safety logging enabled in required and
demo seed insertions, exact `1 MiB` MCP payload limit, and default
`aiSafetyRuleCacheTtlSeconds = 600`. Required seed data must populate
`ai_safety_rules` and `ai_safety_rule_terms`. Admin Center may save the global
`requirementGenerationEnabled`, `aiSafetyForensicLoggingEnabled`,
`mcpMaxRequestBytes`, and `aiSafetyRuleCacheTtlSeconds` through Admin-only
`adminMutationPolicy()` routes and privileged audit events. Safety-rule terms
are administered through separate Admin-only routes and AI-assisted authoring
fails closed if the active rule set cannot be read from the database.
Effective generation availability is false when either the admin preference is
disabled or
`AI_REQUIREMENT_GENERATION_DISABLED` is `1` or `true`; the environment guard
has highest precedence. REST AI-assisted authoring must check effective
availability before model-catalog or chat-provider work. `/api/mcp` must reject
requests above an absolute `5 MiB` cap before database or auth work, then apply
the cached configured limit before bearer-token verification and service
creation. The requirements UI must keep the AI action visible but disabled with
explanatory copy, and an already-open generator modal must also disable
generation.

**Scenario 24 code coverage:** Migration
`typeorm/migrations/0037_ai_settings.mjs:1-25` creates and seeds the singleton
table, and `typeorm/migrations/0041_ai_mcp_payload_limit.mjs` adds the MCP
payload column and check constraint. `typeorm/migrations/0042_ai_safety_rules.mjs`
adds the cache TTL column and safety-rule tables.
`typeorm/migrations/0045_ai_safety_forensic_logging.mjs` adds the forensic
logging setting column. Demo and required seed defaults are in
`typeorm/seed.mjs`, `typeorm/seed-required.mjs`, and
`typeorm/ai-safety-seed-data.mjs`. Environment parsing is in
`lib/ai/scan-guard.ts:1-10`; persisted availability, MCP-limit validation, and
cache fallback logic are in `lib/dal/ai-settings.ts`. Safety-rule loading,
cache invalidation, and admin mutations are in `lib/dal/ai-safety-rules.ts`.
The Admin API policy and audit surfaces are in
`app/api/admin/ai-settings/route.ts` and `app/api/admin/ai-safety-rules/**`.
The REST generation gate is in `app/api/ai/generate-requirement-import/route.ts`,
and the MCP transport guard is in `lib/mcp/http.ts`. UI wiring is in
`app/[locale]/admin/admin-client.tsx`, `app/[locale]/requirements/page.tsx`,
`app/[locale]/requirements/requirements-client.tsx:230-290`, and
`components/AiRequirementGenerator.tsx:232-251`.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 24: Admin Center AI generation disablement is globally effective"
```
<!-- markdownlint-enable MD013 -->

<!-- markdownlint-disable-next-line MD013 -->
### Scenario 23: specification reports stay lifecycle-scoped and pinned to selected versions

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — docs/reference/reports.md "Requirements Specification Field Profiles"]`

**What happened:** Requirements specification profile reports and exports are
lifecycle-scoped outputs rather than row-selected list snapshots. They are used
as procurement attachments, progress follow-up, management reports, and CSV
analysis extracts. `Tillämpningsspårbarhet` is the explicit exception: it is a
filtered requirement-application report driven by normalized server query
state from the current kravunderlag list. If profile report data follows the latest
requirement version instead of the version linked to the specification item, a
generated report can change without an explicit specification decision. If the
menu exposes the wrong profile for a lifecycle status, external procurement
artifacts can leak internal risk, need, or follow-up fields.

**Covered code line ranges:** This scenario covers report generation,
lifecycle-scoping, selected-version pinning, and profile matching in these
implementation ranges:

<!-- markdownlint-disable MD013 -->
```text
app/[locale]/specifications/[specificationId]/requirements-specification-detail-client.tsx:1395-1479
app/[locale]/specifications/[specificationId]/requirements-specification-detail-client.tsx:2426-2508
app/[locale]/specifications/[specificationId]/reports/pdf/[profile]/route.ts:22-78
app/[locale]/specifications/[specificationId]/reports/pdf/traceability/route.ts:1-85
app/api/requirements-specifications/[id]/report-output/route.ts:35-120
app/api/requirements-specifications/[id]/traceability-items/route.ts:1-120
app/api/requirements-specifications/[id]/exports/route.ts:37-160
lib/reports/data/specification-output.ts:345-472
lib/reports/data/specification-traceability.ts:1-60
lib/reports/templates/specification-profile-template.ts:28-263
lib/reports/templates/specification-traceability-template.ts:1-230
lib/reports/specification-csv.ts:28-132
lib/reports/specification-profiles.ts:7-65
```
<!-- markdownlint-enable MD013 -->

**The requirement:** Requirements specification profile reports must use the
linked `requirement_version_id`, cover the whole specification through bounded
server pages sorted by
`Krav-ID`, show only the report profile matching the specification lifecycle
status, and keep `Full CSV-export` always available while limiting
`Anbuds-CSV` to `Upphandling`. `Tillämpningsspårbarhet` must use normalized
filter, locale, and sort state to traverse the complete server-filtered result
in database-authoritative order without browser-side reference enumeration.
Every complete-result traversal must reject duplicate rows, lack of progress,
cursor cycles, and excessive page counts. Field inclusions and exclusions must
stay documented in `docs/reference/reports.md`.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 23: specification reports stay lifecycle-scoped and pinned to selected versions"
```
<!-- markdownlint-enable MD013 -->

### Scenario 24: MCP requirement import keeps token-bound validation execution narrow

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: inferred — docs/integrations/mcp-server-user-guide.md "MCP Requirement Import Flow"]`

**What happened:** MCP import lets an agent validate and later execute a
`Kravimportfil` without resending the full payload. If execution accepted
destination overrides, row patches, or replayed previous receipts, a token leak
or stale reference-data change could create duplicate or misplaced krav. If
validation sessions stored raw tokens, database read access could become import
session takeover.

**Covered code line ranges:** This scenario covers the public MCP import tool
contract, persisted validation-session implementation, and Admin Center caps in
these implementation ranges:

<!-- markdownlint-disable MD013 -->
```text
lib/mcp/server.ts:935-1009
lib/mcp/server.ts:1795-1825
lib/requirements/import-service.ts:201-290
lib/requirements/import-service.ts:1583-1785
lib/requirements/import-service.ts:2100-2553
lib/dal/requirement-import-validation-sessions.ts:1-170
lib/ai/generation-availability.ts:1-79
lib/dal/ai-settings.ts:438-529
app/api/admin/ai-settings/route.ts:26-150
```
<!-- markdownlint-enable MD013 -->

**The requirement:** `requirements_manage_import` must expose
`list_destinations`, `search_destinations`, `validate`, `execute`, and
`inspect_validation`. `validate` must create a persisted SQL-backed validation
session with only a hashed validation token stored. `execute` and
`inspect_validation` must accept only `validationToken`, re-authorize the stored
destination at call time, and reject stale reference data. Execution must
re-check that the stored destination still exists, import only unconsumed rows
without errors, and update the session in the same transaction as requirement
creation. Validation-session diagnostics must log hashes, counts, fingerprints,
and issue codes without raw row text, raw payload JSON, or raw tokens.
Validation responses must use the closed public MCP import issue-code set and
store immutable resolved rows separately from the submitted payload and
execution receipts. Admin Center MCP settings must include request/session
bytes, max import rows, and validation TTL without leaking those fields through
ordinary requirement-generation availability.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 24: MCP requirement import keeps token-bound validation execution narrow"
```
<!-- markdownlint-enable MD013 -->

### Scenario 25: requirements query catalog pages only requirements

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — issue #589 requirements_query_catalog requirement pages]`

**What happened:** `requirements_query_catalog` used to expose both a legacy
unbounded Requirements Library reads and filtered searches in JavaScript.
That could produce oversized responses and a different match contract from
REST. Lookup catalogs remain small, non-paginated reference-data reads.

**Covered code line ranges:** This scenario covers the public MCP schema,
transport text, service implementation, docs, and seeded MCP request fixture in
these implementation ranges:

<!-- markdownlint-disable MD013 -->
```text
lib/mcp/server.ts:96-105
lib/mcp/server.ts:724-827
lib/mcp/server.ts:1557-1590
lib/requirements/service-requirements.ts:87-254
lib/requirements/service-requirements.ts:555-649
docs/integrations/mcp-server-user-guide.md
docs/integrations/mcp-server-contributor-guide.md
tests/fixtures/mcp-requests/seeded-cases.json
```
<!-- markdownlint-enable MD013 -->

**The requirement:** `requirements_query_catalog` requires explicit `catalog`
and `operation` and supports `list` and `search` for every catalog. The
`requirements` branch accepts `cursor` and `limit` from 1 through 100, defaults
to 50, and returns `result` plus forward-only `pagination` without a total.
Requirement search runs in SQL Server over `id`, `uniqueId`,
`version.description`, and `version.acceptanceCriteria`; its `match` contains
`matchedFields` without `quality`. Other catalogs keep `{ "result": [...] }`
and their existing match-quality behavior.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 25: requirements query catalog pages only requirements"
```
<!-- markdownlint-enable MD013 -->

### Scenario 26: norm-reference MCP discovery keeps connected krav IDs separate

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — issue #405 norm-reference MCP connected krav discovery]`

**What happened:** Normbibliotek discovery is used as lookup data before import
validation, while connected krav usage is a separate question. If list/search
responses start carrying connected krav rows, IDs, or counts, agents can treat
usage context as normal lookup state, receive noisy payloads, or accidentally
mix library Krav with kravunderlagslokala krav.

**Covered code line ranges:** This scenario covers the public MCP schema,
transport text, norm-reference service behavior, DAL projection, and docs in
these implementation ranges:

<!-- markdownlint-disable MD013 -->
```text
lib/mcp/server.ts:261-306
lib/mcp/server.ts:950-1044
lib/mcp/server.ts:1760-1795
lib/requirements/service-norm-references.ts:1-299
lib/dal/norm-references.ts:174-198
lib/dal/norm-references.ts:284-305
docs/integrations/mcp-server-user-guide.md
docs/integrations/mcp-server-contributor-guide.md
```
<!-- markdownlint-enable MD013 -->

**The requirement:** `requirements_manage_norm_reference` list/search returns
full canonical Normbibliotek properties in `structuredContent.result` and must
not include connected krav rows, IDs, or counts. Exact `get` and
`list_connected_requirement_ids` operations accept exactly one selector,
numeric `id` or stable `normReferenceId`. The connected-ID operation returns
only `{ id, uniqueId }` for connected library Krav, deduplicated across linked
kravversioner, sorted by `uniqueId`, and excludes kravunderlagslokala krav.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 26: norm-reference MCP discovery keeps connected krav IDs separate"
```
<!-- markdownlint-enable MD013 -->

### Scenario 27: needs-reference MCP management stays specification-scoped

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — issue #403 needs-reference import support]`

**What happened:** Behovsreferenser belong to one kravunderlag. MCP clients
need to list, search, get, and create those references before validating a
kravunderlagsimport, but they must not treat needs references as global
reference data or as part of kravbiblioteksimport.

**Covered code line ranges:** This scenario covers the public MCP schema,
transport text, service behavior, DAL calls, and docs in these implementation
ranges:

<!-- markdownlint-disable MD013 -->
```text
lib/mcp/server.ts
lib/requirements/service-needs-references.ts
lib/dal/requirements-specifications.ts
docs/integrations/mcp-server-user-guide.md
docs/integrations/mcp-server-contributor-guide.md
```
<!-- markdownlint-enable MD013 -->

**The requirement:** `requirements_manage_needs_reference` must require a
numeric `specificationId` for every operation and expose only `list`, `search`,
`get`, and `create`. List/search return specification-scoped
behovsreferenser in `structuredContent.result`; exact get/create return one
row in `structuredContent.needsReference`. Tool descriptions and docs must
state the copy paths from import destination discovery to `specificationId` and
from returned needs-reference IDs to `requirements[].needsReferenceId`.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 27: needs-reference MCP management stays specification-scoped"
```
<!-- markdownlint-enable MD013 -->

### Scenario 28: generated norm-reference IDs remain atomic under concurrent creates

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — issue #529 generated norm-reference ID collision handling]`

**What happened:** A generated norm-reference ID is selected before it is
saved. Concurrent creates can therefore choose the same candidate. A generic
database failure or a non-atomic retry leaves a caller without a durable norm
reference or with untraceable action-log evidence.

**Covered code line ranges:** This scenario covers generated ID allocation,
named-constraint retry, and atomic create-and-Åtgärdslogg behavior. The
[matching Scenario 28 scrutiny area](../../.github/skills/run-spec-audit/references/scrutiny-areas.md#35-scenario-28-generated-norm-reference-ids-remain-atomic-under-concurrent-creates)
tracks the same REST/MCP conflict contract and docs.

<!-- markdownlint-disable MD013 -->
```text
lib/dal/norm-references.ts:343-442
lib/requirements/norm-reference-mutations.ts:30-120
lib/requirements/http-errors.ts:24-34,99-119
lib/mcp/server.ts:334-337,1982-2021
docs/integrations/mcp-server-user-guide.md:181-197
docs/integrations/mcp-server-contributor-guide.md:170-179
```
<!-- markdownlint-enable MD013 -->

**The requirement:** Generated norm-reference creation must allocate the base
ID then deterministic suffixes through `-999`, retrying only the named
norm-reference unique constraint as a complete create-and-Åtgärdslogg
transaction. Explicit duplicates and exhausted generated candidates must return
the documented conflict reasons through REST and MCP without creating an
Åtgärdslogg row.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 28: generated norm-reference IDs remain atomic under concurrent creates"
```
<!-- markdownlint-enable MD013 -->

### Scenario 29: specification item reads stay bounded and cursor-only

<!-- markdownlint-disable-next-line MD013 -->
**Requirement tag:** `[Req: formal — issue #591 shared specification-item pagination]`

**What happened:** The editor preload, REST route, and MCP tool used separate
complete-result reads. Large mixed specifications could therefore bypass page
limits, filter outside SQL Server, or expose transport contracts whose cursors
did not describe the same query.

**Covered code line ranges:** This scenario covers the shared page and cursor
operation, SQL candidate/enrichment boundary, REST and MCP schemas, and the
integration docs:

<!-- markdownlint-disable MD013 -->
```text
lib/requirements/specification-item-page.ts:120-240
lib/requirements/specification-item-page-cursor.ts:1-105
lib/dal/specification-item-page.ts:18-734
app/api/requirements-specifications/[id]/items/route.ts:111-145
lib/mcp/server.ts:2274-2441
docs/integrations/mcp-server-user-guide.md:88-103
docs/integrations/mcp-server-contributor-guide.md:297-315
```
<!-- markdownlint-enable MD013 -->

**The requirement:** Every callable specification-item read accepts only a
1–100 row page (default 50), returns page count and continuation metadata
without an exact total, and binds a canonical opaque cursor to specification,
normalized filters, locale, sort, and direction. SQL combines both item kinds
with `UNION ALL`, keeps the cursor bounded to a stable source identity, resolves
the full ordering boundary inside the candidate query, selects only `limit + 1`
candidates, and enriches only that selected page. REST and MCP map malformed or
mismatched state to `invalid_cursor` and document restart from the first page.

**How to verify:**

<!-- markdownlint-disable MD013 -->
```sh
npm exec -- vitest run tests/quality/functional.test.ts -t "Scenario 29: specification item reads stay bounded and cursor-only"
```
<!-- markdownlint-enable MD013 -->

## AI Session Quality Discipline

1. Read `tests/quality/QUALITY.md` before changing lifecycle, specification, MCP,
   report, or admin-default code.
1. When editing lifecycle or specification logic, run
   `npm exec -- vitest run tests/quality/functional.test.ts` before declaring done.
1. Treat `docs/` as the current spec source. If code disagrees, document
   whether the defect is in code, documentation, or an inferred requirement.
1. Add or update tests for every new lifecycle branch, specification-status
   rule, or outward-facing contract change.
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
