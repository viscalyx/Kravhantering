# Releasing

This repo uses [Changesets](https://github.com/changesets/changesets)
to version and publish both packages **independently**.

- Both packages are **ESM-only**. There is no CJS output.
- Both packages target Node ≥ 22.
- Both packages publish to npm with `"access": "public"`.

## Author flow (every PR)

1. Make your change.
2. Run `npx changeset` and pick the affected packages and bump
   level (see "Choosing the bump" below).
3. The CLI writes a Markdown file under `.changeset/`. Commit it
   alongside your code change.
4. CI (`ci.yml` → `Verify changeset present` job) fails the PR if
   `packages/*/src/**` or a published `package.json` field changed
   without a matching changeset.

### Choosing the bump

For a library with a public API:

| Bump    | Use for                                                                  |
|---------|--------------------------------------------------------------------------|
| `patch` | Bug fix; no public-API or runtime-contract change.                       |
| `minor` | New export, new optional prop, expanded `engines` / `peerDependencies`.  |
| `major` | Removed/renamed export or subpath, changed prop signatures, dropped Node major, narrowed peer-dep range. |

When in doubt, prefer the higher bump.

## Maintainer flow (after merge to `main`)

1. `release.yml` runs on every push to `main`.
2. The `changesets/action` step inspects the pending changesets.
3. If there are any, it opens (or updates) a "Version Packages" PR
   that:
   - Consumes all pending changeset files.
   - Bumps the matching `package.json` versions.
   - Updates each package's `CHANGELOG.md`.
4. Review and merge the Version Packages PR. The next push to
   `main` runs `release.yml` again, sees no pending changesets,
   and runs `npm run release` (`npm run build && changeset publish`).
5. Each newly bumped package is published to npm under
   `@viscalyx/...` with public access.
6. `changesets/action` creates the GitHub Release and tags
   per-package.

## Hard rules

- **Never edit `CHANGELOG.md` or any package's `version` field by
  hand.** Changesets owns both.
- **Never delete a changeset under `.changeset/*.md`** to "skip" a
  release. Open a follow-up PR with a `patch` changeset that
  documents the correction instead.
- **Never publish manually** (`npm publish` from a workstation).
  All publishes go through `release.yml`.

## ESM-only policy

Both packages launch as ESM-only. This is a deliberate choice:

- Halves published bytes vs a dual ESM/CJS build.
- Avoids the [dual-package
  hazard](https://nodejs.org/api/packages.html#dual-package-hazard).
- Every supported runtime — Node ≥ 22, Next.js 16, React 19, all
  modern bundlers — loads ESM natively.

If a CJS consumer ever appears and the demand is real:

1. Open a discussion or issue first; this is a maintainer-level
   decision, not an ad-hoc PR.
2. The change is a **minor** bump for both packages: flip
   `tsdown` `format` to `['esm', 'cjs']`, add a `"require"`
   condition to every `exports` block, add `"main"` for legacy
   resolvers.
3. Update this section of `RELEASING.md` so future contributors
   know the policy changed.

## Required secrets

The `release.yml` workflow expects two repository secrets:

- `GITHUB_TOKEN` — provided automatically by Actions.
- `NPM_TOKEN` — an automation token from npmjs.com with
  publish rights to the `@viscalyx` scope. Stored as a repository
  secret with no environment scoping.

## Initial publish

The first release of each package is `0.1.0`. The Version
Packages PR will reflect that bump from the placeholder version
once the first changeset lands. Until both packages are published
at least once, **do not** merge the Version Packages PR before
`NPM_TOKEN` is configured — the publish step will fail and leave
the tags inconsistent with npm.
