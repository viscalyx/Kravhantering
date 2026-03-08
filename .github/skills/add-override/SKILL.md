---
name: add-override
description: Add or update a package override in package.json and document the reason in //overrides. Use when asked to pin a transitive dependency version, apply a security fix override, or resolve dependency version conflicts via npm overrides.
---

# Add Override

Add an npm override to `package.json` and add a matching reason in `//overrides`.

## Required Inputs

- Package name (for example: `fast-xml-parser`)
- Override version (for example: `5.3.6`)
- Reason for override (security advisory, version conflict, broken transitive dependency)

## Workflow

1. Open `package.json`.
2. Add or update the entry under `overrides` using an exact (unprefixed) version:
   - `"package-name": "version"` (no `^` or `~`)
3. Add a matching explanation line in `//overrides`:
   - Keep existing notes.
   - Add concrete context: affected dependency path, issue/CVE, and fixed version when known.
4. Keep key order and formatting consistent with the file.
5. Return a short summary of changed lines.
6. After applying updates, run:
   - `npm run purge:install`
   - `npm run check`

## Missing Context Rule

If the reason is missing or cannot be inferred with high confidence, stop and ask the user before editing. Ask:

- What issue does this override fix?
- Which dependency path requires it?
- Why is this version the known-good target?
