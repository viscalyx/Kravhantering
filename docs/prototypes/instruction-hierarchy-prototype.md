# Instruction hierarchy prototype

Status: accepted layout and budget prototype; no migration is applied.

The user agrees with the recommendation and asks that the Copilot root file
also be accounted for. The resolution comment owns the complete decision.

Decision: [Design the Codex AGENTS.md hierarchy and context budget](https://github.com/viscalyx/Kravhantering/issues/1299).

Baseline: repository commit `68a6d5096a5668bc0910a7a57c146a51dd7acdd5`.

## Question

Can a root routing index and the existing integration entry provide a clear,
bounded route to applicable instructions for all four supported consumers?
This Markdown outline prototypes instruction placement and read paths.

## Proposed layout

```text
AGENTS.md                         Common rules and complete routing index
.github/instructions/*.md          Authoritative scoped bodies with applyTo
tests/integration/AGENTS.md         Existing local rules; explicit root route
```

No additional nested AGENTS.md files are proposed. The existing inventory
finds no whole-subtree scope among the 37 scoped files. Their selectors remain
cross-tree, file-type, exact-file, or mixed conditions.

The existing integration entry remains its rules' sole owner. Root routing
makes it reachable even when experimental nested discovery is disabled.
Preserve the conditions inside its rules, including Playwright-specific rules.

The disposition of `.github/copilot-instructions.md` and obsolete sync assets
belongs to [Decide which Copilot and obsolete sync assets remain](https://github.com/viscalyx/Kravhantering/issues/1303).
This outline assumes that common rules have one owner in root AGENTS.md, as
already agreed. It does not decide which empty compatibility assets survive.

## Copilot root file accounting

The source inventory explicitly includes `.github/copilot-instructions.md`
(3,363 bytes at the baseline). Its common repository rules move to root
`AGENTS.md`; its conditional rules retain explicit path or task conditions
and receive one authoritative destination in the per-policy mapping.
Examples include authenticated development requests, database schema guidance,
Developer Mode exceptions, and dialog rules. Every rule must remain accounted
for, including rules outside the 37 scoped files.

If the Copilot root file remains, count its actual remaining content in each
Copilot surface's automatically loaded material. Do not classify this as part
of Codex's native AGENTS.md startup chain. Count it for Codex only if a shared
read route requires it. A retained file must not duplicate common rule bodies.
The existing asset-retention decision owns whether it remains or is retired.

## Root routing contract: draft wording

```markdown
## Instruction routing

- Resolve paths from the repository root, including new and renamed files.
- Before repository work, select all routes whose path or task trigger holds.
- Read each selected instruction file unless its complete current content is
  already available in context. Follow applicable reference pointers in it.
- Apply each rule only to the paths and task conditions it governs. Loading
  an instruction file does not extend its rules to unrelated files.
- Re-evaluate routes when the task, target paths, or instruction files change.
- Check both the source and destination paths before moving a file.
- For work under tests/integration/, read tests/integration/AGENTS.md.
- Use the same routing contract in Codex and Copilot. Native selection can
  supply a file; it does not replace task-trigger evaluation.
```

Common repository rules precede this section. Complete routing entries follow
it in the same root file. There is no mandatory intermediate index read.

## Entry shape

Each entry names its body, path trigger, and any semantic task trigger.
Path and task triggers select a document; conditions inside the document
still control individual rules. Express AND/OR explicitly where needed.

- File-type example: `messages/*.json` selects
  `.github/instructions/translations.instructions.md`. This includes immediate
  JSON children only; it excludes deeper files and non-JSON siblings.
- Cross-tree example: the paths in the reports selector select
  `.github/instructions/reports.instructions.md`; an adjacent unrelated
  component does not inherit report-specific rules.
- Exact-file example: `docs/operations/operator-upgrade-notes.md` selects
  `.github/instructions/operator-upgrade-notes.instructions.md`; other
  operations documents do not acquire its automation ownership rule.
- Mixed example: preserve every distinct path alternative in the tests
  selector, including colocated tests. Apply framework-specific rules only
  for their named framework.
- Semantic example: a task that adds a requirement property must reach
  `.github/instructions/add-requirement-column.instructions.md` before the
  final file set is known. Its persistence instructions apply when the
  property is persisted.
- Literal paths such as `app/[locale]/...` are identified as literal paths
  in prose; native glob syntax remains a separate representation.

These examples show the proposed representation. Final trigger corrections,
exceptions, and per-policy assignments belong to the existing scope and
mapping decisions; this prototype does not silently resolve them.

## Budget proposal

- Root AGENTS.md: at most 16 KiB, including common rules and routing entries.
- Combined repository startup chain: at most 24 KiB, including separators.
- Keep the documented Codex default of 32 KiB; leave headroom for growth.
- Measure later reads separately: routing pointers, selected unique bodies,
  and required linked references. Record any known duplicate native loading
  separately; one source file does not guarantee one runtime injection.
- Report representative small and broad tasks in the compatibility analysis.
  If selected material is too large for a supported context, split guidance
  by applicable branch or narrow the task. Preserve all required rules.
- Byte budgets are repository design choices, not model token limits. They
  do not guarantee that every possible task fits every model context.

[Official Codex discovery documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
sets the default combined discovered project-instruction limit at 32 KiB.
It describes a startup root-to-working-directory chain. Later reference reads
must be accounted for separately from that startup limit.

## Measured sizing inputs

At the baseline commit:

- Root entry: 1,909 bytes.
- Copilot root entry: 3,363 bytes.
- Existing integration entry: 1,097 bytes.
- Scoped bodies: 88,573 bytes across 37 files.
- Compact selector-plus-pointer rows below: 6,586 bytes.
- Both existing root entries plus those rows: 11,858 bytes.
- Adding the existing integration entry: 12,955 bytes.

The last two figures are arithmetic sizing inputs, not a migrated file or a
client loading measurement. They exclude new routing prose, semantic trigger
wording, separators, and selected rule bodies. Deduplication can reduce them;
complete semantic triggers can increase them. Measure the final proposed
wording during policy mapping before calling the budget satisfied.

For a translations-only example, the current selected body is 404 bytes.
For an entity example, the prior inventory reports 27,947 selected scoped
bytes before linked references. With a 16 KiB root budget, those examples
would be 16,788 and 44,331 bytes respectively before linked references and
other context. The entity example is not a startup-limit failure: most of
that material is read after startup. It is a task-context cost to review.

## Walkthroughs for human review

1. Edit `messages/en.json`: root routing selects translations. Editing a
   hypothetical `messages/archive/en.json` does not match that same route.
2. Start at repository root and edit an integration spec: the explicit root
   route reaches the existing nested instructions without experimental
   discovery. Follow its manual-case pointer and relevant test conditions.
3. Add a requirement property before choosing files: the semantic trigger
   selects property guidance; route again when persistence and UI paths are
   known. Do not wait for native file matching to express task intent.
4. Change an entity and a translation together: take the union of selected
   documents, while applying persistence rules only to persistence work.
5. Move a file across directories: evaluate old and new scopes before the
   move and use the destination scope for the resulting file.
6. Encounter the same body through Copilot native selection and root routing:
   retain one authoritative meaning. Do not assume that the client removes
   duplicate injected text.

## Current selector inventory for size comparison

This fenced inventory preserves current selector text, including known
scope defects. It is not the final routing index or an approved scope repair.
Semantic triggers must be added through the remaining decisions.

<!-- markdownlint-disable MD013 -->
```text
- "{components/**/*.tsx,app/[locale]/requirements/**/*.tsx,app/api/**/*.ts,lib/**/*.ts,i18n/**/*.ts,lib/typeorm/entities/**/*.ts,typeorm/{seed.mjs,migrations/**/*.mjs},tests/**/*.test.ts,tests/**/*.test.tsx,tests/**/*.spec.ts,tests/**/*.spec.tsx,docs/*.md}" -> `.github/instructions/add-requirement-column.instructions.md`
- "{app/[[]locale[]]/admin/**/*.tsx,components/Navigation.tsx,app/api/admin/**/*.ts,app/api/privacy/**/*.ts}" -> `.github/instructions/admin-center.instructions.md`
- "{.github/instructions/*.md,.github/prompts/*.md,.github/copilot-instructions.md}" -> `.github/instructions/ai-instruction-authoring.instructions.md`
- "{app/api/**/*.ts,lib/http/validation.ts,openapi/**/*.yaml,docs/security-privacy/api-security.md,schemathesis.toml,.github/workflows/security-api.yml,scripts/security/**/*.mjs}" -> `.github/instructions/api-contract.instructions.md`
- "{app/api/auth/**/*.ts,app/api/mcp/route.ts,components/AuthMenu.tsx,lib/auth/**/*.ts,lib/mcp/http.ts,lib/requirements/auth.ts,proxy.ts,tests/support/oidc-mock.ts,dev/keycloak/realm-kravhantering-dev.json,docs/security-privacy/auth-how-it-works.md,docs/integrations/oidc-identity-provider-integration.md,docs/development/auth-developer-workflow.md,docs/integrations/external-idp-handoff.md,docs/operations/rhel10-production-deploy.md}" -> `.github/instructions/auth-docs.instructions.md`
- "{app/api/**/*.ts,app/**/*.tsx,components/**/*.tsx,lib/auth/**/*.ts,lib/http/api-fetch.ts,lib/requirements/auth.ts,proxy.ts,tests/**/*.{ts,tsx}}" -> `.github/instructions/auth-security.instructions.md`
- 'components/**/*.tsx' -> `.github/instructions/components.instructions.md`
- "{lib/typeorm/**/*.ts,typeorm/migrations/**/*.mjs,typeorm/seed*.mjs,typeorm/*seed*.mjs,docs/reference/database-schema.md}" -> `.github/instructions/database-schema.instructions.md`
- "{lib/dal/**/*.ts,lib/requirements/service*.ts,app/api/**/*.ts}" -> `.github/instructions/database-writes.instructions.md`
- "app/[locale]/requirements/[id]/requirement-detail-client.tsx" -> `.github/instructions/detail-pane-layout.instructions.md`
- '{app/**/*.tsx,components/**/*.tsx,docs/**/*.md,tests/unit/**/*.ts,tests/unit/**/*.tsx,tests/integration/**/*.spec.ts,CONTRIBUTING.md}' -> `.github/instructions/developer-mode.instructions.md`
- "{.github/workflows/*.yml,.github/workflows/*.yaml,.github/dependabot.yml,tests/unit/github-actions-workflow-security.test.ts}" -> `.github/instructions/github-actions-security.instructions.md`
- "{components/HelpPanel.tsx,app/[locale]/**/*-client.tsx}" -> `.github/instructions/help-panel.instructions.md`
- "{docs/security-privacy/informationsmangder-kravhantering.md,docs/governance/admin-center.md,docs/reference/database-schema.md,lib/typeorm/**/*.ts,typeorm/migrations/**/*.mjs,typeorm/seed*.mjs,lib/archiving/**/*.ts,app/api/admin/archiving/**/*.ts,app/[[]locale[]]/admin/**/*.tsx,tests/unit/archiving-retention*.test.ts}" -> `.github/instructions/information-assets-retention.instructions.md`
- '{.devcontainer/Dockerfile,.github/workflows/quality-checks.yml,scripts/azure-dev/templates/bootstrap-host.sh,tests/unit/github-actions-workflow-security.test.ts}' -> `.github/instructions/lychee-toolchain.instructions.md`
- "{docs/governance/manuella-testfall.md,tests/integration/**/*.ts}" -> `.github/instructions/manual-test-playwright.instructions.md`
- "{docs/**/*.md,README.md,CONTRIBUTING.md,SECURITY.md,CODE_OF_CONDUCT.md,packages/**/*.md}" -> `.github/instructions/markdown.instructions.md`
- "{lib/mcp/**/*.ts,lib/requirements/**/*.ts,lib/dal/**/*.ts,app/api/**/*.ts,docs/integrations/mcp-server-*.md,tests/unit/mcp-http.test.ts}" -> `.github/instructions/mcp-tool-contract.instructions.md`
- "{app/api/**/*.ts,next.config.ts,package.json}" -> `.github/instructions/next-runtime.instructions.md`
- "**/{Dockerfile,.devcontainer/**,.github/workflows/**,package.json,.nvmrc}" -> `.github/instructions/node-version.instructions.md`
- "docs/operations/operator-upgrade-notes.md" -> `.github/instructions/operator-upgrade-notes.instructions.md`
- 'package.json' -> `.github/instructions/package-updates.instructions.md`
- "{tests/powershell/**/*.Tests.ps1}" -> `.github/instructions/pester.instructions.md`
- "{app/**/*.tsx,components/**/*.tsx,lib/reports/**/*,tests/unit/**/*.ts,tests/unit/**/*.tsx,tests/integration/**/*.spec.ts}" -> `.github/instructions/privacy-display-name.instructions.md`
- "{lib/reports/**/*,components/reports/**/*,app/[locale]/requirements/reports/**/*}" -> `.github/instructions/reports.instructions.md`
- "{lib/requirements/lifecycle.ts,lib/requirements/status-constants.mjs,lib/dal/requirements.ts,lib/requirements/service*.ts,app/api/requirements/**/*.ts,app/api/requirement-transitions/**/*.ts}" -> `.github/instructions/requirement-lifecycle-policy.instructions.md`
- "{app/api/**/*.ts,lib/requirements/service*.ts,lib/mcp/server.ts}" -> `.github/instructions/requirement-service-boundary.instructions.md`
- "{components/RequirementsTable.tsx,app/[locale]/requirements/**/*.tsx,lib/requirements/list-view.ts,tests/unit/requirements-table.test.tsx,tests/unit/requirement-list-view.test.ts,tests/unit/requirements-client.test.tsx,tests/integration/requirements-table-resize.spec.ts,tests/integration/requirements-table-resize.md,docs/governance/requirements-ui-behaviour.md}" -> `.github/instructions/requirements-table.instructions.md`
- "{app/api/**/route.ts,lib/http/*.ts,proxy.ts,openapi/requirements-api.yaml,tests/unit/rest-route-*.test.ts,lib/__tests__/*policy.test.ts}" -> `.github/instructions/route-security-policy.instructions.md`
- 'scripts/**/*.js,scripts/**/*.mjs' -> `.github/instructions/scripts.instructions.md`
- "{app/api/**/route.ts,lib/http/secure-mutation-route.ts,tests/unit/secure-mutation-route*.test.ts,docs/security-privacy/api-security.md,docs/security-privacy/auth-how-it-works.md}" -> `.github/instructions/secure-mutation-routes.instructions.md`
- '**/*.{test,spec}.{ts,tsx,js,mjs,cjs},**/__tests__/**/*' -> `.github/instructions/tests.instructions.md`
- 'messages/*.json' -> `.github/instructions/translations.instructions.md`
- "lib/typeorm/entities/**/*.ts" -> `.github/instructions/typeorm-entities.instructions.md`
- "{lib/typeorm/**/*.ts,typeorm/**/*.ts,lib/db.ts,scripts/db-admin.mjs,scripts/db-sqlserver-admin.mjs,scripts/__tests__/db-sqlserver-admin.test.mjs,docker-compose.sqlserver.yml,package.json,docs/sql-server-*.md}" -> `.github/instructions/typeorm-sqlserver.instructions.md`
- '{components,app}/**/*.tsx' -> `.github/instructions/ui-ux.instructions.md`
- 'lib/**/*.ts' -> `.github/instructions/utilities.instructions.md`
```
<!-- markdownlint-enable MD013 -->

## Accepted recommendations

- Keep the complete routing index in root AGENTS.md.
- Keep the existing integration entry with an explicit root route. Add no
  other nested entries for this migration.
- Use 16 KiB for root and 24 KiB for the combined repository startup chain.
  Measure later reads separately and retain the Codex default.
- Account for the Copilot root file in source mapping and surface-specific
  loading costs; its final retention remains with the existing asset ticket.
