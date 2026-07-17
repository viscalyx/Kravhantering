# Requirement List Performance CI Failure

## `scripts/requirements-list-performance.mjs`

### Status

The `Requirement List SQL Server Baseline` job fails before the specification
item pagination check runs. No Playwright spec fails or requires maintenance.

### Commands

CI runs:

```bash
npm run db:setup
npm run perf:requirements-list
```

Local reproduction against a clean SQL Server database uses:

```bash
npm run db:up
npm run db:setup
PERF_REQUIREMENTS_BASELINE_PROFILE=ci npm run perf:requirements-list
```

### Failure evidence

CI reports these ratio failures:

```text
deep-pagination: logical reads ratio 8.59 exceeded 1.25 vs default-published
deep-pagination: median ratio 2.65 exceeded 1.5 vs default-published
localized-text-deep: logical reads ratio 1.25 exceeded 1.25 vs localized-text-first
```

Local reproduction reports the same deterministic read ratios:

```text
default-published logical reads: 21915
deep-pagination logical reads: 188269
deep-pagination logical reads ratio: 8.59
localized-text-first logical reads: 179712
localized-text-deep logical reads: 225106
localized-text-deep logical reads ratio: 1.25
```

All scenarios remain below their absolute duration, logical-read, spill, and
missing-index thresholds. The relative deep-page guards cause the failure.

The current scenario builder filters first-page and deep-page pairs to the
`PERF-*` fixture and obtains page 20 through real continuation boundaries. The
committed baseline still contains relative thresholds measured for the prior
scenario and cursor-query shape.

Captured local plans show a materially different deep-pagination plan. The
deep plan includes extra clustered scans and index spools around cursor-anchor
resolution, while the first-page plan has no cursor-anchor branch.

### Suspected production files and symbols

- `lib/dal/requirements-list-sql.mjs`
  - `buildRequirementListSql`
  - `buildSeekCondition`
  - `cursorAnchorJoin`
- `scripts/requirements-list-performance.mjs`
  - `createRequirementListPerformanceScenarios`
  - `runScenario`
  - `compareAgainstBaseline`
- `tests/performance/requirements-list-baseline.json`
  - `deep-pagination`
  - `localized-text-deep`
- `tests/unit/requirements-list-performance.test.mjs`

### Required behavior change

Keep the production-style page-20 traversal and the fixture-scoped comparison.
Make cursor-anchor resolution preserve a deep-page plan that SQL Server can
seek efficiently, then rerun the CI profile and inspect the generated
`.sqlplan` files.

Possible implementations include resolving the anchor sort tuple before the
list query and passing it as parameters, or restructuring the single statement
so SQL Server can use the unique-id and secondary-sort boundary as seek keys.
The cursor fingerprint and stable `requirement.id` tie-breaker must remain
validated.

Do not raise or remove the relative guards only to make this run pass. If the
current higher deep-page cost is an intentional and reviewed tradeoff, record
that decision and regenerate both CI and developer profiles from comparable,
idle SQL Server environments. Preserve explicit relative thresholds because
`createBaselineFromResults` does not generate them.

### Blocked checks

- `npm run perf:requirements-list`
- `npm run perf:specification-items` in the same workflow, because the prior
  step exits nonzero

No `tests/integration/**/*.spec.ts` file is blocked by this failure.
