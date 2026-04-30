# Workflows

This repo runs three GitHub Actions workflows. Each one is small
and single-purpose. **If you add or change a workflow, update
this file in the same PR.**

## `ci.yml`

Runs on every push to `main` and every pull request targeting
`main`.

### `check` job

The full local quality bar, in this order:

1. `npm ci`
2. `npm run type-check`
3. `npm run format:check`
4. `npm run lint`
5. `npm run lint:md`
6. `npm run build`
7. `npm run test`

Fails fast on the first non-zero step. Mirrors `npm run check`
locally.

### `changeset` job

Pull-request-only. Runs `npx changeset status --since=origin/main`
and fails if the PR touches `packages/*/src/**` or a published
`package.json` field without a matching changeset under
`.changeset/`.

Repo-tooling-only PRs (workflow tweaks, `biome.json` edits,
top-level docs) pass this job cleanly because no package change is
detected.

## `codeql.yml`

GitHub's standard CodeQL analysis for the `javascript-typescript`
language. Runs on:

- Pushes to `main`.
- Pull requests targeting `main`.
- Weekly on Mondays at 06:00 UTC (`schedule: cron: "0 6 * * 1"`)
  to catch newly disclosed query-pack issues against unchanged
  code.

Findings show up under the **Security → Code scanning** tab.

## `release.yml`

Runs on every push to `main` and orchestrates Changesets.

1. `npm ci` and `npm run build` and `npm run test`.
2. `changesets/action@v1` runs.
   - **If pending changesets exist**, it opens (or updates) a
     "Version Packages" PR that bumps `package.json` versions
     and rewrites `CHANGELOG.md` files.
   - **If no pending changesets exist**, it runs `npm run release`
     (`npm run build && changeset publish`), which publishes any
     newly bumped packages to npm and creates GitHub Releases /
     tags.

### Required secrets

- `GITHUB_TOKEN` — provided automatically by Actions.
- `NPM_TOKEN` — automation token from npmjs.com with publish
  rights to the `@viscalyx` scope. Stored as a repository secret.

See [`RELEASING.md`](../RELEASING.md) for the full author and
maintainer flow.
