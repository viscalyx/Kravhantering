# Trusted Container Publishing

The trusted container flow runs from `.github/workflows/container-release.yml`
for `main`, stable `vX.Y.Z` tags, and manual workflow runs. Preview release
tags such as `vX.Y.Z-preview.N` are created by the `main` run and are excluded
from the tag trigger so the preview tag push does not start a second container
release workflow.

Pull requests report five independent candidate build and vulnerability results
and `Production Assembly Acceptance`. Assembly consumes only successful
app-runtime and db-job artifacts on a separate Ubuntu runner. It inspects core
containment and runs one author browser journey through HTTPS. Trusted release
retains deep lifecycle, recovery, boundary, concurrency, cleanup, and HSA
qualification, including the mTLS provisioner candidate. See
[CI integration ownership](ci-integration-ownership.md) for exact check names,
artifact relationships, and the owner-managed branch-protection update.

The workflow builds the production `app-runtime` and `db-job` images, the
optional `kravhantering-demo-seed` image, the HSA person lookup adapter and the
one-shot strict-PKI provisioner, and the test-only `hsa-directory-mock` image
once each as local OCI candidate archives.
Buildx metadata and the OCI layout must agree on the candidate manifest digest.
Release metadata also records every platform manifest represented by an OCI
index.

## Application UBI Inputs

The application dependency, application build, and transient-cleanup compiler
stages use the public UBI 10 Node.js 24 builder. The application runtime uses
the public UBI 10 Node.js 24 minimal image. Both roles have independent immutable
pins in `containers/app/Dockerfile`, maintained by the `ubi-node-builder` and
`ubi-node-runtime` dependency lanes. Public builds require no Red Hat account,
subscription, credentials, or private package source.

See [shared UBI runtime packaging](../../containers/node/README.md) for the
complete image scope, build network access, and retained license files. Build
and test hosts must meet the UBI 10 CPU requirements documented there.

The builder installs the npm version selected by `packageManager` before
`npm ci`. The application keeps the locked glibc native packages and Next.js
standalone tracing. The shared `containers/node/ubi-compat.sh` adaptation creates
the supported `node` identity at UID/GID `1000:1000` and removes the runtime npm
CLI. Inherited nodemon remains present. Consumers declare workload packages
separately and explicitly set their command, entrypoint, home, path, and user.
The builder resets the S2I npm prefix to `/usr/local`; runtime command execution
uses system paths and bypasses the inherited S2I entrypoint.

The application keeps port 3000, its authentication startup checks, private CA
and client-key mounts, read-only root, and existing writable mounts. Numeric
administrative user overrides remain supported. This does not introduce a new
arbitrary-UID OpenShift contract. Existing production smoke remains the
functional acceptance gate.

For focused local image checks, build the application image and run:

```bash
npm run container:build:app-runtime
KRAVHANTERING_APP_RUNTIME_IMAGE=localhost/kravhantering/app-runtime:local \
  npx vitest run tests/container-integration/app-runtime.test.mjs
```

These checks exercise the selected local image's identity, commands, native
processing, standalone assets, filesystem containment, and startup rejection.
They do not replace the exact-candidate SBOM, policy, or production smoke gates.

## Database Job UBI Inputs

The database dependency stage uses the same public UBI builder pin and npm
policy. It installs only the locked `mssql`, `reflect-metadata`, and `typeorm`
subset with development and optional packages omitted and install scripts
disabled. The separate demo image reuses this dependency stage.

The production `db-job` uses the minimal runtime pin and shared compatibility
adaptation. Its default command remains `health`; migration, required seeds,
runtime permission reconciliation, and provider-secret maintenance retain their
existing CLI. Demo-only seed and clear commands remain restricted to the demo
image. Compiled transient cleanup uses `/usr/local/bin/node`, supplied by the
shared adaptation, so the existing scheduled service needs no command change.
The supported identity remains UID/GID `1000:1000`, including numeric
administrative overrides, read-only roots, and the existing temporary mount.
SQL Server encryption and certificate verification settings remain unchanged.

For focused local image checks:

```bash
npm run container:build:db-job
KRAVHANTERING_DB_JOB_IMAGE=localhost/kravhantering/db-job:local \
  npx vitest run tests/container-integration/db-job.test.mjs
```

These checks exercise identity, the database package subset, filesystem
containment, the compiled cleanup command, and rejected administrative
commands. Verify database connectivity, migration and permission outcomes with
a disposable SQL Server database using the
[SQL Server developer workflow](./sql-server-developer-workflow.md).
The production smoke gate supplies the integrated deployment evidence.

## Candidate Verification

Syft generates an SBOM directly from each candidate archive. Grype scans every
SBOM with an updated vulnerability database, and the committed exception policy
evaluates the complete reports. The release smoke job stages the real production
deployment archive, installs it for a dedicated rootless user on Ubuntu 24.04,
and loads those same candidate archives into that user's Podman store without
rebuilding. GHCR authentication, release tag publication and final attestations
occur only after every candidate passes both the vulnerability and smoke gates.
Promotion first copies every candidate to a content-addressed, non-promoted
`candidate-sha256-*` GHCR tag and verifies all remote manifest digests. It then
applies the planned release tags from the verified remote identities and
verifies every published tag against the candidate manifest digest.

The production image identities are recorded in
`container-stack.lock.json`. The `manifestDigest` is the candidate and verified
registry manifest digest used for GitHub Artifact Attestations and SBOM
subjects. The `imageId` is the container image ID used by production operators
to verify runtime equivalence after tag-based pulls, internal-registry
mirroring or disconnected image transport.
The test support identities are recorded separately in
`container-test-support.lock.json`.
The optional demo seed image is recorded in release metadata and release notes,
not in the production or test-support lock files.
The release smoke test uses the production archive's single-node Quadlet
topology and a separate CI-only HSA overlay. Production deployment and upgrade
guides use tag-style runtime refs by default and verify them against locked image
IDs. The production helper also accepts tag-and-digest refs when a site
explicitly chooses pull-time digest pinning.

The Buildx candidate steps disable BuildKit's default registry provenance
attestations with `--provenance=false`. The workflow publishes provenance and
SBOM evidence explicitly through GitHub Artifact Attestations without pushing
the attestation OCI artifacts back into GHCR. This keeps GitHub Packages from
treating digest-derived attestation tags as the newest installable package
version while keeping the Buildx metadata shape stable enough to record both
`manifestDigest` and `imageId`.

After creating each production deployment archive, the workflow creates a
separate file attestation with the Kravhantering-owned
`attestations/deployment-release/v1` predicate. The signed predicate records
the repository, release version and tag, and source commit and ref. The
predicate-type URI identifies this repository-owned contract; neither the
workflow nor the verifier fetches executable code or trust material from that
URI. Cryptographic trust comes from the GitHub OIDC certificate, Sigstore
bundle, and trusted roots. The
workflow does not push this evidence or any signature helper artifact to GHCR.
It publishes the Sigstore bundle and current trusted-root material beside the
archive instead.

## Release Identity And Remediation Evidence

Each preview and stable run builds and verifies its own candidates. Digest
preservation applies within that run, not across preview and stable runs.
For observed remediation, retain the affected artifact, advisory and fixed
package, public fixed-base digest and availability timestamp, project image
digest, and stable publication timestamp. Record unavailable timestamps as
unknown. Detection does not establish public availability; preview publication
does not establish stable delivery, and publication does not establish operator
installation. Continue the existing maintenance and release policy without a
new schedule, urgent-release route or automatic site upgrade.

## Reproducibility

The workflow uses the Node version from `.nvmrc`, installs the exact npm
version declared by root `package.json`, and then installs dependencies with
`npm ci`. Change that canonical npm pin only through the reviewed dependency
maintenance workflow.

Stable and preview releases use the semantic version as the primary
`app-runtime` and `db-job` image tag recorded in `container-stack.lock.json`.
Preview releases also publish `main-<short-sha>` and `sha-<full-sha>` image
tag aliases for commit traceability. Preview releases use GitVersion's
`FullSemVer` or `SemVer` value, but Docker image tags and GitHub preview tag
names strip SemVer build metadata from the first `+` onward. For example,
`1.2.0-preview.4+Branch.main.Sha.abcdef` becomes `1.2.0-preview.4`.

Local Compose startup honors `--lock-file`; `run-local-stack.mjs` writes the
local image identities before `generate-compose.mjs` reads it. Trusted release
smoke does not use that Compose path. It stages the production archive from
recorded candidate metadata and the stack lock, then the archive's image helper
refuses image IDs that differ from the lock.

## Vulnerability Promotion Policy

`.github/container-vulnerability-exceptions.json` is the reviewed,
machine-readable exception source. The default document contains no
exceptions. Every exception must identify one vulnerability, release image,
package name and installed package version exactly. It also requires:

- a unique exception ID, owner and rationale;
- creation, next-review and hard-expiry dates;
- authoritative HTTPS references; and
- expected-fix status and details, with a tracking reference when a fix or
  upstream tracking item is known.

Wildcards, broad `all` or `any` scopes, malformed dates, stale reviews, expired
records and duplicate scopes fail the release. An active record must match one
current fixable High or Critical finding exactly. An exception that no longer
matches is stale and also fails the release, so obsolete suppressions cannot
accumulate unnoticed.

The policy decision suppresses a matching finding only from the blocking
decision. It does not filter the Grype report. Each decision records hashes of
the complete report and SBOM plus the candidate manifest digest. A failed gate
retains Buildx metadata, candidate identities, SBOMs, full Grype reports,
database status, the policy decision and smoke diagnostics as workflow
artifacts. It does not authenticate to GHCR, apply an OCI release tag, create a
final image or SBOM attestation, or publish a GitHub Release.

## Continuous Published-Release Scanning

`.github/workflows/container-vulnerability-monitor.yml` runs daily from
`main` in the canonical repository and supports manual dispatch as an earlier
retry. Both triggers perform the same complete reconciliation. There is no
release-publication, targeted, cross-workflow, or payload-driven path. One
fixed, non-cancelling concurrency group lets an active run finish and accepts
GitHub's normal coalescing of pending full-state runs.

The committed
`.github/container-release-support.json` selector defines the supported
release channels. The current policy scans the newest stable release and the
newest preview release. Stable means supported and monitored. Preview means
monitored, not supported. Change those bounded counts through normal review
when the product support policy changes.

### Trusted Input And Public Classification

For each selected release, the monitor downloads `release-metadata.json` and
every project-owned SPDX asset declared by that release. Releases predating the
strict-PKI provisioner declare five images; newer releases declare six. The
monitor requires the metadata and release assets to declare the same image set.
It verifies every GitHub Release asset against the SHA-256 digest returned by
the GitHub Releases API, requires the metadata to name the expected
`ghcr.io/viscalyx` image and immutable manifest digest, and verifies the SBOM
attestation against the trusted container release workflow and source commit.
The scan uses the release asset only when its JSON content exactly matches a
verified SPDX attestation predicate.

The monitor updates the Grype database once and scans every verified SBOM
without pulling or rebuilding an image. It evaluates all supported releases
together through `container-vulnerability-policy.mjs` and the same committed
exception file used by pull-request and release gates. The scheduled monitor
records both excepted and unexcepted fixable High or Critical findings.

Classification happens independently for every observation before
aggregation. Public observations are limited to version-guarded Debian DSA or
CVE evidence for `deb` packages, GitHub GHSA evidence for `npm` packages, and
the reviewed UBI 10 RPM contract below.
The namespace, match type, identifier, and exact canonical source must agree.
Public URLs are reconstructed from the validated identifier without fetching
advisory content. Generic URLs, aliases, CPE matches, unknown authorities,
malformed producer or database metadata, and public-looking siblings do not
qualify.

UBI RPM reporting requires Grype 0.110.0 exact direct or indirect matches
from `rpm-matcher`, namespace `redhat:distro:redhat:10`, and Red Hat distro
search evidence for major version 10. The distro search may include a minor
version. Package names and installed, searched, and fixed RPM versions must
pass the reviewed bounded syntax: an optional numeric epoch followed by
version and release, including RPM separators and pre/post-release markers.
Direct evidence must match the installed package; the scanner's explicit zero
epoch is accepted only for an installed version without an epoch and without
contradictory RPM epoch metadata. Indirect evidence must exactly match a
declared source package and its version. Found CVE and suggested fixed version
must agree with the observation.

The CVE identifier must match its exact
`https://access.redhat.com/security/cve/<CVE>` data source. Only RHSA identities
with an exact `https://access.redhat.com/errata/<RHSA>` link from that
observation's fix advisories replace the CVE link. Otherwise the validated
CVE link is used. Query strings, fragments, alternate hosts, credentials,
encoded paths, mismatched identifiers, and generic scanner URLs cannot become
public advisory links. A valid-looking RHSA cannot make an unverified CVE
source eligible. No advisory content is fetched during classification.

The RPM fixture uses synthetic identities and versions with the reviewed
[pinned Grype RPM matcher](https://github.com/anchore/grype/blob/v0.110.0/grype/matcher/rpm/matcher.go),
[match evidence serializer](https://github.com/anchore/grype/blob/v0.110.0/grype/matcher/internal/result/provider.go),
[Red Hat advisory mapping](https://github.com/anchore/grype/blob/v0.110.0/grype/db/v6/build/transformers/os/testdata/rhel-8.json),
and [RPM version syntax](https://rpm.org/docs/6.0.x/manual/spec.html).
It is not evidence of an actual release vulnerability. Other RPM namespaces,
unknown shapes, and contradictory evidence remain confidential. This affects
public eligibility only: all fixable High/Critical findings still enter the
unchanged full Grype policy and reviewed-exception gate, including confidential
observations. Their content, existence, and count cannot change public tracker
output.

### Identity, Current State, And Journal

Public tracking uses one issue for each release image version: one exact image
role plus one immutable published release tag. Automation owns this identity
only while the issue carries `automation:container-vulnerability-release` and
one valid versioned identity marker. Titles are display text. Removing the
label relinquishes ownership. The separate legacy
`automation:container-vulnerability` namespace is never used for lifecycle
state or mutated by this reconciliation.

The issue body is the complete current trusted public state. It includes the
role, release tag, immutable manifest digest, reconciliation time, and public
observations grouped by vulnerability. Human analysis belongs in ordinary
comments. A material change first receives one immutable reconciliation
journal with Added, Changed, and Removed sections, then the current state is
activated. Initial creation has no journal, and a timestamp-only refresh does
not create one. A journal root links the canonical workflow run and names the
restricted evidence artifact and its 30-day retention without copying any
restricted content.

The body and every automation comment are bounded to both 60,000 UTF-8 bytes
and 60,000 Unicode characters. Oversized current state uses at most ten parts
in one verified active A/B continuation bank. Oversized journals use at most
ten immutable linked parts. Splits occur only between complete vulnerability
groups, package rows, or journal entries. Automation stages, links, rereads,
and hash-verifies an inactive bank before activating the body last. It never
truncates an atomic item or depends on deleting comments.

### Lifecycle And Recovery

An issue is created only after the first public affected observation. While the
identity remains monitored, a trusted zero-finding state replaces the body and
closes the issue as completed. A later recurrence activates the affected state
before reopening the same issue.

When a complete trusted replacement window advances, each leaving identity is
terminalized once. The issue receives `monitoring-ended`, preserves its last
trusted state, and freezes. An open issue closes as not planned; an issue
already closed as completed stays completed. Last-known affected observations
are explicitly not confirmed fixed and may still affect users. A last-known
clean scan does not establish current safety after monitoring ends.

The monitor rereads complete tracker state and converges committed partial work
on retry. Journal publication precedes body, label, issue-state, and duplicate
changes. Failure before body cutover leaves the previous state active. Failure
after cutover during cleanup preserves the new state and is retried. One
identity failure does not roll back successful identities; the run collects
sanitized errors, attempts every independent identity, uploads evidence, and
then fails. The next daily run is automatic recovery, and manual dispatch is
the earlier operator recovery path.

### Private Reporting, Permissions, And Evidence

A finding without an authoritative public advisory URL is confidential. The
monitor never creates a public fallback issue or prints its identifying
details. When private vulnerability reporting is enabled, configure
`CONTAINER_VULNERABILITY_ADVISORY_TOKEN` as a narrowly scoped GitHub App or
fine-grained token with only Repository security advisories write access. The
credential is available only to the synchronization step. The monitor creates
or updates a draft private repository security advisory.
Published or otherwise human-resolved advisories remain under human control.
Without that configuration, the workflow reports only the count of skipped
confidential findings in restricted workflow output. Automated public issues
are not a vulnerability-reporting channel.

The normal workflow token has only `contents: read`, `packages: read`,
`attestations: read` and `issues: write`. Complete selection metadata, verified
attestation output, SBOMs, current database status, unfiltered Grype reports and
classification and policy results are retained together with the
reconciliation plan, tracker reads and operations, sanitized errors, and step
outcomes. The restricted artifact is uploaded on success or failure and kept
for 30 days. The workflow's only final failing step runs after the upload
attempt, so normal GitHub failed-run status and notifications remain the alert.

## Dependency Drift Detection

`.github/workflows/dependency-drift.yml` checks the npm and Lychee toolchains,
devcontainer base, remaining Docker Official Node input, independent UBI Node
builder and runtime roles, nginx, SQL Server, Keycloak, and Kong weekly from
`main`. A manual run can select one maintenance unit or all units. Image scans
follow each lane's supported-tag and immutable-identity policy; a selected UBI
`latest` channel reports digest drift within that channel.

The workflow completes registry validation and all selected remote detection
before changing any issue. A failure leaves existing detector-owned issues
untouched and fails the workflow.

Kong is a vendor-updated HSA integration support image. Its lock under
`containers/kong/` is copied into
`container-hsa-integration-support.lock.json` during container releases and is
used by the CI-only release-smoke overlay. Kong is not part of the required
production runtime topology. Dependency maintenance also requires
every active devcontainer and Azure VM Kong runtime reference to match the
lock's exact tag and Linux AMD64 manifest digest.

The HSA person lookup adapter, one-shot strict-PKI provisioner, and HSA
directory mock are project-owned support images. The container release
workflow builds and publishes
`kravhantering-hsa-person-lookup-adapter` and
`kravhantering-hsa-mtls-provisioner` and
`kravhantering-hsa-directory-mock` to GHCR with the same release tags as
`app-runtime` and `db-job`. The adapter is recorded in
`container-hsa-integration-support.lock.json` together with the provisioner;
the mock is recorded in
`container-test-support.lock.json`. All three images get SBOM and provenance
attestations. Their npm dependencies use native Dependabot lanes. The adapter
and mock consume both UBI Node roles; the provisioner consumes the minimal
runtime role and records its RPM toolchain separately. The Docker Official Node
lane continues to maintain the local HSA topology helper. Follow
[UBI Node maintenance](dependency-workflow.md#ubi-node-builder-and-runtime-maintenance)
to update one role and all of its consumers together.

Detector-created issues carry `automation:dependency-drift`, `dependencies`,
and `ready-for-agent`. A stable hidden marker owns deduplication. A successful
scan updates changed drift, closes resolved drift, and reopens unresolved drift
after manual closure. Active reviewed deferrals live in
`.github/dependency-maintenance.json` with the exact available version or tag,
a rationale, and an expiry date. A deferral applies only to that target, so a
same-lane patch or digest refresh remains actionable.

Use the exact skill named in the issue. The skill discovers all synchronized
repository surfaces dynamically, resolves compatibility work and immutable
identity, and runs the relevant verification. The detector never edits a
branch or pull request.

## Release Evidence

The GitHub Release page already shows the release tag, commit and workflow
provenance. The generated release body therefore focuses on the `Container
Images` section with semantic GHCR tags for normal pulls, the immutable GHCR
manifest digest references for `app-runtime` and `db-job` verification, and
the production deployment bundle assets. It also includes
`Deployment archive provenance verification` with the exact archive attestation
page, source identity, and downloadable bundle and trusted roots. Stable
releases use normal GitHub Releases; preview releases are marked as pre-releases
and are kept as part of the release evidence.

The `Container Images` section groups entries by container package, adds a
short purpose description for each image, and lists every published tag for
that release. Those tag entries link to the repository package version URL for
the exact tag when the GitHub Packages API is available during release-note
generation, for example
`https://github.com/<owner>/<repo>/pkgs/container/<package>/<version-id>?tag=<tag>`.
If the package-version lookup is unavailable, the notes fall back to the
repository package page.

When a release includes test support metadata, the generated notes also include
`Test Support Container Images`. That section lists
`kravhantering-hsa-directory-mock` separately from the production runtime
images so operators do not mistake it for a required production service.

When a release includes demo seed metadata, the generated notes include
`Demonstration Container Images`. That section lists
`kravhantering-demo-seed` as an explicit opt-in image for disposable demo and
test environments. The image defaults to `seed:demo` and also owns
`demo:clear --confirm-clear-non-required-data`, so applying and clearing demo
data use the same opt-in container boundary. It is not part of the production
deployment bundle or the standard `release.env.template`.

Release notes also include automatic change notes. Stable releases compare
against the previous published stable GitHub Release. Preview releases compare
against the previous published pre-release GitHub Release. When no previous
release of the same kind exists, the workflow does not let GitHub pick another
release kind as the changelog boundary.

The workflow asks GitHub to generate the `What's Changed` section with
`.github/release.yml`. That file groups pull requests by repository labels and
uses `Other Changes` as a catch-all so unlabeled merged work still appears.
Only pull requests labeled `ignore-for-release` are excluded from the generated
section. If GitHub-generated notes are unavailable, the release still publishes
with the runtime evidence below.

Contributors commit operator upgrade guidance under `## Unreleased` in
`docs/operations/operator-upgrade-notes.md` with the source changes. Every PR,
including automated PRs, selects exactly one declaration: **Operator notes
updated** or **No operator notes needed**. Updated notes require a meaningful
addition or correction; formatting alone is insufficient. No-notes requires no
justification. Reviewers assess semantic adequacy.

Both publishers validate notes from the exact release source before writes.
The GitHub Release page contains the complete applicable Unreleased guidance,
including entries shown in earlier previews. The deployment archive contains
the full committed document, including release history. An empty Unreleased
section is valid. Preview publication leaves the document intact.

Stable archival uses the tagged document as its membership boundary. It removes
only those exact delivered blocks from main and preserves newer entries and
history. Changed shipped guidance requires manual reconciliation. Stable
archive PRs retain the `OPERATOR_UPGRADE_NOTES_TOKEN` credential and existing
protected-branch and auto-merge process. Maintain that credential for archival.

```mermaid
sequenceDiagram
    participant Contributor
    participant PR as Pull request
    participant Main
    participant CI as Container release run
    participant Registry
    participant GitHub as GitHub Release
    Contributor->>PR: Commit source and required Unreleased guidance
    PR->>PR: Check declaration and committed document
    PR->>Main: Merge source and notes together
    Main->>CI: Select event paths and pin source SHA
    CI->>CI: Run fresh applicable validation
    CI->>CI: Validate exact committed notes and publication evidence
    CI->>Registry: Preserve matching images or publish missing images
    CI->>GitHub: Complete release page and required assets
    Note over CI,GitHub: Complete Unreleased page; full history in archive
    opt Stable tag
        CI->>PR: Open archive PR for tagged notes only
        PR->>Main: Retain newer notes and existing history
    end
```

Automatic previews require a main event with release-relevant inputs. A
previous failed run does not make a documentation-only or test-only merge
eligible. To publish current main explicitly, dispatch **Container Release**
from main with **preview** enabled. The dispatch event SHA remains fixed even
if main advances. Dispatch without preview requests validation. New previews
have no alternate branch or historical-source selector.

Both publishers inspect successful validation in the same trusted workflow
run, verify source and content identities, and preserve matching remote
content. Missing stages can be completed only when existing tags, pages,
images and assets are consistent. Conflicts and unverifiable state stop writes.
After an uncertain response, inspect remote state before recovery. Use GitHub's
native failed-job rerun for the original source; a rebuild can produce different
bytes and require manual reconciliation. Successful earlier stages are retained.

The workflow/ref concurrency groups and pending-run replacement remain in
force. An ineligible event can replace a pending eligible run. Publication is
not guaranteed for every merge. Summaries distinguish candidate building,
validation, image publication, release-page publication and asset delivery.
Environment deployment requires separately observed evidence.

Each trusted run also writes runtime evidence:

- `container-stack.lock.json` lists the exact image name, tag,
  `manifestDigest`, `imageId`, source and role for `app-runtime`, `db-job`,
  nginx, SQL Server and Keycloak.
- `container-hsa-integration-support.lock.json` lists the exact image name,
  tag, `manifestDigest`, `imageId`, source and role for Kong and the HSA
  person lookup adapter and strict-PKI provisioner.
- `container-test-support.lock.json` lists the exact image name, tag,
  `manifestDigest`, `imageId`, source and role for the test-only HSA directory
  mock support image.
- `release-metadata.json` records candidate and verified published project
  image identities, OCI archive paths, platform manifests, the expected
  database schema migration `name` and the optional
  `kravhantering-demo-seed` image. The production deployment bundle writes a
  filtered copy that excludes that optional demo image.
- `grype-db-status.json`, the complete per-image reports and
  `vulnerability-policy-decision.json` record the vulnerability gate inputs
  and outcome.
- `promotion-result.json` records each verified non-promoted staging identity
  and final GHCR tag with its manifest digest after successful validation.
- `production-smoke-evidence/` contains redacted systemd, journal, Podman
  inspect, network, database-job, restart, reinstall, and removal evidence from
  the installed production archive.
- `hashes.sha256` contains checksums for saved runtime evidence.
- `public/build.json` contains the app version, commit SHA, build time, image
  tag and expected database schema migration `name` embedded in the tested app
  image.
- `api-docs/hsa-person-lookup/` contains the static Swagger UI for the
  HSA-person lookup REST contract. Its generated initializer and override
  stylesheet keep the UI compatible with the strict documentation CSP.

The workflow uploads these artifact groups:

- `container-release-runtime-*` for production Quadlet smoke evidence, stack
  lock, build metadata and hashes.
- `container-release-metadata-*` for GitVersion, release metadata, release
  notes, Grype database status, complete vulnerability reports, the policy
  decision and SBOM files, including optional demonstration image SBOMs.
- `container-release-playwright-*` for the release-smoke report,
  screenshots, traces and test results.
- `container-release-deployment-*` for the production deployment bundle and
  its flat checksum, Sigstore bundle and trusted-root material.

The production deployment bundle includes `bin/kravhantering-images.sh`, a
Bash and jq helper for explicit operator verification. It can verify configured
tag-style `release.env` image refs against locked image IDs, optionally verify
tag-and-digest refs against locked manifest digests, export already present
verified local images into a transport bundle, and load and tag that bundle on
a disconnected host.
It also includes `bin/kravhantering-quadlet.sh` and topology-specific Quadlet
templates for `app-node-tls`, `app-node-http`, and `single-node`. The helper
renders release environment values into rootless `.container`, `.network`,
`.volume`, and `.target` files. Production operators control topology targets
and individual services with `systemctl --user`; database jobs remain explicit
`podman run --rm` release operations.

The bundled nginx Quadlet templates mount `api-docs/` and serve the HSA-person
lookup Swagger UI at `/api-docs/hsa-person-lookup/` on the same public origin
as the application. They also mount the shared
`nginx/templates/api-docs-security-headers.conf` contract. Release smoke
therefore exercises static files from nginx rather than from the app-runtime
image and verifies the redirect, representative files, a 404 response, exact
single-value security headers, rendered specification and absence of CSP
console violations.

Nginx is the bundled reference implementation, not a universal production
requirement. An external load balancer, reverse proxy or CDN that serves files
below `/api-docs/` owns their final headers and must implement equivalent
values for success, redirect and error responses. It must strip or replace
upstream values instead of appending duplicates. The deployment bundle
includes the canonical
[API Documentation Edge Verification](../operations/api-docs-edge-verification.md)
procedure, which the production deploy and upgrade guides reference.

The production deployment bundle is also uploaded to GitHub Releases as:

- `kravhantering-production-deploy-<version>.tar.gz`
- `kravhantering-production-deploy-<version>.tar.gz.sha256`
- `kravhantering-production-deploy-<version>.tar.gz.sigstore.json`
- `kravhantering-production-deploy-<version>.tar.gz.trusted-root.jsonl`

Markdown files in the deployment bundle bring along local image links. Keep
release-guide diagrams under `docs/images/`. Use `public/` only for content
that the deployed Next.js application intentionally serves at runtime, because
the app-runtime image copies that directory into the container.

See
[rhel10-production-deploy.md](../operations/rhel10-production-deploy.md) for
the enterprise app-node workflow with external SQL Server and external IdP.
See
[rhel10-production-single-node-self-contained-deploy.md](../operations/rhel10-production-single-node-self-contained-deploy.md)
for the self-contained single-node workflow with bundled SQL Server and
Keycloak.
The bundle also includes the matching topology-specific disconnected guides,
upgrade guides and uninstall guides. The disconnected guides document how
operators create a transferable bundle that contains the production deployment
archive, its checksum, attestation bundle, trusted roots, exported images,
image refs and hashes.

Operator verification of published release evidence is documented in
[Release Artifact And Image Verification](../operations/release-artifact-and-image-verification.md).

## Public GHCR Packages

The packages should be public if users must be able to pull the release
artifacts anonymously:

- `ghcr.io/<owner>/kravhantering-app-runtime`
- `ghcr.io/<owner>/kravhantering-db-job`
- `ghcr.io/<owner>/kravhantering-hsa-person-lookup-adapter` for optional HSA
  integration support
- `ghcr.io/<owner>/kravhantering-hsa-mtls-provisioner` for one-shot test-only
  strict-PKI provisioning
- `ghcr.io/<owner>/kravhantering-hsa-directory-mock` for test-only CI and
  developer support
<!-- cSpell:ignore opencontainers -->
The publish steps attach `org.opencontainers.image.description` as both an
image label and a manifest annotation. GHCR reads labels for normal image
metadata, and its package UI needs the annotation form for images published
through manifest/index-style Buildx outputs.

GHCR visibility is managed outside the workflow through package settings or the
organization defaults for new packages. The workflow does not change package
visibility and does not check the GitHub Packages API after publishing. GitHub
normally makes new packages private on first publication unless the organization
has selected a different default.

GHCR can also show digest-derived `sha256-*` entries for release evidence, such
as registry-pushed attestations or Cosign signature helper artifacts. Those
entries are evidence for the image manifest digest, not runnable `app-runtime`
or `db-job` release images. GitHub Packages sorts package versions by publish
time, so an evidence entry created after the image push can appear above the
semantic version tag and be suggested by the package UI as the latest
command-line install target. The workflow keeps GitHub Artifact Attestations
out of GHCR and does not push Cosign image signatures to GHCR for that reason.
Treat the GitHub Release notes, `container-stack.lock.json`, and the semantic
image tags as the release source of truth; do not use `sha256-*` evidence
entries as production image tags.

GitHub warns that a package made public cannot be made private again. Only make
the packages public when anonymous pulls and review without GitHub
authentication are intentional.

## Tokens and Keys

Image and GitHub Release publishing use the built-in `GITHUB_TOKEN` that GitHub
Actions creates for the run. Normal publishing does not require private deploy
keys or signing keys. Stable operator upgrade note archiving is the exception:
it uses the separately configured `OPERATOR_UPGRADE_NOTES_TOKEN` described
above so its protected-branch PR triggers the required checks.

The repository or organization GitHub Actions setting must allow `GITHUB_TOKEN`
to have write permissions. The workflow requests these permissions:

- `packages: write` to log in to GHCR and push `app-runtime` and
  `db-job`.
- `contents: write` to create preview tags and create or update the GitHub
  Release with artifacts.
- `id-token: write` for GitHub Artifact Attestations.
- `attestations: write` to publish provenance and SBOM attestations.

The GHCR packages must also allow the workflow in this repository to write to
the packages. For new packages, the first publication from the workflow is
usually enough. For packages that already exist, the package's **Manage Actions
access** settings may need to grant this repository write or admin access.

Do not add a registry-pushed `cosign sign` step to this flow unless the
signatures are deliberately stored outside the runnable image packages. Cosign's
default registry storage creates digest-derived signature tags that GHCR can
display as recent package versions.
