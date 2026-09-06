# Theoretical compatibility analysis prototype

Throwaway planning specimen for
[Define the theoretical cross-client compatibility analysis](https://github.com/viscalyx/Kravhantering/issues/1302).
Status: proposed method, awaiting the user's reaction. This is neither an
installed instruction migration nor the final viability decision.

## Inputs and evidence boundary

Use the immutable
[instruction destination mapping](https://github.com/viscalyx/Kravhantering/blob/d0fa3a814cfc4bff9811691f6c921245ef93d6bd/docs/plans/instruction-destination-mapping/mapping-report.md)
and its linked ledger, scope proposals, consolidation and context inventory.
Apply the later
[policy ambiguity resolution](https://github.com/viscalyx/Kravhantering/issues/1366#issuecomment-5558916169)
to its pending entries. That resolution owns those policy meanings.

Documentation retrieval date: 2026-09-06. Local path cross-check snapshot:
`35bddcf61d6a20cf3abefa009dfcc415434cae2e`.
Record the target client release and effective settings with each assessment;
the installed Codex CLI is 0.153.4, but this specimen makes no claim to have
validated installed behavior on all four clients.

The review concerns agent/chat instruction handling. It does not certify
inline completions, cloud coding agents, every possible workspace layout,
or runtime obedience. Those are not additional supported consumers here.

## Proposed evidence standard

For each policy owner and each consumer, record:

- Intended path and task scope, including exclusions and exceptions.
- Entry point, native selection route and explicit shared read route.
- Required references, with the condition for following each reference.
- Evidence: official documented behavior, repository fact, inference or
  unresolved question. Cite the source beside each external claim.
- Settings and workspace/current-directory assumptions.
- Verdict separately for availability, native selection, applicability,
  authority, single ownership and context accounting.

Use these verdicts:

- Supported: cited mechanisms and repository structure support the claim
  under stated settings; no known mismatch remains for that claim.
- Conditional: an explicit assumption or unresolved mechanism limits the
  claim. Record its affected paths, impact and the evidence needed to settle
  it. This cannot count as an unconditional pass.
- Blocked: a known missing route, conflict, scope mismatch or budget breach
  prevents the claim. Record the required correction.

Evaluate all 40 source files through their ledger destinations and all 38
proposed scoped owners. Do not substitute a few examples for complete owner
accounting. Use representative examples for every distinct scope shape and
add cases for each defect, exception or uncertain parser construct. This
specimen demonstrates the method; it does not certify all final rule bodies,
which have yet to be rewritten.

A body being read does not make every rule inside it applicable. Two reads
of one owner are repeated context consumption; two maintained normative
copies are duplicated policy. Record them separately.

## Four consumer traces

<!-- markdownlint-disable MD013 -->
| Consumer | Native entry and selection | Shared fallback and qualification |
| --- | --- | --- |
| Codex CLI | Root-to-current-directory instruction chain; one selected file per directory. | Root routes require reading selected owners; a root-started task explicitly reads the integration entry when relevant. |
| Codex IDE extension | Assess the thread's working directory and shared Codex configuration, using the discovery baseline from the research decision. | Apply the same explicit routing; an editor selection is not evidence that every descendant instruction was loaded at startup. |
| GitHub Copilot CLI | Root and applicable nested agent instructions, plus matching modular instructions. | Root task routes still cover work before paths are chosen; no reliance on a general file precedence order. |
| GitHub Copilot in VS Code | Root AGENTS.md and matching scoped instructions with their settings enabled. | Explicit integration read remains required with experimental nested discovery disabled; ordinary read directives do not rely on automatic Markdown-link inclusion. |
<!-- markdownlint-enable MD013 -->

Codex documents root-to-current-directory discovery, override selection and
the configurable 32 KiB default project instruction cap. These are startup
mechanisms, not a whole-task context certificate.
[Official Codex discovery documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

The Codex IDE trace also uses the existing
[cross-client discovery research](https://github.com/viscalyx/Kravhantering/issues/1296#issuecomment-5544007499)
as its implementation context pointer. Recheck that source against the target
release if the shared loader or thread working-directory contract changes.

Copilot CLI documents combined instructions without general precedence,
path-specific selection, and deduplication of certain identical automatic
sources. That does not establish deduplication of a later tool read of a
scoped body. Do not use CLI-only immediate imports as shared routing.
[Official Copilot CLI instruction documentation](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)

VS Code documents root instructions and experimental nested discovery.
Its defaults enable root AGENTS.md and matching instructions, disable nested
discovery and automatic referenced-instruction inclusion, and search
`.github/instructions`. Assess the effective values, not just defaults.
[VS Code instruction guide](https://code.visualstudio.com/docs/agent-customization/custom-instructions)
and [settings reference](https://code.visualstudio.com/docs/agents/reference/ai-settings)

Assume the repository root is the VS Code workspace and the Codex project
root is discoverable. Assess a root-started session and one started under
`tests/integration`. A subfolder-only workspace that cannot reach the root,
disabled root instructions, a shadowing override, or an insufficient custom
byte limit is a failed setup precondition. Record user/global/organization
instructions as external inputs; repository ownership cannot eliminate
conflicts introduced there.

## Scope walkthroughs

The outcomes below describe intended reading and application. Native parser
claims require their own evidence on each Copilot consumer.

<!-- markdownlint-disable MD013 -->
| Case | Expected result | What it probes |
| --- | --- | --- |
| Repair JSON punctuation in messages/en.json | Read translations; the visible-label maintenance condition is false. | Exact scope versus a conditional UI obligation. |
| Edit packages/example/package.json | Root package-updates selector does not match solely because the basename matches. | Root exact file versus nested sibling. |
| Add a requirement property before choosing files | Read add-requirement-column; follow its conditional downstream references as persistence/UI/export choices emerge. | Semantic routing without a native path match. |
| Edit tests/integration/requirements/table-resize.spec.ts from root | Explicitly read integration AGENTS.md and applicable scoped owners; nested discovery may remain off. | Retained nested entry, moved spec, required references. |
| Edit app/[locale]/requirements/[id]/requirement-detail-client.tsx | Read detail-pane guidance; literal brackets are directory names. | Two escaped bracket segments. |
| Edit an unrelated client view | Its client-view guidance may apply; the requirement detail-card ordering rule does not. | Excluded application branch. |
| Move a covered form component to a new directory | Check old and new paths, update both affected scope representations and references before the old route disappears. | Path moves and scope re-evaluation. |
| Maintain root AGENTS.md or a scoped instruction file | Both entry paths reach the single authoring procedure; inspect route and native selector together. | Reciprocal maintenance discovery. |
| Edit tests/powershell/example.Tests.ps1 | Read Pester guidance; React/Vitest-only rules do not apply to PowerShell. | Suffix selection and framework conditions. |
| Change CSV actor display versus durable identity matching | Display-name formatting applies to the former; identity matching retains durable keys. | Shared body with explicit exclusions. |
| Inspect composite action YAML versus execute its policy evaluator | Definition assertions fall under the accepted ban; executable evaluator tests remain allowed. | Resolved testing boundary, including mixed files. |
| Add /api/requirements/example beside a localized requirements page | Verify actual handler behavior in supported modes; shared segment alone does not require a rename. | Resolved route policy without inventing framework facts. |
| Change Developer Mode chips versus product touch controls | Apply the owned Developer Mode exception only to the developer surface. | Explicit exception independent of loading order. |
| Change lib/typeorm/sqlserver-config.ts and an MJS migration | Both need the applicable SQL Server/TypeORM rules. | Existing TypeScript coverage must survive MJS expansion. |
<!-- markdownlint-enable MD013 -->

For each case, trace each consumer from entry through owner to required
references. Mark irrelevant rule branches explicitly; do not equate a wide
reading trigger with a wide policy scope. Synthetic examples are intentional
future-path checks, not claims that every example file exists.

## Findings exposed by the specimen

### Known TypeORM path mismatch

The immutable proposal replaces `lib/typeorm/**/*.ts,typeorm/**/*.ts` with
MJS-only equivalents in the SQL Server owner. The current repository contains
`lib/typeorm/sqlserver-config.ts` and TypeScript entity files, and the policy
still covers their configuration and metadata work.

Native path coverage is blocked for those TypeScript paths in the proposal.
The shared task trigger can provide availability, but does not repair the
path mismatch. Preserve the existing TS alternatives while adding MJS in
both the root row and native selector. This is an intent-preserving mapping
correction under the accepted scope-repair decision. Re-measure the root.

### Composite action maintenance trace

The proposed action-security path selector lists workflows and Dependabot,
while its task condition says editing GitHub Actions. That can reach the
security owner for composite action work, but the native path selector does
not include `.github/actions/**/action.yml` or `action.yaml`.

Record this as a scope-alignment finding. The retained action-security owner
also needs its planned pointer to the testing owner, so definition work
reaches the composite-action test boundary before a test file is chosen.
Proposed correction: include the composite action definition paths in both
scope representations and retain that single-owner reference. This changes
availability of existing obligations, not the underlying security policy.

### Native parser uncertainty

VS Code's general glob reference documents brace alternatives, segment-aware
stars and escaping literal brackets with `[[]` and `[]]`. That supports the
intended spelling, but does not by itself prove how each instruction loader
splits comma-separated patterns containing brace alternatives.
[Official VS Code glob reference](https://code.visualstudio.com/docs/editor/glob-patterns)

Keep separate evidence for VS Code and Copilot CLI. Record nested braces,
commas inside versus outside alternatives, literal Next.js brackets and
zero-directory `**` cases. A generic local glob library cannot certify either
client's instruction parser. Until official documentation or versioned
first-party loader evidence settles the exact construct, mark native
selection conditional. Shared prose interpretation remains a distinct
availability argument. Do not claim the selectors are identical at runtime.

### Authority and reference closure

Check every consolidation group against its one owner, especially database
DDL versus metadata, scalar foreign-key exceptions, Developer Mode, PDF,
REST versus MCP, and deterministic scripts versus definition tests. Express
specializations in the rule bodies; do not depend on Copilot file order.

Walk required pointers recursively only when their conditions hold. Record
missing/stale targets, cycles, transitive instruction owners and external
references. Stop repeated expansion at a source already accounted for, while
retaining an encounter count. A link's existence is not evidence of a read.

## Context worksheet

Use UTF-8 source bytes and identify the exact source revision. Keep tokens,
client wrapper overhead and runtime loading unknown unless independently
evidenced. The immutable mapping provides this provisional baseline:

<!-- markdownlint-disable MD013 -->
| Component | Bytes | Assessment |
| --- | ---: | --- |
| Complete proposed root | 13,799 | Below 16,384-byte repository budget. |
| Root plus retained integration entry and separator | 14,898 | Below 24,576-byte repository startup budget. |
| Retired Copilot root contribution | 0 | Final-state assumption; count actual retained content during migration. |
| Current scoped bodies | 88,725 | Baseline only; final rewrites require measurement. |
| Broad property-task selected bodies | 72,321 | Later-read baseline, separate from startup. |
| Broad property-task explicit reference bundle | 625,747 | Whole-file bundle baseline, not proof all bytes are needed simultaneously. |
<!-- markdownlint-enable MD013 -->

For each consumer and bounded task, account separately for startup sources,
Copilot automatic selected bodies, required explicit reads, transitive
references, and known repeated encounters. Use a union for unique source
bytes and a separate count for possible repeated consumption. Do not subtract
assumed deduplication or count unknown material as zero.

Record the mapping's small translation, development HTTP and instruction
maintenance tasks alongside the broad property task. The broad example
requires staged reads or narrower work with every required rule still
available. Its total alone proves neither failure nor whole-task viability.
Final scoped rewrites, reference selection and model context remain inputs
to the later viability decision. Startup budget success cannot replace them.

## Proposed completion criterion and handoff

Accept this ticket when the user agrees that the method and specimen are
sufficient to assess compatibility, including its separate verdicts and
explicit uncertainty handling. Method acceptance is not migration approval.

The eventual assessment must account for every owner on all four consumers,
repair known mismatches, explain every conditional verdict, show required
reference closure and separate context costs. No unconditional compatibility
claim is available while relevant findings remain blocked or conditional.
Do not add an instruction-file test suite or require live-agent trials.

Carry the two concrete scope corrections and fresh measurements into
[Decide instruction migration sequencing and cleanup](https://github.com/viscalyx/Kravhantering/issues/1365).
Carry parser limitations, setup assumptions and whole-task context limits into
[Decide whether full instruction migration is currently viable](https://github.com/viscalyx/Kravhantering/issues/1305).
Those tickets own sequencing and final viability; this specimen supplies the
assessment method and evidence categories.
