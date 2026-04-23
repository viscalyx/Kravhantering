# Agent Instructions

QUALITY.md is the spec. `functional.test.ts` is the executable form.
They must move together. See
`.github/instructions/quality-spec.instructions.md` for the broader
rule that fires when editing covered code (lifecycle, DAL, API routes,
MCP, reports).

## Authoring checklist for a new or changed Fitness Scenario

1. **Update `QUALITY.md`** — add or edit the `Scenario N: …` heading
   and body. Cite the concrete code line ranges the scenario covers.
   Include the `vitest -t "Scenario N: …"` verify snippet.
2. **Update `tests/quality/functional.test.ts`** — add or edit an
   `it('Scenario N: …', …)` whose name is **verbatim-equal** to the
   QUALITY.md heading. Reuse the in-memory harness (shared DataSource +
   `clearTransactionalTables` + lookup seeding in `beforeAll`); do not
   add ad-hoc setup.
3. **Update `.github/skills/run-spec-audit/references/scrutiny-areas.md`**
   — add, rename, or remove the matching scrutiny area with its
   `Req tag` and `Verify` command.
4. **Run live** (requires SQL Server):

   ```sh
   set -a && source .devcontainer/elevated/.env && set +a \
     && npx vitest run tests/quality/functional.test.ts
   ```

5. **Run `npm run check`**.

## Other upkeep rules

- When adding new `docs/*.md` files relevant to spec compliance, add
  them to the context-files list in
  `.github/skills/run-spec-audit/SKILL.md`.
- When removing scenarios from `QUALITY.md`, remove the corresponding
  scrutiny area from `references/scrutiny-areas.md`.
