# UBI Node.js 24 vendor and security note

Research cutoff: 2026-09-04 UTC. This note covers the exact Linux AMD64
images pinned by this prototype and separates vendor facts from local
inference.

## Decision summary

- The UBI images contain Node.js 24.19.0 because their current Red Hat RPM is
  built before upstream 24.20.0. The subsequent image advisories refresh the
  UBI base and reuse that RPM; they are not Node.js 24.20.0 releases.
- Red Hat has not published a public UBI 10 `nodejs24` 24.20.0 RPM or a date
  for one at the cutoff. Node.js 24.20.0 is an ordinary LTS feature release,
  not a Node.js security release and not, by itself, a disposition for the
  three findings here.
- Red Hat currently calls RHEL 10 `curl` affected by CVE-2026-8458 and
  `nodejs24` affected by CVE-2026-82417 and CVE-2026-84375. Its CVE records do
  not yet list fixed RHEL 10 releases. Upstream fixes exist, but Red Hat may
  backport them without rebasing the visible upstream version.
- None of the three CVE trigger paths appears in the six normal workload
  commands. That is a reachability inference, not Red Hat VEX. It cannot by
  itself turn a blocking vendor-package finding into a clean scan.
- `nodejs-24-minimal` deliberately contains npm and nodemon for its documented
  production and development launch modes. It inherits package-management
  tools and curl from its S2I/UBI base. Red Hat documents package-aware
  customization and a separate UBI Micro construction pattern, but no
  supported `nodejs-24-minimal` switch or recipe that strips these tools while
  preserving the prebuilt runtime contract.

Unresolved at the cutoff: Red Hat publishes no date for a 24.20.0 UBI RPM,
no fixed RHEL 10 release for any of the three findings, and no product analysis
is yet available from NVD for the two future-dated JavaScript CVEs. These are
unknowns, not evidence that a fix is unavailable permanently.

## Why UBI has 24.19.0 while `node:24-trixie-slim` has 24.20.0

### Version and publication facts

- Upstream releases Node.js
  [24.19.0 on 2026-08-03](https://nodejs.org/en/blog/release/v24.19.0) and
  [24.20.0 on 2026-08-26](https://nodejs.org/en/blog/release/v24.20.0).
  The 24.20.0 release page labels it LTS and lists feature and dependency
  updates; it does not label it a security release. It upgrades bundled npm
  to 11.19.0.
- The preceding dedicated upstream
  [Node.js 24 security release](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases)
  is 24.18.1 on 2026-07-29. Red Hat's later
  [RHSA-2026:61377](https://access.redhat.com/errata/RHSA-2026%3A61377)
  ships 24.19.0 for three other Node.js CVEs; it does not name the findings in
  this note.
- The exact current
  [UBI builder image in Pyxis](https://catalog.redhat.com/api/containers/v1/repositories/registry/registry.access.redhat.com/repository/ubi10%2Fnodejs-24/tag/latest)
  has AMD64 digest
  `sha256:5295d1fd8e46aebad1e9da107c62bc4a5cfe8bca5fd1175a7b0a523fa977866a`
  and creation date 2026-09-02. The exact
  [minimal image](https://catalog.redhat.com/api/containers/v1/repositories/registry/registry.access.redhat.com/repository/ubi10%2Fnodejs-24-minimal/tag/latest)
  has AMD64 digest
  `sha256:f0e6f6fa5bd82741bdf9b304341c94bbac4268a7f94d710c26eac01f20528c2b`
  and creation date 2026-09-01.
- The minimal image's
  [Red Hat RPM manifest](https://catalog.redhat.com/api/containers/v1/images/id/6a968912a3233a7323e8f864/rpm-manifest)
  contains `nodejs24-24.19.0-1.el10_2` and
  `nodejs24-npm-11.17.0-1.24.19.0.1.el10_2`. UBI repository metadata records
  the Node RPM build time as 2026-08-18, eight days before upstream 24.20.0.
- The image advisories
  [RHBA-2026:61928](https://catalog.redhat.com/api/containers/v1/advisories/redhat/id/RHBA-2026:61928)
  and
  [RHBA-2026:62475](https://catalog.redhat.com/api/containers/v1/advisories/redhat/id/RHBA-2026:62475)
  say that the UBI/RHEL base images are updated. They list Node.js 24 images
  among many rebuilt Application Stream images and contain no CVEs.
- At the cutoff, the public
  [UBI 10 AppStream repository metadata](https://cdn-ubi.redhat.com/content/public/ubi/dist/ubi10/10/x86_64/appstream/os/repodata/repomd.xml)
  still resolves `nodejs24` to 24.19.0. No official source located in this
  research announces a Red Hat 24.20.0 publication date.
- Docker Hub's
  [official Node image tags](https://hub.docker.com/_/node/tags?name=slim)
  map `24-trixie-slim` to `24.20.0-trixie-slim`. That image consumes upstream
  Node release artifacts directly; the UBI image consumes Red Hat RPMs.

### Inference

The version gap is normal packaging cadence, not evidence that 24.19.0 is a
Red Hat security fork. The September UBI rebuilds use the available August 18
RPM, while Docker Official Images can move directly to the August 26 upstream
artifact. A future Red Hat update may rebase to 24.20.0 or backport fixes onto
24.19.0; the current primary sources establish neither outcome nor timing.

Moving to 24.20.0 would improve upstream currency, but must not be used as the
acceptance test for these findings. CVE-2026-8458 belongs to curl, and the two
Node-related findings belong to packaged JavaScript dependencies rather than
the Node.js engine. Each requires a vendor fixed-package or defensible VEX
disposition.

## Current findings and reachability

### CVE-2026-8458: curl/libcurl

Facts:

- The [curl project advisory](https://curl.se/docs/CVE-2026-8458.html) says
  affected libcurl versions can reuse a Negotiate-authenticated connection for
  the wrong service. Triggering requires the same host, port and credentials,
  different Negotiate service names, and a still-live pooled connection. The
  curl CLI is also affected. Upstream fixes the issue in curl 8.21.0 on
  2026-06-24.
- The
  [Red Hat CVE record](https://access.redhat.com/hydra/rest/securitydata/cve/CVE-2026-8458.json)
  rates it Important, marks RHEL 10 `curl` as `Affected`, says no acceptable
  mitigation is available, and lists no fixed RHEL 10 release.
- The exact UBI image has `curl` and `libcurl-minimal`
  `8.12.1-4.el10_2.4`. The public
  [UBI 10 BaseOS repository metadata](https://cdn-ubi.redhat.com/content/public/ubi/dist/ubi10/10/x86_64/baseos/os/repodata/repomd.xml)
  still exposes that release as current at the cutoff.

Inference for these workloads:

The application entrypoints run Node.js and the repository has no runtime use
of HTTP Negotiate or libcurl service-name options. Merely having curl installed
does not execute the vulnerable path, so normal workload operation appears
not reachable. The path becomes relevant if an operator or injected process
uses curl/libcurl with those exact authentication and pooling conditions.

### CVE-2026-82417: `qs`

Facts:

- The
  [upstream `qs` advisory](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g)
  affects 2.2.5 through 6.15.3 and fixes the issue in 6.16.0. A trigger must
  pass an attacker-shaped object with a truthy, non-callable
  `constructor.isBuffer` member to `qs.stringify`. A `qs.parse` to
  `qs.stringify` round trip can create it when `plainObjects: true` or
  `allowPrototypes: true` is used. Typical framework handling produces one
  HTTP 500; an uncaught asynchronous throw can terminate a worker.
- The
  [Red Hat CVE record](https://access.redhat.com/hydra/rest/securitydata/cve/CVE-2026-82417.json)
  rates it Important and marks RHEL 10 `nodejs24` as `Affected`. It lists no
  fixed RHEL 10 release. Its mitigation is to avoid reserializing
  attacker-influenced objects, keep `allowPrototypes` false, and catch
  `qs.stringify` errors until an update is available.
- The NVD record is still
  [Awaiting Analysis](https://nvd.nist.gov/vuln/detail/CVE-2026-82417) at the
  cutoff. The upstream advisory, not an NVD product analysis, supplies the
  affected and fixed ranges.

Inference for these workloads:

This is not a Node.js engine flaw. The application lock contains fixed
`qs` 6.16.0, and no direct `qs.stringify` call is present. Inspection of the
vendor image layer finds no installed `qs` package; the prototype also removes
the npm tree. Grype nevertheless matches Red Hat's `nodejs24` source-package
status to the installed `nodejs24`, `nodejs24-libs`, `nodejs24-full-i18n`, and
`nodejs24-npm` RPM records. Reachability therefore appears absent, but the
scanner result remains expected until Red Hat changes the package status or a
reviewed VEX/exception accounts for the mismatch.

### CVE-2026-84375: `js-yaml`

Facts:

- The
  [upstream `js-yaml` advisory](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh)
  affects 3.0.0 before 3.15.2 and 4.0.0 before 4.3.2. A crafted YAML document
  repeatedly merges an alias containing many empty mappings, causing
  quadratic CPU work because the configured merge-key budget does not count
  those mappings. Versions 3.15.2 and 4.3.2 contain the fixes.
- The
  [Red Hat CVE record](https://access.redhat.com/hydra/rest/securitydata/cve/CVE-2026-84375.json)
  rates it Important and marks RHEL 10 `nodejs24` as `Affected`. It lists no
  fixed RHEL 10 release or mitigation. The
  [human-readable Red Hat record](https://access.redhat.com/security/cve/cve-2026-84375)
  explains that `Affected` can precede a future fix but is not a publication
  promise.
- NVD still labels its record
  [Received](https://nvd.nist.gov/vuln/detail/CVE-2026-84375) at the cutoff;
  the upstream advisory supplies the version and trigger details.

Inference for these workloads:

This is also not a Node.js engine flaw. The application lock contains
`js-yaml` 5.2.2 only as a development dependency, and its YAML parsing uses
are build/security scripts rather than the six runtime commands. Inspection
of the vendor image layer finds no installed `js-yaml` package, and the
prototype removes npm. As with CVE-2026-82417, Grype is matching the Red Hat
RPM/source-package status, so absent runtime reachability does not make the
package-level finding disappear.

## Is the extra runtime content intentional, and can it be removed?

### Image-content facts

- The official
  [`nodejs-24-minimal` Containerfile](https://github.com/sclorg/s2i-nodejs-container/blob/master/24-minimal/Dockerfile.rhel10)
  explicitly installs `nodejs24`, `nodejs24-full-i18n`, `nodejs24-npm`, and
  `nodejs-nodemon`, plus S2I-support packages. It uses
  `ubi10/s2i-core:latest` as its base.
- The official
  [minimal-image usage guide](https://github.com/sclorg/s2i-nodejs-container/blob/master/24-minimal/README.md)
  says its S2I run script uses `npm run` in production and nodemon in
  development mode. It also documents `NODE_CMD` and `INIT_WRAPPER` as ways to
  launch the application without npm, but does not document removing npm or
  nodemon from the image.
- The official
  [`s2i-core` Containerfile](https://github.com/sclorg/s2i-base-container/blob/master/core/Dockerfile.rhel10)
  starts from the standard `ubi10:latest`, describes package tooling as part
  of S2I functionality, and installs `yum` plus common utilities. The exact
  image RPM manifest confirms curl, libcurl, microdnf, RPM, npm, and nodemon
  are installed.
- Red Hat distinguishes
  [UBI Minimal and UBI Micro](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/building_running_and_managing_containers/types-of-container-images):
  UBI Minimal deliberately includes microdnf, while UBI Micro deliberately
  excludes a package manager and its dependencies. Red Hat documents a
  [Buildah install-root procedure for UBI Micro](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/building_running_and_managing_containers/adding-software-to-a-ubi-container#using-the-ubi-micro-images_adding-software-to-a-ubi-container),
  but does not publish an equivalent prebuilt UBI Micro Node.js 24 image in
  these sources.

### Inference and practical consequence

The `-minimal` suffix means smaller than the full Node.js S2I builder; it does
not mean distroless or package-manager-free. npm and nodemon are deliberate
parts of Red Hat's runtime interface, while curl/RPM/DNF are deliberate
inherited base/S2I capabilities.

A derived image can replace the S2I command with direct `node` execution and
perform a package-manager transaction to remove unneeded packages, reviewing
the proposed dependency transaction before accepting it. That is more
auditable than deleting files because it keeps the RPM database aligned with
the filesystem. It is customization, however, not a Red Hat-documented
`nodejs-24-minimal` profile. Switching to UBI Micro is a separate image design
that must reconstruct the Node runtime and re-evaluate support,
redistribution, update, and scanning contracts.

The prototype's direct deletion of `/usr/lib/node_modules_24/npm` and the
`npm`/`npx` links breaks the documented S2I npm launch contract and leaves
`nodejs24-npm` registered in the RPM database. It also leaves nodemon and the
package-management stack. Most importantly, the Red Hat CVE feed attaches the
two JavaScript CVEs to the `nodejs24` source package, so even package-aware
removal of the npm and nodemon RPMs would not necessarily clear matches on the
Node engine and library RPMs. A clean blocking scan therefore depends on a
Red Hat fixed package/metadata update or an explicit, evidence-backed
exception/VEX decision, not only filesystem pruning.
