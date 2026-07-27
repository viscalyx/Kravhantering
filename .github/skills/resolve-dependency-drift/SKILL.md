---
name: resolve-dependency-drift
description: Resolve a detector-created dependency drift issue for the npm toolchain or a coordinated container image, including every synchronized repository surface and required compatibility work. Use when an `automation:dependency-drift` issue provides a maintenance unit with current and available state.
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
   - **Container image:** Resolve the requested upstream tag and Linux AMD64
     platform manifest. Record the platform manifest digest and image config
     digest where required, then update every dynamically discovered
     synchronized surface without changing release-lane policy.
6. Update focused tests, generated locks or configuration, the maintenance
   coverage invariant, and affected operator, developer, or CI documentation.
7. Run dynamically relevant verification:
   - For npm, include clean installs, pending script approval checks, nested
     packages, `npm run check`, and `npm audit`.
   - For a container image, include image, release, smoke, workflow, and
     repository checks.
8. Confirm a detector scan reports no remaining drift for the maintenance
   unit.
9. Remove only the exact temporary directory created in step 2 after applying
   its findings.

## Guardrails

- Discover surfaces dynamically; do not rely on an issue file inventory.
- Change only the maintenance unit named by the issue.
- Resolve compatibility work instead of evading the available supported
  release.
- Never use floating npm versions or floating image tags when an immutable
  release identity is available.
- Never approve all lifecycle scripts or update an image lock tag without its
  required immutable identities.
- Do not leave research artifacts in the repository.
