# Context accounting

All figures are UTF-8 source bytes, not tokens or measured client injection.

<!-- markdownlint-disable MD013 -->
| Material | Bytes | Interpretation |
| --- | ---: | --- |
| Common guidance and routing contract/preamble | 3259 | Full proposed text before route rows |
| Complete inline route rows | 10540 | All 38 scoped destinations |
| Complete proposed root AGENTS.md | 13799 | Budget 16,384; margin 2585 |
| Retained integration entry | 1097 | Existing complete body |
| Root + integration + explicit two-newline separator | 14898 | Budget 24,576; margin 9678 |
| Retired Copilot root | 0 | Final automatic source contribution |
| Current 37 scoped files | 88725 | Baseline, not rewritten-body measurement |
| Proposed new HTTP body | 680 | Frontmatter not included in this specimen |
| Proposed maintenance addition | 907 | Additional body bytes before consolidation |
<!-- markdownlint-enable MD013 -->

Copilot-native scoped injection and explicit reads count separately from the
AGENTS startup chain. Duplicate reads of the same source add context even
when the policy has only one owner. Neither model limits nor native injection
overhead are inferred from these arithmetic figures. Reserve the measured
startup margin for actual separators and environment-specific packaging;
re-measure the final installed file and chain during implementation.

## Later body and reference reads

The source manifest gives every original body size and each directly
identified local Markdown/YAML reference size. These are separate from the
root proposal. They are baseline costs: scoped rewrites are mapped, not
installed, and final changed bodies must be re-measured at implementation.
Semantic triggers and linked references make later reads task-dependent.

### Repair messages JSON syntax without changing visible text

Selected body baseline: 404 bytes. Explicit reference bundle: 0
bytes. These numbers do not include source code, tool output or other links.

Bodies: `translations`.

References: none required by this bounded example.

### Authenticated development request

Selected body baseline: 680 bytes. Explicit reference bundle: 40,518
bytes. These numbers do not include source code, tool output or other links.

Bodies: `dev-http`.

References: `docs/development/auth-developer-workflow.md`.

### Maintain root instruction routing

Selected body baseline: 1,033 bytes. Explicit reference bundle: 0
bytes. These numbers do not include source code, tool output or other links.

Bodies: `ai-instruction-authoring`.

References: none required by this bounded example.

### Persisted requirement property with UI, CSV and MCP output

Selected body baseline: 72,321 bytes. Explicit reference bundle: 625,747
bytes. These numbers do not include source code, tool output or other links.

Bodies: `add-requirement-column` , `auth-security` , `components` ,
`database-schema` , `database-writes` , `detail-pane-layout` , `developer-mode`
, `help-panel` , `information-assets-retention` , `mcp-tool-contract` ,
`next-runtime` , `privacy-display-name` , `reports` ,
`requirement-service-boundary` , `requirements-table` , `route-security-policy`
, `secure-mutation-routes` , `tests` , `translations` , `typeorm-entities` ,
`typeorm-sqlserver` , `ui-ux` , `utilities` , `manual-test-playwright` ,
`auth-docs` , `api-contract` .

References: `CONTEXT.md` , `docs/reference/database-schema.md` ,
`docs/reference/version-lifecycle-dates.md` , `docs/governance/admin-center.md`
, `docs/governance/manuella-testfall.md` ,
`docs/governance/requirements-ui-behaviour.md` ,
`docs/development/sql-server-developer-workflow.md` ,
`docs/integrations/mcp-server-user-guide.md` ,
`docs/integrations/mcp-server-contributor-guide.md` ,
`docs/security-privacy/informationsmangder-kravhantering.md` .

The broad example demonstrates why whole-task context is not certified by
a 16 KiB root budget. Read applicable document sections, split work by branch
or narrow the task as the accepted design requires. Do not drop required
rules to make the arithmetic fit. Further transitive/external reference costs
remain explicit inputs for the theoretical compatibility analysis.
