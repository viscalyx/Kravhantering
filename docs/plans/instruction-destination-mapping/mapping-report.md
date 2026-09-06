# Instruction destination mapping

Planning artifact for
[Map every current instruction to its destination](https://github.com/viscalyx/Kravhantering/issues/1304)
.
Snapshot: `8339cd5b4b6799de90f578946362e3d34736a6b6` , 2026-09-06. Active
instructions and tests are not edited.
The issue resolution owns the answer; this artifact supplies its inventory.

Read the [consolidation rules](authority-consolidation.md) with the ledger
to identify the single owner of repeated meanings. The
[cleanup inventory](cleanup-inventory.md) identifies affected assertions,
references and installed assets. [Context accounting](context-accounting.md)
separates startup wording from later body and reference reads.

## Coverage and interpretation

All 40 source files are included: 37 scoped files, both root entries and the
integration entry. The [policy ledger](policy-ledger.md) accounts for 749
source blocks, including compound conditions and examples. Its rows provide
source line ranges, one authoritative destination, disposition and rationale.
This is a complete source accounting, not a claim that every existing policy
is already ideal or that client behavior has been proved.

All retained policies target Codex CLI, Codex IDE extension, GitHub Copilot
CLI and GitHub Copilot in VS Code. No per-consumer policy forks are proposed.
The shared route supplies semantic triggers; native selectors can supply the
same body on path matches. Reading and applicability remain distinct.

Keep the 37 existing scoped owners and add `dev-http.instructions.md` for
the authenticated-development-request branch. Retain root `AGENTS.md` and
`tests/integration/AGENTS.md`. Retire the Copilot root after mapping its
common, database, Developer Mode, HTTP and dialog branches. Keep dialog API
details together under UI Dialogs in `ui-ux.instructions.md`.

The [scope mapping](scope-mapping.json) records complete selector proposals,
explicit OR task triggers, consumers and review notes. The measured
[root proposal](root-instructions-proposal.txt) contains common guidance and
the complete inline index. It is inert planning text, not installed guidance.
The [maintenance addition](maintenance-addition-proposal.txt) goes only in
the authoring guide; [development HTTP wording](dev-http-policy-proposal.txt)
illustrates the new conditional owner.

## Review by authoritative file

### add-requirement-column.instructions.md

Keep registry/data wiring/admin defaults/field-specific verification. Delegate
locked columns and sort constraints to requirements-table; schema/seed
verification to database-schema; localization to translations/UI. Repair
hydration and admin entrypoint paths. Keep the task trigger before paths exist.

### admin-center.instructions.md

Keep server authorization, authorized-tab fallback, activation-only fetches,
shell/panel separation, client-secret boundary and focused panel contracts.
Complementary auth and UI routes remain applicable.

### ai-instruction-authoring.instructions.md

Keep concise AI directives, single owner, narrow string applyTo,
headings/bullets/code style. Remove obsolete Copilot-root exception/reference.
Preserve prospective prompt coverage; no prompt directory currently exists. Add
the accepted reciprocal maintenance procedure and retained AGENTS coverage.

### api-contract.instructions.md

Keep REST/Schemathesis inclusion decision, bounded disposable-target contract,
auth/CSRF/errors/schema synchronization, focused tests and available-stack
verification. REST registry authority stays in route-security-policy; MCP stays
separate.

### auth-docs.instructions.md

Keep each documentation destination with its distinct trigger, Mermaid alignment
and provider-generic wording. These are specialized obligations under the common
documentation rule.

### auth-security.instructions.md

Keep browser apiFetch/header handling, identity stripping, shared CSRF helper
and auth test scenarios. Delegate REST policy and MCP exclusion to
route-security-policy; retain browser-versus-bearer qualification.

### components.instructions.md

Keep component structure/client islands, conditional client/server translations,
reduced motion, images/PDF exception, async controls and high-frequency
interactions. Consolidate general loading/animation rules in ui-ux; keep
component-specific mechanics and reduced-motion helper here.

### database-schema.instructions.md

Keep naming, snapshots, removal cleanup, sync surfaces, JSON Schema, erasure,
docs, migration/seed flow and lifecycle-date semantics. Clarify metadata versus
DDL authority; replace decorator naming examples with EntitySchema
uniques/indices. Own scalar-FK exceptions. Consolidate repeated
released-migration, canonical-doc and cleanup statements within their sections.

### database-writes.instructions.md

Keep wrapper-level atomic ownership, transactional safety, deterministic-cleanup
exception, assignment boundaries and focused rollback/ownership tests. Reference
this owner from TypeORM transaction guidance; TypeORM manager/QueryRunner
specifics remain there.

### detail-pane-layout.instructions.md

Keep fixed card order, no sidebar within the card, area ownership and
non-editable form owner. Consolidate repeated card/order statements. Extend
selection to shared cards and form fields; do not interpret the card rule as
banning surrounding page action rails.

### developer-mode.instructions.md

Own English developer labels and the desktop/compact/accessibility exception
transferred from Copilot root and ui-ux. Keep marker updates, code-owned exact
coverage, documentation trigger and production noops. Keep external rationale
pointer conditional on runtime-wiring work.

### github-actions-security.instructions.md

Keep external action SHA/tag resolution, credential exception and Dependabot
ecosystem. Retire all instructions requiring or permitting workflow unit
assertions; reference tests for the shared testing boundary.

### help-panel.instructions.md

Keep module-scope typed constants, view add/change/remove lifecycle, text/visual
schema and translation-driven visuals. Collapse repeated placement rules and
paired-language examples into the translations pointer; preserve relative help
namespace.

### information-assets-retention.instructions.md

Keep asset classification, retention decision, documented exceptions, app
policy/fixtures/tests and privacy-versus-retention separation. No policy
retirement; branch on new assets before schema paths exist.

### lychee-toolchain.instructions.md

Keep coordinated versions and both architecture hashes, maintained drift lane
and relational executable-detector tests. Delegate action pinning to
github-actions-security; retire workflow/version-alignment unit-test
requirement.

### manual-test-playwright.instructions.md

Keep all manual/spec lockstep, functional-versus-geometry scope, explicit
maintenance authorization, chunk generation, role phases/storage and isolated
fixture equivalence. Do not silently relax spec maintenance restrictions.

### markdown.instructions.md

Keep Markdown style and lint conventions, 80-column prose, intact code/URLs,
allowed MD013 exceptions and consistent table style. Scope stays
documentation-shaped, not a new all-Markdown policy.

### mcp-tool-contract.instructions.md

Keep client-visible descriptions/schemas/prerequisites, both guide inventories
and MCP tests. Delegate shared service boundary to its owner, without turning
documentation into the callable contract.

### next-runtime.instructions.md

Keep Node server runtime, wrapper access, platform independence, explicit
connection contract/prodlike flow and header-surface synchronization.
Categorical Turbopack second-segment exclusion is unresolved: existing REST
authoring docs and routes use requirements/[id]. Record a separate decision;
preserve current wording pending it.

### node-version.instructions.md

Keep coordinated Node major, discovery of all pins, verification and documented
exceptions. Use rg and current .nvmrc/package/container/CI inputs; retire the
absent generated bundled/NODE_VERSION example. Do not freeze the example major
as a permanent policy or rewrite digest pinning.

### operator-upgrade-notes.instructions.md

Keep automation ownership, explicit correction-only scope and preservation of
markers/history. No broad deployment editing rule is added.

### package-updates.instructions.md

Keep intentional specifiers, override review, peer compatibility, Biome
schema/type-major alignment, browser installation and check/audit commands. Read
current package metadata for versions; preserve existing user authorization
rules.

### pester.instructions.md

Keep all safety, syntax, scope, mocking, naming, folder, data-driven,
opt-in/container and CI rules. Only remove singleton braces; CI permissions and
result publication are execution requirements, not instructions to unit-test
YAML.

### privacy-display-name.instructions.md

Keep localized sentinel-safe public names, durable-key/internal-log exclusion,
enforcement-test protection and positive anonymous rendering cases. Cover CSV
API producers explicitly; do not extend formatting into erasure identity
matching.

### reports.instructions.md

Keep template/renderer ownership, server PDF/CSP, section/type/engine lifecycle,
archiving review differences, locale-safe links and specialized docs. Preserve
PDF image/rendering exception; locale key synchronization delegates to
translations.

### requirement-lifecycle-policy.instructions.md

Keep incremental pure decisions, status constants, DAL lock/transaction
ownership, no duplicate precondition reads, route transport ownership and
focused tests. No unrelated extraction project is authorized.

### requirement-service-boundary.instructions.md

Keep all enumerated overlaps and direct-DAL/streaming exceptions. Own
HTTP-versus-service responsibility for shared workflows; REST wrapper specifics
remain in secure-mutation-routes.

### requirements-table.instructions.md

Keep custom-table choice, locked columns, default baseline, one sort, hide
resets, width versioning, live resize/commit/cancel semantics and rendered-width
verification. Describe baseline visibility as registry/seed defaults, retaining
admin overrides. Replace moved spec and absent Markdown companion with current
manual-case source.

### route-security-policy.instructions.md

Keep registry fields/completeness, REST/MCP split, cache safeguards, auth-CSRF
order, derived methods, unknown-operation fallback, wrappers and OpenAPI
declarations. Other transport guides point here for authority.

### scripts.instructions.md

Keep changed deterministic code at 85% across four metrics, pure-function
extraction, mixed-script handling and orchestration exclusion. Delegate database
schema/seed facts to database-schema; keep script execution logic tests
permitted.

### secure-mutation-routes.instructions.md

Keep wrapper-only REST exports, required bounded policies, no pre-auth work,
validation/context shape, audit specialization and focused wrapper/route tests.
Reference service boundary for shared workflow transport separation.

### tests.instructions.md

Keep current-behavior/security-negative assertions, behavioral testing,
framework-specific mocks/act, viewport, coverage, DAL and SQL testing.
Explicitly prohibit workflow/skill-definition unit tests and automated
AI-instruction tests. Keep script and application tests, including actual
import-instruction API behavior.

### translations.instructions.md

Keep paired locales, nested keys, JSON validity and interpolation. Remove absent
page-specific cookies/privacy/terms file cache; those pages currently use
messages/en.json and messages/sv.json.

### typeorm-entities.instructions.md

Keep EntitySchema file/type/registration/column/relation/index/localized
metadata mechanics. Reference database-schema for DDL ownership, naming and
scalar FK exceptions. Describe metadata test as naming/table-presence evidence,
not full final-schema drift proof.

### typeorm-sqlserver.instructions.md

Keep Data Mapper/query hierarchy, pooling, transaction manager/QueryRunner
mechanics, SQL performance/procedure/security choices, read-only browsing and
specialized checks/docs. Delegate schema authority and logical mutation
ownership; repair absent script, shallow docs and MJS coverage.

### ui-ux.instructions.md

Keep responsive, target-size exceptions/evidence, dark mode, accessibility,
status contrast, form help, discoverability, interaction/view state, feedback
and UI integration coverage. Own product dialogs transferred from Copilot root.
Reference Developer Mode for its exception; components owns reduced-motion
mechanics. Replace generic direct Playwright invocation with current repository
runner pointer.

### utilities.instructions.md

Keep naming/export/types, utility-local test placement, HTML sanitization and
dynamic-import path validation. Explicitly preserve area-specific test
locations; retain current library-TS scope and conditions.

## Scope repairs and authority

- Correct literal Next.js brackets; remove singleton Pester braces.
- Replace resize/hydration/admin spec paths with current area folders.
- Replace the absent resize Markdown companion with the manual-case source;
  preserve the functional-versus-geometry boundary, not a new companion file.
- Cover shared detail cards/forms, CSV API producers, Developer Mode runtime
  wiring, retained AGENTS files, documented Node pins and MJS persistence.
- Keep semantic triggers before file selection: requirement properties,
  information assets, visible UI, MCP callable behavior and instruction moves.
- Native glob spelling remains a proposal for the compatibility ticket.
  A local match is not evidence of a client's native parser contract.
- Root routes name every owner. Further reference pointers preserve schema,
  transport, manual-case, Developer Mode and service authorities. A common
  verification rule and a named area-specific test requirement are distinct;
  keep the specialization, reference the common rule instead of restating it.
- Keep separate product/PDF rendering, Developer Mode, MCP/REST, direct-DAL,
  deterministic-script/orchestration and framework branches. Do not resolve
  exceptions through file-loading order.

## Evidence for substantive changes

- `lib/typeorm/entities/` uses EntitySchema; the schema guide already states
  the primary/unique/lookup scalar-FK exceptions. The metadata test checks
  naming and table establishment in migration source, not replayed final DDL.
- `lib/requirements/list-view.ts` supplies seeded default column visibility
  and supports administered overrides. Clarify baseline versus runtime state.
- Current integration files are `requirements/table-resize.spec.ts`,
  `requirements/table-hydration.spec.ts` and `admin/entrypoint.spec.ts`.
- `components/RequirementDetailCard.tsx`, `RequirementDetailSections.tsx`,
  `RequirementForm.tsx` and `RequirementFormFields.tsx` are current shared
  surfaces omitted by the original detail-only selector.
- Current message files are `messages/en.json` and `messages/sv.json`.
  There are no tracked page-specific locale JSON files under messages.
- Current database admin is `scripts/db-sqlserver-admin.mjs`; persistence
  scripts are MJS and the workflow guide is under `docs/development/`.
- Node versions are observable in `.nvmrc`, manifests, Dockerfiles, bootstrap
  and CI. No tracked `bundled/NODE_VERSION` source is found. Keep discovery
  of future locations as a task rule; retire only the stale concrete example.
- Accepted decisions explicitly retire workflow/skill-definition unit tests
  and AI-instruction automated tests while preserving executable-code tests.

## Decisions still needed

Two precise questions need follow-up decisions, without changing their
policy intent silently:

The child ticket
[Resolve remaining policy ambiguities in the instruction mapping](https://github.com/viscalyx/Kravhantering/issues/1366)
owns this live decision exchange and blocks compatibility and cleanup
sequencing.

1. Does the workflow-file test ban also cover composite `action.yml`
   assertions? One mixed workflow test inspects both workflow orchestration
   and the composite vulnerability gate. Removing the workflow assertions is
   settled; the composite-only assertions need an explicit boundary.
2. What replaces the categorical Turbopack second-segment exclusion? Existing
   `app/api/requirements/[id]/route.ts` and the REST authoring guide use a
   shape the broad wording appears to reject. Preserve route-conflict
   verification intent; do not infer a framework fix or authorize route moves.

The common/root wording is fully measurable now. These questions affect
scoped wording or cleanup classification, and must resolve before final
compatibility/viability acceptance. This inventory is not that acceptance.
