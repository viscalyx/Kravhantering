# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Kravhantering. Use it together with the RHEL production
upgrade guide for the deployed topology and the GitHub Release notes for the
target version.

## Unreleased

<!-- operator-upgrade:source issue-477 start -->
### Select and configure the client-IP trust boundary before upgrade

Before upgrading, classify each deployment as direct ingress or load-balanced
ingress. Load-balanced sites must provision a root-controlled list containing
only the exact proxy network CIDRs and verify the longest approved proxy chain;
the upgraded ingress fails closed without that trust configuration. Direct
ingress instead overwrites forwarding evidence with the connection peer.

New access logs omit query strings, referrer data, and raw forwarding values.
Treat older access-log copies as potentially sensitive because they may contain
OIDC callback parameters, referrer queries, or attacker-controlled forwarding
values. Inventory and restrict those copies, apply the approved incident,
privacy, and retention process, and rotate any credential that remains usable.
<!-- operator-upgrade:source issue-477 end -->

<!-- operator-upgrade:source pr-870 start -->
Provision AZURE_DEV_WORKSTATION_APPROVER_PUBLIC_KEY_PATH on destination workstations through a trusted channel before generating requests. Request and package schema 3 intentionally has no compatibility path with schema 2; regenerate pending requests and responses after upgrade. Existing approval key rotation requires provisioning the replacement public key before creating a new request.
<!-- operator-upgrade:source pr-870 end -->

<!-- operator-upgrade:source pr-880 start -->
### Invalid requirement and specification-item status colors are reset during upgrade

Before running `db-job migrate`, identify seeded requirement statuses and
specification-item statuses whose color is not an exact case-insensitive
`#RRGGBB` value. Migration 0053 resets only these invalid rows to their
canonical colors; valid custom colors, including their letter case, remain
unchanged.

```sql
SELECT N'requirement_statuses' AS catalog, id, color
FROM requirement_statuses
WHERE id IN (1, 2, 3, 4)
AND (
color IS NULL
OR DATALENGTH(color) <> 14
OR color COLLATE Latin1_General_100_BIN2 NOT LIKE
N'#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
)
UNION ALL
SELECT N'specification_item_statuses' AS catalog, id, color
FROM specification_item_statuses
WHERE id IN (1, 2, 3, 4, 5, 6)
AND (
color IS NULL
OR DATALENGTH(color) <> 14
OR color COLLATE Latin1_General_100_BIN2 NOT LIKE
N'#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
);
```
After upgrade, review `/sv/requirement-statuses` and `/sv/specification-item-statuses`. Open every row and confirm the labeled light- and dark-theme previews report `Uppfyller AA` before accepting the upgraded configuration.
<!-- operator-upgrade:source pr-880 end -->

<!-- operator-upgrade:source pr-924 start -->
Before the first production rollout, configure a privileged database-job
identity separately from the application runtime identity. Set
`DB_RUNTIME_USER` to the application runtime database user, and provision that
user with only the release-managed `kravhantering_runtime` role. Ensure all
required application settings exist; privileged database maintenance owns any
repair because the runtime identity cannot create missing settings.
Permission reconciliation fails closed when the user is missing, managed
grants drift, unexpected role nesting exists, or the user has effective
schema-migration, protected-audit mutation, or database-user impersonation
capabilities. If a development, test, or rollout database gives the runtime
user broad read/write memberships, reconciliation removes those memberships
only after the custom role contract verifies. Other site-managed roles and
direct grants remain in place, but operators must remove or narrow any that
cause verification to fail rather than broadening runtime access.
Retain the permission verification output as deployment evidence and validate
representative application read/write workflows. For rollback, use a complete
database restore point so schema, data, permissions, and role memberships
return as one database state; do not reverse only the role change against the
restricted runtime identity.
<!-- operator-upgrade:source pr-924 end -->

<!-- operator-upgrade:source pr-927 start -->
Production rollout now uses rootless Podman Quadlet and user-level systemd targets. Production hosts no longer require Podman Compose. Before the first rollout, verify the service account’s Quadlet environment, production configuration, image references, selected topology, and container-network resolver.
Quadlet manages long-running services only. Database bootstrap, migrations, and required seeding remain explicit release operations. Existing single-node volume and network names are preserved, and removing managed units does not delete named volumes.
New installations run bin/kravhantering-quadlet.sh for the
selected topology and manage the resulting target with systemctl --user.
<!-- operator-upgrade:source pr-927 end -->

<!-- operator-upgrade:source pr-940 start -->
Before upgrading, verify that each production host supports rootless container resource controls, has finite journal retention configured, and has sufficient CPU, memory, and temporary export capacity. Installation now fails closed when these prerequisites are not met. If disk-backed export storage is required, prepare its ownership, permissions, capacity, and security labels before rollout.
Single-node deployments must set both `NGINX_RESOLVER` for the edge network and `NGINX_IDENTITY_RESOLVER` for the identity network before starting nginx. Existing installations that lack the identity setting must first add the temporary value documented in the single-node upgrade guide so the helper can render the network units. After the edge and identity networks exist, discover each resolver with `kravhantering-quadlet.sh print-resolver`, replace both settings with the discovered values, reinstall the units, and only then start the full target. nginx uses the edge resolver only for `app-runtime` and the identity resolver only for Keycloak.
<!-- operator-upgrade:source pr-940 end -->

<!-- operator-upgrade:source pr-962 start -->
Single-node installations now validate and apply explicit SQL Server and Keycloak CPU, memory, PID, and temporary-storage limits. Review the new `SQLSERVER_*` and `KEYCLOAK_*` values in `containers/production/env/release.env.template` before deployment; the documented defaults require at least 16 GiB host memory. Reinstall the rendered Quadlets and run the production smoke after upgrading so containment, persistence, recovery, and application readiness are verified against the existing volumes. See `docs/operations/production-quadlet-containment.md` for supported ranges, capacity rules, image qualifications, and rollback guidance.
<!-- operator-upgrade:source pr-962 end -->

<!-- operator-upgrade:source pr-965 start -->
Before upgrading a single-node production deployment, provision a SQL Server certificate and private key for the fixed `DNS:sqlserver` service identity. The certificate must chain to the CA trusted by the application and database jobs. The upgraded SQL Server service requires readable certificate material before it can start.
During rollout, remove any insecure server-certificate trust override, make the issuing CA available to every one-shot database container, and verify database-job and application readiness before returning the service to users. Retain the previous certificate and key as a short-lived rollback pair until the verified connection checks pass.
<!-- operator-upgrade:source pr-965 end -->

<!-- operator-upgrade:source pr-967 start -->
Existing self-contained single-node deployments retain the bundled identity
provider as their default and require no action unless changing identity
profiles. Operators moving to an external provider must complete the provider
registration, trust, redirect, logout, claim, and connectivity preparation
before rollout.
Before choosing bundled Keycloak for production, provision a separately
controlled management route with server and client certificate trust, restrict
its network reachability, establish named administrators with MFA and tested
recovery, and retire reusable bootstrap access. Validate both the user-facing
denials and authorized management access, and use the profile-specific backup,
rollback, recovery, uninstall, and incident procedures during its lifecycle.
<!-- operator-upgrade:source pr-967 end -->

<!-- operator-upgrade:source pr-978 start -->
MCP authentication failures now use stable generic responses. Invalid
credentials remain `401`; local authentication configuration failures return
`500`, and identity-provider discovery or signing-key availability failures
return `503`. All retain the Bearer challenge.
Ensure MCP clients and monitoring classify failures by HTTP status rather than
provider-specific error text. During rollout, validate identity-provider
discovery and signing-key reachability and monitor the new `500` and `503`
outcomes.
<!-- operator-upgrade:source pr-978 end -->

<!-- operator-upgrade:source pr-981 start -->
AI provider failures now use stable error codes and sanitized response shapes. During rollout, verify any clients, alerts, or support runbooks that rely on the previous error payloads or treated malformed model output as a validation response.
Provider failure diagnostics now use a structured observability channel containing only bounded operational metadata. Confirm that production log routing and dashboards capture this channel without expecting raw provider error text.
<!-- operator-upgrade:source pr-981 end -->

<!-- operator-upgrade:source pr-984 start -->
Before upgrading, classify each deployment as direct ingress or load-balanced
ingress. Load-balanced sites must provision a root-controlled list containing
only the exact proxy network CIDRs and verify the longest approved proxy chain;
the upgraded ingress fails closed without that trust configuration. Direct
ingress instead overwrites forwarding evidence with the connection peer.
New access logs omit query strings, referrer data, and raw forwarding values.
Treat older access-log copies as potentially sensitive because they may contain
authorization callback parameters, referrer queries, or attacker-controlled
forwarding values. Inventory and restrict those copies, apply the approved
incident, privacy, and retention process, and rotate any credential that
remains usable.
<!-- operator-upgrade:source pr-984 end -->

<!-- operator-upgrade:source pr-987 start -->
Before upgrading, create a site-specific readiness probe boundary containing the approved IPv4 and IPv6 monitoring source networks and configure the deployment to use it. The upgrade will refuse to render or install if the boundary is absent or invalid.
After rollout, verify readiness from an allowed monitoring source, confirm other sources receive an empty denial, and confirm liveness and normal application traffic remain available. Update monitoring expectations for one request per second with a burst of five and generic rate-limit/not-ready responses.
<!-- operator-upgrade:source pr-987 end -->

<!-- operator-upgrade:source pr-989 start -->
Before rollout, verify every production HSA lookup, OAuth, and SOAP endpoint uses HTTPS and that discovery returns a token endpoint on the configured issuer's origin. Confirm host firewall, approved egress proxy, DNS, routing, and upstream ACL rules allow only approved HSA destinations.
<!-- operator-upgrade:source pr-989 end -->

<!-- operator-upgrade:source pr-990 start -->
After deployment, verify responsibility assignment workflows for areas, packages, and specifications. HSA lookup no longer persists a person immediately; the final assignment must present the short-lived evidence returned by verification, after which person creation and assignment are committed atomically.
Update any automation that calls these internal verification and assignment endpoints to forward the returned evidence. Verification is now rate limited, and audit records use target fingerprints and outcomes instead of raw target HSA IDs or personal data. Brief support and privacy teams on the protected-person handling guidance shown in the assignment workflow.
<!-- operator-upgrade:source pr-990 end -->

<!-- operator-upgrade:source pr-993 start -->
After upgrade, every synchronous PDF report and export shares the configured
per-node PDF concurrency, timeout, and item limits. Requests above the item
limit return `422`; saturated capacity returns `429` with retry guidance; and
generation timeouts return `503`.

Before rollout, confirm the existing PDF limits are appropriate for combined,
history, specification, RFI, access-review, and privacy exports. No schema,
secret, or configuration migration is required.
<!-- operator-upgrade:source pr-993 end -->

<!-- operator-upgrade:source pr-994 start -->
Before rollout, update browser, API, MCP, and AI producers to emit
`requirement-import.v4`; v3 is no longer accepted. Apply database migrations
before starting the new application version. The migration adds global import
budgets and clamps existing MCP row limits above 500.

After deployment, verify the Admin Center Imports settings and any
site-specific MCP limit.
<!-- operator-upgrade:source pr-994 end -->

<!-- operator-upgrade:source pr-998 start -->
This release adds a five-minute transient-state cleanup job to every supported
production topology. Before upgrade, make the database-job image available on
each host. Add the cleanup limits to the production application configuration,
or confirm that the default limits are suitable.

During rollout, install and reload the updated units, and restart the topology
target. Confirm that the timer is active. Complete one manual cleanup run before
you restore traffic. Monitor failed cleanup outcomes and an expired-state
backlog that does not decrease.

Before rollback to a release without scheduled cleanup, disable and remove the
cleanup timer and job with the newer release procedure. Rollback stops future
scheduled deletion. It does not restore expired sessions that the cleanup job
already removed.
<!-- operator-upgrade:source pr-998 end -->

<!-- operator-upgrade:source pr-1001 start -->
Before upgrade, drain MCP import-validation traffic and stop all application
nodes. Upgrade the database and all nodes as one coordinated rollout; mixed
versions are unsupported. Upgrade and rollback invalidate every outstanding
validation token, so tell MCP clients to validate imports again.

After upgrade, review the four new validation-session quotas in Admin Center
and verify principal isolation and transient cleanup before restoring traffic.
Keep the authentication session secret unchanged during routine rollout.
Rotating it intentionally invalidates all outstanding validation tokens.
<!-- operator-upgrade:source pr-1001 end -->

<!-- operator-upgrade:source pr-1002 start -->
Before the upgrade, decide whether the MCP surface must be enabled. If it is
enabled, update the identity provider and application configuration together.
MCP service tokens must identify the approved service client, use the
access-token class, contain every required scope and the configured role claim,
and have a short lifetime. An incomplete enabled configuration makes the
application not ready, and old token shapes are rejected.

If MCP is not used, leave the MCP service client unconfigured. The MCP endpoint
then returns `404` while the rest of the application remains available. During
rollout, verify readiness and obtain one valid service token before enabling
MCP clients.
<!-- operator-upgrade:source pr-1002 end -->

<!-- operator-upgrade:source pr-1003 start -->
Before upgrade, review every MCP integration. The MCP endpoint is disabled
unless an approved service client is configured. For enabled deployments,
update the identity provider and MCP clients so that service tokens use the
approved service client and access-token class, contain every required scope and
the configured role claim, and have an approved short lifetime. Existing tokens
that do not meet this contract will be rejected. After rollout, confirm
readiness and request a new service token before running MCP work.

Raw AI safety forensic capture is disabled by default for fresh installations.
Upgrades preserve the stored setting. Review the AI setting in Admin Center and
disable raw forensic capture if the installation must use metadata-only
logging. No action is required when capture is already disabled or when
continued raw capture is approved with suitable access and retention controls.
<!-- operator-upgrade:source pr-1003 end -->

<!-- operator-upgrade:source pr-1024 start -->
This release removes persistent raw AI forensic logging and replaces it with
time-limited evidence capture that requires a separate requester and approver.
Update support and incident-response procedures that depend on the former raw
forensic log stream.

Before rollout, confirm encrypted database transport, encryption at rest and in
backups, least-privilege runtime access, and scheduled transient cleanup. After
rollout, verify automatic capture expiry and the 72-hour post-stop purge. After
a database restore, run transient cleanup before evidence reads are enabled so
expired evidence does not become operationally available.
<!-- operator-upgrade:source pr-1024 end -->

<!-- operator-upgrade:source pr-1035 start -->
Before the upgrade, inject unique authentication secrets into the production
application configuration. For bundled Keycloak, also set temporary bootstrap
administrator credentials and separate application and MCP realm client
secrets. Make sure that the application client secret matches the application
configuration.
During rollout, the deployment preflight rejects blank or shipped placeholder
credentials before services start. The application image also stops if these
placeholders remain. If you rotate the session secret, all active browser
sessions become invalid. Plan this action for a low-traffic period and verify
sign-in after deployment.
<!-- operator-upgrade:source pr-1035 end -->

<!-- operator-upgrade:source pr-1037 start -->
Before rollout, validate the responsibility assignments for requirements specifications and requirement areas. Direct reads of child resources now use the access rules of their parent resource.
Tell API consumers and support staff that an existing child resource can now return `403` when the user cannot read its parent. A missing resource still returns `404`. Published requirement information remains readable according to the existing policy. Sensitive child responses are not cached. No configuration or data migration is required.
<!-- operator-upgrade:source pr-1037 end -->

<!-- operator-upgrade:source pr-1042 start -->
Before rollout, inform requirement-area authors and Reviewers that they can no longer change requirement applications or saved requirement-selection answers unless they are also the responsible author or a co-author of the requirements specification. Administrators remain allowed.
After rollout, verify that denied attempts return `403` and that the action log and security audit log receive denial evidence.
<!-- operator-upgrade:source pr-1042 end -->

<!-- operator-upgrade:source pr-1056 start -->
Before the upgrade, verify that requirement-area owner and co-author assignments
are current. After the upgrade, only these assigned authors and Administrators
can create or change requirement-selection questions and answers. Other
authenticated users have read-only access.
Communicate this permission change to requirement-library maintainers. During
rollout validation, confirm assigned-author access, the Administrator bypass,
and authorization-denial audit evidence. No data migration or configuration
change is required.
<!-- operator-upgrade:source pr-1056 end -->

<!-- operator-upgrade:source pr-1059 start -->
Before upgrade, notify owners of MCP integrations that add requirements to a
requirements specification. Each request now accepts 1–200 unique requirement
IDs. Clients must remove duplicate IDs and split larger batches. Invalid
requests are rejected before database work starts.
<!-- operator-upgrade:source pr-1059 end -->
## v0.4.0 - 2026-08-02

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
outside `app-runtime` and the standard production Quadlet topology. That facade
must integrate with an approved person catalog, and can be an existing
integration platform or a production-approved Kong route backed by
`hsa-person-lookup-adapter`.

Release smoke now installs the production archive's supported `single-node`
Quadlet topology on Ubuntu 24.04. Kong, `hsa-person-lookup-adapter`, the HSA
directory mock, and the demo certificate generator run in a CI-only Quadlet
overlay. That overlay is not included in the production archive and is not a
supported RHEL production topology. Local development and integration Compose
flows remain separate developer tooling.

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

This release removes persistent raw AI forensic logging and replaces it with
time-limited evidence capture that requires a separate requester and approver.
Before rollout, confirm encrypted database transport, encryption at rest and in
backups, least-privilege runtime access, and scheduled transient cleanup.

After rollout, verify automatic capture expiry and the 72-hour post-stop purge.
After a database restore, run transient cleanup before allowing evidence reads
so expired evidence does not become operationally available.

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
Persistent raw AI forensic logging is not available. Use the separately
requested and approved, time-limited evidence-capture workflow only for an
authorized incident investigation. Verify its expiry and purge, and run
transient cleanup after a database restore before allowing evidence reads.
<!-- operator-upgrade:source pr-409 end -->

<!-- operator-upgrade:source pr-430 start -->
Notify teams that maintain MCP clients, strict tool allowlists, or import automation. The MCP requirements import surface now includes needs-reference management, and import-instruction retrieval is destination-aware instead of locale-only. Clients that prepare requirements-specification imports must resolve the target specification and any required needs-reference links before executing the import.
<!-- operator-upgrade:source pr-430 end -->
