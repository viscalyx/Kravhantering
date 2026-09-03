# UBI Node.js 24 candidate research

Research date: 2026-09-03

## Decision summary

Carry one UBI candidate into compatibility validation:

- build stages:
  `registry.access.redhat.com/ubi10/nodejs-24:<version>@<digest>`; and
- runtime stages:
  `registry.access.redhat.com/ubi10/nodejs-24-minimal:<version>@<digest>`.

This pair meets the documentary requirements for no-cost use, anonymous pulls,
public redistribution, no-subscription security updates, Node.js 24, and the
repository's current Linux AMD64 publication target. Red Hat publishes a
Node.js 24 retirement date of April 2028 for both RHEL 9 and RHEL 10. That
matches the upstream Node.js 24 end-of-life date, so UBI does not shorten the
current runtime lifecycle.

Do not carry generic UBI standard, minimal, or micro images forward as Node.js
candidates. They are free and redistributable, but they make this project
assemble and maintain Node.js and its dependency closure when Red Hat already
publishes purpose-built Node.js images. UBI Micro also removes the package
manager and requires an external install-root or equivalent construction.

Keep Red Hat Hardened Node.js 24 as a separate security-focused challenger,
not as the answer to a UBI migration. Red Hat documents Hardened Images and
UBI as different products, and the Hardened image uses Fedora-derived
Hummingbird packages rather than UBI, as Red Hat explains in
[Harden local container base images](https://developers.redhat.com/articles/2026/08/10/harden-local-container-base-images-podman-desktop).
It passes the monetary and anonymous access tests, but its free lifecycle has
no published date or service-level commitment, and first publication remains
subject to the legal gate in
[Confirm redistribution and notice obligations for derived Red Hat images](https://github.com/viscalyx/Kravhantering/issues/1082).
Those uncertainties prevent it from meeting the map's no-regression rule now.

This conclusion identifies candidates only. It does not authorize an image
migration.

## Boundary and current baseline

The in-scope published images are `app-runtime`, `db-job`, `demo-seed`,
`hsa-directory-mock`, `hsa-person-lookup-adapter`, and
`hsa-mtls-provisioner`. The first five use the same pinned
`node:24-trixie-slim` base. The provisioner uses that base plus version-pinned
OpenSSL and CA-certificate packages. The release workflow publishes Linux
AMD64 artifacts.

The current pinned Node image is 81.34 MB compressed for AMD64 in the
[Docker Hub tag record](https://hub.docker.com/_/node/tags?name=slim&page=1).
The upstream image supports Node.js 24 until April 2028 according to the
[Node.js Release Working Group schedule](https://github.com/nodejs/Release#release-schedule).

A replacement qualifies only if it preserves or improves:

- credential-free automated builds and deployments;
- free redistribution and free access to security updates;
- the Node.js 24 lifecycle;
- Linux AMD64 support and the release pipeline;
- runtime, native-module, CA, and OpenSSL compatibility;
- final-image size and vulnerability posture; and
- build and operational complexity.

The project prefers Red Hat when two options are otherwise equal.

## Candidate comparison

Catalog sizes below are AMD64 compressed sizes at the research snapshot. They
describe the base image, not the completed Kravhantering image.

<!-- markdownlint-disable MD013 -->
| Candidate | Cost and public access | Lifecycle and update evidence | Compatibility and size | Disposition |
| --- | --- | --- | --- | --- |
| `ubi10/ubi` | Passes UBI terms; anonymous registry path | Public UBI updates; Node.js not included | 77.2 MB before adding Node.js; full DNF and utilities | Reject: larger ownership surface than a purpose-built Node.js image |
| `ubi10/ubi-minimal` | Passes UBI terms; anonymous registry path | Public UBI updates; Node.js not included | 33.3 MB before adding Node.js; `microdnf` is present | Reject: duplicates Red Hat's Node.js image assembly and testing |
| `ubi10/ubi-micro` | Passes UBI terms; anonymous registry path | Public UBI updates; Node.js not included | 7.5 MB before adding Node.js; no package manager | Reject: external dependency-closure construction is materially more complex |
| `ubi10/nodejs-24` | Passes UBI terms; anonymous registry path | Node.js 24 retires April 2028 | 233.9 MB; contains build tools and runs as UID 1001 | Use for build stages, subject to compatibility validation |
| `ubi10/nodejs-24-minimal` | Passes UBI terms; anonymous registry path | Node.js 24 retires April 2028 | 76.9 MB; Node.js, npm, `microdnf`, and UID 1001 | Primary runtime candidate, subject to compatibility validation |
| `ubi9/nodejs-24` plus `ubi9/nodejs-24-minimal` | Passes UBI terms; anonymous registry path | Same April 2028 Node.js retirement | Minimal image is 82.9 MB; older RHEL generation | Backup only if UBI 10 exposes a proven incompatibility |
| `hi/nodejs:24-builder` plus `hi/nodejs:24` | No-cost and anonymous; conditionally redistributable | Upstream-backed updates, but no published free lifecycle date or SLA | Distinct Hummingbird/Fedora package set, UID 65532, and a reduced runtime | Do not select now; retain only as a later non-UBI challenger |
<!-- markdownlint-enable MD013 -->

Red Hat's
[UBI base-image catalog](https://catalog.redhat.com/en/software/base-images)
defines the standard, minimal, and micro trade-offs. The current catalog
records provide the sizes and package-manager characteristics for
[UBI 10 standard](https://catalog.redhat.com/en/software/containers/ubi10/66f2a8d39bdbdc1b74e81460),
[UBI 10 Minimal](https://catalog.redhat.com/en/software/containers/ubi10/ubi-minimal/66f1504a379b9c2cf23e145c),
and
[UBI 10 Micro](https://catalog.redhat.com/en/software/containers/ubi10-micro/66f2abd91123095c735db44f).

## Why the UBI 10 Node.js pair survives

The
[UBI 10 Node.js 24 catalog entry](https://catalog.redhat.com/en/software/containers/ubi10/nodejs-24/67f6288d9700d2bde865192a)
identifies a generally available, unprivileged Node.js 24 image intended for
building and running applications. Its source recipe installs Node.js, npm,
compilers, Git, and development dependencies. The
[UBI 10 Node.js 24 Minimal catalog entry](https://catalog.redhat.com/en/software/containers/ubi10/nodejs-24-minimal/67f6293d54e0fce2e7d33535)
identifies the smaller unprivileged runtime companion.

Red Hat's
[Node.js container source repository](https://github.com/sclorg/s2i-nodejs-container)
documents the full-builder/minimal-runtime pattern. The images include
Source-to-Image conventions, but ordinary Dockerfile `COPY`, `RUN npm`,
`ENTRYPOINT`, and `CMD` instructions remain supported. UBI 10 also aligns with
the project's RHEL 10 production target. UBI 9 has the same Node.js retirement
date and a larger minimal image, so it provides no documentary advantage.

The 233.9 MB builder does not become part of the final multi-stage runtime
artifact. Its pull and cache cost is nevertheless larger than the current
81.34 MB shared base, so compatibility validation must measure build time and
cache consumption. If that cost is material, validation may test the 76.9 MB
minimal image for build stages as an optimization; it must not assume that a
runtime-oriented image supplies every build dependency.

## Cost, registry, redistribution, and updates

Red Hat states that UBI images are available from both authenticated
`registry.redhat.io` and unauthenticated `registry.access.redhat.com`. It also
states that no subscription is needed to update images from the public UBI
repositories. See
[Universal Base Images: images, repositories, packages, and source code](https://access.redhat.com/articles/4238681).
The candidate deliberately uses `registry.access.redhat.com` so public CI,
downstream deployments, and disconnected-bundle creation do not depend on
private Red Hat credentials.

The [UBI FAQ](https://developers.redhat.com/articles/ubi-faq) states that UBI
and associated content require no subscription for development or deployment,
may run on any OCI platform, and may be redistributed through a registry of the
project's choice. It also states that updates follow the RHEL schedule and that
non-Red Hat platforms receive updates without Red Hat support.

The public repository exposes only current UBI package versions. Red Hat keeps
older package versions behind an appropriate subscription and updates only the
most current images and packages. Red Hat aims to rebuild UBI images every six
weeks or sooner for Critical or Important CVEs. See the
[UBI content-availability policy](https://access.redhat.com/support/policy/updates/ubi).
This is compatible with the repository's existing model: pin an immutable
digest, detect a newer digest, validate it, and rebuild the derived images. A
pinned digest never updates itself.

The
[RHEL Application Streams lifecycle](https://access.redhat.com/support/policy/updates/rhel-app-streams-life-cycle)
sets Node.js 24 retirement to April 2028 on RHEL 9 and RHEL 10 and states that
retired streams receive no updates or errata. There is no EUS or ELS extension
for Application Streams. The longer UBI operating-system lifecycle therefore
does not extend Node.js 24; the project still needs a planned Node major update
before April 2028.

Redistribution remains conditional on the
[UBI EULA](https://www.redhat.com/licenses/EULA_Red_Hat_Universal_Base_Image_English_20190422.pdf),
component licenses, trademark rules, notices, and export obligations. The
release gate from
[Confirm redistribution and notice obligations for derived Red Hat images](https://github.com/viscalyx/Kravhantering/issues/1082)
must apply to the selected UBI pair as well: preserve the unmodified EULA,
remove misleading Red Hat product marks from the derivative, inventory final
image licenses, exclude subscription-only RHEL content, and complete the
authorized legal review before first publication. These obligations require
work but not a paid subscription.

## Compatibility conditions for the next decision

Documentation establishes candidacy, not drop-in compatibility. The UBI pair
uses UID 1001 and group 0, `/opt/app-root/src`, RPM package paths, and Red Hat
environment defaults. The current Dockerfiles assume the named `node` user and
group at UID/GID 1000, Debian paths, root-owned build steps, and `apt` for the
provisioner's toolchain.

The next compatibility decision must prove all of the following before a
switch can be recommended:

1. Rootless Docker Buildx and Podman build every published target without
   credentials, including npm 12.0.2 installation and all native packages.
2. `app-runtime`, `db-job`, `demo-seed`, `hsa-directory-mock`, and
   `hsa-person-lookup-adapter` pass their existing runtime, read-only-root,
   CA, and release-smoke checks as UID 1001 or an explicitly selected
   replacement identity.
3. Runtime stages remove npm, npx, nodemon, compilers, and other unused tools
   without removing Node.js or required shared libraries.
4. `hsa-mtls-provisioner` obtains version-pinned `openssl` and
   `ca-certificates` only from public, redistributable UBI repositories and
   passes its complete toolchain and certificate tests.
5. Final image sizes and vulnerability-gate results are no worse than the
   current images; build time and cache growth are not material regressions.
6. The selected tags resolve to immutable AMD64 manifest digests, Red Hat
   update detection fits the dependency-maintenance workflow, and final-image
   SBOM, provenance, scan, signing, and release evidence remain complete.
7. The redistribution gate above is accepted before any derived image reaches
   GHCR or a public release bundle.

If the UBI 10 pair satisfies every condition, the Red Hat preference breaks
the tie and makes the switch worthwhile. If it fails a condition, keep the
current Node image unless UBI 9 proves that exact condition without creating a
different regression.

## Relationship to the Hardened Images research

[Establish the Red Hat Hardened Node.js product and lifecycle facts](https://github.com/viscalyx/Kravhantering/issues/1081)
already establishes the Hardened Node.js catalog, variants, security evidence,
update claims, identity differences, and missing free lifecycle commitment.
[Confirm redistribution and notice obligations for derived Red Hat images](https://github.com/viscalyx/Kravhantering/issues/1082)
already establishes the conditional redistribution path and first-publication
gate. This note does not reopen those decisions.

Red Hat's
[Hardened Images comparison](https://docs.redhat.com/en/documentation/red_hat_hardened_images/1-latest/discover-evaluate_red_hat_hardened_images_overview)
explicitly contrasts Hardened Images with UBI. The public references are
`registry.access.redhat.com/hi/nodejs:24-builder` and
`registry.access.redhat.com/hi/nodejs:24`, as shown in Red Hat's
[Project Hummingbird Node.js example](https://developers.redhat.com/articles/2026/04/28/exploring-distroless-containers-project-hummingbird).
The no-cost catalog is useful, but it does not meet a literal UBI preference,
and its unresolved lifecycle and publication conditions are weaker than the
UBI 10 candidate's documented position.
