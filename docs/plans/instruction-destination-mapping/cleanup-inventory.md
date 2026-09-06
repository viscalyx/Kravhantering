# Migration cleanup inventory

This is a planning inventory at commit
`8339cd5b4b6799de90f578946362e3d34736a6b6`. Remove or change the listed
assertions during implementation, preserving unrelated tests. Source line
numbers refer to this snapshot and must be refreshed when implementing.

## Workflow and related assertions

<!-- markdownlint-disable MD013 -->
| File and location | Disposition | Retained subject or qualification |
| --- | --- | --- |
| `tests/unit/github-actions-workflow-security.test.ts`: tests starting at 83, 102, 132, 146, 173, 209, 301, 333, 343, 547, 586, 608, 666, 692 | Remove these 14 tests of workflow YAML, including the coordinated Lychee version assertion. | Underlying action pinning, tool coordination and execution requirements remain valid. |
| Same file: `gates PR and release candidates with the same vulnerability policy`, starting at 418 | Remove workflow assertions. Composite-action-only assertions remain a decision item. | It also reads `.github/actions/container-vulnerability-gate/action.yml`; the prior decision names workflow files and does not explicitly classify composite action definitions. |
| Same file: `keeps localhost-only ZAP warnings non-blocking`, starting at 288 | Preserve; relocate to a focused ZAP configuration test if retiring the workflow-security filename. | Reads `.github/zap/rules.*.tsv`, not workflows, skills or instructions. Do not delete merely because of the filename. |
| `tests/unit/container-image-contract.test.ts`: `excludes developer credentials and SSH state from production build contexts`, starting at 317 | Remove the workflow-derived entries at 366–367 and assertions on those entries. Remove the `workflowRunCommands` helper at 63 when no longer used. | Preserve Docker ignore/build arguments and `package.json` command checks; re-evaluate the non-empty assertion against the remaining command set. |
| Same file: `exports HSA topology candidates as archives Docker can load`, starting at 403 | Remove the complete test. | All assertions inspect `container-pr-smoke.yml`. |
| `tests/unit/dev-env-contract.test.ts`: `keeps every Kong test-support tag aligned with its canonical lock`, starting at 123 | Remove `.github/workflows/container-release.yml` from the asserted path set. | Preserve Compose, Quadlet and release-environment checks. |
| `tests/unit/hsa-support-ci-contract.test.ts`: `runs the canonical HSA support command for pull requests and main`, starting at 81 | Remove the complete workflow test and unused workflow reader/types/YAML dependency imports. | Preserve `uses one local command for all nested HSA support packages`, which checks package command composition. |
| `scripts/__tests__/dependency-drift.test.mjs` | Preserve executable detector/issue-rendering tests. Remove retired test filename from the Lychee fixture contract at 98. | Imports executable `dependency-drift.mjs`; creates temporary workflow-shaped input and asserts detector output/errors. It does not assert committed workflow correctness. |
| `scripts/__tests__/dependency-maintenance.test.mjs` | Preserve discovery/validation behavior tests, including workflow-shaped fixtures at 821 and 841. Update copied registry fixtures when cleanup changes their paths. | The subject is executable discovery/validation logic. A temporary workflow input does not turn it into a unit test of committed workflow configuration. |
| `scripts/__tests__/deployment-provenance.test.mjs` | Preserve. | Workflow path strings identify an expected attestation signer; assertions test provenance logic and command output. |
| `tests/unit/azure-dev-codex-config.test.ts` | Preserve. | System skill paths are configuration identities and fixture data; assertions exercise merge behavior, including preservation of unmanaged skills. No skill definition is read. |
| `tests/unit/container-image-contract.test.ts`: system-skill/config checks | Preserve under the agreed subject boundary. | Checks user configuration and container setup, not contents of a `SKILL.md`. |
| `tests/unit/privacy-display-name-enforcement.test.ts` | Preserve. | A workflow mention is a comment; the subject is current application privacy rendering. |
| Requirement import instruction route/service/schema tests | Preserve. | They test the application's user-facing import-instruction API, not repository AI instruction files. |
<!-- markdownlint-enable MD013 -->

The search includes literal paths and constructed `.github`, `workflows`,
`actions`, `skills` paths; inspected positive leads distinguish YAML reads
from executable modules and data fixtures. No automated test reading the
repository AI instruction bodies or skill definitions is identified in this
snapshot. This is static inventory evidence, not a proof that every possible
indirect access is absent. Re-run the inventory against the migration base.

Formatting/linting are retained. No instruction-file test suite, workflow
unit-test replacement or live-agent behavior test is proposed.

## References coupled to test cleanup

<!-- markdownlint-disable MD013 -->
| Source | Required migration change |
| --- | --- |
| `.github/instructions/github-actions-security.instructions.md` | Remove the obsolete test selector and both test requirements; retain SHA/tag and credential/Dependabot policy. |
| `.github/instructions/lychee-toolchain.instructions.md` | Remove the workflow-security test selector and version-alignment test requirement; retain detector behavior tests. |
| `.github/instructions/tests.instructions.md` | State the accepted explicit test-subject boundary; preserve unrelated behavioral coverage and intentional specializations. |
| `.github/dependency-maintenance.json`: Lychee unit paths | Remove the retired workflow-security test path; retain installer, workflow input and detector contract. |
| `.github/workflows/dependency-drift.mjs`: Lychee synchronized paths | Remove the retired test filename from rendered issue instructions; retain executable detector logic and tests. |
| `scripts/__tests__/dependency-drift.test.mjs`: Lychee unit fixture | Keep the fixture consistent with the retained source inventory. |
| `scripts/azure-dev/templates/bootstrap-host.sh`: Lychee checksum comment | Replace the obsolete claim that the workflow-security test enforces alignment with current source-ownership guidance. |
| `.github/skills/manage-container-vulnerability-exceptions/SKILL.md`: validation commands | Remove the workflow-security test command; retain relevant vulnerability evaluator/script tests. Refresh installed copies through the existing skill-distribution process where applicable. |
<!-- markdownlint-enable MD013 -->

## Instruction retirement and signposting

<!-- markdownlint-disable MD013 -->
| Source or target | Required migration change |
| --- | --- |
| `.github/copilot-instructions.md` | Remove after every common/conditional policy has its mapped owner. No empty stub. |
| Root `AGENTS.md` | Replace blanket Copilot-root/folder pointers with measured common guidance and the complete inline index. |
| `.github/instructions/ai-instruction-authoring.instructions.md` | Remove retired-root selector/reference, cover both retained AGENTS entries, and add the single maintenance procedure. Preserve prospective prompt scope unless separately changed. |
| `CONTRIBUTING.md`: specialized instructions paragraph | Explain shared root routing, retained scoped owners, integration entry and maintenance ownership in existing contributor guidance. |
| `docs/development/utvecklarguide.md`: Agentic engineering | Remove retired Copilot-root example and explain the shared instruction locations. |
| `.github/skills/sync-ai-instructions/SKILL.md`, `scripts/sync_ai_instructions.sh`, `agents/openai.yaml` within that skill | Retire the complete instruction-copy skill. No replacement content copier. |
| `.agent/skills/sync-ai-instructions/` and `/home/vscode/.codex/skills/sync-ai-instructions/` | Installed copies observed locally; inventory provenance before cleanup. Check other installations separately. Source deletion does not prune them. |
| `.agents/rules/` | Absent locally at inspection. Elsewhere compare filenames/content/provenance against generated copies; preserve unrelated or independently edited files. |
| `.github/skills/sync-ai-skills/` | Retain. Its distribution of skills is distinct from the retired instruction-copy mechanism; do not add automatic pruning. |
<!-- markdownlint-enable MD013 -->

No tracked external caller of the retired instruction-copy skill is found.
Generic `AGENTS.md` examples in writing-for-agents remain valid.
`.github/instructions/` remains active and needs no retirement notice file.

## Stale paths and retained references

<!-- markdownlint-disable MD013 -->
| Source | Reference disposition |
| --- | --- |
| Requirement-property guide | Change hydration spec to `tests/integration/requirements/table-hydration.spec.ts` and admin spec to `tests/integration/admin/entrypoint.spec.ts`. |
| Requirements-table guide and `docs/governance/requirements-ui-behaviour.md` | Change resize spec to `tests/integration/requirements/table-resize.spec.ts`; replace absent Markdown companion with `docs/governance/manuella-testfall.md` for functional cases and keep automated geometry coverage. |
| `docs/development/auth-developer-workflow.md` | Repair moved admin entrypoint command. |
| `typeorm/seed-dogfood.mjs`: verification-method text | Repair moved resize-spec reference when migrating the documentation reference inventory; preserve seed meaning. Do not imply a source edit updates existing persisted rows. |
| TypeORM-SQLServer guide | Remove absent `scripts/db-admin.mjs`; keep current admin script; correct developer-doc and MJS patterns. |
| Node-version guide | Replace stale bundled constant/example with current pin discovery. |
| Translation guide | Remove nonexistent page-specific locale-file cache; keep paired current message files. |
| Existing dependency-workflow, Admin Center and update-packages-skill links to retained scoped instructions | Keep valid target links; no relocation is proposed. |
| Existing schema, translations, Developer Mode, route-policy and manual-lockstep pointers | Keep paths, consolidate repeated bodies, and preserve conditional authority. Relative sibling pointers resolve from their instruction directory. |
<!-- markdownlint-enable MD013 -->

Refresh this inventory after concurrent work. The sequencing decision owns
transition order, installed-copy cleanup and completion conditions. No
production data migration, application change or instruction installation is
performed by this mapping.
