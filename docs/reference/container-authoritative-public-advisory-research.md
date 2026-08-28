# Container authoritative public-advisory research note

Research date: 2026-08-28

## Decision summary

Classify each Grype match for each supported release independently. Publish an
observation only when all of the following are true:

1. the report identifies the expected Grype producer and a compatible database;
2. at least one `matchDetails[].type` is `exact-direct-match` or
   `exact-indirect-match`;
3. the matched `vulnerability.namespace`, `vulnerability.id`, package type and
   evidence field form a recognized source tuple; and
4. one URL passes the source tuple's exact HTTPS authority, path and identifier
   rule.

Everything else remains confidential. In particular, an arbitrary HTTPS URL,
an unrecognized official-looking host, a secondary reference, a related
vulnerability, a CPE-only match, malformed output, or a mixed public/confidential
aggregate cannot establish public classification.

For the repository's current Debian and npm image surface, enable only these
source tuples:

<!-- markdownlint-disable MD013 -->
| Matched namespace and package | Evidence field | Required identifier and canonical URL |
| --- | --- | --- |
| `debian:distro:debian:<release>` and `artifact.type == "deb"` | Prefer an entry in `vulnerability.advisories[]`; otherwise use `vulnerability.dataSource` | DSA: `^DSA-[0-9]+-[0-9]+$` and `https://security-tracker.debian.org/tracker/<DSA>`; tracker record: CVE pattern and `https://security-tracker.debian.org/tracker/<CVE>` |
| `github:language:javascript` and `artifact.type == "npm"` | `vulnerability.dataSource` | GitHub's GHSA pattern and `https://github.com/advisories/<GHSA>` |
<!-- markdownlint-enable MD013 -->

Do not enable `nvd:cpe` as a qualifying tuple. NVD is an authoritative public
record authority, but Grype documents `cpe-match` as requiring verification,
so it does not deterministically establish that the observed package version is
affected. The same fail-closed rule applies to every other provider until its
namespace, package mapping and canonical public URL contract are added and
tested deliberately. Anchore's current
[data-source inventory](https://oss.anchore.com/docs/reference/grype/data-sources/)
is the discovery list, not an authority allowlist by itself.

## Why these Grype fields have different evidentiary value

The pinned scan action currently embeds Grype 0.110.0. Its presenter exposes
`vulnerability.id`, `dataSource`, `namespace`, `urls`, `fix` and
`advisories[{id,link}]` in the JSON match. The model also keeps
`relatedVulnerabilities` and `matchDetails` alongside, rather than inside, the
matched vulnerability. See the pinned
[`Vulnerability` model](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/presenter/models/vulnerability.go#L11-L33),
[`VulnerabilityMetadata` model](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/presenter/models/vulnerability_metadata.go#L9-L20),
and
[`Match` model](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/presenter/models/match.go#L14-L34).

The fields mean:

- `vulnerability.advisories[]` is strongest when present. Grype constructs it
  from references on the affected range's fix detail, so the link is associated
  with the range which supplies the matching fixed version. See Grype's
  [`toAdvisories`](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/db/v6/vulnerability.go#L359-L377).
- `vulnerability.dataSource` is the primary reference URL: Grype explicitly
  defines it as where the data originates. In database v6 it is simply the first
  vulnerability-record reference. See the
  [metadata definition](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/vulnerability/metadata.go#L8-L18)
  and
  [reference projection](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/db/v6/vulnerability_provider.go#L737-L754).
  It is evidence only when the namespace, package and canonical URL rules make
  the provider relationship unambiguous.
- `vulnerability.urls[]` contains the references after the first one. Grype
  calls these secondary references; database v6 describes underlying references
  as external resources that provide more information. They can include vendor
  pages, commits, issue trackers or third-party material and must never qualify
  an observation. See the same
  [metadata definition](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/vulnerability/metadata.go#L8-L18)
  and the v6
  [`VulnerabilityBlob` definition](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/db/v6/blobs.go#L12-L28).
- `relatedVulnerabilities[]` is alias/enrichment metadata. Grype resolves those
  references separately and returns them separately from the vulnerability that
  produced the match. A public CVE link there does not prove that the related
  record, rather than the matched record, backs the package-version observation.
  It must not qualify or contribute public URLs. See the
  [match construction](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/presenter/models/match.go#L36-L78).
- `matchDetails[].type` records how Grype reaches the match. Anchore classifies
  `exact-direct-match` and `exact-indirect-match` as high confidence and says
  `cpe-match` requires verification in its official
  [result interpretation guide](https://oss.anchore.com/docs/guides/vulnerability/interpreting-results/).

The workflow does not pass `--by-cve`. Keep that invariant in the compatibility
guard. Anchore documents that `--by-cve` can replace a non-CVE identifier and
use the related CVE's metadata, which changes which object is primary. A future
change to that setting therefore requires reviewing the source predicates, not
silently accepting the old ones. See
[Understanding vulnerability IDs](https://oss.anchore.com/docs/guides/vulnerability/interpreting-results/#understanding-vulnerability-ids).

## Current-provider source contracts

### Debian

All six published project images currently derive from Debian Trixie-based
Node images, and their SBOMs can contain Debian packages and npm packages. See
the local
[`app` Dockerfile](../../containers/app/Dockerfile),
[`HSA directory mock` Dockerfile](../../containers/hsa-directory-mock/Dockerfile),
[`mTLS provisioner` Dockerfile](../../containers/hsa-mtls-provisioner/Dockerfile),
and
[`person lookup adapter` Dockerfile](../../containers/hsa-person-lookup-adapter/Dockerfile).

Anchore identifies Debian Security Tracker as Grype's direct Debian package
source. Debian itself says the tracker is its primary source for security
information, gives canonical tracker examples for DSA, DLA and CVE identifiers,
and states that the tracker data is maintained by Debian's security team. See
Anchore's
[data-source inventory](https://oss.anchore.com/docs/reference/grype/data-sources/),
Debian's
[Security Information](https://www.debian.org/security/#DSAS),
and the
[Security Bug Tracker](https://security-tracker.debian.org/tracker/).

Vunnel's Debian provider downloads Debian's public JSON and DSA list, creates
the vulnerability link
`https://security-tracker.debian.org/tracker/<CVE>`, and attaches a matching
DSA ID/link to the affected package's vendor-advisory summary when one exists.
See the official provider's
[input definitions](https://github.com/anchore/vunnel/blob/e5681bf2d47c3beacfcc0cd3bf677d9f08053f56/src/vunnel/providers/debian/parser.py#L42-L53),
[CVE-link construction](https://github.com/anchore/vunnel/blob/e5681bf2d47c3beacfcc0cd3bf677d9f08053f56/src/vunnel/providers/debian/parser.py#L330-L349),
and
[DSA association](https://github.com/anchore/vunnel/blob/e5681bf2d47c3beacfcc0cd3bf677d9f08053f56/src/vunnel/providers/debian/parser.py#L425-L443).
Grype then maps that vendor-advisory summary into fix-detail references before
presenting it as `vulnerability.advisories[]`; see the pinned
[OS transformer](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/db/v6/build/transformers/os/transform.go#L106-L147).

Consequently, either of these Debian tuples is sufficient after an exact match:

- `advisories[].id` matches `^DSA-[0-9]+-[0-9]+$`, and the link is exactly
  `https://security-tracker.debian.org/tracker/` plus that same ID; or
- `vulnerability.id` is a valid CVE ID and `dataSource` is exactly
  `https://security-tracker.debian.org/tracker/` plus that same CVE ID.

The second form is necessary because Debian can publish an authoritative public
tracker record and fixed package version without an associated DSA for that
release. Vunnel deliberately emits an empty advisory summary in that case.

### GitHub Advisory Database

Anchore identifies GitHub Security Advisories as Grype's language-ecosystem
source. GitHub says every database advisory has a unique GHSA ID and defines its
exact alphabet and `GHSA-xxxx-xxxx-xxxx` syntax in the official
[GitHub Advisory Database documentation](https://docs.github.com/en/code-security/concepts/vulnerability-reporting-and-management/github-advisory-database#ghsa-ids).

For Grype 0.110, the GitHub transformer places the GitHub Advisory URL first in
the vulnerability references, so it becomes `dataSource`. It does not place a
reference in the affected range's fix detail, so `advisories[]` can be empty for
an otherwise public GHSA. See the pinned transformer's
[reference construction](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/db/v6/build/transformers/github/transform.go#L291-L315)
and
[fix construction](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/db/v6/build/transformers/github/transform.go#L140-L160).

The qualifying tuple is therefore an exact language match whose namespace is
`github:language:javascript`, whose artifact type is `npm`, whose
`vulnerability.id` matches GitHub's anchored regex
`^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$`, and whose `dataSource` is exactly
`https://github.com/advisories/` plus that same ID.

### CVE and NVD

Validate CVE identifiers with the CVE Program's production schema pattern
`^CVE-[0-9]{4}-[0-9]{4,19}$`. The schema defines CVE records as potentially
containing affected products, versions and public references; see the official
[CVE Record Format](https://github.com/CVEProject/cve-schema/blob/main/schema/docs/CVE_Record_Format_bundled.json).

`https://nvd.nist.gov/vuln/detail/<CVE>` is a recognizable NVD record shape,
and Anchore lists NVD as a direct Grype data source. Do not enable it for this
classification while the match is `nvd:cpe`/`cpe-match`: the URL proves public
disclosure of the CVE, but the match remains the ambiguous part of the
affected-release observation. A later exact-match use can add a reviewed NVD
tuple without weakening the default for current CPE matches.

## Exact validation algorithm

Validate data before grouping or rendering. Do not coerce unexpected values
with `String(...)`; malformed types are confidential.

1. Require a plain object report with a compatible descriptor, a plain array
   `matches`, and the expected object/array/string types for every consumed
   field. Only top-level `matches[]` are eligible.
2. For each release/image report, create an observation from one match and that
   release's immutable manifest digest. Require a non-empty artifact name and
   installed version, a fixed High/Critical vulnerability, and a non-empty
   `fix.versions[]`, as the existing blocking policy already intends.
3. Require at least one high-confidence `matchDetails[].type`. Do not promote
   `cpe-match`, an empty details array or an unknown future type.
4. Select a source rule by exact namespace and artifact type. Cross-check the
   identifier against the rule. Do not infer a provider from the URL alone.
5. Consider only the evidence field named by the rule. For Debian, inspect
   qualifying `advisories[]` entries first and then the matched vulnerability's
   `dataSource`. Never search `urls[]` or `relatedVulnerabilities[]` for a URL
   that happens to pass a host test.
6. Parse the candidate with the standard URL parser. Reject leading/trailing
   whitespace, parse failure, length above a fixed bound such as 2,048 bytes,
   any protocol other than `https:`, credentials, a nonempty port, query or
   fragment, and a hostname other than the exact lower-case allowlisted host.
   Node's WHATWG
   [`URL` API](https://nodejs.org/api/url.html#new-urlinput-base)
   provides the parsed protocol, credentials, port, hostname, path, search and
   fragment components.
7. Construct the one canonical URL from the already-validated identifier and
   require the parsed candidate's serialized `href` to equal it exactly. This
   rejects subdomains, suffix tricks, alternative ports, encoded path
   separators, extra path segments and case variants without maintaining a
   second permissive URL regex.
8. Emit only canonical URLs returned by successful rules. Deduplicate them by
   exact string. Never label or render unvalidated `urls[]` values as
   authoritative advisories.

Classification should not fetch URLs. Both enabled providers populate the
fields from public first-party feeds, while network status, rate limiting and
redirects vary over time. An offline structural predicate is reproducible and
does not create SSRF or redirect-policy inputs. If a separate health audit
fetches links, restrict egress to the same exact authorities, disable automatic
redirects, revalidate every redirect target, bound response size/time and keep
its result out of the confidentiality decision.

## Aggregation and confidentiality boundary

The current policy collects every HTTPS `vulnerability.dataSource` and
`vulnerability.urls[]`, then groups matches by vulnerability ID, image and
package. The monitor unions those URLs before deciding that a nonempty list is
public. See
[`advisoryUrls`](../../scripts/release/container-vulnerability-policy.mjs)
and
[`evaluateSupportedReleaseFindings`](../../scripts/release/container-vulnerability-monitor.mjs).

That order is unsafe for mixed evidence. One qualifying release can make every
other release in the aggregate appear under the same public issue even if its
own source is missing or ambiguous. Instead:

- classify and retain evidence on each affected-release observation first;
- aggregate qualifying observations into the public issue using only their
  validated URLs;
- send nonqualifying observations through the confidential path even when they
  share the public fingerprint; and
- close/update public and private tracking from their respective observation
  sets.

If one tracker record must represent the entire fingerprint, use the stricter
alternative: publish only when every active observation qualifies. Never copy
an unqualified release row into a public issue because a sibling row qualifies.

## Producer and database compatibility guard

Grype JSON has a top-level `descriptor` with producer `name`, producer
`version`, configuration and database information. See the pinned
[`Document` model](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/presenter/models/document.go#L16-L29)
and
[`descriptor` model](https://github.com/anchore/grype/blob/dee8de483dfba5b4e0bc0aa8e4ab2ce52137e490/grype/presenter/models/descriptor.go#L3-L10).

The workflow pins `anchore/scan-action` but omits its `grype-version` input.
At the pinned action commit the omitted input resolves to an embedded
`v0.110.0`, as shown by the action's
[`GrypeVersion.js`](https://github.com/anchore/scan-action/blob/e1165082ffb1fe366ebaf02d8526e7c4989ea9d2/GrypeVersion.js)
and
[`action.js`](https://github.com/anchore/scan-action/blob/e1165082ffb1fe366ebaf02d8526e7c4989ea9d2/action.js#L10-L13).
That default can change whenever the action pin changes, even though the
workflow still has no visible Grype version.

Before classification, require:

- `descriptor.name === "grype"`;
- `descriptor.version === "0.110.0"`, or equality with an explicitly configured
  and separately recorded expected version;
- the expected `descriptor.configuration["by-cve"] === false` invariant;
- a recognized database-v6 `descriptor.db.schemaVersion` and valid RFC 3339
  `descriptor.db.built`; and
- equality of report database schema/build identity with the separately
  captured `grype db status -o json`, whose `valid` value must be `true`.

Prefer passing `grype-version: v0.110.0` explicitly in the workflow and keeping
the report guard anyway. An intentional upgrade then changes a visible pin,
fixtures and accepted descriptor together. A missing descriptor, unknown
version/schema, changed `by-cve` mode or database-identity mismatch makes all
observations confidential and should fail the synchronization job without
printing finding details.

## Required fixtures

Compatibility tests should use minimized real-output fixtures, not only
hand-built matches. Cover at least:

- Debian CVE tracker `dataSource` with exact `dpkg-matcher` detail: public;
- Debian DSA `advisories[{id,link}]` tied to the fix: public;
- npm GHSA `dataSource` with exact JavaScript match: public even when
  `advisories` is empty;
- a valid NVD URL on a `cpe-match`: confidential;
- valid canonical URL in `urls[]` only: confidential;
- valid canonical URL in `relatedVulnerabilities[]` only: confidential;
- valid host with wrong namespace, wrong package type, mismatched ID/path,
  subdomain, userinfo, port, query, fragment or encoded path: confidential;
- missing/wrong descriptor, changed `by-cve`, unknown Grype version, invalid or
  mismatched database status: confidential and synchronization fails closed;
- two releases under one fingerprint, only one qualifying: no confidential
  release row or URL appears publicly; and
- one valid and one malformed candidate: only the canonical validated URL is
  retained, without allowing the malformed candidate to qualify anything.

## Remaining uncertainty

Grype's JSON presenter has no explicit public/private or publication-state bit.
The proposed decision therefore trusts a recognized Grype provider tuple plus
the integrity-checked current database; it does not independently prove the
current HTTP response or advisory lifecycle state.

The daily database can change provider content independently of application
code, and Grype DB documentation notes that adding or removing a source does not
necessarily require a schema bump. Keep the provider registry closed, retain
real fixtures, record the report and database identities, and review unknown
namespaces or changed canonical shapes before enabling them. See the official
[Grype DB schema policy](https://github.com/anchore/grype-db#db-schemas).

Future release images may introduce another distribution or package ecosystem.
That expands the source registry only after primary-source review of the
provider's namespace, package mapping, match type and canonical public record
shape. Until then, those findings remain confidential by design.
