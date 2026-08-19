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
2. Distribute the keyring and verify that every app node has loaded the new
   version.
3. Change the active write version atomically. Never infer it from the highest
   version number.
4. Re-encrypt existing provider-secret revisions and verify that every row can
   be decrypted with its recorded root-key version.
5. Keep each old root-key version while any database row or restorable backup
   depends on it.
6. Remove an old version only through the central secret and deployment
   mechanism, roll all nodes, and verify that no node or restorable backup
   still needs it.

## Backup and Restore

Treat the SQL Server backup and external root keyring as one recoverability
set. Record which root-key versions each retained backup can require. A restore
test must prove that encrypted provider secrets can be decrypted without
exposing their plaintext through the API, Admin Center, logs, or test
artifacts.

If a required root-key version is missing, keep the global AI guard active and
block affected run profiles. Restore the key version from the approved backup.
If it cannot be recovered, a product administrator must enter new provider
secrets and repeat connection, model-capability, and run-profile activation
checks. Do not weaken application health or readiness to signal this AI-only
failure.

## Monitoring and Incident Response

Monitor administrative lifecycle and operational health as separate states.
At minimum, page or alert immediately for:

- an AI connection authentication failure
- an opened circuit breaker
- an active run profile becoming blocked

Maintain environment-specific baselines for failure rate, p95 duration, queue
saturation, token use, and cost. Operational events may contain opaque AI
connection, run profile revision, and AI connection model revision IDs, but
never prompts, images, model output, endpoints, provider secrets, or secret
references.

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
