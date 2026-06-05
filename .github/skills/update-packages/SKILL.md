---
name: update-packages
description: Audit npm dependencies in package.json, recommend safe updates for this repo, review overrides and vulnerabilities, apply the project's LTS policy, and generate npm update commands. Use when Codex needs to analyze dependency freshness, compare declared versions to installed versions, decide whether overrides should stay, or plan package maintenance work for this project.
---

# Update Packages

- Always run the commands outside the sandbox, otherwise it fails.
- Audit `package.json` for outdated or installed-version mismatches and vulnerabilities.
- Recommend repo-safe updates and npm update commands.
- Review `overrides` and justify each keep, remove, or update decision.
- Apply the project's LTS policy and compatibility rules from `.github/instructions/package-updates.instructions.md`.
- Output a clear, minimal update plan.

## Workflow

1. Read `package.json`.
2. Read `.github/instructions/package-updates.instructions.md`.
3. Record `dependencies`, `devDependencies`, `overrides`, `//overrides`,
   and `allowScripts`.
4. Run `npm run purge:install` to hydrate `node_modules` using this repo's full install flow. Verify it succeeds before continuing.
5. Run `npm approve-scripts --allow-scripts-pending` to capture packages with
   install scripts not yet covered by `allowScripts`.
   - This command is read-only. If it reports pending packages, keep the output
     and include pinned approval recommendations in the report.
6. Run `npm outdated --json` to collect wanted/latest data.
   - If `npm outdated` exits non-zero but returns JSON, treat the JSON as usable output.
7. Run `npm ls --json --depth=0` to capture actual installed versions.
8. For packages that need registry confirmation, run `npm view <package> dist-tags --json` or `npm view <package> versions --json`.
9. Run `npm audit --json`.
   - If `npm audit` exits non-zero because vulnerabilities exist, treat the JSON as usable output.
10. For each major update candidate, run `npm install <package>@<latest> --dry-run 2>&1` and capture any `ERESOLVE` or peer-dependency conflict warnings.
11. For each transitive vulnerability reported by `npm audit`:
   a. Run `npm ls <vulnerable-package> --json` to identify the dependency path(s).
   b. Check if any parent dependency in the path has a patch/minor update that would pull in the fixed version — cross-reference with the main update tables. If yes, skip the override.
   c. If no parent update resolves it, determine the minimum patched version from the advisory data.
   d. Run `npm install --dry-run` with the override applied to confirm compatibility.
   e. Group multiple advisories for the same package into one override recommendation.
   f. Skip vulnerabilities that are disputed, withdrawn, or have no fix version available.
12. Evaluate each direct dependency, dev dependency, override, and install-script approval.
13. Render the report in the required format.

## Apply Repo Rules

- Treat pinned versions as intentional. Do not convert pinned specs to ranges.
- Do not normalize existing valid `^` or `~` ranges to pinned versions unless explicitly asked.
- Verify Next.js and React compatibility before recommending updates to either package.
- Keep `@biomejs/biome` aligned with the `biome.json` `$schema` version when recommending a Biome update.
- Keep `@types/react` and `@types/react-dom` aligned with the installed React major.
- Never recommend a downgrade, even if a downgrade would avoid a vulnerability. Flag it for manual review instead.

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

## Evaluate Install-Script Approvals

- Review every entry in `allowScripts`.
- Use `npm approve-scripts --allow-scripts-pending` output to detect packages
  with install scripts that are not yet explicitly approved or denied.
- Prefer pinned approvals, for example `@swc/core@1.15.32`, so the approval
  tracks the exact version reviewed.
- Do not recommend `npm approve-scripts --all` unless the user explicitly asks.
- For each pending package, briefly state why the install script is expected or
  why it needs manual review.
- If no pending install scripts exist, still include the Install-script
  approvals section and state that no pending approvals were found.

### Propose New Overrides for Transitive Vulnerabilities

- From the `npm audit --json` output, filter for vulnerabilities where the vulnerable package is not a direct dependency (it is transitive).
- For each transitive vulnerability, use the dependency path from workflow step 10 to determine whether it can be resolved:
  - If a parent dependency patch/minor update resolves it, do not propose an override — the main update tables already cover it.
  - If no parent update resolves it and a fixed version exists, propose an `Add override` with the exact patched version.
  - If no fixed version exists, flag it under `Vulnerable` in the main tables for manual review — do not propose an override.
- Add rows to the Overrides table with the `Add override` label. Include in the Recommendation cell: the vulnerable package, the recommended pinned version, the advisory reference (GHSA or CVE), and the parent dependency that pulls it in.
- After the Overrides table, include a Proposed overrides section listing each recommendation with:
  - Package name and recommended pinned version.
  - Advisory reference.
  - Parent dependency path.
  - Whether the override was verified compatible via `--dry-run`.
- If no new overrides are proposed, state that no transitive vulnerabilities require overrides.

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
  - `Add override`
- Add concise explanations inline in the Recommendation cell when the label alone is insufficient, especially for overrides, pinned versions, deprecations, vulnerabilities, peer conflicts, and manual-review cases.
- Flag deprecated packages and known vulnerabilities explicitly.
- Use `Patch/Minor, Vulnerable` only when a non-breaking fix exists.
- Use `Vulnerable` when no newer fixed version is available.
- Never omit a direct dependency or dev dependency from the tables, even if `npm outdated` does not list it.

## Check Peer Dependency Conflicts

- For every package where a major update is available, run `npm install <package>@<target-version> --dry-run` and inspect stderr for `ERESOLVE` or `Could not resolve dependency` warnings.
- If a conflict is found, use the `Peer conflict` label (or append `, Peer conflict` to an existing label such as `Pinned, Peer conflict`) and name the blocking package and its peer requirement in the Recommendation cell.
- Include a Peer dependency conflicts section after Overrides in the report listing each conflict: the package being updated, the blocker package, its peer requirement, and whether the blocker has a newer version that widens the peer range.
- If no peer conflicts exist, still include the section and state that no conflicts were found.
- Do not include a major update in the commands section if it has an unresolved peer conflict. Instead list it under Blocked major updates with the conflict details.

## Check Install-Script Approvals

- Include an Install-script approvals section after Peer dependency conflicts.
- List currently pinned approvals from `allowScripts`.
- List any pending packages from `npm approve-scripts --allow-scripts-pending`.
- For pending packages that should be approved, provide one pinned
  `npm approve-scripts <pkg...>` command using package names, not `--all`.
- If packages should be denied instead, provide the matching
  `npm deny-scripts <pkg...>` command and explain why.

## Provide Commands And Order

- Provide one `npm install` command that batches all safe patch/minor updates.
- Provide one separate `npm install` command per major update that has no unresolved peer conflict.
- For each major update, summarize the breaking-change risk and any stack compatibility concern.
- If new overrides were proposed, provide a New override commands subsection listing each override to apply via the `add-override` skill (package name, pinned version, and reason).
- If new install-script approvals are needed, provide an Install-script
  approval commands subsection with the pinned `npm approve-scripts` command.
- Provide an `Excluded` list for non-LTS skips.
- Recommend this order:
  1. Apply patch/minor updates in one batch.
  2. Run `npm run purge:install`.
  3. Run `npm approve-scripts --allow-scripts-pending`.
  4. Apply recommended install-script approvals or denials.
  5. Run `npm run check`.
  6. Run `npm audit`.
  7. Apply recommended new overrides (using `add-override` for each).
  8. Run `npm run purge:install`.
  9. Run `npm approve-scripts --allow-scripts-pending`.
  10. Run `npm run check`.
  11. Run `npm audit`.
  12. Review and apply major updates one at a time.
  13. Run `npm run purge:install`.
  14. Run `npm approve-scripts --allow-scripts-pending`.
  15. Run `npm run check`.
  16. Run `npm audit`.

## Handle Missing Data

- If registry, audit, or install-state commands fail without usable JSON output, report the gap clearly and state how it limits confidence.
- If the repo adds package-management rules elsewhere, follow them in addition to this skill.
