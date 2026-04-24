# Scrutiny Areas

Locate functions by grepping for their name. Do not rely on the line
numbers below — they are approximate anchors that shift as code evolves.

This file must stay in sync with `tests/quality/QUALITY.md`
fitness-to-purpose scenarios. See `tests/quality/AGENTS.md` for the
maintenance rule.

## 1. Detail-Read Version Exposure — Scenario 1

- **Code:** `lib/requirements/service.ts` — detail-read logic.
- **Spec:** Docs say default detail reads expose the latest published
  version only.
- **Req tag:** `[Req: formal — docs/mcp-server-contributor-guide.md
  "requirements_get_requirement"]`
- **Question:** Does any path return draft, review, or archived
  content for `view: "detail"`?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 1"`

## 2. Lifecycle Transitions — Scenario 2, 3

- **Code:** `lib/dal/requirements.ts` — lifecycle transition functions.
- **Spec:** `docs/lifecycle-workflow.md`.
- **Req tag (S2):** `[Req: formal — docs/lifecycle-workflow.md
  "Initiate archiving"]`
- **Req tag (S3):** `[Req: formal — docs/lifecycle-workflow.md
  "Review -> Published"]`
- **Question:** Are all lifecycle transitions valid, especially archive
  initiation, archive approval, archive cancel, restore, and
  publish-time auto-archiving?
- **Verify (S2):** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 2"`
- **Verify (S3):** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 3"`

## 3. Effective Status and Archived Visibility — Scenario 5

- **Code:** `lib/dal/requirements.ts` — effective-status logic.
- **Spec:** `docs/version-lifecycle-dates.md`.
- **Req tag:** `[Req: formal — docs/version-lifecycle-dates.md
  "Effective Status"]`
- **Question:** Does effective status preserve archived visibility
  while a replacement draft or review exists?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 5"`

## 4. Version Immutability — Scenario 4

- **Code:** `lib/dal/requirements.ts` — edit guards for review and
  archived versions.
- **Spec:** `docs/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md
  "Published -> Draft : New version created"]`
- **Question:** Can review or archived versions be edited in place?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 4"`

## 5. Draft Edit Concurrency — Scenario 11

- **Code:** `lib/dal/requirements.ts` and
  `lib/requirements/service.ts` — optimistic edit preconditions.
- **Spec:** `docs/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md "Draft"]`
- **Question:** Are stale draft edits rejected before content or joins are
  rewritten?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 11"`

## 6. Package-Local Requirements and Deviations — Scenario 6, 7

- **Code:** `lib/dal/requirement-packages.ts` — package-local
  requirement, needs-reference, and deviation-gated status functions.
- **Spec:** `docs/lifecycle-workflow.md`.
- **Req tag (S6):** `[Req: formal — docs/lifecycle-workflow.md
  "Deviation Effect on Package Item Status"]`
- **Req tag (S7):** `[Req: inferred — from
  linkRequirementsToPackageAtomically() cleanup path]`
- **Question:** Do package-local requirements, needs references, and
  deviation-gated statuses behave exactly as the docs imply?
- **Verify (S6):** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 6"`
- **Verify (S7):** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 7"`

## 7. Deviation Lifecycle Guards and Decision Immutability — Scenario 9

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
  -t "Scenario 9"`

## 8. Suggestion Terminal State — Scenario 8

- **Code:** `lib/dal/improvement-suggestions.ts` — resolution logic.
- **Spec:** `docs/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/lifecycle-workflow.md
  "Improvement Suggestion Lifecycle"]`
- **Question:** Can suggestions be resolved or dismissed without
  review, or edited after a terminal decision?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 8"`

## 9. List View Defensive Parsing

- **Code:** `lib/requirements/list-view.ts`.
- **Spec:** `docs/requirements-ui-behaviour.md` and
  `docs/admin-center.md`.
- **Question:** Do malformed admin defaults, invalid visible-column
  JSON, hidden filters, or bad widths fail safely?

## 10. REST and MCP Output Consistency

- **Code:** `lib/mcp/http.ts`, `lib/mcp/server.ts`,
  `app/api/requirements/[id]/route.ts`,
  `app/api/requirement-packages/[id]/items/[itemId]/route.ts`.
- **Spec:** `docs/mcp-server-user-guide.md` and
  `docs/mcp-server-contributor-guide.md`.
- **Field contracts:** `references/integration-contracts.md` — use
  these tables as the expected-field ground truth.
- **Question:** Do REST and MCP outputs, transport rules, and field
  names match the documentation and field contracts?

## 11. CSV Export

- **Code:** `lib/export-csv.ts`.
- **Spec:** `docs/reports.md`.
- **Field contracts:** `references/integration-contracts.md` — verify
  exported fields align with the REST response schemas.
- **Question:** Does export behavior match the documented CSV
  expectations for separators and escaping?

## 12. Coverage Target Alignment

- **Source:** `tests/quality/QUALITY.md` — Coverage Targets table.
- **Question:** Do the subsystems and file paths listed in the
  coverage-targets table still match the actual project structure?
  Flag new DAL files, renamed modules, or removed subsystems that
  make the targets stale.

## 13. MCP Tool Inventory Parity — Scenario 10

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
  tests/quality/functional.test.ts -t "Scenario 10"`

## Maintenance

This file must stay in sync with `tests/quality/QUALITY.md`:

- When a QUALITY.md scenario is added, add a matching scrutiny area
  with its `Req tag` and `Verify` command.
- When a QUALITY.md scenario is removed, remove the corresponding
  scrutiny area.
- When code files are renamed or restructured, update the `Code`
  references here.
- See `tests/quality/AGENTS.md` for the authoritative sync rule.

## 14. Reference Data Behavioral Contracts

- **Code:** `lib/dal/norm-references.ts`, `lib/dal/owners.ts`,
  `lib/dal/package-implementation-types.ts`,
  `lib/dal/package-lifecycle-statuses.ts`,
  `lib/dal/package-responsibility-areas.ts`.
- **Spec:** `docs/reference-data-and-ai.md` §1–3,
  `docs/database-schema.md`.
- **Question:** Does norm-reference ID derivation follow the
  3-tier strategy? Does collision resolution work? Does
  lifecycle-status validation reject empty strings while other
  taxonomy DALs skip validation? Is ordering consistent
  (`nameSv` for taxonomy, `normReferenceId` for norm
  references, `lastName`/`firstName` for owners)?

## 15. AI Generation Contracts

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
