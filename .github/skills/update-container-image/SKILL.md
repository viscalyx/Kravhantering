---
name: update-container-image
description: Update pinned vendor container image locks and all repository references for a specified container image. Use when Codex is asked to bump, refresh, switch, or verify an upstream container image such as nginx, SQL Server, Keycloak, or another image recorded in `containers/*/image.lock.json`, including integration tests, release-smoke fixtures, prodlike examples, deployment docs, and vendor-image-update pipeline configuration.
---

# Update Container Image

Update one requested container image end to end: resolve the upstream tag and
immutable identities, switch every repo-owned usage for that container, and
verify the release/smoke/test surfaces that consume it.

## Workflow

1. Identify the requested image and old state.
   - Read `.github/workflows/vendor-image-updates.mjs`.
   - Match by `IMAGE_CONFIGS` key, `image`, or `lockPath`.
   - Read the matching `containers/<image>/image.lock.json`.
   - If the image is not in `IMAGE_CONFIGS`, search for a matching
     `containers/*/image.lock.json` and all direct refs before editing.

2. Resolve the target tag.
   - If the user supplied a tag, verify that exact upstream tag exists.
   - If the user asked for latest/newer/current, query the upstream registry or
     official source before choosing. Do not rely on memory.
   - Prefer immutable, version-specific tags for release locks. Avoid moving
     tags such as `stable-alpine`, `latest`, or `2025-latest` unless the repo's
     existing product lane explicitly uses that moving tag.
   - Preserve the lane policy from `IMAGE_CONFIGS.parseTag`,
     `laneFromVersion`, and `versionSortValue`.

3. Resolve immutable image identity for `linux/amd64`.
   - Record both the platform manifest digest and the image config digest.
   - For manifest lists, select platform `{ os: "linux", architecture:
     "amd64" }`, then fetch that platform manifest.
   - Update `tag`, `manifestDigest`, and `imageId` together in
     `containers/<image>/image.lock.json`.
   - Use `.github/workflows/vendor-image-updates.mjs` as the source of truth
     for registry host, repository, accepted media types, and digest
     normalization.

4. Update companion files and usage surfaces.
   - Check `IMAGE_CONFIGS[image].companionFiles`; keep it complete when adding
     or discovering hardcoded refs.
   - Any time this task changes a file because it contains a hardcoded image
     reference, release example, devcontainer/devfile example, or active
     deployment/doc workflow reference, update
     `.github/workflows/vendor-image-updates.mjs` in the same change so
     `IMAGE_CONFIGS[image].companionFiles` or the replacement logic covers
     that file for future automated updates.
   - Known companion files:
     - `nginx`: `containers/production/env/release.env.template`
     - `sqlserver`: `docker-compose.sqlserver.yml`,
       `.devcontainer/docker-compose.yml`,
       `.devcontainer/elevated/docker-compose.yml`
     - `keycloak`: `docker-compose.idp.yml`,
       `.devcontainer/docker-compose.yml`,
       `.devcontainer/elevated/docker-compose.yml`,
       `devfile.example.yaml`,
       `containers/production/env/release.env.template`,
       `docs/development/auth-developer-workflow.md`,
       `docs/development/openshift-devspaces.md`
   - Search broadly for the old tag, moving tags, image name, env var, and
     lock name:

```bash
rg --hidden -n "OLD_TAG|NEW_TAG|docker.io/library/nginx|NGINX_IMAGE_REF|stable-alpine" \
  --glob '!node_modules/**' --glob '!.git/**' --glob '!.next/**' \
  --glob '!coverage/**' --glob '!test-results/**' .
```

5. Update tests and fixtures that model the changed image.
   - Common release/container fixture files:
     - `scripts/__tests__/container-stack-lock.test.mjs`
     - `scripts/__tests__/container-compose.test.mjs`
     - `scripts/__tests__/container-oci-archives.test.mjs`
     - `scripts/__tests__/production-image-helper.test.mjs`
     - `scripts/__tests__/container-release.test.mjs`
     - `scripts/__tests__/container-stack.test.mjs`
   - Keep fixture tags version-specific when the real lock is
     version-specific.
   - Add an assertion when a shipped template should contain the new direct
     public example, as with `NGINX_IMAGE_REF`.

6. Update docs only when they contain active examples or workflow behavior.
   - Update deploy, upgrade, release, prodlike, and smoke docs that hardcode
     the old tag or describe companion-file behavior.
   - Leave warning prose about avoiding moving tags intact unless it has become
     misleading.
   - If an IDE/open-tab path does not exist in the checkout, search for the
     checked-in successor before assuming it needs an edit.

7. Verify.
   - Run targeted tests for changed scripts when useful.
   - Run `node --check .github/workflows/vendor-image-updates.mjs` when the
     updater changed.
   - Run `npm run check` before final response unless the user asked for a
     narrower pass or the change is documentation-only.
   - Re-run the broad `rg` search and explain any remaining old/moving tag
     hits as intentional warnings or unrelated refs.

## Safety Rules

- Do not run `.github/workflows/vendor-image-updates.mjs` locally unless the
  user explicitly wants the workflow branch/PR behavior and the GitHub env is
  configured. It switches branches, commits, pushes, and opens PRs.
- Do not update only the tag in an image lock. Digest and image ID must move
  with it.
- Do not leave the release/prodlike example behind when a direct public image
  ref is shown for operators.
- Do not update user-facing deployment docs from memory. Derive actual runtime
  refs from `container-stack.lock.json` and `release.env.template`.
