---
applyTo: "**/{Dockerfile,.devcontainer/**,.github/workflows/**,package.json,.nvmrc,**/*.md}"
---

# Node Version Synchronization (AI-only instruction)

When you change a file that sets or documents a Node version (e.g., `FROM node:`, `node-version:`, `engines.node`), synchronize **all** pinning locations before committing.

## 1. Find all pinning locations

Search: `grep -R "node-version:\|node-version-file:\|FROM node:\|\.nvmrc\|\"engines\".*\"node\"" .`

Locations to check:
- `.nvmrc`
- `package.json` → `engines.node`
- `.github/workflows/*.yml` → `node-version:` and `node-version-file:`
- `Dockerfile` / `.devcontainer/Dockerfile` → `FROM node:`
- `bundled/` → generated `NODE_VERSION` constants

## 2. Update all locations

Use the same single major version (e.g., `24`) across `.nvmrc`, `package.json` `engines`, and GitHub workflows:
- `.nvmrc` → `24`
- `package.json` → `"engines": { "node": "24" }`
- Dockerfiles → `node:24` or `node:24-alpine`

## 3. Verify

```bash
nvm install && nvm use
npm ci
npm run check
```

## 4. Document exceptions

If any location cannot be updated, note it explicitly in the PR description.

## Context

- Node version affects build-time only; Cloudflare Workers run in a V8 isolate, not Node.
- Aligned `.nvmrc` + `engines.node` + CI workflows prevent environment drift.
