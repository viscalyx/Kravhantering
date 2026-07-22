# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Kravhantering. Use it together with the RHEL production
upgrade guide for the deployed topology and the GitHub Release notes for the
target version.

## Unreleased

### Invalid priority colors are reset during upgrade

Before running `db-job migrate`, identify P1-P5 priority rows whose color is
not an exact case-insensitive `#RRGGBB` value. Migration 0050 replaces only
those invalid values with the corresponding canonical P1-P5 color; valid
custom colors remain unchanged.

```sql
SELECT id, code, color
FROM priority_levels
WHERE code IN (N'P1', N'P2', N'P3', N'P4', N'P5')
  AND (
    color IS NULL
    OR DATALENGTH(color) <> 14
    OR color COLLATE Latin1_General_100_BIN2 NOT LIKE
      N'#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
  );
```

After upgrade, open `/sv/priority-levels` and review every priority in both
the labeled light and dark previews. Confirm that each priority remains
readable and visually distinct before accepting the upgraded configuration.

### Access-review periods must be ordered before upgrade

Before running `db-job migrate`, confirm no access-review run has a
`period_start` later than its `period_end`. The migration adds a checked
constraint and stops rather than modifying historical review evidence when it
finds an invalid row.

```sql
SELECT id, period_start, period_end
FROM access_review_runs
WHERE period_start > period_end;
```

<!-- operator-upgrade:source pr-572 start -->
Before rollout, review identity-provider role assignments for Admin Center users. Access is now limited to users with the Admin or PrivacyOfficer role, and users who need both general administration and privacy or archiving work must have both roles. Users without either role will no longer see the Admin Center entry point, and direct links will show an access-denied page.
<!-- operator-upgrade:source pr-572 end -->

### Export CSV and PDF generation

Provision sufficient private temporary storage on every application node. If KRAVHANTERING_EXPORT_TEMP_DIR is configured, it must reference an existing absolute directory accessible only to the non-root application account. Size storage for configured concurrency and maximum file sizes.

Deploy the updated reverse-proxy configuration with an extended timeout for
generated-output routes, including numeric requirements-specification CSV
paths. Procurement and full specification CSV reuse the existing
`KRAVHANTERING_EXPORT_TEMP_DIR`, storage-sizing formula, CSV settings, and
process-local pool; no new environment variable or setting is required.

#### After Upgrade

Review Admin Center > Settings > Exports and Reports. The common CSV limits
apply to Requirements Library, procurement, and full specification CSV.

<!-- operator-upgrade:source pr-625 start -->
### RFI question suggestions require consistent lifecycle history
Before upgrade, verify that existing RFI question suggestions have consistent lifecycle history. In particular, handled or dismissed suggestions must have a recorded review request, motivation, and chronologically valid lifecycle timestamps. The database migration stops and identifies affected records rather than altering historical evidence; correct them before retrying.
Update integrations and support runbooks to follow the forward-only lifecycle: draft → review requested → handled or dismissed.
<!-- operator-upgrade:source pr-625 end -->
## v0.3.0 - 2026-07-09

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

Only use `single-node-demo` for release smoke, disposable demos or other
test-only environments. Before starting that topology, set `KONG_IMAGE_REF` and
`HSA_DIRECTORY_MOCK_IMAGE_REF` from `container-test-support.lock.json` or from
your internal mirrored tags, and set the demo app runtime to
`HSA_PERSON_LOOKUP_URL=http://kong:8000/hsa/person-records/lookup`. For
disconnected demo/test hosts, export and load images with
`bin/kravhantering-images.sh --topology single-node-demo --test-lock-file
container-test-support.lock.json`.

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

Disconnected first installs and planned upgrades now split import from
activation. For disconnected environments, use the disconnected guide to verify
the transferred bundle, prepare the target release, and load or verify images
only. Do not activate the new release or copy first-install configuration
during the disconnected import step.

After import completes, resume the regular deployment or upgrade guide at the
activation step. Apply the image references recorded in the transferred offline
manifest, then verify the already loaded images instead of pulling from a
registry. This applies to both app-node and single-node topologies, including
the disposable single-node demo path.

### After upgrading

Releases with DB-backed AI safety rules require the `seed:required` step to
complete after migration.

Releases with AI safety forensic logging add
`ai_settings.ai_safety_forensic_logging_enabled` with default `1`. Review the
Admin Center `Settings` tab, section `AI`, after migration and either route
`channel == "security-forensics"` logs with stricter access/retention controls
or disable `Log forensic AI security data` until that routing is ready.

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

<!-- operator-upgrade:source pr-394 start -->
Update automated requirement-import producers and API/MCP integrations before rollout to use the version 2 requirement import schema and the renamed verifiability attribute. Payloads built for the previous import schema, including the old testing-required flag, will not be accepted by this release.
<!-- operator-upgrade:source pr-394 end -->

<!-- operator-upgrade:source pr-399 start -->
After rollout, MCP clients can discover two additional requirements-import tools for retrieving the canonical import schema and import instruction. Existing MCP clients should continue to work, but operators or support staff should notify teams that maintain strict MCP tool inventories, allowlists, or client-side assertions so they can refresh their expected tool count after upgrade.
<!-- operator-upgrade:source pr-399 end -->

<!-- operator-upgrade:source pr-406 start -->
After upgrade, review the Admin Center MCP limits before enabling high-volume imports. The release adds database-backed, short-lived MCP import validation sessions and new operator-tunable limits for request/session size, import row count, and validation-token lifetime. The defaults are 10 MiB, 500 rows, and 60 minutes; adjust them to match production capacity and client retry behavior.
<!-- operator-upgrade:source pr-406 end -->

<!-- operator-upgrade:source pr-409 start -->
Before or immediately after upgrade, route the new AI safety forensic log stream separately from metadata security audit logs, with stricter access, retention, and masking controls, or disable forensic AI safety logging in Admin Center until that routing is ready. The forensic stream is enabled by default during this diagnostic phase and can contain raw blocked AI content, model reasoning, repair payloads, matched rule terms, personal data, or secrets.
<!-- operator-upgrade:source pr-409 end -->

<!-- operator-upgrade:source pr-430 start -->
Notify teams that maintain MCP clients, strict tool allowlists, or import automation. The MCP requirements import surface now includes needs-reference management, and import-instruction retrieval is destination-aware instead of locale-only. Clients that prepare requirements-specification imports must resolve the target specification and any required needs-reference links before executing the import.
<!-- operator-upgrade:source pr-430 end -->
