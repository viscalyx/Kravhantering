# AI Connections Operations

This runbook describes the target operating contract for provider-neutral AI
connections. Use it when the AI integration layer from
[ADR 0051](../adr/0051-ai-integrationslager-med-korprofiler-och-adaptrar.md)
is deployed. The trust, lifecycle, and provider-secret decision is
[ADR 0052](../adr/0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md).

AI-assisted authoring is optional. An unavailable or unconfigured AI
connection blocks only its dependent run profiles; it does not make
`/api/health` or `/api/ready` fail.

## Ownership

- Product administrators register AI connections, enter and rotate provider
  secrets, record attestations, verify AI connection models, and activate run
  profile revisions.
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
relax either policy.

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
5. Each intended AI connection has a valid attestation, successful connection
   test, available provider secret, and `active` lifecycle state.
6. Each selected AI connection model revision has passed the required
   capability tests.
7. Each intended run profile revision is active, unblocked, and references
   exactly the verified dependencies reviewed for the rollout.
8. Alerts for authentication failure, an opened circuit breaker, and a
   blocked active run profile reach the on-call channel.

Required seed leaves AI unconfigured. Demo seed may create only unverified
drafts and must never create verification evidence or activate a run profile.

## Runtime Capacity and Failure Contract

Each run profile revision owns a total budget of 5–60 minutes, an inactivity
limit of at least 5 minutes and no longer than the total budget, and a bounded
FIFO queue of 0–100 requests. The defaults are 20 minutes total, 5 minutes of
inactivity, and 10 queued requests. Queue time, the first attempt, retry delay,
and an optional second attempt share the same total budget. AI connection
concurrency is 1–100 with a default of 4; any lower verified AI connection
model limit takes precedence.

The AI integration layer may make at most one automatic retry against the
same AI connection, AI connection model revision, and run profile revision. A
retry is allowed only before any analysis or output delta and when the request
was not accepted, an upstream `429` or `503` is explicitly retryable, or the
adapter has a verified idempotency contract. Automatic fallback to another AI
connection is forbidden.

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
opaque connection and secret-version IDs, referenced root-key versions, and
pass/fail results.

Before destroying an old root-key version, repeat the verification while
logically omitting that version:

```bash
npm run db:provider-secret-restore-verify -- \
  --omit-root-key-version root-2026-01
```

Proceed only when `compatible` and `safeToRemoveOmittedRootKeyVersion` are both
`true` for every retained backup restored with its matching keyring. This check
does not change the database or keyring.

If a required root-key version is missing, keep the global AI guard active and
block affected run profiles. Restore the key version from the approved backup.
If it cannot be recovered, a product administrator must enter new provider
secrets and repeat connection, model-capability, and run-profile activation
checks. Do not weaken application health or readiness to signal this AI-only
failure.

## Runtime Limits, Leases, and Recovery

Each immutable run profile revision owns a total budget of 5-60 minutes, an
inactivity budget of at least 5 minutes and no greater than the total, a FIFO
queue capacity of 0-100, and explicit output-token, output-byte,
retained-memory, and parsed-event limits. Defaults are 20 minutes total, 5
minutes inactive, and 10 waiting requests. Queue time, execution, one optional
retry delay, and the second attempt all consume the original total budget.

SQL Server coordinates admission, FIFO order, connection concurrency, any
lower model-revision concurrency, retry waits, and renewable execution leases
across all app nodes. Queue rows contain only opaque identities, state,
counters, per-invocation fencing tokens, and timestamps. Finish, retry, and
renewal mutations require the current fencing and lease ownership so a stale or
duplicate worker cannot affect its replacement. A zero-capacity queue admits
only runs that fit the currently reserved execution capacity. Expired deadlines
and abandoned leases are reclaimed transactionally.

The integration layer may retry at most once and only against the same
connection, model revision, and run profile revision, before any analysis or
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
breakers; the SQL lease selects one node, and `next_recovery_at` preserves the
60-minute cadence across restarts. Probes resolve the exact active profile
again and use the versioned, fixed synthetic JSON prompt. Healthy and unused
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
events include run type, adapter version, outcome/failure category, and opaque
application-run, connection, profile-revision, and model-revision IDs. They
never include prompts, images, model output, endpoints, provider secrets,
secret references, or provider error bodies. Alert rules must bind the emitted
authentication-failure, breaker-opened, and active-profile-blocked alarm events
to the on-call channel before AI is enabled.

For an incident, activate the global AI guard or suspend the affected AI
connection or run profile. This stops new requests and attempts to cancel
running requests without automatic fallback. Restore service only after the
cause, attestation, provider secret, connection test, model capabilities, and
run profile dependencies are valid again.

## Rollback

Prefer the global AI guard, suspension, or explicit activation of a previously
verified run profile and provider-secret revision. No automatic fallback or
legacy direct OpenRouter path exists. A release rollback that restores the
database must restore the matching external root-key versions at the same
time, then repeat the pre-deployment gate before AI is enabled.
