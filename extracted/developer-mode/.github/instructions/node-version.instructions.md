---
applyTo: "**/{.github/workflows/**,package.json,packages/*/package.json,.nvmrc}"
---

# Node Version Synchronization (AI-only instruction)

`.nvmrc` is the **single source of truth** for the Node version this
monorepo and all published packages target. Every other location
that pins a Node version MUST reference it or repeat the same value.

## 1. Pinning locations

- `.nvmrc` (source of truth — major version only, e.g. `22`)
- Root `package.json` → `engines.node` (use `>=<major>` to allow
  patch upgrades by consumers, e.g. `">=22"`)
- Each `packages/*/package.json` → `engines.node` (same `>=<major>`)
- `.github/workflows/*.yml` → prefer `node-version-file: .nvmrc`
  over a hardcoded `node-version:` value

## 2. Updating the Node version

When you change `.nvmrc`:

1. Update `engines.node` in the root and every `packages/*/package.json`.
2. Confirm every workflow uses `node-version-file: .nvmrc` (no
   hardcoded versions left behind).
3. Run `nvm install && nvm use` locally, then `npm install`,
   `npm run check`, and `npm run build`.
4. Add a changeset describing any consumer-visible bump (a major
   Node bump is at least a `minor` for libraries that publish
   `engines`).

## 3. Verify

```bash
nvm install && nvm use
npm install
npm run check
```

## 4. Document exceptions

If any location cannot be updated, note it explicitly in the PR
description.
