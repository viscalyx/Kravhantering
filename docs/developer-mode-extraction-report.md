# Developer Mode extraction — final report

> **Status:** All five phases are complete. The new
> [`viscalyx/developer-mode`](https://github.com/viscalyx/developer-mode)
> repository owns the source and publishes the packages, and this
> PR completes Phase 4 by consuming the published versions
> (`@viscalyx/developer-mode-core@^0.2.1` and
> `@viscalyx/developer-mode-react@^0.1.2`) from npm.

This document records what was done to extract
`@viscalyx/developer-mode-core` and `@viscalyx/developer-mode-react`
out of `viscalyx/Kravhantering` into a standalone repository, and
how the migration was finished.

## Handoff to `viscalyx/developer-mode` (closed out)

The new repository owns the source, tooling, CI workflows, and AI
artifacts on its `main` branch (pushed via `git subtree split`).
All handoff steps that were originally listed here have been
completed:

1. **`package-lock.json` generated and committed** in the new repo
   so `actions/setup-node@v4` (`cache: npm`) and `npm ci` find a
   lockfile.
2. **`NPM_TOKEN` secret configured** with publish rights to the
   `@viscalyx` scope; `release.yml` runs successfully.
3. **`@johlju` is the code owner** (committed `.github/CODEOWNERS`);
   branch protection on `main` requires the `CI / check` and
   `CI / changeset` jobs.
4. **First changeset added and "Version Packages" PR merged**, then
   `changesets/action` published both packages to npm with
   `access: "public"`.
5. **Verified on npm**:

   ```bash
   npm view @viscalyx/developer-mode-core version   # → 0.2.1
   npm view @viscalyx/developer-mode-react version  # → 0.1.2
   ```

   `@viscalyx/developer-mode-react@0.1.2` runtime-depends on
   `@viscalyx/developer-mode-core@^0.2.1`.
6. **Kravhantering Phase 4** is finished in this PR — see the
   [Phase 4 section](#phase-4--kravhantering-consumes-published-packages-)
   below.

### Optional follow-ups in the new repo

- Wire up GitHub Discussions (the issue-template `config.yml`
  links to it).
- Enable Dependabot alerts and CodeQL on the repository settings
  page (the workflow file is committed; Dependabot config lives at
  `.github/dependabot.yml`).
- Decide whether to publish the React package's `peerDependencies`
  range for `react`/`react-dom` more strictly; currently `^19.0.0`.

## What was extracted

Two packages, both ESM-only, targeting Node ≥ 22. Initial publish
was `0.1.x`; the current published versions are
`@viscalyx/developer-mode-core@0.2.1` and
`@viscalyx/developer-mode-react@0.1.2`.

<!-- markdownlint-disable MD013 -->

| Package | Description |
| --- | --- |
| `@viscalyx/developer-mode-core` | Framework-agnostic helpers, marker functions, label-derivation pipeline, copy-text and chip-label formatters. No React dependency. |
| `@viscalyx/developer-mode-react` | React 19 provider + overlay built on the core. `react`/`react-dom` are peer deps. Depends on `@viscalyx/developer-mode-core ^0.2.1`. |

<!-- markdownlint-enable MD013 -->

Both packages expose:

- A `.` export (full implementation).
- A `./noop` subpath whose API is identical to the main entry but
  whose behaviour is a no-op — for SSR-disabled or feature-flagged
  builds.
- A `./package.json` export so tools can read metadata.

## Phase-by-phase audit

### Phase 1 — stage packages + monorepo tooling ✅

Staged at `extracted/developer-mode/` (now removed in Phase 5,
present on the `main` branch of `viscalyx/developer-mode`):

- Root `package.json` (npm workspaces, Changesets, tsdown, Vitest,
  Biome, markdownlint-cli2, TypeScript), `tsconfig.base.json`,
  solution-style root `tsconfig.json`, `biome.json`
  (with `"root": false`), `.biomeignore`, `.editorconfig`,
  `.gitattributes`, `.gitignore`, `.nvmrc`, root `vitest.config.ts`,
  `vitest.setup.ts`.
- `.changeset/{config.json,README.md}` — independent versioning,
  `access: "public"`, `baseBranch: "main"`.
- `packages/developer-mode-core/` — ported `src/{index.ts,noop.ts}`,
  ESM-only `package.json` v0.1.0 with `exports` map (`.`, `./noop`,
  `./package.json`, `"types"` first), `tsdown.config.ts`,
  `tsconfig.json`, smoke test, README.
- `packages/developer-mode-react/` — ported
  `src/{index.tsx,noop.tsx}`, ESM-only `package.json` v0.1.0 with
  React 19 peer deps, depends on the core via `^0.1.0`,
  `tsdown.config.ts`, `tsconfig.json`, smoke test, README.
- Security-bumped `vitest` to `^2.1.9` and `happy-dom` to
  `^20.8.9` after `gh-advisory-database` flagged advisories on the
  initially planned versions, before any vulnerable version was
  committed.

### Phase 2 — community/docs + AI artifacts ✅

Also staged at `extracted/developer-mode/`, now on the new repo's
`main` branch:

- Community/docs: `LICENSE`, `CODE_OF_CONDUCT.md` (copied
  verbatim), `README.md`, `CONTRIBUTING.md`, `RELEASING.md` (incl.
  the ESM-only policy and how to flip to dual-output if ever
  needed), `SECURITY.md`, `docs/architecture.md`,
  `docs/workflows.md`.
- `.github/`: `CODEOWNERS` (`* @johlju`), `dependabot.yml`,
  `PULL_REQUEST_TEMPLATE.md`, `ISSUE_TEMPLATE/{bug_report,
  feature_request,config}.yml`, `copilot-instructions.md`.
- `.github/workflows/`: `ci.yml` (full local quality bar +
  changeset-presence gate), `codeql.yml`, `release.yml`
  (`changesets/action@v1`).
- `.github/instructions/` (8 files): `ai-instruction-authoring`
  carried verbatim; `markdown`, `node-version`, `package-updates`,
  `tests` carried + trimmed; new `release`, `package-exports`,
  `monorepo-structure`.
- `.github/skills/` (6 directories, copied as-is): `add-override`,
  `extract-coderabbit-ai-review-comments`, `report-dead-code`,
  `review-comments-validator`, `sync-codex-skills`,
  `update-packages`.

### Phase 3 — split out and push ✅ (done by user)

```bash
git subtree split --prefix=extracted/developer-mode \
  copilot/create-implementation-plan-for-packages -b devmode-main
git checkout devmode-main
git push git@github.com:viscalyx/developer-mode.git devmode-main:main
```

103 objects, 62.50 KiB. The new repo now has the full extraction
on its `main` branch.

### Phase 4 — Kravhantering consumes published packages ✅

Done in this PR. Both packages are now installed from npm:

- `@viscalyx/developer-mode-core@^0.2.1`
- `@viscalyx/developer-mode-react@^0.1.2` (peer-depends on
  `react`/`react-dom` `^19.0.0`, runtime-depends on
  `@viscalyx/developer-mode-core@^0.2.1`)

Concrete changes applied:

- `package.json` — replaced `file:packages/...` entries with the
  published semver ranges above.
- `tsconfig.json` — removed the `@viscalyx/developer-mode-core` and
  `@viscalyx/developer-mode-react` entries from `paths`.
- `vitest.config.ts` — removed the two source-tree aliases; tests
  now resolve the packages from `node_modules` like any other
  dependency.
- `next.config.ts` — kept the developer-mode no-op swap, but
  switched both the Turbopack `resolveAlias` and the legacy
  webpack `config.resolve.alias` blocks to alias each package to
  its published `/noop` subpath export
  (`@viscalyx/developer-mode-core/noop`,
  `@viscalyx/developer-mode-react/noop`) instead of the deleted
  in-repo source files.
- Deleted `packages/developer-mode-core/`,
  `packages/developer-mode-react/`, and the now-empty `packages/`
  directory.

Verified locally with the new lockfile:

- `npm install` — resolves cleanly, two packages changed.
- `npm run type-check` — passes.
- `npm run lint` — passes (no errors).
- `npm run lint:md` — passes.
- `npm run test` — 1558 passed / 10 skipped, including
  `tests/unit/developer-mode.test.ts`, which now imports from the
  published `@viscalyx/developer-mode-core`.
- `BUILD_TARGET=prod NEXT_PUBLIC_SITE_URL=… npm run build` —
  Turbopack production build succeeds with the no-op swap
  pointing at the published `/noop` exports.

### Phase 5 — delete `extracted/developer-mode/` from Kravhantering ✅

Done in this PR, along with reverting the parent-repo isolation
changes that previously kept Kravhantering's tooling away from the
staged tree:

- Removed `extracted/` from `.biomeignore`.
- Removed `extracted/**` from `cspell.jsonc` `ignorePaths`.
- Removed `!extracted/**` from `.markdownlint-cli2.jsonc` globs.
- Removed `extracted` from the root `tsconfig.json` `exclude`.
- Removed `extracted/**` from `vitest.config.ts` `exclude`.

Verified: `npm run lint` and `npm run lint:md` still pass cleanly
without those entries.

## Deviations from the original plan

These were called out in the staging PRs and remain noted here for
the record:

1. **`ai-instruction-authoring` skill not carried over.** The plan
   listed an `ai-instruction-authoring` skill, but only the
   matching instruction file exists in this repo's
   `.github/skills/`. The instruction file was carried over; no
   skill directory was invented. If a skill is genuinely wanted
   later, it needs to be authored fresh in the new repo.
2. **Biome version bump.** The new repo's `biome.json` uses
   `^2.4.13` rather than the originally drafted `^1.9.4`. This
   matched the parent repo's Biome at staging time and let the
   nested config use Biome 2.x's `"root": false` field so it did
   not collide with the parent's root config while the staged tree
   still lived under `extracted/`. The new repo can keep `2.x` —
   it does not need to track Kravhantering's version any more.
3. **Vitest / happy-dom security bumps.** `vitest` `^2.1.9` and
   `happy-dom` `^20.8.9`, up from the originally drafted `2.1.8`
   / `15.11.7`, in response to advisories surfaced before commit.

## Files changed in Kravhantering after the extraction

- `extracted/developer-mode/**` — deleted in Phase 5.
- `.biomeignore`, `cspell.jsonc`, `.markdownlint-cli2.jsonc`,
  `tsconfig.json`, `vitest.config.ts` — Phase 5 reverted the
  temporary isolation entries that pointed at `extracted/`.
- `packages/developer-mode-core/`,
  `packages/developer-mode-react/`, and the now-empty `packages/`
  directory — deleted in Phase 4.
- `package.json` — Phase 4 swapped the `file:packages/...` entries
  for the published semver ranges.
- `tsconfig.json`, `vitest.config.ts`, `next.config.ts` — Phase 4
  removed the in-repo source aliases and updated the
  developer-mode no-op swap to point at the packages' `/noop`
  subpath exports.
- `docs/developer-mode-extraction-report.md` — this report.

The `@viscalyx/developer-mode-*` consumers
(`components/DeveloperModeProvider.tsx`,
`lib/developer-mode-markers.ts`, `tests/unit/developer-mode.test.ts`)
are unchanged at the call site — they now resolve to the published
packages from `node_modules` instead of the in-repo workspaces.
