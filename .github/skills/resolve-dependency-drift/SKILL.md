---
name: resolve-dependency-drift
description: Resolve a detector-created dependency drift issue for the npm toolchain, a coordinated release toolchain, or a container image, including every synchronized repository surface and required compatibility work. Use when an `automation:dependency-drift` issue provides a maintenance unit with current and available state.
disable-model-invocation: true
---

# Resolve Dependency Drift

## Workflow

1. Read the issue's maintenance unit, current state, available state, and
   completion checklist.
2. Create one isolated directory with
   `mktemp -d /tmp/resolve-dependency-drift.XXXXXX`.
3. Start a background agent with `$research`.
   - For npm, research compatibility, lifecycle-script policy, install paths,
     and verification using primary npm and Node sources.
   - For a container image, research vendor releases, compatibility,
     immutable identity, synchronized surfaces, and verification using primary
     registry and vendor sources.
   - For a release toolchain such as Lychee, research the supported release,
     action compatibility, release assets, published digests, and every
     synchronized installer and CI surface using primary project sources.
   - Override `$research` output handling for this invocation: write its single
     Markdown result inside the exact temporary directory, never in the
     repository.
4. Continue repository discovery while research runs. Read and apply the
   temporary findings before choosing the target or editing.
5. Apply the policy for the issue's maintenance unit:
   - **npm toolchain:** Treat root `package.json` as canonical. Adopt one exact
     reviewed npm version across every dynamically discovered install path.
     Preserve pinned script approvals, explicit denials, fail-closed lifecycle
     policy, and even-LTS Node compatibility.
   - **Container image:** Resolve the requested upstream tag, multi-platform
     index when published, and Linux AMD64 platform manifest. For
     `devcontainer-base`, record the index digest as `manifestDigest` and the
     AMD64 image config digest as `imageId`. For other image lanes, preserve
     their existing platform-manifest identity policy. Update every dynamically
     discovered synchronized surface without changing release-lane policy.
   - **Lychee toolchain:** Update both installer version constants, the CI
     `lycheeVersion`, and both AMD64 and ARM64 asset checksums together. Keep
     the action compatible and pinned to a full commit SHA with its release-tag
     comment, and preserve relational alignment coverage.
6. Update focused tests, generated locks or configuration, the maintenance
   coverage invariant, and affected operator, developer, or CI documentation.
7. Run dynamically relevant verification:
   - For npm, include clean installs, pending script approval checks, nested
     packages, `npm run check`, and `npm audit`.
   - For a container image, include image, release, smoke, workflow, and
     repository checks.
   - For Lychee, include the dependency-drift, dependency-maintenance, workflow
     security, Markdown link, and repository checks relevant to the change.
8. Confirm a detector scan reports no remaining drift for the maintenance
   unit.
9. Remove only the exact temporary directory created in step 2 after applying
   its findings.

## Guardrails

- Discover surfaces dynamically; do not rely on an issue file inventory.
- Change only the maintenance unit named by the issue.
- Resolve compatibility work instead of evading the available supported
  release.
- Never use floating versions for project-bound npm dependencies or the
  canonical npm toolchain.
- Preserve ADR 0045 rolling channels such as `@github/copilot@latest` for
  standalone development tools when their distribution integrity is verified
  or ADR 0045 records an explicit exception. Do not replace those channels with
  routine version pins.
- Broad image tags such as `latest` are forbidden for externally sourced
  service and base images. Repository-local build outputs do not require an
  explicit Compose `image` or canonical image lock.
- Preserve each image lane's identity policy. Production and release
  references keep their required immutable identities. ADR 0045 development
  references backed by canonical image locks stay explicit, non-`latest`,
  tag-only references; do not append digests to those runtime references.
- For an ADR 0045 development image update, record the required manifest digest
  and image ID in the canonical image lock and update every synchronized
  development tag reference from that lock. Keep the devcontainer base lock's
  `manifestDigest` bound to the multi-platform index, not one platform
  manifest.
- Never approve all lifecycle scripts or update an image lock tag without its
  required immutable identities.
- Do not leave research artifacts in the repository.
