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

## Runtime security packages

Red Hat can publish a fixed RPM in the public UBI 10 repositories before
it publishes a refreshed base image. The shared helper's
`security_update_packages` list closes that gap for inherited base packages:
the helper upgrades only the listed packages from the public BaseOS and
AppStream repositories and removes package-manager metadata. The hook is
permanent; an empty list skips the upgrade.

| Packages | Vulnerabilities | Fixed version | Advisory |
| --- | --- | --- | --- |
| `nodejs24`, `nodejs24-libs`, `nodejs24-full-i18n`, `nodejs24-npm` | Node.js security fixes, including `CVE-2026-109829` | `24.22.1-3.el10_2` | [Red Hat CVE record](https://access.redhat.com/security/cve/CVE-2026-109829) |
| `c-ares` | `CVE-2026-69184`, `CVE-2026-69186` | `1.34.6-5.el10_3.2` | [Red Hat CVE record](https://access.redhat.com/security/cve/CVE-2026-69184) |
| `libxml2` | `CVE-2026-74860`, `CVE-2026-86140` | `2.12.5-15.el10_3.2` | [Red Hat CVE record](https://access.redhat.com/security/cve/CVE-2026-74860) |
| `libblkid`, `libmount`, `libsmartcols`, `libuuid` | `CVE-2026-53615` | `2.40.2-24.el10_3.24` | [Red Hat CVE record](https://access.redhat.com/security/cve/CVE-2026-53615) |
| `krb5-libs` | Kerberos security fixes in `RHSA-2026:99624` | `1.21.3-11.el10_3.2` | [Red Hat advisory](https://access.redhat.com/errata/RHSA-2026:99624) |

This table is the record for every list entry. Add a package to the list and
this table when a fixable container finding affects an inherited base RPM.
Confirm that UBI 10 BaseOS or AppStream supplies the fixed version before
treating an entry as remediation. A vendor advisory can precede public UBI
package availability; an entry prepared during that gap does not establish
that a rebuild installs the fix. Verify the installed RPM in the rebuilt
images and require the completed-image vulnerability gate to pass before
release. Prefer the supported package update over a vulnerability exception.
Remove an entry when the unmodified pinned runtime base contains the fixed
version, for example:

```sh
docker run --rm --platform linux/amd64 --entrypoint rpm \
  "<pinned-runtime-reference>" -q libxml2
```

These updates apply during an uncached helper build; cached layers retain the
packages installed when they were built. Rebuild without cache when checking
for newly published RPM fixes. Workload packages and the provisioner's locked
toolchain remain the responsibility of their consuming Dockerfiles.

The selected minimal base includes `openssl-libs-3.5.8-2.el10_2`, which also
fixes [CVE-2026-84782](https://access.redhat.com/security/cve/CVE-2026-84782).
It includes fixed curl, Brotli, PCRE2, certificate, and RPM cryptography
packages, so these packages need no additional helper update.
The shared helper uses the inherited OpenSSL library. The provisioner additionally
installs its locked OpenSSL 3.5.9 CLI package from the public UBI 10 BaseOS
repository. The container vulnerability policy evaluates the completed images.

The helper removes the inherited development-only Nodemon RPM. Runtime images
start Node.js directly and do not use this runner. Removing it also removes its
bundled vulnerable brace-expansion dependency, which is outside the application's
npm lockfile and is affected by
[GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7).

Deploy a new immutable project release to receive the updated runtime packages.
Existing release images and installed containers do not change when a base pin
or a public RPM repository changes.

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
