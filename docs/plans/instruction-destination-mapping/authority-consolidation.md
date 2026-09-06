# Consolidation rules for the policy ledger

The ledger accounts for source occurrences. This table identifies the single
owner when different occurrences express the same policy. Apply it together
with each file's review: retaining intent does not mean retaining every copy
of its wording. Keep conditional pointers at other relevant sites.

<!-- markdownlint-disable MD013 -->
| Meaning | Authoritative destination | Treatment of other occurrences |
| --- | --- | --- |
| Sole repository stack; common documentation and user-facing verification obligations | Root `AGENTS.md` | Schema/TypeORM/script guides point to shared stack policy. Named domain docs and focused test cases remain scoped specializations. Current package versions and check composition are read from `package.json`. |
| Scoped discovery and reading-versus-applicability contract | Root `AGENTS.md` | Keep native selectors as the accepted second activation representation. Do not repeat the full routing procedure in scoped guides. |
| Instruction writing and reciprocal maintenance procedure | `ai-instruction-authoring.instructions.md` | Root carries the maintenance trigger; other scoped files need no copied procedure. |
| Schema naming, DDL versus metadata responsibility, scalar-FK exceptions, released migration rule, snapshot/seed/doc synchronization | `database-schema.instructions.md` | EntitySchema, TypeORM, tests and requirement-property guides reference the schema owner. Keep EntitySchema syntax/registration and TypeORM driver/query mechanics in their specialized owners. |
| SQL Server connection contract and browse workflow | `typeorm-sqlserver.instructions.md` | Next-runtime and script guides reference this owner for URL/scaffold meanings; keep their runtime/command-specific behavior. |
| Logical atomic mutation ownership | `database-writes.instructions.md` | TypeORM guide references atomicity/ownership; it retains transactional-manager and dedicated-connection mechanics. Lifecycle guide retains requirement-specific lock/precondition placement. |
| REST registry, MCP exclusion and transport policy | `route-security-policy.instructions.md` | Auth, secure mutation and API contract guides use a pointer for registry authority. Browser apiFetch, mutation schemas/policies and Schemathesis inclusion are distinct specializations. |
| Shared REST/MCP service versus route responsibility | `requirement-service-boundary.instructions.md` | Secure mutation guide references shared workflow ownership, retaining wrapper validation/context rules. Lifecycle guide keeps pure-decision versus DAL guard specialization. |
| External GitHub Action pinning | `github-actions-security.instructions.md` | Lychee points here for pinning, retaining tool versions/checksums and detector behavior. |
| Workflow/skill-definition/instruction test boundary and general coverage | `tests.instructions.md` | Delete conflicting policy in GitHub Actions/Lychee. Preserve stronger deterministic-script coverage in scripts and PowerShell execution isolation in Pester. |
| Manual scenario/spec lockstep | `manual-test-playwright.instructions.md` | Root, UI, general testing and integration entry refer to this owner. Integration entry keeps unique web-first assertions, steps, no sleeps, user-action and route-mock rules. |
| Paired locale-file update workflow | `translations.instructions.md` | Component/property/help/report/UI guides retain their task-specific label/key obligations and reference the paired-file procedure. Root owns the supported locales as a stack choice. |
| Developer Mode English labels and desktop/compact/accessibility exceptions | `developer-mode.instructions.md` | Move the Copilot-root exception here; UI/components retain exception pointers. Keep the underlying product accessibility contract in UI. |
| Product UI accessibility, loading feedback and transitions | `ui-ux.instructions.md` | Components keeps concrete async-state and reduced-motion helper mechanics, referencing common feedback policy. Keep PDF-specific primitives/printed-background exceptions conditional. |
| Dialog API, variants, anchor handling and provider | `ui-ux.instructions.md`, UI Dialogs | Move the complete Copilot-root branch together. Existing popover placement becomes a pointer to this subsection rather than a second anchor rule. |
| Locked requirement columns, baseline defaults and resize semantics | `requirements-table.instructions.md` | Property guide references the table owner; retains registry/data/admin wiring instructions. Generic high-frequency interaction guidance stays component-scoped; table preview/commit/cancel behavior is its specialization. |
| Generic material browser-state changes require storage-key versioning | `ui-ux.instructions.md` | Table guide references that policy while retaining the column-width-specific storage contract. |
| HelpContent placement/schema/lifecycle | `help-panel.instructions.md` | Collapse repeated module-scope/add-view bullets and redundant bilingual examples inside the same owner. |
| Requirement detail card order and area ownership | `detail-pane-layout.instructions.md` | Collapse repeated order/no-sidebar/card statements within that owner. Keep create/edit form owner-display behavior as a separate conditional rule. |
| Localized actor display versus durable identity | `privacy-display-name.instructions.md` | Preserve erasure matching and persisted personal-data duties in schema guidance; they are different policies. |
<!-- markdownlint-enable MD013 -->

Examples illustrating retained mechanics may be shortened or disclosed when
they add context without changing a rule. Never use example pruning to lose
an exception, option or mandatory step. Framework-specific test instructions
remain conditional even when a broad test selector causes the file to load.

These are planned source consolidations. They do not create a maintained
mapping registry in the repository. Future maintenance locates routes by
their authoritative repository-relative target path.
