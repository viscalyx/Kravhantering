# UBI 10 container documentation research

Research date: 2026-09-11

## Scope

The repository uses Red Hat UBI 10 Node.js 24 builder and minimal runtime
images for six published workloads. The Dockerfiles and
[shared runtime packaging](../../containers/node/README.md) define the exact
scope and digest pins. The HSA topology test runner still uses Debian Node.js;
external services retain their independently selected images.

This note separates upstream facts from documentation implications inferred
from the repository. It does not establish application compatibility or
certification.

## Host CPU and kernel

Red Hat explicitly requires the host hardware to satisfy the container image's
minimum architecture, including **x86-64-v3 for RHEL 10 x86_64 images**. It also
warns that newer container user space can require kernel features absent from
older hosts, with failures possible at startup or later. Its support conditions
require workload validation for these combinations.
[Red Hat container compatibility matrix](https://access.redhat.com/support/policy/rhel-container-compatibility)

Repository implication: document the CPU requirement for development, build,
and deployment hosts that execute the AMD64 images. For virtual machines, the
guest must expose the required instructions. Selecting `linux/amd64` alone
does not demonstrate this compatibility. Retain the documented RHEL 10
production baseline; the base-image choice alone does not validate every older
Linux host or establish a new universal minimum kernel version.

## Registry access and disconnected deployment

`registry.access.redhat.com` permits unauthenticated access;
`registry.redhat.io` requires authentication.
[Red Hat registry authentication](https://access.redhat.com/articles/RegistryAuthentication)

UBI repositories provide redistributable RPM content. Installing those packages
requires access to the UBI content delivery network, `cdn-ubi.redhat.com`.
[UBI image characteristics](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/building_running_and_managing_containers/types-of-container-images)

Repository implications:

- The selected base-image registry does not require a Red Hat login.
- Uncached builds also need HTTPS access to the EULA PDF at `www.redhat.com`:
  [`ubi-compat.sh`](../../containers/node/ubi-compat.sh) downloads it and verifies
  a fixed SHA-256 before installation.
- The
  [HSA provisioner Dockerfile](../../containers/hsa-mtls-provisioner/Dockerfile)
  installs pinned OpenSSL and CA packages from `ubi-10-baseos-rpms`. Its build
  therefore needs RPM repository access as well as image and EULA access.
- A disconnected production deployment imports completed release images using
  the [disconnected guide](../operations/rhel10-production-disconnected.md).
  These build dependencies do not introduce a requirement to contact Red Hat
  when starting those completed images. Rebuilding from source is a separate
  workflow with additional network dependencies.

## TLS and certificates

RHEL 10's default cryptographic policy rejects RSA key exchange. The `SHA1`
subpolicy is unavailable, and the `LEGACY` policy does not by itself enable
SHA-1 signatures in TLS. Red Hat also documents that OpenSSL rejects SHA-1 in
TLS at security level 2.
[RHEL 10 security changes](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/considerations_in_adopting_rhel_10/security)

Repository implication: deployment verification should exercise the actual
UBI runtime against SQL Server, the identity provider, HSA, and configured
external HTTPS endpoints. Certificate or cipher compatibility cannot be
inferred solely from a successful Debian-based development run. Do not add
`DEFAULT:SHA1` as a troubleshooting command for UBI 10. Prefer replacing weak
certificates or updating the peer's TLS configuration. The
[SQL Server certificate research](sql-server-self-signed-tls-research.md)
already recommends SHA-256 or stronger signatures.

The upstream policy documentation describes RHEL libraries and defaults. It
does not by itself prove the effective configuration of every Node.js build,
custom TLS option, or deployed container. Verify behavior with the actual
release image and configuration.

## Redistribution, licenses, and sources

The UBI EULA preserves the licenses of individual components and requires the
unmodified EULA in distributions of derived container images. It does not
grant Red Hat services or support, and restricts statements implying Red Hat
support or endorsement.
[UBI EULA, sections 1 and 2](https://www.redhat.com/licenses/EULA_Red_Hat_Universal_Base_Image_English_20190422.pdf)

Red Hat makes source container images available for UBI-based images. These
are retrieved using Skopeo and cannot be run as application containers. The
source image corresponds to a binary image version; availability can lag a
binary release.
[Getting UBI container image source code](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/building_running_and_managing_containers/adding-software-to-a-ubi-container#getting-ubi-container-image-source-code)

Repository observation: the shared helper installs the original UBI EULA and
project `LICENSE`, retaining inherited base-image license files. The current
release packaging does not collect corresponding upstream source containers
or publish a source archive for the image's RPM content. Documentation should
describe these mechanisms accurately, without claiming that the license PDF,
SBOM, or application source archive is a complete corresponding-source bundle.
Any distribution assessment must examine the actual component licenses and
delivered artifacts separately.

## Support and certification

Red Hat's redistribution guidance distinguishes using UBI from obtaining
Red Hat container certification. Derived images must not be described as
Red Hat certified or supported solely because their base is UBI.
[Redistributing UBI images](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/building_running_and_managing_containers/working-with-container-images#redistributing-ubi-images)

Repository implication: preserve the existing distinction between
[guide-based deployment verification](../operations/CONTEXT.md) and Red Hat
certification, qualification, or support. Successful repository checks provide
evidence for the tested release and environment only.
