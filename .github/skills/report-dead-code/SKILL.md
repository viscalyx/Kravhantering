---
name: report-dead-code
description: Audit a codebase for removable dead code, stale tests or
  fixtures, stale documentation, and code kept only for backward
  compatibility. Use when Codex needs to scan for unused files, unused
  exports, unreachable branches, deprecated aliases, legacy compatibility
  seams, past-tense docs, cleanup opportunities, or intentional future-use
  placeholders, then update a structured Markdown report with concrete
  evidence and line-savings estimates.
---

# Report Dead Code

Produce an evidence-backed cleanup report. Do not trust a single static import
graph as proof; use targeted repo-aware searches and verify every finding.

## Workflow

1. Confirm the requested scope and output path.
   - If the user names an existing report, update it in place.
   - Include source, tests, scripts, config, and docs unless scoped narrower.
   - Exclude generated output, dependency folders, caches, and build artifacts.
2. Inventory candidates from multiple signals.
3. Validate each candidate against live entrypoints and dynamic loading.
4. Classify dead code, compatibility seams, stale docs, and near-misses.
5. Measure removable size only for removal-ready findings.
6. Produce or update the Markdown report from
   `references/report-template.md`.

## Candidate Discovery

Use repo-native tools before inventing analysis. Prefer `rg`, compiler output,
existing test names, and package scripts.

Run broad inventory commands:

```bash
git status --short
rg --files
```

Use compiler or linter signals when available:

```bash
npx tsc --noEmit --noUnusedLocals --noUnusedParameters --pretty false
```

Treat compiler and linter output as candidate input, not as the whole audit.
Some repos intentionally keep public exports, framework files, and adapters
that compilers cannot classify.

Search for stale-code and compatibility terms:

```bash
rg -n -i "legacy|compat|deprecated|obsolete|unused|dead code|todo" \
  app components hooks i18n lib scripts tests typeorm containers docs
rg -n -i "no longer|previously|previous|old|removed|retired|deferred" \
  docs --glob '*.md'
```

For TypeScript and JavaScript, check both file-level and symbol-level usage:

- Search exported symbol names directly with `rg`.
- Compare production imports with test-only imports.
- Check route-local duplicate helpers that make shared helpers stale.
- Check barrel exports and re-exports.
- Search dynamic imports, `require()`, config references, and string names.

For Markdown, report past-tense wording only in active docs that describe the
current product or workflow. Do not flag ADRs, release notes, rollback guides,
or upgrade notes when they intentionally preserve history.

## Manual Validation

Validate every finding with targeted searches before reporting it as dead:

- Check for dynamic imports:

  ```bash
  rg -n "import\\(" app components lib scripts
  ```

- Check for `require()` and config-driven module names:

  ```bash
  rg -n "require\\(|['\"][^'\"]+\\.(ts|tsx|js|jsx|mjs|cjs)['\"]" \
    app components lib scripts tests typeorm containers
  ```

- Check for named exports:

  ```bash
  rg -n "export (async )?(function|const|class|type|interface|enum) " \
    app components lib scripts
  ```

- Check for re-exports and barrel files:

  ```bash
  rg -n "export .* from ['\"]" app components lib scripts
  ```

- Check for legacy or replacement hints:

  ```bash
  rg -n -i "legacy|compat|deprecated|obsolete|unused|dead code|todo" \
    app components lib scripts tests docs
  ```

- Check for unreachable branches:

  ```bash
  rg -n "if \\(false\\)|&& false|\\? false :|feature flag" \
    app components lib scripts
  ```

- Check for future-placeholder signals:

  ```bash
  rg -n -i "planned|deferred|future|placeholder|stub|not enforced|not yet implemented|feature flag|todo" \
    app components lib scripts tests docs
  ```

Prefer `confirmed dead` only when the code has no live callers, no route or
tooling convention claims it, and no credible dynamic loading path remains.
Use `likely dead` when evidence is strong but one path is still uncertain.

## Live Entrypoints To Check

Before marking a file dead, check whether the repo can load it through:

- Framework conventions such as Next.js `app/**/page.tsx`, `route.ts`,
  `layout.tsx`, `middleware.ts`, `proxy.ts`, and `instrumentation.ts`.
- Config files such as `next.config.ts`, `tsconfig.json`, test configs,
  package exports, container files, and GitHub Actions.
- `package.json` scripts and shell scripts that call Node, test, database,
  release, or security helpers.
- Database migration, seed, fixture, and generated-schema discovery.
- Plugin, connector, MCP, or route registries.
- Tests that intentionally preserve public API or compatibility behavior.

## Placeholder Heuristic

Use `possible future-use placeholder` only when the evidence is explicit.
Do not infer it from a vague hunch.

Strong signals include:

- A roadmap, TODO, architecture note, or contributor guide describes the
  feature as planned, deferred, or intentionally not wired yet.
- Comments or nearby docs use terms such as `planned`, `future`,
  `placeholder`, `stub`, `deferred`, or `not enforced yet`.
- The code is an extension seam such as an interface, strategy, adapter,
  policy object, feature hook, or noop implementation.
- The current wiring uses a permissive or noop implementation while a stricter
  implementation also exists.
- Tests or examples exercise the dormant path even though production wiring
  does not use it yet.

Decision rule:

- Use `possible future-use placeholder` only when at least one explicit
  documentation signal and one code-structure signal both exist.
- If the code only has a speculative future value but no explicit repo
  evidence, keep the finding as `likely dead` or `keep`.
- Do not recommend removal by default for `possible future-use placeholder`.
  Recommend `keep and document`, `keep until feature rollout`, or
  `revisit after milestone` instead.

## Measuring Line Savings

- For whole files, use `wc -l <file>`.
- Include stale tests or fixtures in the line count only when they exist solely
  to test the dead code being removed.
- For partial blocks, measure only the removable range.
- Record the exact file or line range used for the count.
- Count `keep` findings as `0` removable lines.

## Finding Types

Report the kind of dead code explicitly:

- `orphaned file`
- `unused export`
- `unreachable branch`
- `legacy implementation`
- `stale test or fixture`
- `future-use seam`
- `backward-compatibility seam`
- `documentation cleanup`

If a candidate turns out to be live, mark it as `keep` and explain why it
stays.

## Report Requirements

Use the structure from `references/report-template.md`.

For every finding, include:

- `What`: file, symbol, or branch.
- `Why it is dead or dormant`: concrete evidence, not intuition.
- `Estimated lines saved`: whole-file or block-level count.
- `Recommendation`: why removal helps, or why the code should stay for a
  future rollout.
- `Possible future use if kept`: one short sentence when a credible reuse
  case exists. Use `n/a` when it does not.

Add a short summary above the table:

- Number of `confirmed dead` findings.
- Number of `likely dead` findings.
- Number of `possible future-use placeholder` findings.
- Number of `backward-compatibility keep` findings.
- Number of `past-tense documentation cleanup` findings.
- Total estimated removable lines.

## Output Contract

- Keep the report in Markdown.
- Sort removal-ready findings first, then compatibility keeps, then
  documentation cleanup findings, then near-misses.
- Quote commands and evidence briefly. Do not paste long logs.
- Use `keep` for code that remains solely for compatibility and cite the
  caller, test, comment, or doc that proves the contract still exists.
- If a finding is `possible future-use placeholder`, cite both the doc signal
  and the code signal.
- For docs findings, recommend current-state wording instead of historical
  phrasing.
- If no dead code is found, say so explicitly and list the strongest
  near-misses.
- Do not delete code unless the user explicitly asks for removal after
  reviewing the report.
