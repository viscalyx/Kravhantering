# Required seed ownership evidence

This note is for maintainers deciding SQL migration and seed safeguards and
operators assessing required-seed reruns during upgrades. It separates fixed
application identities from administrator-owned configuration and identifies
specific gaps without choosing a new seed or transaction policy.

Evidence date: 2026-11-14. Repository baseline:
`f82963fb91830df23e7852d5ecfb5ac9e6568db7`. All source links below pin that
revision. Facts are static source observations; deductions and unverified
behavior are identified explicitly. No database, application, environment,
instruction, or tracker mutation, database experiment, or application test is
part of this research.

## Findings at a glance

- Required seed already preserves existing values for ordinary rows: its
  default operation checks the primary key and inserts only if absent.
  It does not compare or repair existing values. [Runner][runner].
- Fixed identities do not imply fixed labels, colors, descriptions, or
  order. The supported administration paths edit these fields even on
  system statuses and priorities. [Status edits][status-edit],
  [usage-status edits][usage-edit], [priority edits][priority-edit].
- The column-default family has a concrete identity mismatch: administration
  replaces rows using generated IDs, while seed checks shipped numeric IDs.
  A rerun collision is a source-supported inference, not a reproduced result.
  [Column save][column-save], [seed rows][seed-columns],
  [unique constraints][column-entity].
- AI safety seeding deliberately converges rule metadata and standard-term
  metadata while preserving existing standard terms' active state and
  direction. A custom term that becomes standard is a documented exception
  that is activated and given the standard direction. [AI helper][ai-seed],
  [ownership documentation][ai-doc].
- Upgrades run migrations before required seed. Preserving existing seed
  values does not prevent migrations from changing data for a release.
  [Upgrade sequence][upgrade], [bounded repair example][color-repair].

## Family coverage and supported ownership

The [required table list and data][seed] define 17 tables. The grouped table
below covers every family. “Insert only” describes the current default
runner, not a declaration that every shipped value must remain immutable.
Editable fields refer to supported application paths, not direct SQL
permission. Absence of a mutation path in this bounded inspection is not
proof that no external integration can write the table.

<!-- markdownlint-disable MD013 -->
| Required family | Identity or functional contract | Editable values and actual rerun behavior |
| --- | --- | --- |
| `archiving_retention_policies` | IDs 3–8, stable policy keys, ages and predicates supply six disposal policies. Runtime selects candidate definitions by policy key. [Seed][seed-retention], [consumer][retention]. | No policy-configuration mutation route is identified. Runtime updates `last_run_at` and `updated_at`; insert only preserves them and existing policy values. This does not establish that all policy fields are user-owned. [Run update][retention-update]. |
| `specification_implementation_types`, `specification_governance_object_types` | Shipped IDs 1–2 and 1–5 provide default catalogs. [Seed][seed-catalogs]. | Names can change; create/delete paths exist. Insert only preserves renamed rows but restores a missing shipped ID. Thus supported deletion and later reseeding need an explicit ownership decision. [Implementation DAL][implementation], [governance DAL][governance]. |
| `specification_lifecycle_statuses` | Shipped IDs 1–4 have code-defined lifecycle meanings; progress reporting uses IDs 2/3, and ID 4 means management. [Seed][seed-catalogs], [constants][lifecycle]. | Names can change and create/delete paths exist. Insert only preserves names, but the fixed semantic IDs and extensible CRUD surface are distinct contracts. [DAL][lifecycle-edit]. |
| `requirement_categories`, `requirement_types` | Three categories and type IDs 1/2 are shipped; quality rows reference type IDs. [Seed][seed-catalogs], [quality/type seed][seed-quality]. | The inspected public category/type routes expose GET. Type CRUD exists in the DAL, but this alone does not establish a supported admin edit path. Current seed is insert only. [Category route][category-route], [type route][type-route], [type DAL][type-dal]. |
| `specification_item_statuses` | Fixed IDs 1–6 mean Included, In Progress, Implemented, Verified, Deviated, Not Applicable; the catalog is explicitly non-extensible. [Constants][usage-ids]. | Names, descriptions, color, icon and order are editable, except order is ignored for IDs 1/5. Insert only preserves edits, including permitted order changes. [DAL][usage-edit]. |
| `requirement_statuses` | IDs 1–4 mean Draft, Review, Published, Archived; lifecycle predicates compare IDs. [Constants][status-ids], [consumer][status-consumer]. | System-row names, sort order, color and icon are editable. Insert only preserves edits; it also leaves an incorrect existing `is_system` flag untouched. [DAL][status-edit], [seed][seed-statuses]. |
| `requirement_status_transitions` | Shipped edges are 1→2, 2→3, 2→1, 3→2, 2→4 with IDs 1–5. Reads resolve endpoints. [Seed][seed-statuses], [DAL][transition-dal]. | DAL create/delete functions exist; this inspection finds no caller establishing an admin transition-definition editor. Insert only checks row ID, so it does not validate existing endpoints or reconcile by endpoint pair. [DAL][transition-dal]. |
| `quality_characteristics` | 49 shipped IDs form a type-linked, parent-linked chapter hierarchy. Parent rows precede children. Reads sort by parsed chapter components. [Seed][seed-quality], [read ordering][quality-read]. | Admin PUT permits chapter, names, type and parent changes; DELETE is supported subject to child/use checks. Thus even structural values are editable. Insert only preserves existing edits and restores missing shipped IDs. [Route][quality-route]. |
| `priority_levels` | IDs 1–5 carry codes P1–P5; seed order is reversed (P5 has sort order 1, P1 has 5). [Seed][seed-priority]. | Names, descriptions, assessment criteria, order, color and icon are editable; update input excludes code/ID. Insert only preserves those edits. [DAL][priority-edit]. |
| `ai_settings`, `application_settings` | Both use singleton ID 1. Seed includes startup settings; omitted columns rely on migration/schema defaults. [Seed][seed-settings]. | AI enabled state, limits, quotas and cache TTL have an admin schema; application fields have validated updates. Insert only preserves saved values. Application import-row reduction may intentionally clamp the AI row limit. [AI API][ai-settings-route], [application update][application-edit]. |
| `ai_run_profiles` | Three fixed UUIDs and keys: `generation_without_images`, `generation_with_images`, `invalid_json_repair`; initial model binding is null. [Seed][seed-settings]. | Admins select verified model revisions and bounded budgets; separate actions manage operational status. Insert only preserves assignments, budgets and configuration versions. [Admin contract][profiles], [admin guide][profiles-doc]. |
| `ai_safety_rules`, `ai_safety_rule_terms` | Rules use stable `rule_id`; terms match on parent rule, term type and normalized term. Numeric IDs are generated/resolved. [Helper][ai-seed]. | Rule metadata converges; standard terms receive shipped text/order/default-direction metadata. Existing standard direction/active overrides survive. Custom terms are supported; a custom-to-standard collision resets direction and activates it. Explicit restore is separate. [Helper][ai-seed], [documented ownership][ai-doc]. |
| `requirement_list_column_defaults` | Fifteen shipped rows have fixed numeric IDs; the application contract addresses columns by `column_id`, with unique column and order constraints. [Seed][seed-columns], [API][column-api], [entity][column-entity]. | Organization defaults for order/visibility are editable; unique ID and description stay visible. Save deletes/reinserts without IDs. Insert-only-by-ID therefore does not reliably preserve this family's supported state. [Guide][column-doc], [save][column-save]. |
<!-- markdownlint-enable MD013 -->

## What a required-seed rerun actually establishes

**Fact.** The runner follows explicit table order and each array's row order,
binds parameters, uses explicit identity values where appropriate, and checks
only the declared primary key. The current ordinary entries all declare
`pk: ['id']`; AI rule/term entries are empty placeholders for their helper.
Existing row presence causes a skip, even if another column differs.
[Seed definitions][seed], [runner][runner]. This protects administrator edits
when the ID still identifies the intended row; it is not value convergence
or a complete invariant check.

**Fact.** The CLI passes a DataSource. Ordinary rows complete in the runner's
transaction before the AI helper issues DataSource queries without its own
wrapper. The profile therefore has no single transaction in this invocation;
this observation does not choose an atomicity policy.
[Profile function][seed-function], [runner transaction][runner-transaction],
[CLI invocation][seed-cli], [AI query helper][ai-query].

The CLI's `insertedRows` counts ordinary seed rows processed, including skipped
inserts, and excludes AI helper work. [Runner][runner], [CLI][seed-cli].

### Concrete mismatch: saved column defaults versus seed IDs

**Fact.** A supported admin save deletes all column-default rows, then inserts
the normalized set without `id`. The ID column is generated. Seed instead
guards each shipped numeric ID before inserting its shipped column and order.
Both `column_id` and `sort_order` are unique. [Save][column-save],
[entity][column-entity], [seed][seed-columns].

**Inference, not database-tested.** Starting from seeded data, an ordinary save
can leave the same logical columns under new IDs. A later required seed sees
a missing shipped ID and attempts to insert a column/order that already
exists, producing a uniqueness failure. In a different state, an unrelated
row occupying a shipped ID can instead suppress insertion of the intended
column. This is a matching-key defect candidate, not evidence that a valid
admin order should be reset. A focused isolated save→seed regression would
be needed before claiming reproduced runtime behavior.

**Decision gap.** “Insert missing only” needs a family-specific definition of
missing. Here the supported key is the column identifier; numeric seed IDs
are not stable through the supported writer. Adding new default columns also
needs a collision-safe placement rule that preserves existing admin order.
This note does not select that placement rule.

## Release migrations are a separate data-change contract

**Fact.** The production upgrade guide requires a tested restore point and
then runs migration status, migration, status, required seed and permission
verification. It says to stop on failure and, after migration starts, restore
the recorded recovery set instead of running individual migration down paths.
[Preparation][backup], [execution][upgrade], [recovery][recovery].

**Fact.** Existing migrations illustrate several distinct intentions:

- `0050` and `0053` repair only invalid priority/status colors, preserving
  valid custom colors through their predicates. [Priority repair][color-repair],
  [status repair][status-color-repair].
- `0055` clamps existing MCP import limits above 500 before introducing the
  tighter check constraint. This is a bounded compatibility conversion, not
  a universal reset to seed values. [Migration][import-migration].
- `0057` changes the forensic logging default and updates singleton data only
  when the fresh-install flag is true; existing configuration is preserved.
  [Migration][forensic-migration].
- `0066` adds the CSP logging field with an enabled default and `WITH VALUES`,
  initializing existing rows as part of that schema introduction.
  [Migration][csp-migration].

**Inference for safeguards.** Protecting editable seed values and permitting
reviewed, release-specific migration conversions are compatible. A future
change needs to state which invariant changed, which rows qualify, which
admin choices survive, and how the upgrade is verified. Blanket convergence
of all seed columns would conflict with current supported administration.
Blanket insert-only treatment of AI rule metadata would also change its
documented synchronization contract. Neither blanket rule follows from the
current evidence.

## Bounded open questions

1. Decide whether supported catalog deletion is permanent or shipped rows are
   restored on upgrade, especially quality/specification catalogs.
2. Specify matching keys, occupied-ID handling and collision-safe new ordering.
3. Resolve the AI custom-to-standard conversion: its documented override
   conflicts with a preservation rule that includes these editable terms.
4. Verify column save→seed and allowed-edit preservation in a later authorized
   isolated test; this note establishes no database execution or incident.

Manual cases and application tests remain unchanged because this artifact
changes no user-facing behavior.

[seed]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/seed-required.mjs#L4-L622
[seed-retention]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/seed-required.mjs#L25-L133
[seed-catalogs]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/seed-required.mjs#L134-L235
[seed-settings]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/seed-required.mjs#L236-L381
[seed-columns]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/seed-required.mjs#L392-L418
[seed-statuses]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/seed-required.mjs#L419-L447
[seed-quality]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/seed-required.mjs#L448-L538
[seed-priority]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/seed-required.mjs#L539-L621
[runner]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/seed-runner.mjs#L82-L129
[runner-transaction]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/seed-runner.mjs#L24-L180
[seed-function]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/seed-required.mjs#L626-L633
[seed-cli]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/scripts/db-sqlserver-admin.mjs#L1701-L1748
[status-ids]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/requirements/status-constants.mjs#L1-L4
[status-consumer]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/requirements/lifecycle.ts#L13-L35
[status-edit]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/dal/requirement-statuses.ts#L67-L98
[transition-dal]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/dal/requirement-statuses.ts#L107-L182
[usage-ids]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/specification-item-status-constants.ts#L1-L44
[usage-edit]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/dal/specification-item-statuses.ts#L141-L178
[priority-edit]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/dal/priority-levels.ts#L183-L220
[implementation]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/dal/specification-implementation-types.ts#L28-L62
[governance]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/dal/specification-governance-object-types.ts#L28-L62
[lifecycle]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/specifications/lifecycle-status-constants.ts#L1-L9
[lifecycle-edit]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/dal/specification-lifecycle-statuses.ts#L28-L74
[category-route]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/app/api/requirement-categories/route.ts
[type-route]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/app/api/requirement-types/route.ts
[type-dal]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/dal/requirement-types.ts#L99-L128
[quality-route]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/app/api/quality-characteristics/%5Bid%5D/route.ts#L34-L103
[quality-read]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/dal/requirement-types.ts#L58-L80
[retention]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/archiving/retention.ts#L1159-L1174
[retention-update]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/archiving/retention.ts#L1358-L1364
[ai-settings-route]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/app/api/admin/ai-settings/route.ts#L34-L94
[application-edit]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/dal/application-settings.ts#L193-L228
[profiles]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/ai/admin-contracts.ts#L127-L294
[profiles-doc]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/docs/governance/admin-center.md#L150-L165
[ai-seed]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/ai-safety-seed-data.mjs#L292-L420
[ai-query]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/ai-safety-seed-data.mjs#L283-L295
[ai-doc]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/docs/reference/database-schema.md#L2708-L2746
[column-save]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/dal/ui-settings.ts#L324-L352
[column-entity]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/lib/typeorm/entities/requirement-list-column-default.ts#L16-L38
[column-api]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/app/api/admin/requirement-columns/route.ts#L23-L61
[column-doc]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/docs/governance/admin-center.md#L93-L106
[backup]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/docs/operations/rhel10-production-single-node-self-contained-upgrade.md#L89-L98
[upgrade]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/docs/operations/rhel10-production-single-node-self-contained-upgrade.md#L558-L587
[recovery]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/docs/operations/rhel10-production-single-node-self-contained-upgrade.md#L667-L698
[color-repair]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/migrations/0050_repair_invalid_priority_colors.mjs#L1-L19
[status-color-repair]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/migrations/0053_repair_invalid_status_colors.mjs#L1-L32
[import-migration]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/migrations/0055_requirement_import_budget.mjs#L64-L74
[forensic-migration]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/migrations/0057_ai_safety_forensic_default.mjs#L1-L48
[csp-migration]: https://github.com/viscalyx/Kravhantering/blob/f82963fb91830df23e7852d5ecfb5ac9e6568db7/typeorm/migrations/0066_csp_violation_logging.mjs#L1-L5
