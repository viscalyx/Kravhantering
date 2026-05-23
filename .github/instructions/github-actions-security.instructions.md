---
applyTo: "{.github/workflows/*.yml,.github/workflows/*.yaml,.github/dependabot.yml,tests/unit/github-actions-workflow-security.test.ts}"
---

# GitHub Actions Security

## Action References

- Pin every active external `uses:` reference to a full 40-character commit SHA.
- Add the upstream release tag as a same-line trailing comment, for example
  `uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6`.
- Resolve tag refs through the upstream repository before pinning. For annotated
  tags, use the target commit SHA, not the tag object SHA.
- Do not rewrite local action refs (`./`, `../`), `docker://` refs, or commented
  examples.
- Add `persist-credentials: false` to `actions/checkout` steps unless the job
  explicitly needs the checked-out GitHub token.

## Dependabot

- Keep `.github/dependabot.yml` configured for the `github-actions` ecosystem at
  directory `/`.
- When adding or renaming workflow files, keep
  `tests/unit/github-actions-workflow-security.test.ts` passing.
