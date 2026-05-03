# Scrutiny Areas

Locate functions by grepping for their name. Do not rely on the line
numbers below — they are approximate anchors that shift as code evolves.

This file must stay in sync with `tests/quality/QUALITY.md`
fitness-to-purpose scenarios. See `tests/quality/AGENTS.md` for the
maintenance rule.

## 1. Scenario 1: published detail never leaks draft content

- **Code:** `lib/requirements/service.ts` — detail-read logic.
- **Spec:** Docs say default detail reads expose the latest published
  version only.
- **Req tag:** `[Req: formal — docs/mcp-server-contributor-guide.md
  "requirements_get_requirement"]`
- **Question:** Does any path return draft, review, or archived
  content for `view: "detail"`?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 1: published detail never leaks draft content"`

## 2. Scenario 2: pending replacement blocks archiving

- **Code:** `lib/dal/requirements.ts` — lifecycle transition functions.
- **Spec:** `docs/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md
  "Initiate archiving"]`
- **Question:** Does archive initiation fail while replacement draft or
  review work is pending?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 2: pending replacement blocks archiving"`

## 3. Scenario 3: publishing a successor auto-archives its predecessor at the same instant

- **Code:** `lib/dal/requirements.ts` — lifecycle transition functions.
- **Spec:** `docs/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md
  "Review -> Published"]`
- **Question:** Does publishing a successor atomically archive the
  predecessor so there is only one published version?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 3: publishing a successor auto-archives its predecessor at the same instant"`

## 4. Scenario 4: review and archived versions are immutable until the state changes

- **Code:** `lib/dal/requirements.ts` — edit guards for review and
  archived versions.
- **Spec:** `docs/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md
  "Published -> Draft : New version created"]`
- **Question:** Can review or archived versions be edited in place?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 4: review and archived versions are immutable until the state changes"`

## 5. Scenario 5: archived requirements stay visible while a replacement draft exists

- **Code:** `lib/dal/requirements.ts` — effective-status logic.
- **Spec:** `docs/version-lifecycle-dates.md`.
- **Req tag:** `[Req: formal — docs/version-lifecycle-dates.md
  "Effective Status"]`
- **Question:** Does effective status preserve archived visibility
  while a replacement draft or review exists?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 5: archived requirements stay visible while a replacement draft exists"`

## 6. Scenario 6: deviated status requires an approved deviation for both library and specification-local items

- **Code:** `lib/dal/requirements-specifications.ts` — specification-local
  requirement and deviation-gated status functions.
- **Spec:** `docs/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md
  "Deviation Effect on Specification Item Status"]`
- **Question:** Do library and specification-local items require an
  approved deviation before entering Deviated status?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 6: deviated status requires an approved deviation for both library and specification-local items"`

## 7. Scenario 7: needs-reference linking never leaks orphan metadata

- **Code:** `lib/dal/requirements-specifications.ts` —
  needs-reference linking and cleanup functions.
- **Spec:** `docs/lifecycle-workflow.md`.
- **Req tag:** `[Req: inferred — from
  linkRequirementsToSpecificationAtomically() cleanup path]`
- **Question:** Do needs-reference rows exist only when at least one
  linked specification item still points at them?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 7: needs-reference linking never leaks orphan metadata"`

## 8. Scenario 8: suggestion resolution is impossible without review

- **Code:** `lib/dal/improvement-suggestions.ts` — resolution logic.
- **Spec:** `docs/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md
  "Improvement Suggestion Lifecycle"]`
- **Question:** Can suggestions be resolved or dismissed without
  review, or edited after a terminal decision?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 8: suggestion resolution is impossible without review"`

## 9. Scenario 9: deviation decisions are write-once audit events

- **Code:** `lib/dal/deviations.ts` — approval/rejection logic,
  review-requested guards, edit/delete guards.
- **Spec:** `docs/lifecycle-workflow.md` "Deviation Lifecycle".
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md
  "Deviation Lifecycle"]`
- **Question:** Can approvals or rejections be rewritten, deleted, or
  duplicated after the first decision? Can decisions be recorded on
  deviations that haven't been submitted for review? Can deviations
  be edited or deleted while in review-requested state?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 9: deviation decisions are write-once audit events"`

## 10. Scenario 11: stale draft edits are rejected before replacing latest content

- **Code:** `lib/dal/requirements.ts` and
  `lib/requirements/service.ts` — `baseVersionId`/`baseRevisionToken`
  optimistic edit preconditions.
- **Spec:** `docs/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md "Draft"]`
- **Question:** Are stale draft edits rejected before content or joins are
  rewritten?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 11: stale draft edits are rejected before replacing latest content"`

## 11. List View Defensive Parsing

- **Code:** `lib/requirements/list-view.ts`.
- **Spec:** `docs/requirements-ui-behaviour.md` and
  `docs/admin-center.md`.
- **Question:** Do malformed admin defaults, invalid visible-column
  JSON, hidden filters, or bad widths fail safely?

## 12. REST and MCP Output Consistency

- **Code:** `lib/mcp/http.ts`, `lib/mcp/server.ts`,
  `app/api/requirements/[id]/route.ts`,
  `app/api/specifications/[id]/items/[itemId]/route.ts`.
- **Spec:** `docs/mcp-server-user-guide.md` and
  `docs/mcp-server-contributor-guide.md`.
- **Field contracts:** `references/integration-contracts.md` — use
  these tables as the expected-field ground truth.
- **Question:** Do REST and MCP outputs, transport rules, and field
  names match the documentation and field contracts?

## 13. CSV Export

- **Code:** `lib/export-csv.ts`.
- **Spec:** `docs/reports.md`.
- **Field contracts:** `references/integration-contracts.md` — verify
  exported fields align with the REST response schemas.
- **Question:** Does export behavior match the documented CSV
  expectations for separators and escaping?

## 14. Coverage Target Alignment

- **Source:** `tests/quality/QUALITY.md` — Coverage Targets table.
- **Question:** Do the subsystems and file paths listed in the
  coverage-targets table still match the actual project structure?
  Flag new DAL files, renamed modules, or removed subsystems that
  make the targets stale.

## 15. Scenario 10: MCP tool inventory matches documentation

- **Code:** `lib/mcp/server.ts`.
- **Spec:** `docs/mcp-server-contributor-guide.md` ("Server Contract",
  `Exposed MCP tools` line) and `docs/mcp-server-user-guide.md`
  ("What The Server Exposes" tool list).
- **Req tag:** `[Req: formal — docs/mcp-server-contributor-guide.md
  "Server Contract"]`
- **Question:** Does the number of `server.registerTool()` calls match
  the documented tool count in the contributor guide and the explicit
  tool listing in the user guide?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 10: MCP tool inventory matches documentation"`

## 16. Scenario 12a: concurrent initiateArchiving attempts are atomic and strictly targeted

- **Code:** `lib/dal/requirements.ts` — `initiateArchiving`
  (`SERIALIZABLE` transaction with `UPDLOCK, HOLDLOCK` precondition
  read and conditional `UPDATE` with row-count guard).
- **Spec:** `docs/lifecycle-workflow.md` ("Two-Step Archiving").
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md
  "Two-Step Archiving"]`
- **Question:** Are concurrent `initiateArchiving` calls on the same
  requirement serialized so at most one succeeds and the loser fails
  with a `conflict` error?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 12a: concurrent initiateArchiving attempts are atomic and strictly targeted"`

## 17. Scenario 12b: concurrent approveArchiving attempts are atomic and strictly targeted

- **Code:** `lib/dal/requirements.ts` — `approveArchiving`
  (`SERIALIZABLE` transaction with `UPDLOCK, HOLDLOCK` precondition
  read, conditional `UPDATE` with row-count guard, strict-target
  filter on `archive_initiated_at IS NOT NULL`).
- **Spec:** `docs/lifecycle-workflow.md` ("Two-Step Archiving").
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md
  "Two-Step Archiving"]`
- **Question:** Are concurrent `approveArchiving` calls on the same
  requirement serialized, and does the archived flag plus
  `archivedAt` end up set exactly once on the formerly-published
  version?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 12b: concurrent approveArchiving attempts are atomic and strictly targeted"`

## 18. Scenario 12c: concurrent approveArchiving vs cancelArchiving are atomic and strictly targeted

- **Code:** `lib/dal/requirements.ts` — `approveArchiving`,
  `cancelArchiving` (shared serialization guards, conditional
  `UPDATE` with row-count guard).
- **Spec:** `docs/lifecycle-workflow.md` ("Two-Step Archiving").
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md
  "Two-Step Archiving"]`
- **Question:** When approve and cancel race for the same
  requirement, does exactly one win, the other fail with `conflict`,
  and `archive_initiated_at` end up cleared on the targeted version?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 12c: concurrent approveArchiving vs cancelArchiving are atomic and strictly targeted"`

## 19. Scenario 12d: strict-target behavior with manual state manipulation

- **Code:** `lib/dal/requirements.ts` — `approveArchiving`,
  `cancelArchiving` (strict-target filter on
  `archive_initiated_at IS NOT NULL`).
- **Spec:** `docs/lifecycle-workflow.md` ("Two-Step Archiving").
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md
  "Two-Step Archiving"]`
- **Question:** When a newer Draft or Review version exists for the
  same requirement (legacy state), do `approveArchiving` and
  `cancelArchiving` only ever touch the version with
  `archive_initiated_at` set and leave the newer version's status,
  content, and revision token untouched?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 12d: strict-target behavior with manual state manipulation"`

## Maintenance

This file must stay in sync with `tests/quality/QUALITY.md`:

- When a QUALITY.md scenario is added, add a matching scrutiny area
  with its `Req tag` and `Verify` command.
- When a QUALITY.md scenario is removed, remove the corresponding
  scrutiny area.
- When code files are renamed or restructured, update the `Code`
  references here.
- See `tests/quality/AGENTS.md` for the authoritative sync rule.

## 20. Reference Data Behavioral Contracts

- **Code:** `lib/dal/norm-references.ts`, `lib/dal/owners.ts`,
  `lib/dal/specification-implementation-types.ts`,
  `lib/dal/specification-lifecycle-statuses.ts`,
  `lib/dal/specification-responsibility-areas.ts`.
- **Spec:** `docs/reference-data-and-ai.md` §1–3,
  `docs/database-schema.md`.
- **Question:** Does norm-reference ID derivation follow the
  3-tier strategy? Does collision resolution work? Does
  lifecycle-status validation reject empty strings while other
  taxonomy DALs skip validation? Is ordering consistent
  (`nameSv` for taxonomy, `normReferenceId` for norm
  references, `lastName`/`firstName` for owners)?

## 21. AI Generation Contracts

- **Code:** `lib/ai/openrouter-client.ts`,
  `lib/ai/requirement-prompt.ts`, `lib/ai/taxonomy.ts`.
- **Spec:** `docs/reference-data-and-ai.md` §4.
- **Question:** Do timeout values match spec (120 s chat,
  10 s models, 5 s key info)? Does taxonomy validation
  filter/repair correctly (invalid `typeId` → delete, invalid
  optional IDs → `undefined`)? Are locale-dependent prompts
  consistent EN/SV? Does format negotiation attempt
  `json_schema` (when `structured_outputs` is supported)
  and fall back to `json_object`?
