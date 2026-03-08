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

1. Run `npm outdated --json` to gather version data. For packages needing more detail, use `npm view <package> versions --json`.

`npm outdated` only reports packages where the installed version differs from the wanted/latest version. It will **not** list a package when the installed version already satisfies `wanted` — even if `package.json` declares an older range. To catch these gaps:
- After collecting `npm outdated` results, run `npm ls --json --depth=0` (or `npm ls <package> --json` selectively) to obtain the **actual installed version** of every dependency.
   - Compare each installed version against the version range in `package.json`. If the installed version exceeds the declared range minimum (e.g., `4.8.3` installed but `package.json` says `^4.8.2`), treat this as a declaration gap and recommend bumping the declared minimum in `package.json` (not as a faulty install).
   - The **Current** column must always reflect the version declared in `package.json` (the range minimum, e.g., `4.8.2` from `^4.8.2`).
   - The **Latest (Same Major)** and **Latest** columns must show the highest available version — which may be the **installed** version if it is newer than what `package.json` declares, or a yet-newer registry version. Always verify against the registry with `npm view <package> dist-tags --json` or `npm view <package> versions --json`.

2. Evaluate whether each `overrides` entry is still needed:
   - Check if upstream packages now include the required fixes/versions.
   - Recommend removing overrides that are no longer necessary.
   - Clearly list which overrides should be kept and why.
   - For overrides that should be kept, check if they can be updated to newer versions.

3. Audit all packages for known vulnerabilities using `npm audit --json`

4. Present a markdown table for all **Dependencies**, **Dev Dependencies** and **Overrides** (sorted alphabetically):

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
- **Vulnerable** - packages that have known vulnerabilities without newer versions available (with explanation of the vulnerabilities and recommended actions). Unlike **Patch/Minor, Vulnerable**, this means no fix version is currently available.

Bold the **Latest** column when a major bump is available. Flag deprecated or vulnerable packages.
Id is a unique identifier for each package (e.g. `1`, `2`, `3`…), to allow simple reference in further prompts.
Never recommend updating to a lower version even if it would resolve vulnerabilities, as that can cause other issues. Instead, flag it and recommend manual review.

5. Provide update commands:
   - **Safe updates** — single `npm install` for all patch/minor updates
   - **Major updates** — separate `npm install` per package with breaking change summary and compatibility notes for the stack (Next.js, React, TypeScript, Tailwind, etc.)
   - **Excluded** — list any packages skipped due to non-LTS policy with a brief explanation

6. Suggest update order: patch/minor first (batch), then major one at a time.

7. After applying updates, run `npm run purge:install` to clean `node_modules`, `package-lock.json` and do a fresh install.

8. Run `npm run check` to verify nothing is broken.
