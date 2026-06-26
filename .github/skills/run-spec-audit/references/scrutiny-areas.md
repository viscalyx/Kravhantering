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
- **Req tag:** `[Req: formal — docs/integrations/mcp-server-contributor-guide.md
  "requirements_get_requirement"]`
- **Question:** Does any path return draft, review, or archived
  content for `view: "detail"`?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 1: published detail never leaks draft content"`

## 2. Scenario 2: pending replacement blocks archiving

- **Code:** `lib/dal/requirements.ts` — lifecycle transition functions.
- **Spec:** `docs/governance/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/governance/lifecycle-workflow.md
  "Initiate archiving"]`
- **Question:** Does archive initiation fail while replacement draft or
  review work is pending?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 2: pending replacement blocks archiving"`

## 3. Scenario 3: publishing a successor auto-archives its predecessor at the same instant

- **Code:** `lib/dal/requirements.ts` — lifecycle transition functions.
- **Spec:** `docs/governance/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/governance/lifecycle-workflow.md
  "Review -> Published"]`
- **Question:** Does publishing a successor atomically archive the
  predecessor so there is only one published version?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 3: publishing a successor auto-archives its predecessor at the same instant"`

## 4. Scenario 4: review and archived versions are immutable until the state changes

- **Code:** `lib/dal/requirements.ts` — edit guards for review and
  archived versions.
- **Spec:** `docs/governance/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/governance/lifecycle-workflow.md
  "Published -> Draft : New version created"]`
- **Question:** Can review or archived versions be edited in place?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 4: review and archived versions are immutable until the state changes"`

## 5. Scenario 5: archived requirements stay visible while a replacement draft exists

- **Code:** `lib/dal/requirements.ts` — effective-status logic.
- **Spec:** `docs/reference/version-lifecycle-dates.md`.
- **Req tag:** `[Req: formal — docs/reference/version-lifecycle-dates.md
  "Effective Requirement Status"]`
- **Question:** Does effective requirement status preserve archived visibility
  while a replacement draft or review exists?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 5: archived requirements stay visible while a replacement draft exists"`

## 6. Scenario 6: deviated status requires an approved deviation for both library and specification-local items

- **Code:** `lib/dal/requirements-specifications.ts` — specification-local
  requirement and deviation-gated status functions.
- **Spec:** `docs/governance/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/governance/lifecycle-workflow.md
  "Deviation Effect on Usage Status"]`
- **Question:** Do library and specification-local items require an
  approved deviation before entering Deviated status?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 6: deviated status requires an approved deviation for both library and specification-local items"`

## 7. Scenario 7: needs-reference linking never leaks orphan metadata

- **Code:** `lib/dal/requirements-specifications.ts` —
  needs-reference linking, cleanup, and register-management functions.
- **Spec:** `docs/governance/requirements-ui-behaviour.md`.
- **Req tag:** `[Req: inferred — from
  linkRequirementsToSpecificationAtomically() cleanup path]`
- **Question:** Does add-to-specification cleanup remove newly created
  needs-reference rows when no items are added, while intentionally
  pre-registered unused needs references remain allowed?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 7: needs-reference linking never leaks orphan metadata"`

## 8. Scenario 8: suggestion resolution is impossible without review

- **Code:** `lib/dal/improvement-suggestions.ts` — resolution logic.
- **Spec:** `docs/governance/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/governance/lifecycle-workflow.md
  "Improvement Suggestion Lifecycle"]`
- **Question:** Can suggestions be resolved or dismissed without
  review, or edited after a terminal decision?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 8: suggestion resolution is impossible without review"`

## 9. Scenario 9: deviation decisions are write-once audit events

- **Code:** `lib/dal/deviations.ts` — atomic approval/rejection
  mutations, review-requested guards, edit/delete guards.
- **Spec:** `docs/governance/lifecycle-workflow.md` "Deviation Lifecycle".
- **Req tag:** `[Req: formal — docs/governance/lifecycle-workflow.md
  "Deviation Lifecycle"]`
- **Question:** Can approvals or rejections be rewritten, deleted, or
  duplicated after the first decision, including under stale/concurrent
  writes? Can decisions be recorded on deviations that haven't been
  submitted for review? Can deviations be edited or deleted while in
  review-requested state?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 9: deviation decisions are write-once audit events"`

## 10. Scenario 11: stale draft edits are rejected before replacing latest content

- **Code:** `lib/dal/requirements.ts` and
  `lib/requirements/service.ts` — `baseVersionId`/`baseRevisionToken`
  optimistic edit preconditions.
- **Spec:** `docs/governance/lifecycle-workflow.md`.
- **Req tag:** `[Req: formal — docs/governance/lifecycle-workflow.md "Draft"]`
- **Question:** Are stale draft edits rejected before content or joins are
  rewritten?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 11: stale draft edits are rejected before replacing latest content"`

## 11. List View Defensive Parsing

- **Code:** `lib/requirements/list-view.ts`.
- **Spec:** `docs/governance/requirements-ui-behaviour.md` and
  `docs/governance/admin-center.md`.
- **Question:** Do malformed admin defaults, invalid visible-column
  JSON, hidden filters, or bad widths fail safely?

## 12. REST and MCP Output Consistency

- **Code:** `lib/mcp/http.ts`, `lib/mcp/server.ts`,
  `app/api/requirements/[id]/route.ts`,
  `app/api/specifications/[id]/items/[itemId]/route.ts`.
- **Spec:** `docs/integrations/mcp-server-user-guide.md` and
  `docs/integrations/mcp-server-contributor-guide.md`.
- **Field contracts:** `references/integration-contracts.md` — use
  these tables as the expected-field ground truth.
- **Question:** Do REST and MCP outputs, transport rules, and field
  names match the documentation and field contracts?

## 13. CSV Export

- **Code:** `lib/export-csv.ts`, `lib/reports/specification-csv.ts`,
  and `lib/reports/specification-profiles.ts`.
- **Spec:** `docs/reference/reports.md`.
- **Field contracts:** `references/integration-contracts.md` — verify
  exported fields align with the REST response schemas.
- **Question:** Does export behavior match the documented CSV
  expectations for separators and escaping?

## 13a. Scenario 23: specification reports stay lifecycle-scoped and pinned to selected versions

- **Code:** `lib/reports/data/specification-output.ts`,
  `lib/reports/data/specification-traceability.ts`,
  `lib/reports/templates/specification-profile-template.ts`,
  `lib/reports/templates/specification-traceability-template.ts`,
  `lib/reports/specification-csv.ts`, `lib/reports/specification-profiles.ts`,
  and specification report/export routes.
- **Spec:** `docs/reference/reports.md` and `docs/governance/requirements-ui-behaviour.md`.
- **Req tag:** `[Req: formal — docs/reference/reports.md
  "Requirements Specification Field Profiles"]`
- **Question:** Do lifecycle profile reports use linked requirement versions,
  cover the whole specification, expose only lifecycle-matching profiles, keep
  full CSV export always available, and document each field choice? Does
  `Tillämpningsspårbarhet` remain the explicit selected-ref report with 400 for
  invalid refs and 404 for refs outside the requested kravunderlag?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 23: specification reports stay lifecycle-scoped and pinned to selected versions"`

## 13b. Scenario 24: Admin Center AI generation disablement is globally effective

- **Code:** `lib/dal/ai-settings.ts`,
  `app/api/admin/ai-settings/route.ts`,
  `app/api/ai/generate-requirement-import/route.ts`, Admin Center UI, and
  requirements UI.
- **Spec:** `docs/governance/admin-center.md` and
  `docs/governance/reference-data-and-ai.md`.
- **Req tag:** `[Req: formal — docs/governance/admin-center.md "AI"]`
- **Question:** Does the persisted Admin Center preference disable AI
  generation across UI and REST while preserving the environment guard as the
  highest-precedence hard override?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 24: Admin Center AI generation disablement is globally effective"`

## 14. Coverage Target Alignment

- **Source:** `tests/quality/QUALITY.md` — Coverage Targets table.
- **Question:** Do the subsystems and file paths listed in the
  coverage-targets table still match the actual project structure?
  Flag new DAL files, renamed modules, or removed subsystems that
  make the targets stale.

## 15. Scenario 10: MCP tool inventory matches documentation

- **Code:** `lib/mcp/server.ts`.
- **Spec:** `docs/integrations/mcp-server-contributor-guide.md` ("Server Contract",
  `Exposed MCP tools` line) and `docs/integrations/mcp-server-user-guide.md`
  ("What The Server Exposes" tool list).
- **Req tag:** `[Req: formal — docs/integrations/mcp-server-contributor-guide.md
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
- **Spec:** `docs/governance/lifecycle-workflow.md` ("Two-Step Archiving").
- **Req tag:** `[Req: formal — docs/governance/lifecycle-workflow.md
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
- **Spec:** `docs/governance/lifecycle-workflow.md` ("Two-Step Archiving").
- **Req tag:** `[Req: formal — docs/governance/lifecycle-workflow.md
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
- **Spec:** `docs/governance/lifecycle-workflow.md` ("Two-Step Archiving").
- **Req tag:** `[Req: formal — docs/governance/lifecycle-workflow.md
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
- **Spec:** `docs/governance/lifecycle-workflow.md` ("Two-Step Archiving").
- **Req tag:** `[Req: formal — docs/governance/lifecycle-workflow.md
  "Two-Step Archiving"]`
- **Question:** When a newer Draft or Review version exists for the
  same requirement (legacy state), do `approveArchiving` and
  `cancelArchiving` only ever touch the version with
  `archive_initiated_at` set and leave the newer version's status,
  content, and revision token untouched?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 12d: strict-target behavior with manual state manipulation"`

## 20. Scenario 13: specification-local graduation is copy-only into a draft library requirement

- **Code:** `lib/dal/requirements-specifications.ts` —
  `graduateSpecificationLocalRequirementToLibrary`; `lib/requirements/service-specifications.ts`
  graduation authorization and service wrapper.
- **Spec:** issue #96 copy-only graduation workflow and
  `docs/governance/requirements-ui-behaviour.md` specification-local action rail.
- **Req tag:** `[Req: formal — issue #96 copy-only graduation workflow]`
- **Question:** Does graduation copy a specification-local requirement
  regardless of usage status into a new Draft library requirement in the
  selected target area while leaving the source local row, status, note,
  and local deviations unchanged?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 13: specification-local graduation is copy-only into a draft library requirement"`

## 21. Scenario 16: requirement application usage status cannot be cleared once assigned

- **Code:** `components/_requirements-table/SpecificationItemStatusSelect.tsx`,
  `app/api/specifications/[id]/items/[itemId]/route.ts`,
  `lib/dal/requirements-specifications.ts`, and
  `typeorm/migrations/0015_require_specification_item_status.mjs`.
- **Spec:** issue #147 and `docs/governance/lifecycle-workflow.md`
  ("Usage Status").
- **Req tag:** `[Req: formal — issue #147 prevent clearing usage status]`
- **Question:** Do library requirement applications and specification-local
  requirements always keep a real usage status, while explicit null-clearing
  attempts are rejected at the UI, API, DAL, and database boundaries?
- **Verify:** `npm exec -- vitest run
  tests/quality/functional.test.ts -t "Scenario 16: requirement application usage status cannot be cleared once assigned"`

## Maintenance

This file must stay in sync with `tests/quality/QUALITY.md`:

- When a QUALITY.md scenario is added, add a matching scrutiny area
  with its `Req tag` and `Verify` command.
- When a QUALITY.md scenario is removed, remove the corresponding
  scrutiny area.
- When code files are renamed or restructured, update the `Code`
  references here.
- See `tests/quality/AGENTS.md` for the authoritative sync rule.

## 22. AI Generation Contracts

- **Code:** `lib/ai/openrouter-client.ts`,
  `lib/ai/requirement-prompt.ts`, `lib/ai/taxonomy.ts`.
- **Spec:** `docs/governance/reference-data-and-ai.md` §4.
- **Question:** Do timeout values match spec (120 s chat,
  10 s models, 5 s key info)? Does taxonomy validation
  filter/repair correctly (invalid `typeId` → delete, invalid
  optional IDs → `undefined`)? Are locale-dependent prompts
  consistent EN/SV? Does format negotiation attempt
  `json_schema` (when `structured_outputs` is supported)
  and fall back to `json_object`?

## 23. Reference Data Behavioral Contracts

- **Code:** `lib/dal/norm-references.ts`, `lib/dal/owners.ts`,
  `lib/dal/specification-implementation-types.ts`,
  `lib/dal/specification-lifecycle-statuses.ts`,
  `lib/dal/specification-responsibility-areas.ts`.
- **Spec:** `docs/governance/reference-data-and-ai.md` §1–3,
  `docs/reference/database-schema.md`.
- **Question:** Does norm-reference ID derivation follow the
  3-tier strategy? Does collision resolution work? Does
  lifecycle-status validation reject empty strings while other
  taxonomy DALs skip validation? Is ordering consistent
  (`nameSv` for taxonomy, `normReferenceId` for norm
  references, `lastName`/`firstName` for owners)?

## 24. Scenario 15: configurable status and priority icons use an allowlist and stay additive

- **Code:** `lib/icons/status-icon-allowlist.ts`,
  `lib/icons/status-icon-schema.ts`, `lib/icons/status-icon-components.ts`,
  `app/api/requirement-statuses/route.ts`,
  `app/api/catalog/specification-item-statuses/route.ts`,
  `app/api/priority-levels/route.ts`,
  `lib/requirements/service-requirements.ts`.
- **Spec:** `docs/governance/admin-center.md` "Reference Data",
  `docs/reference/database-schema.md`.
- **Req tag:** `[Req: formal — docs/governance/admin-center.md "Reference Data"]`
- **Question:** Are icon names accepted only through the shared allowlist
  generated from the installed Lucide icon catalog? Are `iconName` fields
  additive on REST/MCP/catalog output? Do print/PDF renderers use validated
  Lucide icon components or loaded SVG node data instead of unchecked component
  names? Does the migration add nullable columns without backfilling live rows?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 15: configurable status and priority icons use an allowlist and stay additive"`

## 25. Scenario 17: requirements specification MCP tools enforce identifiers and mutation outcomes

- **Code:** `lib/mcp/server.ts` — requirements specification tool schemas
  and handlers; `lib/requirements/service-specifications.ts` — shared service
  workflow for listing, item lookup, graduation, add, and remove operations.
- **Spec:** `docs/integrations/mcp-server-contributor-guide.md`,
  `docs/integrations/mcp-server-user-guide.md`, and issue #166.
- **Req tag:** `[Req: formal — issue #166 specification MCP tools]`
- **Question:** Do the specification MCP tools reject ambiguous identifiers and
  malformed input before service delegation, pass locale/response format
  through consistently, map service errors to MCP `isError` responses, and
  report real add/remove outcomes without deleting underlying requirements?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 17: requirements specification MCP tools enforce identifiers and mutation outcomes"`

## 26. Scenario 18: HSA-id prefixes stay UI guidance with a visible default rule

- **Code:** `typeorm/migrations/0032_hsa_id_prefixes.mjs`,
  `typeorm/seed.mjs`, `lib/dal/ui-settings.ts`,
  `app/api/admin/hsa-id-prefixes/route.ts`, and
  `components/HsaPersonVerifyField.tsx`.
- **Spec:** `docs/governance/admin-center.md`, `docs/reference/database-schema.md`, and
  `docs/reference/hsa-id.md`.
- **Req tag:** `[Req: formal — docs/governance/admin-center.md "Identity"]`
- **Question:** Do HSA-id-prefixes remain optional UI guidance, with no required
  seed rows, one visible default when visible prefixes exist, delete/change
  protection for used prefixes, audited admin saves, and editable fields that
  still submit complete syntactically valid HSA-id values?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 18: HSA-id prefixes stay UI guidance with a visible default rule"`

## 27. Scenario 19: assignment RBAC denies hidden broad access

- **Code:** `lib/requirements/assignment-authorization.ts`,
  `lib/requirements/service-specifications.ts`,
  `lib/specifications/preload.ts`, `lib/specifications/permissions.ts`, and
  `app/api/specifications/route.ts`.
- **Spec:** `docs/adr/0012-uppdragsbaserad-rbac.md` and
  `docs/governance/behörigheter.md`.
- **Req tag:** `[Req: formal — docs/adr/0012-uppdragsbaserad-rbac.md]`
- **Question:** Do requirement and specification actions resolve the target
  resource before authorization, list only assigned requirements
  specifications for ordinary users, keep Admin/Reviewer broad read
  explicit, return 403 for existing unauthorized resources, and expose
  server-derived permission payloads for UI state without treating the UI as
  the authorization boundary?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 19: assignment RBAC denies hidden broad access"`

## 28. Scenario 20: publishing a successor replaces requirement-package membership

- **Code:** `lib/dal/requirements.ts` — successor publication;
  `lib/dal/requirement-packages.ts` — package current-membership queries.
- **Spec:**
  `docs/adr/0031-kravpaket-ersatter-kravversion-vid-publicering.md`.
- **Req tag:**
  `[Req: formal — docs/adr/0031-kravpaket-ersatter-kravversion-vid-publicering.md]`
- **Question:** Does publishing a successor atomically replace the predecessor
  in requirement-package membership while package lists and counts ignore
  unpublished draft package choices?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 20: publishing a successor replaces requirement-package membership"`

## 29. Scenario 21: archiving without successor preserves package history but excludes practical use

- **Code:** `lib/dal/requirements.ts` — archiving without successor;
  `lib/dal/requirement-packages.ts` — package practical-use queries.
- **Spec:**
  `docs/adr/0031-kravpaket-ersatter-kravversion-vid-publicering.md`.
- **Req tag:**
  `[Req: formal — docs/adr/0031-kravpaket-ersatter-kravversion-vid-publicering.md]`
- **Question:** Does archiving a packaged requirement without a successor keep
  the historical package link while practical package lists and counts exclude
  the archived version?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 21: archiving without successor preserves package history but excludes practical use"`

## 30. Scenario 22: package filters keep archived history out of specifications but available in the library

- **Code:** `lib/dal/requirement-selection-questions.ts` — specification
  package matching; `lib/dal/requirements.ts` — requirement library package
  filtering.
- **Spec:**
  `docs/adr/0031-kravpaket-ersatter-kravversion-vid-publicering.md`.
- **Req tag:**
  `[Req: formal — docs/adr/0031-kravpaket-ersatter-kravversion-vid-publicering.md]`
- **Question:** Do requirement-specification package selections exclude
  archived package links while the requirement library can still show archived
  package-linked requirements when the user includes `Archived` in the status
  filter?
- **Verify:** `npm exec -- vitest run tests/quality/functional.test.ts
  -t "Scenario 22: package filters keep archived history out of specifications but available in the library"`
