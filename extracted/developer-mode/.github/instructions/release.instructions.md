---
applyTo: '{packages/*/src/**,packages/*/package.json,.changeset/**,CHANGELOG.md,packages/*/CHANGELOG.md}'
---

# Releases & Changesets (AI-only instruction)

This monorepo uses [Changesets](https://github.com/changesets/changesets)
for versioning and publishing both packages independently.

## When a changeset is required

A changeset is **required** for every PR that touches:

- `packages/*/src/**`
- `packages/*/package.json` (any field that ships, including
  `dependencies`, `peerDependencies`, `exports`, `engines`)
- Any file listed in a package's `"files"` array

A changeset is **not** required for:

- Repo-only tooling (`.github/**`, root `tsconfig.json`,
  `biome.json`, `.changeset/config.json`, `vitest.config.ts`)
- Documentation outside packages (`README.md`, `docs/**`,
  `CONTRIBUTING.md`, `RELEASING.md`) — unless that doc change
  ships inside a package (`packages/*/README.md` is published).

CI enforces the presence of a changeset via the
`changesets/action` check.

## How to add a changeset

```bash
npx changeset
```

Pick the packages, choose the bump, write a summary aimed at
**consumers** of the package — that summary becomes the entry in
`CHANGELOG.md`.

## Choosing the bump

For a library with a public API:

- **patch** — bug fix that does not change the public API or
  observable runtime contract.
- **minor** — additive change: new export, new optional prop, new
  optional field on an interface, widened input type, expanded
  `engines` / `peerDependencies` range.
- **major** — anything a consumer can break on: removed or
  renamed export, removed or renamed `exports` map subpath,
  removed or renamed prop, narrowed input or widened output type,
  bumped `peerDependencies` minimum, dropped Node major.

When in doubt, prefer the higher bump — once published you can't
take it back.

## Hard rules

- Never edit `CHANGELOG.md` or any package's `version` field by
  hand. `changeset version` owns both.
- Never delete a changeset under `.changeset/*.md` to "skip" a
  release — open a follow-up PR with a `patch` changeset that
  documents the correction instead.
- One PR may contain multiple changesets when changes span
  packages with different bump levels.
- Changeset summaries are user-facing release notes. Write them
  in present tense, focused on observable behaviour, with no
  internal jargon, no PR numbers, and no commit hashes (the
  template adds those automatically).

See [`RELEASING.md`](../../RELEASING.md) for the full release flow
including how `release.yml` interacts with `changesets/action`.
