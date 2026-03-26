---
applyTo: 'package.json'
agent: agent
description: 'Analyze package.json, recommend safe updates following the project LTS policy, and provide update commands'
---

# Update Packages

- Audit `dependencies`, `devDependencies`, `overrides`, and `//overrides` in `package.json`.

## LTS Policy

- Recommend only LTS versions for packages with LTS release cycles.
- Show the registry latest even when it is non-LTS.
- If latest is non-LTS: Recommendation = `Skip (non-LTS)`; exclude it from safe and major update commands.
- Apply the same rule to any additional package discovered to follow an LTS release cycle.

### Packages with LTS release cycles in this project

| Package | LTS rule | How to identify LTS |
| --- | --- | --- |
| `Node.js` / `@types/node` | Even-numbered majors only | Skip odd-numbered majors |

## Steps

1. Run `npm run purge:install`. Continue only after it succeeds.
2. Run `npm outdated --json`.
   - Run `npm ls --json --depth=0` after `npm outdated`.
   - Treat a newer installed version within the declared range as a declaration gap.
   - Set `Current` to the declared minimum in `package.json`.
   - Set `Latest (Same Major)` and `Latest` to the highest available versions.
   - Confirm registry data with `npm view <package> dist-tags --json` or `npm view <package> versions --json`.
3. Review `overrides`.
   - Remove overrides made unnecessary by upstream updates.
   - Keep required overrides and update them when a newer fixed version exists.
4. Run `npm audit --json`.
5. For each transitive vulnerability:
   - Run `npm ls <vulnerable-package> --json`.
   - Skip override proposals when a parent dependency patch/minor update resolves the issue.
   - Otherwise determine the minimum patched version.
   - Run `npm install --dry-run` with the override applied.
   - Group multiple advisories for the same package into one recommendation.
   - Skip disputed, withdrawn, and no-fix advisories.
   - Use `Add override` for viable fixes.
6. For each major update candidate, run `npm install <package>@<latest> --dry-run 2>&1` and capture `ERESOLVE` or peer-dependency warnings.

## Output

- Render `Dependencies`, `Dev Dependencies`, and `Overrides` tables sorted alphabetically.
- Use columns `| Id | Package | Current | Latest (Same Major) | Latest | Recommendation |`.
- Use these recommendation labels only:
  - `Patch/Minor`: safe update, no breaking changes
  - `Patch/Minor, Vulnerable`: non-breaking fix available for a vulnerable current version
  - `Major available`: new major version available
  - `Skip (non-LTS)`: latest major is non-LTS
  - `Up to date`: latest and no known vulnerabilities
  - `Keep override`: keep the current override
  - `Remove override`: remove the current override
  - `Update override`: update the current override
  - `Pinned`: direct dependency is intentionally pinned
  - `Flagged`: deprecated or otherwise needs manual review
  - `Vulnerable`: vulnerable and no newer fixed version is available
  - `Peer conflict`: major update blocked by a peer requirement
  - `Add override`: add a new override for a transitive vulnerability
- Bold the `Latest` cell when a major bump is available.
- Keep `Id` unique and sequential.
- Never recommend downgrades. Flag them for manual review.
- Add a `Proposed overrides` section after the Overrides table.
  - Include package name, pinned version, advisory reference, parent dependency path, and `--dry-run` compatibility result.
  - If no new overrides are needed, state that none are required.
- Add a `Peer dependency conflicts` section after `Proposed overrides`.
  - Include the package being updated, blocker package, peer requirement, and whether a newer blocker version widens the range.
  - If no conflicts exist, state that none were found.

## Commands

- Provide one `npm install` command for safe patch/minor updates.
- Provide one separate `npm install` command per major update with no unresolved peer conflict.
- Summarize breaking-change risk and stack-compatibility risk for each major update.
- Add a `New override commands` section when new overrides are recommended.
- Add an `Excluded` list for non-LTS skips.
- List unresolved peer conflicts under `Blocked major updates`.

## Update Order

1. Apply patch/minor updates in one batch.
2. Run `npm run purge:install`.
3. Run `npm run check`.
4. Run `npm audit`.
5. Apply recommended new overrides with `add-override`.
6. Run `npm run purge:install`.
7. Run `npm run check`.
8. Run `npm audit`.
9. Review and apply major updates one at a time.
10. Run `npm run purge:install`.
11. Run `npm run check`.
12. Run `npm audit`.
