# UBI Node.js 24 prototype results

## Question

Can the exact public UBI 10 Node.js 24 builder/minimal-runtime pair preserve
the six workload-complete image contracts, and does the first paired evidence
clear the adoption bar?

## Reproducibility boundary

- Application source baseline:
  `032ddeeacbac6d32c0247fddbcba25c32b493973`.
- Observation: 2026-09-04 UTC, Linux AMD64.
- UBI builder manifest:
  `sha256:5295d1fd8e46aebad1e9da107c62bc4a5cfe8bca5fd1175a7b0a523fa977866a`.
- UBI runtime manifest:
  `sha256:f0e6f6fa5bd82741bdf9b304341c94bbac4268a7f94d710c26eac01f20528c2b`.
- Current base manifest:
  `sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600`.
- Scanner: Grype 0.110.0 with database built 2026-09-04 06:30:46 UTC,
  schema 6.1.9.

## Observed result

The UBI pair is technically viable enough to continue evaluating, but this
run does not clear the hard adoption bar.

- All six candidate images build from public sources without credentials.
  The full application build passes its Next.js/Turbopack build, native glibc
  package selection, bundle limits, and standalone dependency check.
- Both database images load the exact `mssql`, `reflect-metadata`, and
  `typeorm` subset. Both HSA services load `saxes`.
- The final images preserve their explicit Node commands, root/non-root role,
  UID/GID `1000:1000` where required, absence of callable npm/npx, required
  proof tools, and read-only-root plus writable-`/tmp` behavior.
- The UBI provisioner installs exact public RPM versions for OpenSSL and CA
  certificates, verifies those versions during the build, and completes
  disconnected `ensure` under `NoNewPrivileges` with tmpfs-backed issuer and
  runtime roots.
- The strict HSA topology passes all three authenticated TLS legs and its nine
  negative identity/protocol/listener checks with the UBI provisioner, adapter,
  and mock.
- UBI contains Node 24.19.0 while the current exact image contains 24.20.0.
  The [vendor and security note](vendor-security-note.md) establishes that
  24.20.0 is a normal LTS release, not the fix release for the three highlighted
  findings. Red Hat publishes no UBI 24.20.0 RPM or publication date at the
  research cutoff, so the gap remains packaging-cadence evidence.
- UBI retains callable `curl`, `microdnf`, and RPM tooling that the workloads
  do not require. Its RPM database also retains npm/nodemon package records
  after their callable files are removed. This adds comparison work and may
  add candidate-only exposure.

## Compressed transfer size

Every artifact and the unique six-image set remain below the rejection rule of
growth greater than both 10 percent and the applicable absolute limit.

<!-- markdownlint-disable MD013 -->
| Artifact | Current MiB | UBI MiB | Delta MiB | Delta |
| --- | ---: | ---: | ---: | ---: |
| `app-runtime` | 108.29 | 112.36 | +4.07 | +3.76% |
| `db-job` | 93.90 | 97.97 | +4.07 | +4.33% |
| `demo-seed` | 93.98 | 98.05 | +4.07 | +4.33% |
| `hsa-directory-mock` | 81.40 | 85.47 | +4.07 | +5.00% |
| `hsa-person-lookup-adapter` | 81.40 | 85.47 | +4.07 | +5.00% |
| `hsa-mtls-provisioner` | 82.54 | 89.03 | +6.49 | +7.87% |
| Unique six-image layers | 122.29 | 128.79 | +6.50 | +5.31% |
<!-- markdownlint-enable MD013 -->

## Vulnerability snapshot

Raw counts are diagnostic only. Grype reports no fixable High or Critical
finding in either family. The UBI images have 40 High and no Critical matches
(41 High for the provisioner); the current images have 56 High and 7 Critical
matches. Those counts cannot establish superiority because the distro package
names, severity authorities, and matching coverage differ.

The UBI set contains 12 distinct High IDs and the current set contains 26
distinct High/Critical IDs; only three IDs overlap. Candidate-only findings
include Node and unused curl/libcurl packages. Primary-source analysis in the
[vendor and security note](vendor-security-note.md) finds that the curl issue
requires a Negotiate-authenticated connection-reuse pattern absent from the
workloads, while the two highlighted Node RPM findings concern `qs` and
`js-yaml` payloads that are fixed or absent from the runtime. Red Hat still
marks the RPMs affected and publishes no fixed UBI release, so this is
reachability evidence rather than a clean vendor disposition.

## Gates not established by this prototype

- The required 12-week prospective remediation observation, reconstructed
  12-month history, and minimum three comparable fix events.
- Five clean and five warm paired builds for the median 20-percent build-time
  gate.
- The complete rootless Podman production smoke, SBOM action, vulnerability
  policy evaluator, attestation, release archive, and disconnected deployment
  path. This environment cannot initialize rootless Podman because its
  `/run/user/1000` path is read-only.
- Written clarification or authorized approval of the UBI redistribution
  controls.

## Prototype interpretation for review

Treat this as a compatibility and size pass, not an adoption pass. Under the
existing hard-gate decision, remediation evidence is insufficient and the
Node packaging cadence plus candidate-only vendor status remain evidence that
later reviewers must carry explicitly. The recommended next human decision is
to close this prototype as a present no-pass and let the adoption-boundary
ticket decide no adoption. Keeping it open for the prospective observation
period is reasonable only if delayed adoption remains valuable enough to hold
the map open.
