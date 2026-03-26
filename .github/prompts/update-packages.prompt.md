---
agent: agent
description: 'Analyze package.json, recommend safe updates following the project LTS policy, and provide update commands'
---

# Update Packages

Check all dependencies and devDependencies in `package.json` for available updates.

## LTS Policy

Only recommend **LTS (Long-Term Support)** versions for packages that follow an LTS release cycle. Do **not** recommend upgrading to non-LTS releases.

### Packages with LTS release cycles in this project

| Package | LTS Rule | How to identify LTS |
| --- | --- | --- |
| **Node.js** / `@types/node` | Even-numbered majors only (20, 22, 24, 26…) | Odd-numbered majors (21, 23, 25…) are short-lived "Current" releases — skip them |

When a non-LTS version is the latest available, the table should show it but the **Recommendation** column must say **Skip (non-LTS)** and the safe/major update commands must exclude it.

If you discover additional packages with LTS release cycles during analysis, apply the same policy and note them.

## Steps

1. Run `npm run purge:install` to hydrate `node_modules` using this repo's full install flow. Verify the install succeeds before continuing to `npm audit --json`, `npm ls <vulnerable-package> --json`, or any `npm install --dry-run` checks.

2. Run `npm outdated --json` to gather version data. For packages needing more detail, use `npm view <package> versions --json`.

`npm outdated` only reports packages where the installed version differs from the wanted/latest version. It will **not** list a package when the installed version already satisfies `wanted` — even if `package.json` declares an older range. To catch these gaps:
- After collecting `npm outdated` results, run `npm ls --json --depth=0` (or `npm ls <package> --json` selectively) to obtain the **actual installed version** of every dependency.
   - Compare each installed version against the version range in `package.json`. If the installed version exceeds the declared range minimum (e.g., `4.8.3` installed but `package.json` says `^4.8.2`), treat this as a declaration gap and recommend bumping the declared minimum in `package.json` (not as a faulty install).
   - The **Current** column must always reflect the version declared in `package.json` (the range minimum, e.g., `4.8.2` from `^4.8.2`).
   - The **Latest (Same Major)** and **Latest** columns must show the highest available version — which may be the **installed** version if it is newer than what `package.json` declares, or a yet-newer registry version. Always verify against the registry with `npm view <package> dist-tags --json` or `npm view <package> versions --json`.

3. Evaluate whether each `overrides` entry is still needed:
   - Check if upstream packages now include the required fixes/versions.
   - Recommend removing overrides that are no longer necessary.
   - Clearly list which overrides should be kept and why.
   - For overrides that should be kept, check if they can be updated to newer versions.

4. Audit all packages for known vulnerabilities using `npm audit --json` against the successfully hydrated install from step 1.

5. For each transitive vulnerability reported by `npm audit`:
   - Run `npm ls <vulnerable-package> --json` against the hydrated install to identify the dependency path(s).
   - Check if any parent dependency in the path has a patch/minor update that would pull in the fixed version — cross-reference with the main update tables. If yes, skip the override.
   - If no parent update resolves it, determine the minimum patched version from the advisory data.
   - Run `npm install --dry-run` with the override applied to confirm compatibility.
   - Group multiple advisories for the same package into one override recommendation.
   - Skip vulnerabilities that are disputed, withdrawn, or have no fix version available.
   - Propose an `Add override` for each viable fix. If no new overrides are proposed, state that no transitive vulnerabilities require overrides.

6. For each major update candidate, run `npm install <package>@<latest> --dry-run 2>&1` after the successful `npm run purge:install` hydration and capture any `ERESOLVE` or peer-dependency conflict warnings. If a conflict is found, use the `Peer conflict` label and name the blocking package and its peer requirement.

7. Present a markdown table for all **Dependencies**, **Dev Dependencies** and **Overrides** (sorted alphabetically):

| Id | Package | Current | Latest (Same Major) | Latest | Recommendation |
| --- | --- | --- | --- | --- | --- |

Where **Recommendation** is one of:
- **Patch/Minor** — safe update, no breaking changes
- **Patch/Minor, Vulnerable** — Current version is vulnerable; a non-breaking patch/minor update is available, so update promptly to remediate
- **Major available** — new major version, review changelog
- **Skip (non-LTS)** — latest major is a non-LTS release, do not update
- **Up to date** — already latest and have no known vulnerabilities
- **Keep override** — for entries in `overrides` that should be retained (with explanation)
- **Remove override** — for entries in `overrides` that can be removed (with explanation)
- **Update override** — for entries in `overrides` that should be updated to a newer version (with explanation)
- **Pinned** — for packages with pinned versions (no `^`/`~`) that should be reviewed for updates (with explanation)
- **Flagged** — for packages that are deprecated or have known vulnerabilities (with explanation)
- **Vulnerable** — packages that have known vulnerabilities without newer versions available (with explanation of the vulnerabilities and recommended actions). Unlike **Patch/Minor, Vulnerable**, this means no fix version is currently available.
- **Peer conflict** — a major update is blocked by a peer dependency conflict; name the blocking package and its peer requirement
- **Add override** — a new override should be added to resolve a transitive vulnerability; include the vulnerable package, recommended pinned version, advisory reference (GHSA or CVE), and parent dependency path

Bold the **Latest** column when a major bump is available. Flag deprecated or vulnerable packages.
Id is a unique identifier for each package (e.g. `1`, `2`, `3`…), to allow simple reference in further prompts.
Never recommend updating to a lower version even if it would resolve vulnerabilities, as that can cause other issues. Instead, flag it and recommend manual review.

Include a **Proposed overrides** section after the Overrides table listing each new override recommendation with: package name and pinned version, advisory reference, parent dependency path, and whether the override was verified compatible via `--dry-run`. If no new overrides are proposed, state that no transitive vulnerabilities require overrides.

Include a **Peer dependency conflicts** section listing each conflict: the package being updated, the blocker package, its peer requirement, and whether the blocker has a newer version that widens the peer range. If no peer conflicts exist, state that none were found.

8. Provide update commands:
   - **Safe updates** — single `npm install` for all patch/minor updates
   - **Major updates** — separate `npm install` per package with breaking change summary and compatibility notes for the stack (Next.js, React, TypeScript, Tailwind, etc.). Do not include major updates with unresolved peer conflicts — list those under **Blocked major updates** instead.
   - **New override commands** — if new overrides were proposed, list each override to apply via the `add-override` skill (package name, pinned version, and reason)
   - **Excluded** — list any packages skipped due to non-LTS policy with a brief explanation

9. Suggest update order:
   1. Patch/minor updates (batch).
   2. Run `npm run purge:install`.
   3. Run `npm run check`.
   4. Run `npm audit`.
   5. Apply recommended new overrides (using `add-override` for each).
   6. Run `npm run purge:install`.
   7. Run `npm run check`.
   8. Run `npm audit`.
   9. Major updates one at a time.
   10. Run `npm run purge:install`.
   11. Run `npm run check`.
   12. Run `npm audit`.
