# Changesets

This directory holds [changesets](https://github.com/changesets/changesets).
A changeset is a small Markdown file that describes a change to one or more
packages and the SemVer bump it warrants. Changesets are consumed by
`changeset version` to produce changelogs and bump `package.json` versions.

## Adding a changeset

```bash
npx changeset
```

Pick the affected packages, choose `patch` / `minor` / `major`, and write a
short summary aimed at consumers of the package — that summary becomes the
release note in `CHANGELOG.md`.

## Rules

- Every PR that changes published files in `packages/*/src/**` or a package
  `package.json` MUST include a changeset.
- Never edit `CHANGELOG.md` or the `version` field of a package by hand —
  Changesets owns both.
- Adding a new export = `minor`. Removing or renaming an export = `major`.
- Bug fixes that do not change the public API = `patch`.

See [`RELEASING.md`](../RELEASING.md) for the full release flow.
