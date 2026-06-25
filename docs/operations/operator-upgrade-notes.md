# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Kravhantering. Use it together with the RHEL production
upgrade guide for the deployed topology and the GitHub Release notes for the
target version.

## Unreleased

### Requirements specifications need lifecycle status before upgrade

The migration backfills requirements specifications without lifecycle status to
`Förvaltning` (`Management`, ID `4`) before making the column mandatory.

### Requirement packages need purpose and scope before upgrade

The migration renames `requirement_packages.description` to
`purpose_and_scope` and makes the field mandatory. Confirm that every
requirement package has meaningful non-blank text before running
`db-job migrate`; the migration fails instead of generating placeholder text
for missing package purpose and scope.

### Specification-local requirement package links are removed

The migration drops `specification_local_requirement_requirement_packages`.
Requirement packages now apply only to requirements-library requirements.
Existing package links on specification-local requirements are deleted during
upgrade; review downstream reports or integrations that read that table before
running `db-job migrate`.

### Responsibility assignments must have valid HSA-id values before upgrade

Confirm that every live requirement-area owner, requirement-area co-author,
specification lead, specification co-author, and requirement-package lead has a
valid HSA-id before running `db-job migrate`. The migration creates
`requirement_responsibility_people`, removes duplicated live display-name
columns, and cannot reconstruct removed name snapshots on rollback without data
loss.

### Custom UI terminology values must be exported before upgrade if retained

The upgrade removes the retired UI terminology table. Export any historical
custom UI terminology values you need to keep before running `db-job migrate`;
migration rollback will not restore them.

### Topology changes

Production deployments must provide an approved HSA person lookup REST facade
outside `app-runtime` and the standard production Compose files. That facade
must integrate with an approved person catalog, and can be an existing
integration platform or a production-approved Kong route backed by
`hsa-person-lookup-adapter`.

The release adds a test-only `single-node-demo` topology for release smoke,
disposable demos and other non-production environments. It layers Kong,
`hsa-person-lookup-adapter`, the HSA directory mock and the demo HSA
certificate generator on top of `single-node`. The mock, demo certificate
generator, test support lock file, mock image, SBOM and attestation are relevant
only for operators who mirror or validate that demo/test topology.

### Before upgrading

Correct legacy requirements specifications that lack lifecycle status before
running `db-job migrate` if `Förvaltning` is not the intended value.

Review requirement packages and complete the current description field for
every package where it is missing or blank. The target version treats that text
as the package purpose and scope, and uses it to guide which requirements
belong in the package.

```sql
SELECT id, name
FROM requirement_packages
WHERE description IS NULL OR LTRIM(RTRIM(description)) = '';
```

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

Export any historical custom UI terminology values and any assignment-level AI
permission evidence that must be retained before `db-job migrate`. This branch
removes duplicated live display-name columns and unused AI permission flag
columns, and the destructive migrations cannot reconstruct those values on
rollback.

Add `HSA_PERSON_LOOKUP_URL` to the app runtime environment before users edit
responsibility assignments after the upgrade. The URL must be a server-side
REST facade reachable from `app-runtime` that accepts `POST { "hsaId": "..." }`
and returns normalized person data; keep `HSA_PERSON_LOOKUP_TIMEOUT_MS=5000`
unless the approved integration path needs another timeout. If the approved
facade requires app-to-platform authentication, also set the relevant optional
mTLS or OAuth2 client credentials variables:
`HSA_PERSON_LOOKUP_CLIENT_CERT_PATH`, `HSA_PERSON_LOOKUP_CLIENT_KEY_PATH`,
`HSA_PERSON_LOOKUP_CA_PATH`, `HSA_PERSON_LOOKUP_TLS_SERVER_NAME`,
`HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID`,
`HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET`, and either
`HSA_PERSON_LOOKUP_OAUTH_TOKEN_URL` or
`HSA_PERSON_LOOKUP_OAUTH_ISSUER_URL`. Add
`HSA_PERSON_LOOKUP_OAUTH_SCOPE` or `HSA_PERSON_LOOKUP_OAUTH_AUDIENCE` only
when the token endpoint requires them. The canonical flow is described in
[HSA person lookup integration](../integrations/hsa-person-lookup-integration.md).

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
