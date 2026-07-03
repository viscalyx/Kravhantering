# AI Safety Rules Planning Decisions

Temporary planning ledger for the Admin Center AI safety-rule UI and storage
design. This file is not product documentation.

## Locked Decisions

- Admins may fully edit AI safety-rule terms, including disabling standard
  terms.
- Disabled standard terms must be restorable.
- Future standard terms are automatically active.
- If a future standard term matches an existing custom term, the custom term is
  folded into the standard term instead of being shown twice.
- The UI shows separate term groups/types rather than forcing all terms into
  only action/object lists.
- Term groups are `Handlingar`, `Mal`, `Direkta fraser/markorer`, and
  `Kodningsord`.
- Rules are shown once as rule groups/categories, not duplicated under input
  and output.
- Direction is stored per term row, not per rule.
- Direction values are `Input`, `Output`, and `Input och output`.
- Standard rules and terms may deviate from their standard direction/activity.
- Deviations from standard are shown with a small warning icon/symbol.
- There is no separate on/off switch per safety rule in v1.
- Standard rules and standard terms live in required seed data and the
  database, not as a runtime code fallback.
- AI assistance fails closed if the active safety-rule set cannot be read from
  the database.
- The data model stores terms in normalized database rows:
  `rule_id`, term type, term text, normalized term, direction, standard flag,
  active flag, timestamps.
- Standard terms use `is_standard = 1`; custom admin additions use
  `is_standard = 0`.
- Active terms use `is_active = 1`.
- Disabling a standard term sets `is_active = 0`.
- Removing a custom term deletes the row.
- New required seed standard terms are inserted with `is_standard = 1` and
  `is_active = 1`.
- A unique key should prevent duplicates by `rule_id`, term type, and
  normalized term.
- The main UI layout is expandable rule rows.
- Each expandable row represents one AI safety rule, such as
  `instruction_override`, `system_prompt_extraction`, `encoded_smuggling`,
  `secret_extraction_request`, `harmful_generation_request`, and
  `sensitive_backend_leak`.
- Inside an expanded rule row, terms are grouped by term type.
- Each term group uses the same columns: `Ord`, `Riktning`, `Standard`,
  `Aktiv`.
- Empty but relevant term groups may be shown so admins can add custom terms.
- There is no shared Save button for the AI tab.
- All AI-tab settings save immediately, including existing settings such as
  requirement-generation availability and MCP request limit, and new settings
  such as safety-rule cache TTL and safety-rule terms.
- Numeric AI-tab settings commit on blur or Enter when typed, and commit
  immediately when changed by +/- stepper buttons.
- Immediate saves use optimistic updates with per-row status, such as
  `Sparar...`, `Sparat`, or an error state with rollback of the affected row.
- Failed immediate saves for toggles and numeric controls roll back to the last
  saved value and show an error near the affected control.
- AI safety rules use their own admin API routes, not the existing
  `/api/admin/ai-settings` route.
- API mutations are small term-row operations:
  `POST` for adding a custom term, `PATCH` for changing direction/activity,
  and `DELETE` for deleting custom terms.
- Standard terms are not deleted through the API; UI removal patches
  `isActive=false`.
- Term text is not editable in v1 for either standard terms or custom terms.
- To change text, an admin adds a new term and removes/disables the old one.
- Batch removal may include both standard and custom terms.
- Mixed batch removal summarizes the effect before applying it, for example:
  `2 standardord inaktiveras och 1 eget tillagg tas bort.`
- Each rule has `Aterstall standard`.
- `Aterstall standard` for one rule reactivates all standard terms in that rule
  and restores their standard directions, without touching custom additions.
- There is no global `Aterstall standard for alla regler` in v1.
- Terms are in one common list with no language marker.
- All active terms apply regardless of UI language or detected text language.
- Admins edit term lists only; rule pattern logic and distance windows are fixed
  per rule.
- Existing rule pattern examples:
  `instruction_override` uses actions near targets or direct phrases;
  `encoded_smuggling` uses coding terms near targets in either order;
  `sensitive_backend_leak` uses direct markers.
- UI/admin-entered terms are literal phrases, not regex or wildcard syntax.
- Swedish inflections/plurals are represented as separate term rows, for
  example `instruktion`, `instruktionen`, `instruktionerna`.
- Regex special characters in terms are escaped when matchers are built.
- Matching is whitespace-flexible between term parts, so a term like
  `authorization: bearer` can match variants with different or missing
  whitespace between parts.
- Matching uses word boundaries for ordinary language terms and escaped literal
  substring-style matching for technical marker terms.
- The active rule set is cached in process memory.
- Cache TTL is configurable in Admin Center.
- Default cache TTL is 10 minutes.
- Minimum cache TTL is 30 seconds.
- Maximum cache TTL is 60 minutes.
- The cache TTL control appears in the Admin Center AI tab under `AI- och
  MCP-sakerhet`, above the expandable safety-rule administration and near the
  MCP request-limit control.
- After an admin mutation, the current process clears its local rule cache
  immediately.
- Other running instances observe rule changes when their TTL expires.
- Every direct-save server mutation records privileged admin audit.
- Admin audit for safety-rule term operations is metadata-only and does not
  include term text.
- Audit details may include rule ID, term ID, term type, changed field,
  operation, and counts for batch operations.
- Batch-removal audit records counts such as standard terms deactivated and
  custom terms deleted, plus rule ID when the batch is scoped to one rule.

## Prototype Artifacts

- `prototypes/ai-safety-rules-master-detail.html`
- `prototypes/ai-safety-rules-expandable-rows.html`
- `prototypes/ai-safety-rules-tabs.html`

The expandable-rows prototype is the chosen direction and was updated to show
rule groups with term-level rows, directions, standard/active flags, inline
save status, and batch removal behavior.

## ADR

- `docs/adr/0038-db-forvaltade-ai-sakerhetsregler.md` records the architectural
  decision to use DB-/required-seed-managed AI safety rules, fail closed when
  they cannot be read, cache active rules with Admin-controlled TTL, and save
  AI-tab settings directly.

## Terms Added To Glossary

- `AI-sakerhetsregel`
- `Sakerhetsregelriktning`
- `Lackage av systemnara innehall` / `System-adjacent content leakage`

The canonical glossary entries are in `CONTEXT.md`.

## Later Terminology Decisions

- User-facing AI safety rule names are aligned with AISVS/OWASP-style language:
  - `instruction_override`: `Promptinjektion: instruktionsovertagande` /
    `Prompt injection: instruction override`
  - `system_prompt_extraction`: `Lackage av systemprompt` /
    `System prompt leakage`
  - `encoded_smuggling`: `Promptinjektion via kodning och maskering` /
    `Prompt injection via encoding and obfuscation`
  - `secret_extraction_request`: `Kanslig informationsutlasning: hemligheter` /
    `Sensitive information disclosure: secrets`
  - `harmful_generation_request`: `Begaran om skadligt innehall` /
    `Harmful content generation request`
  - `sensitive_backend_leak`: `Lackage av systemnara innehall` /
    `System-adjacent content leakage`
- User-facing Swedish rule name for `sensitive_backend_leak` is
  `Lackage av systemnara innehall`, not a backend-based term.
- User-facing English rule name is `System-adjacent content leakage`, chosen to
  stay close to the Swedish `systemnara innehall` term.
- Internal rule/category IDs remain unchanged for compatibility.

## Next Open Question

- Decide final implementation plan and docs/test updates.
