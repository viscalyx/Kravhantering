# HSA test-PKI provisioner

This one-shot image owns test certificate construction for the repository-owned
HSA person lookup chain. Runtime services never use this image and never
receive a CA signing key.

The source-of-truth profile is
`containers/hsa-mtls/certificate-profile.json`. The independently pinned build
toolchain is recorded in `toolchain.lock.json` and enforced by package tests.

## Storage contract

Mount an empty `tmpfs` at `/run/kravhantering/hsa-mtls-issuer` and a persistent
provisioning volume at `/var/lib/kravhantering/hsa-mtls`. The provisioner creates
one trust domain at a time in the issuer workspace, copies only profile-approved
runtime material to versioned role bundles, removes the issuer workspace, and
validates the complete staged generation before promotion.

The generated layout separates staging, immutable promoted generations, and
the atomic selection file:

```text
/var/lib/kravhantering/hsa-mtls/
  generations/<generation-id>/bundles/{app,kong,adapter,mock,probe}/
  staged/<generation-id>/bundles/{app,kong,adapter,mock,probe}/
  selection.json
```

Runtime orchestration mounts only the selected participant role directory,
read-only, at `/run/kravhantering/hsa-mtls`. The `probe` bundle contains one
correct-CA/wrong-stable-identity client per trust domain. It remains inside
generation state unless the required topology harness explicitly sets
`HSA_MTLS_INCLUDE_PROBES=true` or passes `--include-probes`; it is never
materialized by ordinary developer, Azure, or release-smoke activation.

## Lifecycle commands

The image entry point supports these commands:

- `activate` ensures a generation and copies each selected role bundle to its
  separately mounted runtime volume before any runtime service starts.
- `deploy` copies the already selected generation after orchestration has
  stopped the services affected by a promotion or rollback.
- `ensure` reuses a valid persistent generation and stages a complete
  replacement when material is missing, invalid, or within the renewal window.
- `inspect` and `verify [generation-id]` return safe metadata without PEM or
  private-key contents.
- `stage [all|trust-domain] --from <generation-id>` creates an unmounted staged
  generation.
- `promote <generation-id>` atomically selects a validated staged generation
  while preserving the prior generation.
- `rotate <trust-domain>` stages and promotes a replacement CA, the expected
  server/client leaves, and the isolated decoy probe leaf for exactly one trust
  domain.
- `rollback` restores the prior selection and removes the failed generation.
- `finalize` verifies the selected generation and removes its preserved prior
  generation after external authenticated verification succeeds.

Persistent material uses the 425-day CA and 397-day leaf policy with renewal
inside 30 days. CI and release-smoke use `--lifetime ephemeral` for fresh
seven-day material.

`activate` leaves a preserved prior selection when automatic renewal promotes
a replacement. Repository-owned devcontainer and Azure startup reconciliation
must authenticate the full chain before `finalize`; on failure they run
`rollback`, deploy the prior selection, restart server-first, and authenticate
recovery. An initial generation has no prior selection, so ordinary first
startup does not wait for this reconciliation.
