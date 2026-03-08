---
agent: Plan
description: 'Add a package override in package.json and document why it exists'
---

# Add Override

Add an npm `overrides` entry to `package.json` for a given package name and version, and document why the override is needed in the `//overrides` section.

Constraint: do not add new packages to `dependencies` or `devDependencies`. You may update existing entries only to patch/minor releases within the same major version when that resolves the issue without needing an override.

Verification rule: never assume an issue is resolved only because a safe version appears in `node_modules`. Treat it as resolved only when that safe version is explicitly enforced by `package.json` (through `dependencies`, `devDependencies`, or `overrides`).

## Required Inputs

- Package name (for example: `fast-xml-parser`)
- Override minimum patched version (for example: `5.3.6`)
- Reason for override (for example: security advisory, upstream version conflict, broken transitive dependency)

## Steps

1. Open `package.json`.
2. Validate that an override is actually required before editing:
   - Inspect the dependency tree and confirm at least one installed path still resolves to the vulnerable version.
   - Do not treat transiently installed versions as a fix unless the safe version is also explicitly declared in `package.json`.
   - Check whether any parent dependency in that path has an available patch/minor update that would resolve the issue without an override.
   - If updating existing `dependencies`/`devDependencies` to same-major patch/minor versions resolves it, do that and do not add an override.
   - Only proceed with an override when no safe same-major patch/minor update higher in the tree removes the vulnerable version.
3. Add or update the entry under `overrides` using an exact (unprefixed) version:
   - `"package-name": "version"` (no `^` or `~`)
4. Add a matching human-readable explanation in the `//overrides` section.
   - Keep existing explanations.
   - Add one new line for the new override with concrete context (affected parent dependency, issue/CVE, and fixed version when known).
5. Keep keys and notes tidy and consistent with existing formatting.
6. Include a post-change verification phase in the plan with:
   - `npm run purge:install` to clean `node_modules`, `package-lock.json` and do a fresh install.
   - `npm run check` to verify nothing is broken.
7. Return a short summary that includes what changed and the verification outcomes.

## Missing Context Rule

If the reason for the override is not known or cannot be inferred confidently from the repository context, do **not** invent one. Ask the user for the missing information before editing:

- What issue does this override fix?
- Which dependency path requires it?
- What version is known-good and why?
