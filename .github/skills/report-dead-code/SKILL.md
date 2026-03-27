---
name: report-dead-code
description: Search a codebase for dead code candidates, verify whether
  they are truly unused, and write a structured dead-code report with
  evidence, reasons, estimated line savings, removal recommendations, and
  an optional note about what the code could still be used for if it is
  kept. Use when auditing stale files, unused exports, unreachable
  branches, legacy feature remnants, cleanup opportunities, or intentional
  future-use placeholders such as deferred RBAC seams.
---

# Report Dead Code

Search for dead code candidates, confirm whether they are truly unused,
and produce a removal-ready Markdown report.

## Workflow

1. Inventory the codebase.
   - Prioritize source roots such as `app`, `components`, `lib`, `scripts`,
     and `tests`.
   - Exclude generated output, dependency folders, caches, and build
     artifacts.
2. Run the helper script to find unreferenced file candidates.
3. Manually validate every candidate before calling it dead.
4. Check whether a candidate is a documented future-use placeholder.
5. Expand beyond orphaned files when needed.
6. Measure removable size.
7. Classify each finding.
8. Produce the final report from the template in
   `references/report-template.md`.

## Helper Script

Start with the helper script for file-level candidates:

```bash
python3 .github/skills/report-dead-code/scripts/find_dead_code_candidates.py \
  --root .
```

What the script does:

- Build a static import graph for `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`,
  and `.cjs` files.
- Resolve path alias patterns from `tsconfig.json`.
- Check `package.json` scripts for `node ./...` or `bash ./...`
  entrypoints.
- Exclude common Next.js route files and test files that are live by
  convention.
- Report files with zero inbound static references and estimated removable
  lines.

What the script does not prove:

- Runtime-only loading.
- Path aliases defined only in `tsconfig.json` files reached via `extends`;
  the helper reads the local config and does not merge inherited configs.
- Reflective or string-based usage.
- CMS-, config-, or plugin-driven entrypoints not visible in source.
- Partial dead code inside otherwise-live files.
- Intentional future-use placeholders.

Treat script output as a seed list, not proof.

## Manual Validation

Validate every finding with targeted searches before reporting it as dead:

- Check for dynamic imports:

  ```bash
  rg -n "import\\(" app components lib scripts
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
  rg -n "legacy|deprecated|obsolete|unused|dead code|TODO" \
    app components lib scripts tests
  ```

- Check for unreachable branches:

  ```bash
  rg -n "if \\(false\\)|&& false|\\? false :|feature flag" \
    app components lib scripts
  ```

- Check for future-placeholder signals:

  ```bash
  rg -n -i "rbac|planned|deferred|future|placeholder|stub|not enforced|not yet implemented|feature flag|todo" \
    app components lib scripts tests docs
  ```

Prefer `confirmed dead` only when the code has no live callers, no route or
tooling convention claims it, and no credible dynamic loading path remains.
Use `likely dead` when evidence is strong but one path is still uncertain.

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
- For partial blocks, measure only the removable range.
- Record the exact file or line range used for the count.

## Finding Types

Report the kind of dead code explicitly:

- `orphaned file`
- `unused export`
- `unreachable branch`
- `legacy implementation`
- `stale test or fixture`
- `future-use seam`

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
- Total estimated removable lines.

## Output Contract

- Keep the report in Markdown.
- Sort findings by confidence first, then by estimated lines saved.
- Quote commands and evidence briefly. Do not paste long logs.
- If a finding is `possible future-use placeholder`, cite both the doc signal
  and the code signal.
- If no dead code is found, say so explicitly and list the strongest
  near-misses.
- Do not delete code unless the user explicitly asks for removal after
  reviewing the report.
