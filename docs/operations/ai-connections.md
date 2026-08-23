# AI Connections Operations

This runbook describes the operating contract for provider-neutral AI
connections implemented by the AI integration layer in
[ADR 0051](../adr/0051-ai-integrationslager-med-korprofiler-och-adaptrar.md).
The trust, lifecycle, and provider-secret decision is
[ADR 0052](../adr/0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md).
The fixed privacy floor is
[ADR 0053](../adr/0053-integritetsminimum-for-ai-anrop.md).
The release gate and verification modes are defined by
[ADR 0054](../adr/0054-global-ai-sparr-och-driftsattningsbevis.md), and the
content-free telemetry and synthetic live-evidence contract by
[ADR 0055](../adr/0055-innehallsfri-ai-observerbarhet-och-syntetisk-liveverifiering.md).
The unified verification and stable-profile decision is
[ADR 0056](../adr/0056-sammanhallen-modellverifiering-och-stabila-korprofiler.md).

AI-assisted authoring is optional. An unavailable or unconfigured AI
connection blocks only its dependent run profiles; it does not make
`/api/health` or `/api/ready` fail.

Authoring clients receive a localized cause for normalized provider failures
such as authentication, rate limiting, connectivity, timeout, rejected
requests, capability mismatch, adapter failure, or an unusable response. A
validated content-free `technicalCode` is shown as a support reference. Raw
provider bodies and nested exception details are never returned.

## Ownership

- Product administrators register AI connections, enter and rotate provider
  secrets, record attestations, verify AI connection models, activate
  connections, and configure stable run profiles.
- Operations owns the external versioned root keyring, distribution to every
  app node, egress enforcement, backup and restore, dashboards, and alerts.
- Security and data-protection owners approve information class, geography,
  subprocessors, training policy, maximum retention, and incident contacts.

Product administrators can write or replace provider secrets but can never
read or export their plaintext. Operations handles root keys but does not need
to participate in an ordinary provider-secret rotation.

## Provider-Secret Cryptography

Each secret revision is encrypted before SQL Server sees it. The envelope uses
AES-256-GCM, a new 12-byte cryptographically random nonce, and a 16-byte
authentication tag. Its authenticated additional data is the exact UTF-8 byte
sequence below, where `NUL` is one zero byte and UUIDs are lowercase:

<!-- markdownlint-disable MD013 -->

```text
kravhantering.ai-provider-secret NUL 1 NUL <root-key-version> NUL <connection-id> NUL <secret-revision-id>
```

<!-- markdownlint-enable MD013 -->

The database stores only ciphertext, nonce, tag, cipher-format version, and the
explicit root-key version. Moving an envelope to another connection or secret
revision, or changing either version field, therefore makes authentication
fail. Plaintext exists only inside a fixed, purpose-specific trusted operation
owned by the provider-secret service. Request handlers cannot supply callbacks
that receive it, and no public service method returns it. Do not write plaintext
to an API response, log, error, telemetry event, test artifact, or export.

## External Root Keyring

Set `AI_PROVIDER_SECRET_KEYRING_FILE` to an external JSON file with this shape:

```json
{
  "formatVersion": 1,
  "activeWriteVersion": "2026-08-a",
  "keys": {
    "2026-08-a": "<base64-encoded-32-byte-key>",
    "2026-05-b": "<base64-encoded-32-byte-key>"
  }
}
```

Versions are opaque identifiers. The application encrypts new revisions only
with `activeWriteVersion` and decrypts each stored revision only with its
recorded version; it never chooses the lexically or numerically highest key.
Every key must decode to exactly 32 bytes.

In the production Quadlet topologies, provision the file as
`/etc/kravhantering/secrets/ai-provider-secret-keyring.json`, owned by
`root:kravhantering` with mode `0640`. Keep the directory at mode `0750` and
apply the site's container-readable SELinux label. The app mounts that
directory read-only at `/run/secrets/kravhantering`. Distribute the same
required versions to every app node through the approved secret manager; do
not put key bytes in `app.env`, the repository, release artifacts, or support
bundles.

For local development, both devcontainer variants and the Azure development
bootstrap run:

```bash
node scripts/provision-ai-provider-secret-keyring.mjs
```

The helper atomically creates the ignored
`.local/ai-provider-secret-keyring.json` with private permissions. Repeated or
concurrent runs leave an existing file byte-for-byte unchanged and never read
or print its key material. Use `--path <file>` only when testing an alternate
local path. This helper is for local provisioning, not production key
generation or distribution.

## Provider-Secret Lifecycle

Writing or replacing a provider secret creates an encrypted `candidate`
revision. Test that exact candidate against its exact AI connection before an
atomic activation makes it `active` and supersedes the previous revision. A
failed test leaves the candidate inactive. An unactivated candidate may be
deleted.

Activating a new or restored credential increments the affected connection's
configuration version, moves a non-draft connection to
`verification_required`, and marks its verified model revisions
`new_revision_required`. Existing stable profile selections remain recorded but
are blocked. After credential activation, run the unified model verification to
create each required replacement revision, reactivate the connection, select
the replacement revisions on affected profiles, and confirm that the profiles
have no blockers before resuming traffic.

Ending or deleting a model revision requires that no stable profile selects it
and that no queued, retrying, or running coordination row uses it. Disconnect
the profile or select a replacement first. Ending is irreversible. Permanent
deletion is available only after ending and also deletes the model container
when its final revision is removed. The same external model ID and version
cannot be registered as two different connection models on one connection.

A still-encrypted superseded revision may be restored only after a new
connection test. After the old provider credential has been revoked, confirm
revocation to erase its ciphertext, nonce, and tag while retaining lifecycle
and audit metadata. A revision whose encrypted material was erased cannot be
restored; enter a new candidate instead.

## External Trust Boundary

Every adapter call uses the app-owned trust boundary. Admin Center stores only
the fixed authentication type and deployment policy keys; it cannot supply
arbitrary request headers, CA material, a certificate-validation override, or
an egress implementation.

Production endpoints must use `https` or `wss` and contain no user information,
query, or fragment. The endpoint origin must occur in the selected
deployment-owned egress policy. Ordinary origins must resolve only to public IP
addresses. A private, loopback, link-local, or internal destination is accepted
only when both its exact origin and every permitted address occur in the
deployment's sidecar policy. DNS is checked when configuration is verified,
when an activation probe runs, and immediately before every transport request.
Redirects and requests outside the verified endpoint path are rejected.

The validated address set is pinned into the deployment-owned TLS transport
for that request. The transport connects only to one of those addresses while
retaining the original hostname for SNI and hostname/certificate validation.
It must not resolve the hostname again.

The application check and pinned transport complement the deployment egress
firewall or proxy. Operations must generate the network control from the same
reviewed allowlist as defense in depth.

TLS policy implementations come from deployment configuration. Public policy
uses normal Web PKI validation. A private policy may attach the site's private
CA to its deployment-owned transport, but hostname, chain, and validity checks
remain mandatory. Admin Center cannot upload CA material or disable validation.

The built-in runtime composition reads the deployment-owned maps from
`AI_CONNECTION_EGRESS_POLICIES_JSON`,
`AI_CONNECTION_DATA_POLICIES_JSON`, and
`AI_CONNECTION_TLS_POLICIES_JSON`. TLS map values identify the trust source;
the built-in pinned HTTPS transport uses `public_web_pki`. A deployment that
uses `deployment_private_ca` must compose its own deployment-owned pinned
transport with the approved CA material. Leaving a map empty makes its policy
keys unavailable and therefore blocks verification and activation. Local
development may set `AI_CONNECTION_DEVELOPMENT_LOCAL_ORIGIN` to the one exact
origin permitted to use authentication type `none`; this exception is inactive
in test and production.

For field-by-field schemas, exact environment-file examples, decision owners,
and a first-time operator procedure, follow the
[AI connection deployment-policy guide](./ai-connection-deployment-policies.md).

The fixed authentication types are static secret, OAuth 2.0 client credentials,
and mTLS. Production sidecars require one of these forms. The only no-auth and
plain HTTP exception is the exact `development-local` origin supplied by the
development deployment; it is rejected in test and production environments.

## Data and Content Gates

The active, unexpired connection attestation supplies the connection's
information-class ceiling, personal-data approval, regions, subprocessors,
training decision, and retention maximum. The deployment-owned run-type policy
supplies the conservative requirement for each fixed run profile. Missing,
malformed, expired, or insufficient policy blocks the run. Request data cannot
relax either policy. Admin Center distinguishes a missing deployment-owned
run-type policy from an attestation that does not satisfy a configured policy.

The application derives each run profile's capability selection from its fixed
requirements and the exact selected model revision's verified capabilities.
Administrators cannot edit this policy. Unsupported optional capabilities are
forced to `disabled`, and a revision that lacks a required capability cannot be
selected. Runtime resolution rechecks the same verified capability evidence and
remains fail closed.

Every server-owned AI request also has an administrator-owned privacy minimum:
provider data collection is denied and zero data retention is required. The
minimum applies when caller preferences are absent and overrides weaker caller
or adapter preferences. An attestation that permits training or retention
above zero does not satisfy the minimum, even when a deployment run-type policy
is weaker. OpenRouter requests always set both the deny-data-collection and ZDR
routing controls; ZDR is a routing restriction and must never degrade to best
effort. OpenRouter's data-collection classification still depends on its
provider-policy information, so operators must review that evidence before
activation.

Before release, verify that every intended active connection has current
evidence for no training, zero retention, and the selected model revision. Keep
the global AI guard active if evidence is missing or the exact provider path
cannot satisfy the minimum. Provider and model admission allowlisting remains
the separate [allowlisting work](https://github.com/viscalyx/Kravhantering/issues/194);
the privacy minimum does not select or approve a provider or model.

Before egress, the application:

1. validates each image's signature against its declared MIME type
2. enforces deployment-owned byte, width, height, decoded-pixel, and frame
   limits
3. decodes and re-encodes accepted images as PNG without source metadata
4. screens every text part with the app-owned input safety filter

The integration layer quarantines both analysis and output deltas. No delta is
client-visible or importable. At the terminal boundary, the application screens
the quarantined text, complete analysis, and complete result; parses the final
JSON; rejects callback, function, and tool fields; and validates the exact
response schema. A blocked decision, filter failure, malformed JSON, schema
failure, or activation-probe callback/tool attempt produces one safe terminal
failure.

Adapters receive only the sanitized task, opaque external run ID, fixed
resolved revision data, transient authentication configuration, and the
app-owned egress transport. They do not receive internal correlation IDs or an
unrestricted network client. Normal logs and telemetry must never include
prompt text, image bytes, model result, endpoint, provider secret, secret
reference, CA material, or adapter configuration. Record only stable internal
IDs, bounded metrics, and sanitized outcome categories.

## Pre-deployment Gate

Keep the global AI guard active during installation and upgrade. Before
releasing it, verify all of the following for the environment:

1. The required root-key versions are present on every app node, and the
   intended active write version is explicit.
2. SQL Server backup and the matching external root keyring can be restored
   together.
3. The egress firewall or proxy allows only approved AI connection
   destinations, including explicitly deployment-defined sidecars.
4. Secure defaults and app-owned input, image, output, and schema gates are
   active.
5. Each intended AI connection has a valid zero-retention, no-training
   attestation, successful connection test, available provider secret, and
   `active` lifecycle state.
6. Each selected AI connection model revision has passed the required
   capability tests.
7. Each intended stable run profile is enabled, unblocked, and references
   exactly the verified dependencies reviewed for the rollout; record its
   current configuration version.
8. Alerts for authentication failure, an opened circuit breaker, and a
   blocked active run profile reach the on-call channel.

Required seed leaves AI unconfigured. Demo seed may create only unverified
connection drafts and must never create verification evidence or configure a
run profile.

Connection verification evidence is append-only. An authentication failure or
runtime contradiction records a new failed evidence row and moves current
connection/model state to verification required; it never edits the expiry or
contents of earlier evidence. Reverification appends a new passed row.

### Deployment Evidence Gate

The production bundle includes `scripts/ai-deployment-gate.mjs`. Keep
`AI_REQUIREMENT_GENERATION_DISABLED=1` on every app node while gathering a
content-free JSON evidence document. The strict schema rejects unknown fields;
never add a prompt, image, result, endpoint, provider response, secret
reference, or secret value.

Use exactly one verification mode:

- `prodlike` proves the production-like test suite used `controlled_test`,
  made no external live AI call, and used only synthetic data.
- `staging_live` proves the opt-in staging probe used synthetic data through
  the exact intended adapter, connection, model revision, stable profile, and
  profile configuration version.
- `production` records that no live authoring probe ran in production. The
  connection and model activation tests, restoration evidence, alert bindings,
  and exact intended active path remain mandatory.

The evidence shape is:

<!-- markdownlint-disable MD013 -->

```json
{
  "schemaVersion": 3,
  "environment": "production",
  "verificationMode": "production",
  "guardActive": true,
  "keyring": {
    "activeWriteVersionExplicit": true,
    "requiredVersionsPresentOnEveryNode": true
  },
  "restore": {
    "databaseAndKeyringRestoredTogether": true,
    "providerSecretsAuthenticated": true
  },
  "egress": { "deploymentPolicyEnforced": true },
  "secureDefaults": {
    "contentGatesVerified": true,
    "privacyFloorVerified": true
  },
  "inventory": {
    "intendedPaths": [{
      "adapterType": "openrouter",
      "adapterVersion": "1",
      "aiConnectionId": "<opaque-id>",
      "aiConnectionModelRevisionId": "<opaque-id>",
      "aiRunProfileId": "<opaque-id>",
      "aiRunProfileConfigurationVersion": 1,
      "connectionRevisionToken": "<opaque-token>",
      "modelRevisionToken": "<opaque-token>",
      "profileToken": "<opaque-token>"
    }],
    "verifiedPaths": [{
      "adapterType": "openrouter",
      "adapterVersion": "1",
      "aiConnectionId": "<same-opaque-id>",
      "aiConnectionModelRevisionId": "<same-opaque-id>",
      "aiRunProfileId": "<same-opaque-id>",
      "aiRunProfileConfigurationVersion": 1,
      "connectionRevisionToken": "<same-opaque-token>",
      "modelRevisionToken": "<same-opaque-token>",
      "profileToken": "<same-opaque-token>"
    }]
  },
  "liveExecutionProof": null,
  "checks": [
    { "axis": "adapter_contract", "evidenceId": "ci-adapter-42", "outcome": "passed", "suiteVersion": "adapter-v1" },
    { "axis": "security", "evidenceId": "ci-security-42", "outcome": "passed", "suiteVersion": "security-v1" },
    { "axis": "sql", "evidenceId": "ci-sql-42", "outcome": "passed", "suiteVersion": "sql-v1" },
    { "axis": "routes", "evidenceId": "ci-routes-42", "outcome": "passed", "suiteVersion": "routes-v1" },
    { "axis": "sse", "evidenceId": "ci-sse-42", "outcome": "passed", "suiteVersion": "sse-v1" },
    { "axis": "playwright_dev", "evidenceId": "ci-pw-dev-42", "outcome": "passed", "suiteVersion": "playwright-v1" },
    { "axis": "playwright_prodlike", "evidenceId": "ci-pw-prodlike-42", "outcome": "passed", "suiteVersion": "playwright-v1" },
    { "axis": "manual", "evidenceId": "manual-42", "outcome": "passed", "suiteVersion": "manual-v1" },
    { "axis": "required_seed", "evidenceId": "ci-required-seed-42", "outcome": "passed", "suiteVersion": "seed-v1" },
    { "axis": "demo_seed", "evidenceId": "ci-demo-seed-42", "outcome": "passed", "suiteVersion": "seed-v1" },
    { "axis": "recovery_rotation", "evidenceId": "recovery-42", "outcome": "passed", "suiteVersion": "recovery-v1" },
    { "axis": "deployment_rollback", "evidenceId": "rollback-42", "outcome": "passed", "suiteVersion": "rollback-v1" }
  ],
  "alerts": {
    "activeProfileBlocked": true,
    "authenticationFailure": true,
    "circuitBreakerOpened": true
  },
  "syntheticProbe": {
    "adapterType": "openrouter",
    "adapterVersion": "1",
    "aiConnectionId": "<same-opaque-id>",
    "aiConnectionModelRevisionId": "<same-opaque-id>",
    "aiRunProfileId": "<same-opaque-id>",
    "aiRunProfileConfigurationVersion": 1,
    "connectionRevisionToken": "<same-opaque-token>",
    "externalLiveCallMade": false,
    "modelRevisionToken": "<same-opaque-token>",
    "outcome": "not_run",
    "payloadClassification": "none",
    "profileToken": "<same-opaque-token>"
  }
}
```

<!-- markdownlint-enable MD013 -->

For `prodlike`, use `environment: "prodlike"`,
`verificationMode: "prodlike"`, and `liveExecutionProof: null`. Every
inventory and synthetic-probe path still contains all nine identity and
configuration fields shown above. The synthetic probe uses `adapterType:
"controlled_test"`, `externalLiveCallMade: false`, `outcome: "completed"`,
and `payloadClassification: "synthetic"`.

For `staging_live`, use `environment: "staging"` and
`verificationMode: "staging_live"`. Merge the probe's `inventory`,
`syntheticProbe`, and `liveExecutionProof` fields directly into the otherwise
complete document. `liveExecutionProof` is an array with one item per intended
path. Each item contains all nine path fields plus `executionId`,
`externalLiveCallMade: true`, `failureCategory: null`, `outcome: "passed"`,
and `testSuiteVersion: "ai-admin-functional-probe-v1"`.

Run the gate from the unpacked bundle and retain its output with the release
evidence:

```bash
node scripts/ai-deployment-gate.mjs verify \
  --evidence /var/tmp/kravhantering-ai-deployment-evidence.json
```

Only a report with `readyToRelease: true` permits the guard to be changed to
`0`. Update every app node together, recreate `app-runtime`, and confirm the
effective Admin Center availability before restoring AI authoring. A gate
failure leaves the rest of Kravhantering available with AI blocked.

### Staging-Live Synthetic Probe

The staging-live probe is opt-in and otherwise exits without a network call.
Use an Admin session created for the staging test and store only its cookie
header in a mode `0600` file. The staging server must keep
`AI_REQUIREMENT_GENERATION_DISABLED=1`, set
`AI_STAGING_LIVE_PROBE_ENABLED=1`, set
`KRAVHANTERING_DEPLOYMENT_ENVIRONMENT=staging`, and expose a stable opaque
`KRAVHANTERING_DEPLOYMENT_ENVIRONMENT_ID` unique to that environment. Export
that expected server identity and a mode `0600` JSON paths file. The file must
contain exactly one content-free tuple for each of the three fixed profiles;
the tuples may use different adapters, connections, and models:

```json
[
  {
    "profileKey": "generation_without_images",
    "adapterType": "openrouter",
    "aiConnectionId": "<opaque-id-1>",
    "aiConnectionModelRevisionId": "<opaque-id-1>",
    "aiRunProfileId": "<opaque-id-1>",
    "aiRunProfileConfigurationVersion": 1
  },
  {
    "profileKey": "generation_with_images",
    "adapterType": "openrouter",
    "aiConnectionId": "<opaque-id-2>",
    "aiConnectionModelRevisionId": "<opaque-id-2>",
    "aiRunProfileId": "<opaque-id-2>",
    "aiRunProfileConfigurationVersion": 1
  },
  {
    "profileKey": "invalid_json_repair",
    "adapterType": "openrouter",
    "aiConnectionId": "<opaque-id-3>",
    "aiConnectionModelRevisionId": "<opaque-id-3>",
    "aiRunProfileId": "<opaque-id-3>",
    "aiRunProfileConfigurationVersion": 1
  }
]
```

Set the file mode to `0600`, then run:

```bash
export AI_STAGING_LIVE_SYNTHETIC_PROBE=1
export AI_STAGING_LIVE_BASE_URL=https://staging.example.internal
export AI_STAGING_LIVE_SESSION_COOKIE_FILE=/run/user/1000/krav-ai-cookie
export AI_STAGING_LIVE_EXPECTED_ENVIRONMENT_ID=staging-eu-test
export AI_STAGING_LIVE_PATHS_FILE=/run/user/1000/krav-ai-paths.json
node scripts/ai-staging-live-probe.mjs \
  > /var/tmp/kravhantering-ai-staging-probe.json
```

The script first requires server-proven `staging` identity, the exact expected
environment ID, the server-side live-probe opt-in, and an active global guard.
Production ships with `AI_STAGING_LIVE_PROBE_ENABLED=0`; never enable it there.
It proves that every configured
stable profile is enabled and unblocked at the requested configuration
version, and that the exact
connection and model revision are active and verified. It then runs the
guard-compatible, non-mutating Admin `verify_live_path` action. That action
resolves the exact active connection/model/profile path, rejects controlled
offline adapters, runs the fixed synthetic `ai-admin-functional-probe-v1`, and
then executes a fixed synthetic request through the selected active profile's
resolver, configured secret, trust boundary, queue/retry/deadline coordinator,
integration layer, and exact live adapter. It does not select an area or send
database-derived authoring data. The service rechecks the connection and model
revision tokens plus the stable profile token and configuration version
after execution, so a concurrent Admin change emits no proof. Its response binds
the current execution ID, suite version, outcome, observed adapter, exact path,
and revision tokens; the script validates every field before emitting evidence.
The v1 capability probe isolates provider-facing controls by capability.
Keep that version stable while its introducing pull request is unmerged.
Increment it only after an earlier suite version has been released or its
persisted evidence must remain distinguishable from a changed suite contract.
Baseline access and validatable JSON use only the fixed prompt plus local JSON
validation. Reasoning controls are present only for the AI-analysis check. The
OpenRouter adapter uses the runtime default `high` effort for that check so the
verification exercises the same default as an ordinary generation run.
JSON Schema controls only for strict schema steering, image content only for
image input, and streaming only for the streaming check. Advertised parameters
are not proof: AI analysis passes only when the normalized terminal contains a
plaintext or summarized analysis value; absent or encrypted-only reasoning
remains unverified.
The baseline is a gate: when it fails, later live capability and profile probes
remain not tested. Failed rows may expose only the adapter's sanitized technical
code and normalized HTTP status, never the provider error body.
After the baseline passes, at least one verified fixed run profile makes the
model saveable. An inconclusive optional capability remains unavailable for
profile selection but does not block a separately verified run profile.
Adapter authors must follow the capability-isolation and dialect-selection
rules in the
[adapter verification design contract](../development/ai-assisted-authoring-developer-workflow.md#adapter-verification-design-contract).
Every HTTP operation has a 120-second deadline and a 1 MiB streamed response
limit. The script prints only opaque path identifiers and outcome metadata.
Merge that fragment into a `staging_live` deployment evidence document and run
the gate. Never point the probe at production or store the session cookie in
release evidence.

## Runtime Capacity and Failure Contract

Each stable run-profile configuration owns a total budget of 5–60 minutes, an inactivity
limit of at least 5 minutes and no longer than the total budget, and a bounded
FIFO queue of 0–100 requests. The defaults are 20 minutes total, 5 minutes of
inactivity, and 10 queued requests. Queue time, the first attempt, retry delay,
and an optional second attempt share the same total budget. AI connection
concurrency is 1–100 with a default of 4; any lower verified AI connection
model limit takes precedence.

The AI integration layer may make at most one automatic retry against the
same AI connection, AI connection model revision, stable run profile, and
captured profile configuration version. A
retry is allowed only before any analysis or output delta and when the request
was not accepted, an upstream `429` or `503` is explicitly retryable, or the
adapter has a verified idempotency contract. Automatic fallback to another AI
connection is forbidden. An aggregate provider such as OpenRouter may still
select another eligible endpoint for the same fixed model. Every such endpoint
remains subject to the request's data collection, zero-data-retention, and
required-parameter filters.

Queue, concurrency leases, and circuit-breaker state are coordinated through
SQL Server across app nodes. Adapter and client streams remain pull-driven and
bounded. A client disconnect cancels upstream work. A silent upstream end or
stream break without exactly one terminal outcome is an invalid response;
partial output never becomes client-visible or importable.

An authentication failure opens the circuit breaker immediately. Five
consecutive connection, deadline, or retryable adapter failures also open it.
Only those latter failures receive hourly automatic recovery probes, at most
five times and under a single SQL Server lease. Authentication, capability,
attestation, suspension, and safety failures require an explicit corrective
action and administrator decision.

## Root-Key Rotation

1. Add the new 256-bit root-key version to the external keyring without
   removing any old version.
2. Keep `activeWriteVersion` unchanged, distribute the expanded keyring, roll
   every app node, and verify the new version is available everywhere.
3. Change `activeWriteVersion` explicitly and atomically, distribute it, and
   roll every app node. Never infer it from the highest version number.
4. Re-encrypt rows that explicitly reference the old version. This creates a
   fresh nonce for every envelope; do not change connection or secret-revision
   IDs.

   Run bounded batches from the production `db-job` image. Repeat until
   `remainingCount` is `0`:

   ```bash
   npm run db:provider-secret-root-rotate -- \
     --from-root-key-version root-2026-01 --batch-size 100
   ```

   The command authenticates each old envelope, re-encrypts it under the
   keyring's explicit `activeWriteVersion`, and emits counts and root-key
   versions only. It never prints plaintext. A failed batch rolls back.
5. List referenced root-key versions and prove that every row decrypts with its
   recorded version. Include retained database backups in this inventory.
6. Keep each old root-key version while any database row or restorable backup
   depends on it.
7. Remove an old version only through the central secret and deployment
   mechanism, roll all nodes, and verify again that no node, row, or retained
   backup needs it. Securely delete retired key material according to the
   secret manager's destruction procedure.

## Backup and Restore

Treat the SQL Server backup and external root keyring as one recoverability
set. Record which root-key versions each retained backup can require. A restore
test must prove that encrypted provider secrets can be decrypted without
exposing their plaintext through the API, Admin Center, logs, or test
artifacts.

Restore into an isolated environment, restore the matching keyring through the
approved secret mechanism, and test each referenced version through the
internal provider-secret availability or connection-test path. Do not query or
export decrypted values. Record only opaque revision IDs and pass/fail results.

Run the restore verifier against the isolated restored database, never the live
production database:

```bash
export DATABASE_URL=\
'mssql://runtime-user:password@restored-sql:1433/restored-db?encrypt=true'
export AI_PROVIDER_SECRET_KEYRING_FILE=\
/run/secrets/kravhantering/ai-provider-secret-keyring.json
npm run db:provider-secret-restore-verify
```

The command fails when the restore contains no encrypted provider-secret
versions, any envelope cannot be authenticated with its recorded root-key
version, or database/keyring access fails. Its JSON evidence contains only
aggregate counts, a maximum of 20 failed opaque connection/secret-version IDs
with stable reason codes, and at most 100 referenced root-key versions. It
never emits successful row IDs. Rows are authenticated in keyset pages of 100
by default; choose a bounded page size from 1 to 1000 when validating a larger
restore:

```bash
npm run db:provider-secret-restore-verify -- --batch-size 500
```

The same packaged command in the released `db-job` image is:

```bash
docker run --rm --entrypoint node <db-job-image> \
  scripts/ai-provider-secret-restore-cli.mjs --batch-size 500
```

Mount the restored-database connection and keyring environment exactly as in
the normal `db-job` invocation; the command does not accept key material on its
command line.

`failureSampleTruncated` or `referencedRootKeyVersionsTruncated` means the
bounded evidence sample is incomplete, not that verification stopped. The
aggregate checked and failed counts still cover every retained encrypted row.

Before destroying an old root-key version, repeat the verification while
logically omitting that version:

```bash
npm run db:provider-secret-restore-verify -- \
  --omit-root-key-version root-2026-01 --batch-size 500
```

Proceed only when `compatible` and `safeToRemoveOmittedRootKeyVersion` are both
`true` for every retained backup restored with its matching keyring. This check
does not change the database or keyring. The live database must also report
`remainingCount: 0` and `safeToRemoveFromRootKeyVersion: true` from the final
rotation batch. Keep the old key while any retained backup references it.

If a required root-key version is missing, keep the global AI guard active and
block affected run profiles. Restore the key version from the approved backup.
If it cannot be recovered, a product administrator must enter new provider
secrets and repeat connection activation, model verification, and stable-profile
configuration checks. Do not weaken application health or readiness to signal
this AI-only failure.

## Runtime Limits, Leases, and Recovery

Each stable run-profile configuration owns a total budget of 5-60 minutes, an
inactivity budget of at least 5 minutes and no greater than the total, a FIFO
queue capacity of 0-100, and explicit output-token, output-byte,
retained-memory, and parsed-event limits. Defaults are 20 minutes total, 5
minutes inactive, and 10 waiting requests. Queue time, execution, one optional
retry delay, and the second attempt all consume the original total budget.

SQL Server coordinates admission, FIFO order, connection concurrency, any
lower model-revision concurrency, retry waits, and renewable execution leases
across all app nodes. Queue rows contain only opaque identities, state,
counters, per-invocation fencing tokens, and timestamps. Finish, retry, and
renewal mutations require the current fencing token, lease owner, and an
unexpired running lease so a stale or duplicate worker cannot affect its
replacement. Cancellation before acquisition or during retry wait removes only
the invocation's fenced queued row, without changing model health or breaker
state. A zero-capacity queue admits
only runs that fit the currently reserved execution capacity. Expired deadlines
and abandoned leases are reclaimed transactionally.

The integration layer may retry at most once and only against the same
connection, model revision, stable run profile, and captured configuration
version, before any analysis or
output delta. Safe pre-acceptance failures use a randomized 1-3 second delay.
Explicit retryable `429` or `503` outcomes may honor `Retry-After` only when at
least five minutes remain after the delay. No automatic fallback is allowed.

Adapter streams are pull-driven: downstream demand causes at most one upstream
pull, and configured buffer/memory/byte/token ceilings are enforced before an
over-limit event is exposed. Every valid event, including a heartbeat, resets
the inactivity budget without moving the original total deadline.
A client disconnect aborts provider work, with at most five seconds allowed for
uncooperative cleanup. Silent EOF, stream failure, thrown coordination work,
and every other failure are normalized to exactly one terminal outcome.

Operational health is independent of administrative lifecycle. Missing,
invalid, future, or older-than-24-hour evidence is displayed as `unknown`. An
authentication failure opens the breaker immediately and requires manual
recovery. Five consecutive connection, deadline, or retryable adapter failures
open it for one hourly SQL-leased probe; a crashed half-open lease is
reclaimable. After five failed probes, or if a probe discovers an
authentication or capability failure, recovery becomes manual. At process
startup and every minute, each node scans a bounded set of only due open
breakers; the SQL lease selects one node, reserves ordinary connection and
model concurrency for the probe, and `next_recovery_at` preserves the
60-minute cadence across restarts. Probes resolve the exact active profile
again, enforce its total and inactivity budgets, and accept only the versioned
fixed synthetic response `{ "status": "ok" }`. Healthy and unused
connections are never probed periodically. Manual probes emit the
`admin_health_check` event with actor, outcome, duration, and normalized usage.
Automatic probes and all health/breaker transitions have separate content-free
events.

## Monitoring and Incident Response

Monitor administrative lifecycle and operational health as separate states.
At minimum, page or alert immediately for:

- an AI connection authentication failure
- an opened circuit breaker
- an active run profile becoming blocked

Maintain environment-specific baselines for failure rate, p95 duration, queue
saturation, active concurrency, attempt and retry counts, time to first
analysis/output delta, cancellation reasons, token use, and cost. Operational
events include run type, adapter type and version, outcome/failure category,
and opaque application-run, connection, stable-profile, and model-revision IDs.
They also carry the stable profile's captured configuration version plus
request and correlation IDs; queue-full terminals carry the observed queue
depth and active concurrency. Events never include prompts, images, model
output, endpoints, provider secrets, secret references, or provider error
bodies. Alert rules must bind the emitted
authentication-failure, breaker-opened, and active-profile-blocked alarm events
to the on-call channel before AI is enabled.

Application nodes emit one JSON line on the `ai-run-observability` channel.
The three binding alarm events use error severity:

<!-- markdownlint-disable MD013 -->

| Event | Binding action |
| --- | --- |
| `ai_alarm_authentication_failed` | Page the AI service owner and credential owner immediately. |
| `ai_alarm_breaker_opened` | Page the AI service owner immediately. |
| `ai_alarm_active_profile_blocked` | Alert the product administrator and service owner immediately. |

<!-- markdownlint-enable MD013 -->

Deduplicate only by event name plus opaque connection, model-revision, and
stable-profile IDs and the captured profile configuration version. Do not add
an endpoint, public connection name, model name, prompt excerpt, response
excerpt, or secret reference to a notification.

Build the operator-configurable dashboard from the same channel with these
minimum panels: outcomes and failure category by run type, adapter type, and
adapter version;
p50/p95 duration and time to first delta; queue depth, wait, saturation, and
active concurrency; attempts and retry count; cancellation reason; circuit and
health transitions; token totals; and reported cost by currency. Filters may
use time range, environment, run type, adapter type, adapter version, outcome,
failure category, and opaque connection, stable-profile,
profile-configuration, and model-revision identities. Alert routing, thresholds
beyond the three binding alarms, panel layout, refresh rate, and retention
remain environment-specific operator configuration.

For an incident, activate the global AI guard or suspend the affected AI
connection or run profile. This stops new requests and attempts to cancel
running requests without automatic fallback. Suspension commits a durable,
fenced, content-free cancellation request in the same Admin transaction. Each
coordinator polls it every second, aborts only the matching leased run, and
force-closes an uncooperative adapter no later than five seconds after the
durable SQL request time; polling delay consumes that five-second cleanup
budget. A queued or retry-wait row returns a non-retryable cancelled terminal
with the stored administrative reason, never opens an adapter, and is removed
only by its fencing token without changing health.
Lifecycle remains separate from operational health. Restore service only after the
cause, attestation, provider secret, connection test, model capabilities, and
run profile dependencies are valid again.

## Rollback

Prefer the global AI guard, suspension, selecting a still-usable verified model
revision on a stable profile, or restoring a verified provider-secret revision.
No automatic fallback or direct OpenRouter path exists. A release rollback that
restores the database must restore the matching external root-key versions at
the same time, then repeat the pre-deployment gate before AI is enabled.
