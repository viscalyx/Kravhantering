# One month of Node container security evidence

## Question and boundary

This report supplies evidence for
[Compare one month of workload-relevant security exposure for current and UBI images](https://github.com/viscalyx/Kravhantering/issues/1316).
It applies the revised criteria in
[Challenge whether the remaining UBI gates justify the no-pass](https://github.com/viscalyx/Kravhantering/issues/1315#issuecomment-5546795977).
The human decision about adoption remains in
[Choose the no-cost UBI adoption boundary by stage and artifact](https://github.com/viscalyx/Kravhantering/issues/1086).

- Comparison date: 2026-09-04 UTC.
- Shared retrospective window: `2026-08-04T00:00:00Z` inclusive to
  `2026-09-04T00:00:00Z` exclusive. This is one calendar month and excludes
  the incomplete comparison day for both families.
- Scope: the six published Linux AMD64 Node artifacts, their current Debian
  image family, and the standard UBI 10 Node.js 24 builder/minimal pair.
- The same-source comparison uses application commit
  `032ddeeacbac6d32c0247fddbcba25c32b493973` and
  [prototype definitions](https://github.com/viscalyx/Kravhantering/tree/c8b61a26cd305c142bfc7fd8c87e10f2b5ed79bf/prototypes/ubi-nodejs-24).
  Actual releases use their own recorded source commits; they are historical
  observations, not paired builds with identical application dependencies.

## Evidence classes

1. Historical project evidence: release timestamps, final-image identities,
   SBOMs, Grype reports, scanner database identities, and policy results
   attached to the releases inside the window.
2. Reconstructed vendor history: retained registry publication records and
   RPM manifests, upstream advisories, and Red Hat product dispositions.
   Retained publication records establish availability by that time; they
   cannot exclude an earlier image which the registry no longer retains.
3. Post-cutoff supporting inspection: the prototype scans use the September 4
   database, and new read-only checks inspect those retained prototype images.
   Neither is a historical August scan. A present product disposition is
   never silently applied to the whole past month.

The report does not count missing observations as zero exposure. It does not
claim deployed operator installations received a fix when a project release
became available. There is no UBI stable project release or complete shadow
release in the evidence, so its project remediation clock is unmeasured.

## Assessment for the adoption decision

**No material reachable workload regression is demonstrated by the inspected
events. Complete equality across the month is not established.** The evidence
can inform the agreed comparable-security working assumption, with the
limitations below carried into the human adoption decision. It cannot justify
claims of faster Red Hat remediation or mark retained release gates passed.

Material package-remediation differences exist: the July Node engine fixes
reach retained UBI images in September, and Debian supplies an August OpenSSL
package fix while the UBI package retains affected status. The identified
High trigger paths are outside the inspected workload capabilities. Under the
agreed method, those package delays alone do not establish a material
workload-security regression.

<!-- markdownlint-disable MD013 -->
| Artifact | Evidence relevant to the decision | Remaining uncertainty |
| --- | --- | --- |
| `app-runtime` | No demonstrated reachable regression in the triaged events; actual current release history available throughout the window. | Earlier UBI HTTPS identity-policy reuse and package backports are not fully reconstructed; native dependencies also prevent an all-package equality claim. |
| `db-job` | SQL/TLS job; no identified HTTP/2, permission-model, QUIC, mount, or homed trigger in its commands. | Earlier UBI-derived job builds do not exist; complete transitive applicability and the UBI project release clock are unmeasured. |
| `demo-seed` | Same relevant database/TLS dependency boundary as `db-job`, with its separate test-data commands. | Same historical reconstruction limits; assess within the supported non-production boundary. |
| `hsa-directory-mock` | HTTPS/mTLS server with PEM material; no identified QUIC or other triaged trigger. | No continuous historical UBI workload evidence; full release proof remains required. |
| `hsa-person-lookup-adapter` | PEM-based mTLS and explicit hostname checks; no PFX-array trigger. | Earlier UBI cross-policy HTTPS reuse/backports remain uncertain, as for the application's HSA client. |
| `hsa-mtls-provisioner` | Explicit certificate generation/verification commands do not invoke the identified QUIC/CMS/CMP/DTLS paths. | Current project evidence starts August 24; historical earlier coverage is absent. Exact CLI and shared-library fixes remain separate from Node's embedded library. |
<!-- markdownlint-enable MD013 -->

These uncertainties are not measured regressions and do not silently become
zero exposure. The adoption ticket must decide how much weight to give the
limited history under the already agreed working-assumption rule. This
research does not select any artifact or introduce a new waiting period.

## Historical project releases

The [release evidence](ubi-month-security-evidence/release-history.json)
contains all 80 retained releases in the window: 78 previews and two stable
releases. All 419 available reports for the six image names contain zero
fixable High/Critical findings. Every corresponding release policy passes
with zero exceptions. Report hashes and image digests match their policy
evidence; selected SBOM hashes also match. This is consistency verification,
not an independent verification of Sigstore signatures.

Five image names have evidence throughout the release series. The provisioner
first appears in
[the strict mTLS preview](https://github.com/viscalyx/Kravhantering/releases/tag/v0.6.0-preview.9)
on August 24. Its earlier interval is absent, not a zero-finding observation.

The important package change is OpenSSL. `CVE-2026-14456` appears as
High / `wont-fix` in app scans from the
[August 17 preview](https://github.com/viscalyx/Kravhantering/releases/download/v0.5.0-preview.67/app-runtime.json)
through the
[August 26 morning preview](https://github.com/viscalyx/Kravhantering/releases/download/v0.6.0-preview.15/app-runtime.json).
Upstream rates it Low and specifies a QUIC-server queue trigger. Debian
publishes the backported fix in `3.5.7-1~deb13u2`; source acceptance is
August 25 at 18:48:29 UTC and the advisory follows at 18:58:46 UTC.

Sources:
[OpenSSL advisory](https://openssl-library.org/news/secadv/20260813.txt),
[Debian package acceptance](https://tracker.debian.org/news/1790345/accepted-openssl-357-1deb13u2-source-into-stable-security/),
[Debian advisory](https://lists.debian.org/debian-security-announce/2026/msg00376.html).

The project adds fixed packages in
[the August 26 source change](https://github.com/viscalyx/Kravhantering/commit/d52165b087617d47004aef3b502b877fb8ca4e4d)
at 15:20:52 UTC. All six
[first fixed preview SBOMs and scans](https://github.com/viscalyx/Kravhantering/releases/tag/v0.6.0-preview.17)
show the package correction; publication is August 26 at 16:01:05 UTC.
[The August 28 base refresh](https://github.com/viscalyx/Kravhantering/commit/c54c2ee42d59f4e507859997fc60e0d894713ce2)
removes the temporary package overrides.
[The stable release](https://github.com/viscalyx/Kravhantering/releases/tag/v0.6.0)
publishes August 28 at 14:37:57 UTC.

Thus the observed Debian source-acceptance-to-preview interval is
21 hours 12 minutes 36 seconds, and source acceptance to stable publication
is 2 days 19 hours 49 minutes 28 seconds. These are package-to-project
intervals, not the acceptance method's exact base-image-to-project clock.
The temporary package update bypasses the base-image wait. The event shows a
real update route; it does not show a reachable QUIC security incident or
prove that UBI could complete its own project release within the same time.

The start and end app reports each contain 21 distinct High/Critical CVEs.
Eight Perl CVEs change from `not-fixed` to `wont-fix` during the series while
the package version remains unchanged. This illustrates why neither raw
counts nor fix-state changes alone measure remediation.

## Exact comparison images

The prototype pins these base identities:

- Current `node:24-trixie-slim`:
  `sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600`.
- UBI builder `registry.access.redhat.com/ubi10/nodejs-24`:
  `sha256:5295d1fd8e46aebad1e9da107c62bc4a5cfe8bca5fd1175a7b0a523fa977866a`.
- UBI runtime `registry.access.redhat.com/ubi10/nodejs-24-minimal`:
  `sha256:f0e6f6fa5bd82741bdf9b304341c94bbac4268a7f94d710c26eac01f20528c2b`.

The [prototype scan summary](ubi-month-security-evidence/prototype-scan-summary.json)
records all twelve final image IDs, scan manifest digests, OCI manifest
digests, High/Critical package matches, scanner versions, database identities,
and SHA-256 hashes of the retained raw reports. Different archive and scanner
manifest representations are kept separate.

New [content inspection](ubi-month-security-evidence/content-inspection.json)
shows Node 24.20.0 with bundled OpenSSL 3.5.7 in each current artifact, versus
Node 24.19.0 linked to system OpenSSL 3.5.5 in each UBI artifact. These are
runtime version observations, not proof that a distribution backport is absent.
Changing the system OpenSSL package does not by itself update the current
image's statically linked Node OpenSSL.

## Reconstructed UBI vendor history

The [registry history](ubi-month-security-evidence/registry-history.json)
joins retained AMD64 image records to exact RPM manifests. The investigation
paginates 196 minimal and 372 builder records across architectures, then
selects window and boundary records. Availability uses the public
`ubi10` repository's push timestamp, not image creation, a sibling RHEL
repository, or a mutable latest tag.

<!-- markdownlint-disable MD013 -->
| Node RPM transition | Minimal public push UTC | Builder public push UTC |
| --- | --- | --- |
| `1:24.18.0-3.el10_2`, latest retained pre-window | July 30 01:52:18.346 | August 3 17:49:08.091 |
| `1:24.18.0-5.el10_2`, dependency fixes | August 25 05:38:02.967 | August 25 05:26:15.572 |
| `1:24.19.0-1.el10_2`, engine fixes | September 1 08:13:49.727 | September 1 08:14:04.903 |
<!-- markdownlint-enable MD013 -->

[The August dependency advisory](https://security.access.redhat.com/data/csaf/v2/advisories/2026/rhsa-2026_58819.json)
issues August 24 at 07:11:41 UTC and fixes brace-expansion and ip-address
dependencies. Dependency presence in build inputs or runtime output must be
checked separately; a Node source-RPM label does not establish reachability.

[The engine advisory](https://security.access.redhat.com/data/csaf/v2/advisories/2026/rhsa-2026_61377.json)
issues August 31 at 12:20:58 UTC and fixes `CVE-2026-56846`,
`CVE-2026-56848`, and `CVE-2026-58043`. The first retained fixed UBI
containers follow about 19 hours 53 minutes later, approximately 34 calendar
days after upstream's July 29 fix. Within the comparison window, the
correction arrives 28 days 8 hours after the start. This is a package/container
interval, not a measured exploitable-workload duration. Earlier public RPM
availability is not reconstructed exactly.

The [hostname-reuse VEX](https://security.access.redhat.com/data/csaf/v2/vex/2026/cve-2026-58040.json)
and [PFX-reuse VEX](https://security.access.redhat.com/data/csaf/v2/vex/2026/cve-2026-56850.json)
have August generation dates and say affected with fixes deferred. Their
source-package status predates the later rebase. It cannot prove that the
September upstream code retains those defects; conversely an older visible
version does not prove that a Red Hat backport is absent.

All selected UBI manifests retain `openssl-libs 1:3.5.5-6.el10_2`.
[Red Hat's QUIC VEX](https://security.access.redhat.com/data/csaf/v2/vex/2026/cve-2026-14456.json)
generated August 27 and
[CMS VEX](https://security.access.redhat.com/data/csaf/v2/vex/2026/cve-2026-63072.json)
generated September 3 identify affected RHEL 10 packages without a fix. This
positively establishes unresolved vendor package status at the cutoff for
those events; it does not depend on comparing upstream version numbers.

## Workload applicability

The
[workload inventory](https://github.com/viscalyx/Kravhantering/issues/1083)
defines the supported commands, inputs, identities, capabilities, and proof
tools. The following are evidence-based inferences for that boundary, not
blanket product VEX statements.

### Node security events

The
[July Node security release](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases)
fixes three High issues in HTTP/2 and the Node permission model, and additional
TLS, DNS, SQLite, compression, and HTTP parser issues. Its fix release,
24.18.1, predates the window; a fix arriving in UBI during August or September
still matters when reconstructing exposure carried into the window.

The six declared workload commands use neither the Node permission model nor
a Node HTTP/2 server. Their supported database is SQL Server. HSA TLS material
uses PEM `cert`/`key`, not PFX arrays. These facts rule out several specific
trigger paths; they do not rule out every Node vulnerability.

Hostname verification requires particular care. Both
[application HSA requests](https://github.com/viscalyx/Kravhantering/blob/032ddeeacbac6d32c0247fddbcba25c32b493973/lib/hsa/strict-person-lookup.ts)
and the
[HSA adapter](https://github.com/viscalyx/Kravhantering/blob/032ddeeacbac6d32c0247fddbcba25c32b493973/containers/hsa-person-lookup-adapter/src/strict-server.mjs)
provide `checkServerIdentity` callbacks to HTTPS requests. Their configured
identities are constrained, but this investigation does not reconstruct every
historical connection-reuse path or prove every older Red Hat RPM backport.
That interval remains uncertain for those artifacts. It must not be reported
as a measured zero-day exposure interval.

### Operating-system findings and extra tools

The [Red Hat OS evidence extract](ubi-month-security-evidence/os-summary.json)
preserves source URLs, publication/revision times, descriptions, and RHEL 10
product statuses for the candidate's remaining High finding families.

- `CVE-2026-53612`, `CVE-2026-53613`, `CVE-2026-53614`,
  `CVE-2026-76642`, and `CVE-2026-78410` require privileged mount paths and
  associated configuration. `CVE-2026-78408` requires privileged `nsenter`
  with cgroup joining. All six exact UBI artifacts lack `/usr/bin/mount`,
  `/usr/bin/nsenter`, and `/etc/fstab`; their workload commands do not call
  libmount. The library-package matches alone therefore do not establish
  reachable workload exposure. See the
  [upstream mount advisory](https://github.com/util-linux/util-linux/security/advisories/GHSA-g8wm-75wr-g2vh).
- `CVE-2026-16742` requires active `systemd-homed` user management. That daemon
  is absent from all twelve inspected images and is not a workload process.
  The September 3 Red Hat VEX structured RHEL 10 status says not affected,
  while its prose says affected; the report retains that inconsistency.
  The local conclusion rests on the missing trigger capability, supported by
  the [systemd advisory](https://github.com/systemd/systemd/security/advisories/GHSA-jm29-p7hh-vjhv).
- `CVE-2025-64756` requires the glob CLI command option to process malicious
  filenames. The six workload entrypoints do not invoke it. All inspected
  images lack `/usr/bin/glob`; this path check alone is not an exhaustive
  inventory of every JavaScript package or executable alias.
- Curl, qs, and js-yaml require the specific authentication, serialization,
  or parsing conditions identified in the
  [prototype vendor analysis](https://github.com/viscalyx/Kravhantering/blob/c8b61a26cd305c142bfc7fd8c87e10f2b5ed79bf/prototypes/ubi-nodejs-24/vendor-security-note.md).
  Its non-applicability reasoning is supporting evidence for the exact
  prototype, not a historical scan of the month.

The inspection also confirms nodemon remains present in every UBI artifact.
It is not valid to claim the prototype removes it. Package metadata and
executable contents require separate verification before publication.

### OpenSSL capability boundary

Ordinary Node TLS, X.509 verification, and the provisioner's OpenSSL CLI are
real requirements. They cannot be removed to improve scan results. Conversely,
the supported commands do not establish use of QUIC, DTLS, CMS, CMP, or raw
public-key TLS. The provisioner's
[explicit OpenSSL commands](https://github.com/viscalyx/Kravhantering/blob/032ddeeacbac6d32c0247fddbcba25c32b493973/containers/hsa-mtls-provisioner/src/provisioner.mjs)
generate and verify certificate material; an OpenSSL package finding does not
automatically make every one of those commands vulnerable.

The [August 5 OCSP advisory](https://openssl-library.org/news/secadv/20260805.txt)
affects OpenSSL 3.6 and 4.0, not the 3.5 line in these images.
The [August 25 advisory](https://openssl-library.org/news/secadv/20260825.txt)
adds Moderate issues in QUIC, CMS key unwrapping, and CMP parsing, plus Low
issues in raw public-key TLS, DTLS, CMP, QUIC, and a specific empty-ciphertext
ChaCha20/OCB `EVP_Cipher()` call. Ordinary HTTPS/mTLS or AES-GCM alone does not
establish those trigger paths. The report does not audit every native module
or map every advisory to every historical Red Hat backport.

Cutoff discipline also applies to the prototype's JavaScript findings:
the [qs VEX](https://security.access.redhat.com/data/csaf/v2/vex/2026/cve-2026-82417.json)
and [js-yaml VEX](https://security.access.redhat.com/data/csaf/v2/vex/2026/cve-2026-84375.json)
are regenerated on September 4 after this report's cutoff. They explain
present scanner results but do not independently prove September 3 status.

## Reproducing the supporting inspection

The content check executes only Node version/configuration queries and
filesystem existence checks in the retained images, with no network, a
read-only root, all capabilities dropped, and no new privileges. It does not
exercise a vulnerability. For each image ID in the evidence summary:

```bash
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --entrypoint node IMAGE_ID -e '
const fs = require("fs");
console.log(process.version, process.versions.openssl,
  process.config.variables.node_shared_openssl);
for (const p of ["/usr/bin/mount", "/usr/bin/nsenter",
  "/usr/lib/systemd/systemd-homed", "/usr/bin/glob", "/usr/bin/npm",
  "/usr/bin/nodemon", "/etc/fstab"]) {
  console.log(p, fs.existsSync(p));
}'
```

This is research evidence only. No container migration, vulnerability
exception, release automation, application behavior, or manual test case
changes are part of this branch.
