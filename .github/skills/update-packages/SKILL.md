---
name: update-packages
description: Audit npm dependencies in package.json, recommend safe updates for this repo, review overrides and vulnerabilities, apply the project's LTS policy, and generate npm update commands. Use when Codex needs to analyze dependency freshness, compare declared versions to installed versions, decide whether overrides should stay, or plan package maintenance work for this project.
---

# Update Packages

Audit `package.json` and produce a repo-safe dependency update plan for this project.

Use `.github/instructions/package-updates.instructions.md` as a required companion for version pinning and compatibility rules.

## Workflow

1. Read `package.json`.
2. Read `.github/instructions/package-updates.instructions.md`.
3. Record `dependencies`, `devDependencies`, `overrides`, and `//overrides`.
4. Run `npm outdated --json` to collect wanted/latest data.
   - If `npm outdated` exits non-zero but returns JSON, treat the JSON as usable output.
5. Run `npm ls --json --depth=0` to capture actual installed versions.
6. For packages that need registry confirmation, run `npm view <package> dist-tags --json` or `npm view <package> versions --json`.
7. Run `npm audit --json`.
   - If `npm audit` exits non-zero because vulnerabilities exist, treat the JSON as usable output.
8. For each major update candidate, run `npm install <package>@<latest> --dry-run 2>&1` and capture any `ERESOLVE` or peer-dependency conflict warnings.
9. Evaluate each direct dependency, dev dependency, and override.
10. Render the report in the required format.

## Apply Repo Rules

- Treat pinned versions as intentional. Do not convert pinned specs to ranges.
- Do not normalize existing valid `^` or `~` ranges to pinned versions unless explicitly asked.
- Verify Next.js and React compatibility before recommending updates to either package.
- Keep `@biomejs/biome` aligned with the `biome.json` `$schema` version when recommending a Biome update.
- Keep `@types/react` and `@types/react-dom` aligned with the installed React major.
- Never recommend a downgrade, even if a downgrade would avoid a vulnerability. Flag it for manual review instead.
- End every actionable report with `npm run purge:install` and `npm run check`.

## Apply LTS Policy

- For Node.js and `@types/node`, recommend only even-numbered majors.
- Show the newest non-LTS major in `Latest` if that is the registry latest.
- Mark such rows `Skip (non-LTS)`.
- Exclude non-LTS majors from safe and major update commands.
- Apply the same rule to any additional package discovered to follow an LTS release cycle, and name that package explicitly.

## Evaluate Versions

- Use the version declared in `package.json` for `Current`.
- For ranged specs like `^4.8.2` or `~4.8.2`, use the declared minimum `4.8.2` as `Current`.
- Use `npm ls --json --depth=0` to compare the installed version to the declared minimum.
- If the installed version is newer than the declared minimum while the declaration still allows it, treat it as a declaration gap and recommend bumping the declared minimum.
- Use registry data to confirm `Latest (Same Major)` and `Latest`.
- Allow `Latest (Same Major)` to be the installed version if it is newer than the declared minimum and still within the same major.
- Bold `Latest` when a major bump is available.

## Evaluate Overrides

- Review every entry in `overrides`.
- Use `//overrides` to understand the current rationale.
- Check whether upstream direct dependency updates make an override unnecessary.
- Recommend `Keep override`, `Remove override`, or `Update override`.
- Explain each override decision briefly, including the relevant parent package, fix, or reason when known.
- If no overrides exist, still include the Overrides section and state that no overrides are configured.

## Render Output

- Produce separate markdown tables for `Dependencies`, `Dev Dependencies`, and `Overrides`.
- Sort each table alphabetically by package name.
- Use the exact columns `| Id | Package | Current | Latest (Same Major) | Latest | Recommendation |`.
- Keep `Id` unique and sequential across the full report.
- Use only these recommendation labels:
  - `Patch/Minor`
  - `Patch/Minor, Vulnerable`
  - `Major available`
  - `Skip (non-LTS)`
  - `Up to date`
  - `Keep override`
  - `Remove override`
  - `Update override`
  - `Pinned`
  - `Flagged`
  - `Vulnerable`
  - `Peer conflict`
- Add concise explanations inline in the Recommendation cell when the label alone is insufficient, especially for overrides, pinned versions, deprecations, vulnerabilities, peer conflicts, and manual-review cases.
- Flag deprecated packages and known vulnerabilities explicitly.
- Use `Patch/Minor, Vulnerable` only when a non-breaking fix exists.
- Use `Vulnerable` when no newer fixed version is available.
- Never omit a direct dependency or dev dependency from the tables, even if `npm outdated` does not list it.

## Check Peer Dependency Conflicts

- For every package where a major update is available, run `npm install <package>@<target-version> --dry-run` and inspect stderr for `ERESOLVE` or `Could not resolve dependency` warnings.
- If a conflict is found, use the `Peer conflict` label (or append `, Peer conflict` to an existing label such as `Pinned, Peer conflict`) and name the blocking package and its peer requirement in the Recommendation cell.
- Include a **Peer dependency conflicts** section after Overrides in the report listing each conflict: the package being updated, the blocker package, its peer requirement, and whether the blocker has a newer version that widens the peer range.
- If no peer conflicts exist, still include the section and state that no conflicts were found.
- Do not include a major update in the commands section if it has an unresolved peer conflict. Instead list it under **Blocked major updates** with the conflict details.

## Provide Commands And Order

- Provide one `npm install` command that batches all safe patch/minor updates.
- Provide one separate `npm install` command per major update that has no unresolved peer conflict.
- For each major update, summarize the breaking-change risk and any stack compatibility concern.
- Provide an `Excluded` list for non-LTS skips.
- Recommend this order:
  1. Apply patch/minor updates in one batch.
  2. Run `npm run purge:install`.
  3. Run `npm run check`.
  4. Review and apply major updates one at a time.
  5. Run `npm run purge:install` and `npm run check` again after major changes.

## Handle Missing Data

- If registry, audit, or install-state commands fail without usable JSON output, report the gap clearly and state how it limits confidence.
- If the repo adds package-management rules elsewhere, follow them in addition to this skill.
