---
name: remediate-container-vulnerabilities
description: >-
  Remediate container findings from a failing job or a package tracking issue.
argument-hint: "[GitHub Actions job URL | remediation issue URL]"
disable-model-invocation: true
---

# Remediate Container Vulnerabilities

Run this workflow only when the user invokes it. Accept a failing pull-request
or release-pipeline job, or an existing package remediation issue. CI jobs
provide evidence; this skill creates and maintains the remediation issues.

## Establish the case

1. Read the input and bind its evidence to the exact repository, source commit,
   image digest, complete report, SBOM, and scanner database. For a PR, compare
   the failing commit with its current head and obtain current evidence when
   they differ. Follow the canonical gate's evidence layout and policy in
   `docs/development/trusted-container-publishing.md`.
2. Identify the affected package names and ecosystem. A job failure without
   package findings needs its own diagnosis; establish findings before opening
   remediation issues. Process each affected package separately, including all
   its affected images and CVEs in one case.
3. Read [the tracking contract](references/tracking.md). Reuse the supplied
   issue or search for its existing human-managed package issue. Create a
   missing package issue with `ready-for-human` and
   `remediation:container-vulnerability`. Apply both labels to reused package
   issues too and keep them when recording progress. Preserve unrelated
   issue content and automation-owned issue bodies. Automation-labelled issues
   are outside this hierarchy and its parent references.

## Recheck an existing remediation

Read the issue's next-check instructions, original base selection, installed
workaround, fix criteria, and evidence. Inspect the current unmodified upstream
image and available packages using those criteria.

If the original image now contains the actual fix, update the selected image
and every synchronized consumer. Remove the temporary update, source patch,
removal rule, or approved exception that the original fix makes unnecessary.
Rebuild and verify before using `Closes #<package-issue>` in the cleanup PR.
The initial workaround PR uses `Relates to`; a passing workaround does not
complete the tracking issue. Continue below if the original fix is absent.

## Remediate in order

Finish each path with either verified remediation or recorded evidence of why
it cannot solve the case. Continue to the next path only on the latter result.

1. **Install a fix.** Verify a compatible fixed package or base from an
   authoritative source. Use RPM-aware comparisons for RPMs. For UBI runtime
   packages, inspect both the selected base and the shared security-update
   helper; follow `containers/node/README.md`. Synchronize the owning
   maintenance role, consumers, and locks for a base change. A package-list
   entry passes this step only when a rebuild installs the real fix.
2. **Patch from source.** Obtain authenticated, pinned vendor or upstream
   sources and the actual fixes. Record source and patch hashes, signature
   verification, builder identity, recipe, output identity, notices, and
   provenance. Build the package and test its ABI, runtime configuration,
   crypto policy, and affected behavior in the target image. Keep its package
   identity truthful; changing a version to clear a scanner is not a patch.
   Record unavailable inputs, failed builds, or unresolved compatibility
   evidence when this path cannot deliver a verified fix.
3. **Remove unused software.** Inspect production entrypoints, application
   calls, health checks, native-library linkage, database and identity clients,
   and operational commands. Resolve the complete dependency removal list and
   report each package's purpose and evidence that production does not need
   it. When production uses a package, or use remains uncertain, recommend
   retaining it and continue to the exception step. Otherwise remove the
   reviewed list with normal dependency checks after all build-time consumers
   finish. Preserve accurate package inventory, trust material, licenses, and
   required runtime behavior. Record collateral tools removed and how their
   build-time or diagnostic purpose is served. Verify the final workloads.
4. **Ask about an exception.** First update the package issue with why all
   three paths failed, residual exposure, and concrete next-check instructions.
   Ask the user whether to add an exception, presenting its exact scope,
   accountable owner, rationale, and proposed case-specific review and expiry
   dates. Wait for the answer before changing the exception file. If approved,
   follow the model-invoked
   [exception maintenance skill](../manage-container-vulnerability-exceptions/SKILL.md).
   The user decides the dates from the case; this workflow sets no fixed
   review or expiry interval. A refusal leaves the package issue open with
   the recorded blocker and next checks.

## Verify and record

- Rebuild the affected final images, including helper and provisioner consumers.
  Verify installed fixes or actual removal using complete external SBOMs and
  the unchanged canonical vulnerability gate. For source patches, exercise the
  affected behavior as well as scanner results. For removal, check native
  linkage and production workload behavior after the full removal transaction.
- Run relevant repository checks through npm scripts. Assess operator guidance
  with the operator-upgrade-notes skill and update affected build/run guidance.
  Obtain fresh canonical CI evidence for the exact published PR commit before
  claiming the remediation passes. A local probe of an older image is partial
  evidence. Keep scan reports and build downloads outside Git.
- Update each package issue using the tracking contract. Account for every
  affected image, remaining blocker, and temporary change. State what the user
  should watch for and what a later skill invocation must inspect to remove it.
- Keep complete findings visible in reports. Apply only explicitly approved,
  exact exceptions through the existing evaluator; retain its expiry and
  stale-scope checks. An initial successful remediation leaves the issue open
  until the original image includes the fix and the workaround is removed.
