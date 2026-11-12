# HSA test-PKI provisioner

This one-shot image owns test certificate construction for the repository-owned
HSA person lookup chain. Runtime services never use this image and never
receive a CA signing key.

The source-of-truth profile is
`containers/hsa-mtls/certificate-profile.json`. The independently pinned build
toolchain is recorded in `toolchain.lock.json`. Every image build verifies the
selected UBI 10 Node.js 24 minimal base image, tag, digest, Node major, and
public RPM versions. It checks the exact installed Node and OpenSSL binary
versions and queries RPM for the name, epoch, version-release, architecture,
source RPM, and vendor of `openssl`, `openssl-libs`, and `ca-certificates`.
Missing evidence or any selected-input, installed-version, identity, or source
mismatch fails the build. Package tests cover
the same verifier contract without inspecting Dockerfile or workflow source.

## Toolchain maintenance

The digest-pinned runtime and additional packages are available anonymously.
The build enables only the public `ubi-10-baseos-rpms` repository, with Red Hat
signature verification, for the declared OpenSSL and CA RPMs. Installed RPM
headers supply source-package and vendor evidence; the immutable base and
restricted signed repository supply the build provenance. No subscription,
private registry credentials, or package downloads at deployment are required.

For an approved runtime or package update, synchronize the Dockerfile base
arguments and RPM versions with `toolchain.lock.json`. Independently inspect
the selected image and installed RPM headers; do not regenerate expected
values from verifier output. Record exact Node and OpenSSL binary versions,
RPM identities, source RPMs, and vendor in the lock. Keep the shared
`containers/node/ubi-compat.sh` adaptation and the provisioner's `0:0` runtime
identity. `HOME=/root` and the explicit Node CLI entrypoint override inherited
S2I defaults. The shared adaptation removes the npm CLI and development-only
Nodemon; certificate commands need neither npm nor package installation.

Run `npm run test:hsa-provisioner`, build the complete `linux/amd64` image,
and retain its toolchain verification event, SBOM, vulnerability-policy result,
and certificate lifecycle evidence. Follow the existing dependency-maintenance
and release verification workflow before publishing a new immutable image.
Operators receive the complete release image, including its RPMs and notices;
disconnected installations import and verify that image without resolving UBI
or RPM inputs. Certificate commands, mounts, role ownership, and renewal policy
remain the storage and lifecycle contracts below.

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
correct-CA/wrong-stable-identity client and server per trust domain. It remains
inside generation state unless the required topology harness explicitly sets
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
  server/client leaves, and the isolated client/server decoy probe leaves for
  exactly one trust domain.
- `rollback` restores the prior selection and removes the failed generation.
- `finalize <authenticated-generation-id>` requires and verifies the exact
  selected generation that passed external authentication, then removes its
  preserved prior generation. The prior selection is retained until its
  directory is deleted, so `previous: null` proves cleanup completed and an
  interrupted deletion remains retryable.

Persistent material uses the 425-day CA and 397-day leaf policy with renewal
inside 30 days. CI and release-smoke use `--lifetime ephemeral` for fresh
seven-day material.

`activate` leaves a preserved prior selection when automatic renewal promotes
a replacement. Repository-owned devcontainer and Azure startup reconciliation
must authenticate the full chain before `finalize`; on failure they run
`rollback`, deploy the prior selection, restart server-first, and authenticate
recovery. An initial generation has no prior selection, so ordinary first
startup does not wait for this reconciliation.

Repository-owned explicit `ensure` orchestration stops endpoint processes
before checking the generation. A reused generation restarts and authenticates
without copying unchanged material. A promoted generation is deployed into the
stopped runtime volumes, force-recreates every startup-snapshot endpoint, and
is authenticated before `finalize`; failure restores, deploys, recreates, and
authenticates the preserved prior generation.
