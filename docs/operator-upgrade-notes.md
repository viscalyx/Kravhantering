# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Kravhantering. Use it together with the RHEL production
upgrade guide for the deployed topology and the GitHub Release notes for the
target version.

## Unreleased

### Responsibility assignments must have valid HSA-id values before upgrade

Confirm that every live requirement-area owner, requirement-area co-author,
specification lead, specification co-author, and requirement-package lead has a
valid HSA-id before running `db-job migrate`. The migration creates
`requirement_responsibility_people`, removes duplicated live display-name
columns, and cannot reconstruct removed name snapshots on rollback without data
loss.

### Custom UI terminology must be exported before upgrade if it must be retained

Export any custom UI terminology values you need to keep before running
`db-job migrate`; migration rollback will not restore them.

### Topology changes

For the container release bundle, production `single-node` remains unchanged:
do not add Kong or the HSA directory mock to production Compose startup. If you
mirror, archive or attest every release artifact, include the new
`container-test-support.lock.json`, the `kravhantering-hsa-directory-mock`
GHCR image, its SBOM and its attestations alongside the existing production
artifacts. Kong is still a vendor image, but it is now locked as test support
for `single-node-demo`.

Only use `single-node-demo` for release smoke, disposable demos or other
test-only environments. Before starting that topology, set `KONG_IMAGE_REF` and
`HSA_DIRECTORY_MOCK_IMAGE_REF` from `container-test-support.lock.json` or from
your internal mirrored tags, and set the demo app runtime to
`HSA_PERSON_LOOKUP_URL=http://kong:8000/hsa/person-records/lookup`. For
disconnected demo/test hosts, export and load images with
`bin/kravhantering-images.sh --topology single-node-demo --test-lock-file
container-test-support.lock.json`.

Real production HSA integration is still not delivered by this release. Keep
production `HSA_PERSON_LOOKUP_URL` pointed at the approved server-side REST
facade or integration platform; the bundled HSA directory mock must not be used
for production person verification.

### Before upgrading

Confirm that every live responsibility assignment has a valid HSA-id before
running `db-job migrate`: requirement-area owners, requirement-area
co-authors, requirements-specification leads, specification co-authors and
requirement-package leads. `responsible_hsa_id` must be present on every
requirements specification, and all live HSA-id values must match
the format: two uppercase letters, ten digits, `-`, and an alphanumeric suffix,
for example `SE5560000001-admin1`. The full HSA-id may be at most 31
characters.

Review broad-reader and authoring expectations before the new version is
enabled. `Admin` and `Reviewer` can still read every requirements
specification, but other users only see requirements specifications where they
are assigned as requirements-specification lead or specification co-author. Add
missing specification co-authors before the rollout if ordinary users must keep
access to specific requirements specifications.

Review requirement-area owners, co-authors and prefixes before the rollout.
Current requirement-area owners can manage metadata, co-authors and owner
handover for their own areas after the upgrade. Prefix corrections for
requirement areas that already contain requirement rows should be completed
before the rollout; once the new version is live, those prefix changes return
`409 conflict`.

Export any custom UI terminology values and any assignment-level AI permission
evidence that must be retained before `db-job migrate`. This branch removes
duplicated live display-name columns and unused AI permission flag columns, and
the destructive migrations cannot reconstruct those values on rollback.

Add `HSA_PERSON_LOOKUP_URL` to the app runtime environment before users edit
responsibility assignments after the upgrade. The URL must be a server-side
REST facade reachable from `app-runtime` that accepts `POST { "hsaId": "..." }`
and returns normalized person data; keep `HSA_PERSON_LOOKUP_TIMEOUT_MS=5000`
unless the approved integration path needs another timeout.

### After upgrading

Review Admin Center > Identity and confirm the visible/default HSA-id-prefix
values are correct for the organization. The migration seeds prefixes from
existing assignment data where possible, but clean or sparse environments may
need an administrator to add the first visible default prefix before new
HSA-id fields are usable.

Plan a refresh pass for migrated `Kravansvarsperson` rows that show
`(saknar namn, kräver nytt uppslag)` or have no `last_fetched_at`. Users can
refresh those people through the HSA lookup icon in the relevant assignment
editing flows after the lookup endpoint is configured.

Communicate the updated assignment rules to administrators and stewards:
new requirements specifications get the signed-in user as lead, package
creation requires a verified human HSA-id plus requirement-area author access
or `Admin`, and requirement-package changes require the package lead or
`Admin`.

Communicate the updated requirements-specification read boundary to support
staff and affected users. Users without `Admin` or `Reviewer` see an empty
requirements-specification list when no specifications are assigned to them.
A direct link to an existing but unauthorized requirements specification shows
a forbidden page with the specification ID, name and lead contact, while REST
and MCP clients still receive a generic `403`. A missing requirements
specification still returns `404`.

Review action-log monitoring and support runbooks for authorization denials.
Denied assignment-RBAC checks are recorded in the action log, so a short-lived
increase in `403` responses after rollout may indicate users who need a
requirements-specification, requirement-area or package assignment rather than
an application outage.

Access-review, privacy export and retention outputs now include
requirement-package co-authors and local responsibility-person rows, while
assignment-level AI flags no longer appear. Review local evidence templates or
operator runbooks that expect those older fields.
