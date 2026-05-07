---
applyTo: "{lib/dal/**/*.ts,lib/requirements/**/*.ts,lib/mcp/**/*.ts,lib/reports/**/*.ts,app/api/**/*.ts,tests/quality/**/*,.github/skills/run-spec-audit/references/scrutiny-areas.md}"
---

# Quality Spec (QUALITY.md) Upkeep

`tests/quality/QUALITY.md` is the spec for outward-facing invariants
(lifecycle, specification-item status, MCP tools, report columns, admin
defaults). `tests/quality/functional.test.ts` is the executable form of
that spec. They must move together.

## When editing covered code

1. Read `tests/quality/QUALITY.md` before changing lifecycle, specification,
   MCP, report, or admin-default behavior.
2. Classify the change:
   - **Refactor, no behavior change** — no QUALITY.md update needed.
   - **New outward-facing behavior** (new lifecycle branch, new
     specification-item status rule, new MCP tool, new report column, new
     admin-default surface) — add a new Fitness Scenario to QUALITY.md
     and a matching test in `tests/quality/functional.test.ts`.
   - **Change to an existing covered invariant** — update the matching
     Fitness Scenario wording, re-verify the cited line ranges, and
     update its test case.

## Sibling-move rule

A Fitness Scenario has three siblings that must stay in sync:

- `tests/quality/QUALITY.md` — the `Scenario N: …` heading and body.
- `tests/quality/functional.test.ts` — an `it('Scenario N: …', …)` whose
  name is **verbatim-equal** to the QUALITY.md heading (QUALITY.md
  documents `vitest -t "Scenario N: …"` invocations).
- `.github/skills/run-spec-audit/references/scrutiny-areas.md` — a
  matching scrutiny area with its `Req tag` and `Verify` command.

Add, rename, or remove all three together. See
[tests/quality/AGENTS.md](../../tests/quality/AGENTS.md) for the
directory-local authoring checklist.

## Verify before declaring done

```sh
set -a && source .devcontainer/elevated/.env && set +a \
  && npx vitest run tests/quality/functional.test.ts
```

All scenarios must pass. Then run `npm run check`.
