# Shared UBI runtime packaging

`ubi-compat.sh` adapts the selected UBI Node.js minimal base for all six
published runtime images and the local HSA topology helper. Each Dockerfile
invokes it during the existing image build and declares its own workload
packages, commands and final user.

## Image scope

The UBI 10 Node.js 24 minimal runtime is used by:

- `app-runtime`, `db-job`, and `demo-seed` in
  [`containers/app/Dockerfile`](../app/Dockerfile).
- [`hsa-directory-mock`](../hsa-directory-mock/README.md).
- [`hsa-person-lookup-adapter`](../hsa-person-lookup-adapter/README.md).
- [`hsa-mtls-provisioner`](../hsa-mtls-provisioner/README.md).
- The local [`hsa-mtls-topology`](../hsa-mtls-topology/Dockerfile) test helper.

The app, database, demo, mock, adapter, and topology helper build stages use
the separate UBI Node.js builder role. The provisioner installs its locked RPM
toolchain directly into the minimal runtime. The devcontainer and vendor nginx,
SQL Server, Keycloak, and Kong images retain their independently maintained bases.

Maintain the two UBI roles through the
[dependency workflow](../../docs/development/dependency-workflow.md#ubi-node-builder-and-runtime-maintenance).
Base tags are always paired with their selected immutable digest.

## Build and execution prerequisites

Hosts that build or run the Linux AMD64 UBI 10 images must expose x86-64-v3 CPU
instructions, including inside virtual machines. The image architecture
`linux/amd64` alone does not establish CPU compatibility. Red Hat also warns
that newer container user space can require features absent from older host
kernels; validate the actual workload and host combination. See the
[Red Hat container compatibility policy](https://access.redhat.com/support/policy/rhel-container-compatibility).

Uncached builds need HTTPS access to the public image registry
`registry.access.redhat.com`, the existing npm package sources, the original
license URL below, and the public UBI RPM repositories at
`cdn-ubi.redhat.com`. These inputs need no Red Hat account or subscription.
Disconnected deployments import completed release images; they do not repeat
those build-time downloads.

## OpenSSL runtime package

The selected minimal base includes `openssl-libs-3.5.8-1.el10_2`, which fixes
`CVE-2026-14456` according to
[Red Hat advisory RHSA-2026:67154](https://access.redhat.com/errata/RHSA-2026:67154).
The shared helper uses that inherited library. The provisioner additionally
installs its locked OpenSSL CLI package from the public UBI 10 BaseOS
repository. The container vulnerability policy evaluates the completed images.

Deploy a new immutable project release to receive the updated base. Existing
release images and installed containers do not change when a base pin changes.

## Licenses and image identity

The helper downloads the original
[Red Hat Universal Base Image EULA](https://www.redhat.com/licenses/EULA_Red_Hat_Universal_Base_Image_English_20190422.pdf)
and verifies the SHA-256 recorded in the helper before installing it at
`/usr/share/licenses/ubi/UBI-EULA.pdf`. The PDF remains unmodified; its contents
are not extracted into text or stored in Git. Uncached builds need HTTPS access
to that URL and fail if retrieval or checksum verification fails.

The project's original `LICENSE` stays in Git and is copied unchanged to
`/usr/share/licenses/kravhantering/LICENSE`. Both files are readable by the
supported runtime users. The helper leaves existing base-image license files
unchanged; dependency packaging follows the existing workload builds.

Final Dockerfiles identify the images as Viscalyx/Kravhantering, clear stale
base-image build metadata and retain component provenance. Using UBI does not
imply Red Hat endorsement, certification or support for Kravhantering.

The [UBI documentation research](https://github.com/viscalyx/Kravhantering/issues/1292#issuecomment-5716421171)
records upstream evidence for host requirements, TLS policy, redistribution,
and support boundaries. Runtime license files and SBOMs do not constitute a
corresponding-source archive; the current release workflow does not collect
upstream source containers.
