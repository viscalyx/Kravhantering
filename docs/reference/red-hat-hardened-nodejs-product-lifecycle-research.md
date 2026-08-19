# Red Hat Hardened Node.js product and lifecycle research

Research date: 2026-08-19

## Decision summary

Red Hat Hardened Images provides a public, no-cost Node.js image family that
currently covers the repository's Node.js 24 major, Linux on AMD64 and Arm64,
multi-stage builder and runtime use, signed images, per-image SBOM data, and
FIPS variants. It is a credible candidate for a later compatibility evaluation.
The product facts do not justify an unconditional base-image replacement.

The following distinctions constrain every later decision:

- The UBI license terms referenced by the Node.js image are contractual. They
  allow redistribution subject to license, notice, trademark, and export
  obligations. Free access alone does not grant support or maintenance.
- Catalog contents, tags, and metadata describe the service at the research
  snapshot. They are not a lifecycle or availability guarantee.
- Statements such as "near-zero CVEs" and remediation "typically within
  hours" are Red Hat product claims, not a published service-level guarantee
  for anonymous users.
- Image-level SBOM, signature, provenance, CVE, and FIPS evidence applies to
  the selected Red Hat image. It does not make the completed application image
  or deployed workload compliant, vulnerability-free, signed, or fully
  traceable.

No public Red Hat Hardened Images lifecycle schedule, free-tier remediation
SLA, or currently available paid LTS tag is identifiable in the primary
sources reviewed. Red Hat ties the current no-cost lifecycle to upstreams and
describes paid LTS as forthcoming. A later adoption decision therefore needs
an explicit support and end-of-life policy rather than treating catalog
presence as support.

## Evidence classification

This note uses four evidence classes:

1. **Contractual terms** are the Red Hat license terms linked from the image.
2. **Documented behavior** is current Red Hat product documentation, catalog
   data, registry behavior, or source code.
3. **Product claim** is Red Hat marketing or announcement language without a
   published contractual service level.
4. **Inference** is a consequence for this repository derived from the primary
   evidence. It requires validation before implementation.

## Access, cost, registries, and redistribution

Red Hat documentation says that Red Hat Hardened Images can be used without a
subscription. The GA announcement also describes every catalog image as free
of charge to use on any Linux distribution, Kubernetes version, or container
engine. These are documented access and product statements, not a grant of
support. See the
[Red Hat Hardened Images overview](https://docs.redhat.com/en/documentation/red_hat_hardened_images/1-latest/discover-evaluate_red_hat_hardened_images_overview)
and the
[GA announcement](https://www.redhat.com/en/blog/red-hat-hardened-images).

The canonical Node.js pull reference is
`registry.access.redhat.com/hi/nodejs:<tag>`. Anonymous manifest access works
at the research snapshot. The official Node.js catalog page also presents
unauthenticated access, Red Hat login, and registry-token access, and
recommends a registry service-account token for CI/CD automation. The same
repository namespace is available through `registry.redhat.io`, where access
requires authentication. See the
[Red Hat Ecosystem Catalog Node.js entry](https://catalog.redhat.com/en/software/containers/hi/nodejs/69c576b93c12f133e877c1b6)
and the
[Red Hat registry and signature documentation](https://docs.redhat.com/en/documentation/red_hat_hardened_images/1-latest/develop-run_containerized_tools_with_red_hat_hardened_images).

Red Hat's developer guidance describes Hardened Images as freely
redistributable like UBI and says that RHEL and OpenShift users receive support
under their standard SLA. The current Node.js image source labels its
distribution scope as `public` and links its license terms to the UBI EULA.
See
[Exploring distroless containers with Project Hummingbird](https://developers.redhat.com/articles/2026/04/28/exploring-distroless-containers-project-hummingbird)
and the immutable
[Node.js 22 Containerfile snapshot](https://gitlab.com/redhat/hummingbird/containers/-/blob/bf66abd5bec0de96c621ab579e215af754195329/images/nodejs-22/hummingbird/default/Containerfile).

The linked
[Red Hat UBI EULA](https://www.redhat.com/licenses/EULA_Red_Hat_Universal_Base_Image_English_20190422.pdf)
grants a perpetual worldwide license to the programs. Component licenses
permit running, copying, modification, and redistribution subject to their
individual obligations. For distributed images derived from the programs, it
requires the unmodified EULA, restricts unsupported Red Hat endorsement
claims, requires Red Hat trademarks to be removed when the UBI is modified,
and applies export-control obligations. The EULA explicitly grants no rights
to maintenance, upgrades, or support.

The Ecosystem Catalog additionally says that users must agree to the Red Hat
subscription agreement and that an existing negotiated agreement controls
where applicable. The image label and catalog therefore need to be read
together. **Uncertainty:** legal review should confirm the exact notice and
trademark mechanics for this project's derived images before they are
republished. Private CI use is technically straightforward, but redistribution
must not be treated as obligation-free.

## Current Node.js catalog snapshot

The live catalog API behind the supplied page exposes the following snapshot:

- streams `20`, `22`, `24`, `25`, and `26`;
- `26.7.0` as the catalog's current `latest` target;
- `default`, `builder`, `fips`, and `fips-builder` variants; and
- Linux manifest images for `amd64` and `arm64`.

The evidence is the supplied
[Node.js catalog page](https://images.redhat.com/?name=nodejs&tab=overview),
the catalog's
[Node.js overview API](https://api-hummingbird.hummingbird-project.io/v1/images/nodejs),
and its
[Node.js tag API](https://api-hummingbird.hummingbird-project.io/v1/images/nodejs/tags).
These endpoints are mutable service data, so the values above are a dated
snapshot rather than a promise that every stream or variant remains available.

Current Node.js tags include moving aliases such as `latest`, `24`, and
`24.18`; exact release tags such as `24.18.1`; and the variant suffixes
`-builder`, `-fips`, and `-fips-builder`. Red Hat's tag guidance says:

- use `latest` to test new features, not in production;
- use a major tag in development and CI to receive features and fixes;
- use a version-specific tag when compatibility testing must precede a
  change; and
- use an immutable digest when exact reproducibility is required.

See
[Plan your image strategy](https://docs.redhat.com/en/documentation/red_hat_hardened_images/1-latest/plan-plan_your_image_strategy_overview).
An immutable digest does not receive a fix automatically. Red Hat documents
that consumers must pull a mutable tag again or update a pinned digest and
rebuild the derived image. See
[Maintain and diagnose runtime issues](https://docs.redhat.com/en/documentation/red_hat_hardened_images/1-latest/troubleshoot-maintain_and_troubleshoot_red_hat_hardened_images).

## Upstream lifecycle versus catalog presence

Red Hat says that its current lifecycle is the lifecycle provided by upstreams
and describes optional subscription LTS images as a future offering. The
[GA announcement](https://www.redhat.com/en/blog/red-hat-hardened-images)
does not publish LTS availability, dates, prices, or service levels. The live
Node.js catalog exposes no separate LTS variant at the research snapshot.

The upstream
[Node.js Release Working Group schedule](https://github.com/nodejs/Release#release-schedule)
classifies the catalog streams as follows on the research date:

- Node.js 20 reaches end of life on 2026-04-30;
- Node.js 22 is Maintenance LTS through 2027-04-30;
- Node.js 24 is Active LTS, enters maintenance on 2026-10-20, and reaches end
  of life on 2028-04-30;
- Node.js 25 reaches end of life on 2026-06-01; and
- Node.js 26 is Current, is scheduled to enter LTS on 2026-10-28, and reaches
  end of life on 2029-04-30.

The upstream schedule says that its dates are subject to change. It also says
that odd-numbered lines do not become LTS. Catalog availability of Node.js 20
and 25 after their upstream end-of-life dates demonstrates why availability
must not be interpreted as a support commitment.

For this repository, `.nvmrc`, `package.json`, and the current application
container builds select Node.js 24. Node.js 24 exists in the Red Hat catalog
and remains upstream Active LTS at the research snapshot. This alignment is a
necessary compatibility condition, not proof that the application works on
the Red Hat image.

## Update cadence, remediation, support, and SLA

Red Hat says its automated pipelines track upstream projects and security
feeds and deliver fixes "typically within hours" after a vulnerability has an
upstream fix. The product page says Red Hat aims for a "near-zero" known-CVE
state when an image is released. These are product claims. They do not specify
a maximum response time, upstream-fix dependency exception, severity-specific
deadline, availability target, or remedy for missed performance. See the
[GA announcement](https://www.redhat.com/en/blog/red-hat-hardened-images)
and the
[Red Hat Hardened Images product page](https://www.redhat.com/en/products/hardened-images).

Red Hat's product overview advertises optional commercial support with clear
SLAs, while its developer guidance says RHEL and OpenShift subscribers receive
support under their standard SLA. No SLA text specific to Hardened Images is
linked from those statements. The UBI EULA grants no support right by itself.
Consequently:

- anonymous or no-cost consumption has no identified contractual remediation
  or lifecycle SLA;
- an existing RHEL or OpenShift agreement may supply support, but its actual
  scope and service level must be checked in that agreement; and
- a future paid LTS offering cannot be planned as available until Red Hat
  publishes orderable terms, covered Node streams, lifecycle dates, and SLAs.

The first two source statements are in
[Red Hat Hardened Images: Filter the noise, focus on the code](https://www.redhat.com/en/resources/hardened-images-filter-noise-focus-code-overview)
and
[Exploring distroless containers with Project Hummingbird](https://developers.redhat.com/articles/2026/04/28/exploring-distroless-containers-project-hummingbird).

## SBOM, signatures, provenance, and CVE evidence

Red Hat documentation says the catalog exposes an SBOM for the selected image
tag and that the SBOM lists its components, libraries, and dependencies. The
product overview identifies SPDX as the standard format. Red Hat recommends
auditing an immutable digest rather than a mutable tag. See
[Compliance verification by using image SBOMs](https://docs.redhat.com/en/documentation/red_hat_hardened_images/1-latest/develop-sbom_and_compliance)
and the
[product overview](https://www.redhat.com/en/resources/hardened-images-filter-noise-focus-code-overview).

Red Hat signs every catalog image at build time. The documented `cosign`
procedure verifies the image with Red Hat's public key and fails nonzero for a
missing or invalid signature. RHEL can enforce Sigstore verification for Red
Hat registries through its container trust policy. See
[Verify the integrity of Red Hat Hardened Images](https://docs.redhat.com/en/documentation/red_hat_hardened_images/1-latest/develop-run_containerized_tools_with_red_hat_hardened_images).

Red Hat says the images come from a SLSA 3 build pipeline with attestations.
The live Node.js detail API reports `SLSA Build L3`, Konflux CI, the source
repository, source commit, and Containerfile for each architecture. See the
[Node.js 22.23.2 detail API](https://api-hummingbird.hummingbird-project.io/v1/images/nodejs/details/22.23.2)
and the
[Red Hat product overview](https://www.redhat.com/en/resources/hardened-images-filter-noise-focus-code-overview).

Red Hat also exposes catalog CVE reporting and publishes Red Hat security
advisories for Hardened Images. These records establish transparency and a
base-image remediation channel. They do not guarantee zero CVEs at all times.

### Workload-complete boundary

The Red Hat evidence terminates at the selected Red Hat image. This project
adds npm packages, compiled Next.js output, project scripts, configuration,
certificates, and deployment controls. Therefore, as an inference:

- the Red Hat SBOM is not the final application-image SBOM;
- the Red Hat signature does not sign the project's derived image;
- Red Hat provenance does not cover the project's source, npm dependency
  resolution, or final build pipeline;
- Red Hat's CVE count does not include application and npm vulnerabilities;
  and
- a clean base-image scan does not establish a clean workload scan.

A workload-complete supply-chain decision must generate and verify evidence
for the final image, preserve the pinned base digest as one input, scan both
base and application content, and sign the released artifact through the
project's own release pipeline.

## FIPS scope

All Node.js streams in the current catalog expose `fips` and `fips-builder`
variants. Red Hat's precise documentation says that a FIPS runtime variant is
optimized for a host operating in FIPS mode and ensures that the application
uses validated cryptographic modules in restricted environments. See
[Plan your image strategy](https://docs.redhat.com/en/documentation/red_hat_hardened_images/1-latest/plan-plan_your_image_strategy_overview).

Selecting a `-fips` tag alone is not workload-complete FIPS evidence. As an
inference, the host must operate in the required mode, the deployed digest and
module certificate relationship must be recorded, application dependencies
must not bypass the validated modules, and the complete deployment must be
tested against the applicable compliance boundary. Red Hat's broader phrase
"FIPS-validated variants" should not be expanded into a claim that every
derived image or workload is automatically FIPS compliant.

## Compatibility and CI/CD expectations

Red Hat's generic model separates builder and runtime variants. Builder images
include `dnf` and Bash for dependency installation and compilation. Minimal
runtime images remove development tools. The Node.js catalog recommends
running `npm ci` in `nodejs:<tag>-builder`, then copying application artifacts
into `nodejs:<tag>`. See the live
[Node.js overview API](https://api-hummingbird.hummingbird-project.io/v1/images/nodejs)
and
[Plan your image strategy](https://docs.redhat.com/en/documentation/red_hat_hardened_images/1-latest/plan-plan_your_image_strategy_overview).

Hummingbird aims for compatibility with popular community images, but Red Hat
says migration may require Containerfile changes. Its examples call out
non-root defaults and shell-free instructions. Node.js is specifically a
compatibility-oriented exception that retains npm. The current Node.js 22
source also sets user `65532`, `HOME=/tmp`, work directory `/app`, a
`docker-entrypoint.sh` entry point, and `node` as the default command. It
includes several command-line utilities and uses a shell entry-point script,
so the generic word "distroless" must not substitute for inspection of the
exact variant and digest. See
[Build trusted containers with Project Hummingbird](https://developers.redhat.com/articles/2026/05/05/build-trusted-python-containers-project-hummingbird-and-calunga),
[Exploring distroless containers](https://developers.redhat.com/articles/2026/04/28/exploring-distroless-containers-project-hummingbird),
and the immutable
[Node.js Containerfile](https://gitlab.com/redhat/hummingbird/containers/-/blob/bf66abd5bec0de96c621ab579e215af754195329/images/nodejs-22/hummingbird/default/Containerfile).

The repository's current Dockerfiles assume the Docker Hub image's `node`
user and group, use shell-form build commands and heredocs, delete npm from
runtime stages, and install OpenSSL with `apt-get` in one runtime image. A
later prototype must account for UID and ownership differences, replace
Debian package operations with builder-stage equivalents, prove native npm
module compatibility, verify writable paths and CA behavior, and test every
application, database-job, seed, mock, and adapter target. The facts above do
not establish those results.

For CI/CD, use registry service credentials when operational reliability and
auditing require authenticated pulls. Use moving tags only where automatic
updates are intentional, record their resolved digest, verify the Red Hat
signature, and promote a tested digest into production. Rebuild derived
images when the selected Red Hat tag moves. If the project republishes a
derived image, apply the UBI EULA and component-license obligations and attach
the project's own workload-complete SBOM, provenance, scan, and signature.

## Unresolved uncertainties

The following questions remain open for later decision tickets:

- Which Red Hat agreement, if any, covers this project's production
  deployment, and what Hardened Images support and SLA does it actually grant?
- Is a paid Hardened Images LTS offering orderable now, which Node streams does
  it cover, and what lifecycle dates and remedies are contractual?
- How long does Red Hat retain superseded tags and upstream end-of-life
  streams, and what notice precedes removal?
- Which registry endpoint and authentication model does Red Hat recommend as
  the durable CI/CD contract during the catalog's registry transition?
- What exact EULA, component-license, trademark, and notice files must the
  project include when distributing each derived image?
- Which FIPS certificates and operating-environment requirements correspond
  to the exact Node.js 24 FIPS digest selected for evaluation?
- Does the final Kravhantering workload pass functional, native-module,
  filesystem, certificate, observability, vulnerability, and performance
  testing on the selected runtime and builder pair?

Until these questions are resolved, the safe interpretation is that Red Hat
Hardened Node.js is available for evaluation and may improve the base-image
security posture, but its catalog presence and product claims are not a
complete production support, lifecycle, compliance, or workload-security
decision.
