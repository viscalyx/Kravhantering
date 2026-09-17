# Export and report admission

This guide is for operators configuring export limits, investigating rejected
requests and coordinating upgrades across application nodes.

An export and report actor quota protects all authenticated output starts.
The default is ten starts in each rolling 60-second interval and one active
operation per person. Browser sessions, clients, administrators and app
replicas share the same quota. A privacy officer exporting another person's
data uses the requesting officer's quota. The key is an HMAC fingerprint of
the normalized HSA-id using `AUTH_SESSION_COOKIE_PASSWORD`, which also
protects HSA verification evidence.

## Covered operations

<!-- markdownlint-disable MD013 -->

| Callable surface | Output |
| --- | --- |
| `/api/requirements/export` | Library CSV |
| `/api/requirements-specifications/{id}/exports` | Specification CSV |
| `/api/admin/audit-events?format=csv` | Action log CSV |
| `/{locale}/requirements/reports/pdf/list` | Requirement list PDF |
| `/{locale}/requirements/reports/pdf/review/{id}` | Review PDF |
| `/{locale}/requirements/reports/pdf/history/{id}` | History PDF |
| `/{locale}/requirements/reports/pdf/deviation-review/{id}` | Deviation PDF |
| `/{locale}/requirements/reports/pdf/suggestion-history/{id}` | Suggestion history PDF |
| `/{locale}/requirements/reports/pdf/review-combined` | Combined review PDF |
| `/{locale}/specifications/{id}/reports/pdf/{profile}` | Specification PDF |
| `/{locale}/specifications/{id}/reports/pdf/traceability` | Traceability PDF |
| `/api/requirements-specifications/{id}/report-output` | Report model JSON |
| `/api/requirements-specifications/{id}/rfi-list/export` | RFI CSV or PDF |
| `/api/admin/access-reviews/{id}/export` | Access review JSON or PDF |
| `/api/privacy/data-subject-export` | Person data JSON or PDF |
| `/api/admin/archiving/exports` | Archive JSON |

<!-- markdownlint-enable MD013 -->

Authentication, authorization, CSRF and input validation remain required.
Admission precedes collection, rendering and file creation. Actor denials
consume no starts. An admitted start remains recorded after failure or
cancellation. Quota decisions use the SQL Server clock.

The actor slot remains held through streaming and cleanup. Cancellation does
not release collection or rendering that has not settled. Existing process
capacity, item, file, disk, memory and generation-time controls still apply.
CSV and JSON share a service pool. PDF has a separate pool. Simultaneous work
by two people requires at least two slots in the relevant pool. This does not
guarantee service availability under unlimited load or single-slot settings.

## Recovery and failure handling

The maximum total lifetime is 12 minutes, including up to ten minutes of
generation and the remaining delivery time. Cancellation aborts delivery and
waits for resource cleanup. An independent watchdog starts before generation.
If work remains stuck after 14 minutes, the watchdog terminates the app
process. The service manager must restart it.
SQL permits recovery of an unreleased admission after 15 minutes. The margin
prevents a mere expired timer from releasing a slot while its old process
continues work. Do not remove the watchdog while retaining automatic expiry.
A stopped process, host or database must be fenced before restoring a
suspended image; do not restore old running process snapshots into service.

SQL coordination failure rejects new work with 503 and
`quota_check_unavailable`; no process-local actor fallback exists. The client
receives an advisory five-second Retry-After. Release failure conservatively
holds the SQL slot until recovery. Capacity telemetry records stable reasons
and retry information without HSA-id or fingerprints. This telemetry stays
separate from action logs and security logs.

<!-- markdownlint-disable MD013 -->

| Reason | Status | Retry guidance |
| --- | --- | --- |
| `actor_rate_limit` | 429 | Computed time until sufficient rolling usage expires |
| `actor_concurrency_limit` | 429 | Wait for active work; no estimated completion time |
| `capacity_busy` | 429 | Service capacity occupied; advisory retry delay |
| `quota_check_unavailable` | 503 | Temporary coordination failure; advisory retry delay |
| `edge_rate_limit` | 429 | Aggregate network traffic; advisory one-second delay |

<!-- markdownlint-enable MD013 -->

English and Swedish messages distinguish these causes. Active-work wording
follows the configured concurrency. Direct downloads and navigation requests
that accept HTML receive readable no-store error pages. JSON clients receive
structured errors. Non-JSON edge rejections have a safe localized fallback.
Retry guidance never promises recovery.

## Tuning and ingress topology

Admin Center application settings control actor starts per minute (1–100,
default 10) and active work (1–10, default 1). Changes are audited and
neither reset history nor cancel existing work. Lowering a limit may prevent
new work until enough current usage expires or finishes.

Operators configure `NGINX_API_RATE=50`, `NGINX_API_BURST=200`,
`NGINX_LOGIN_RATE=5` and `NGINX_LOGIN_BURST=50` in the release configuration.
Rates are requests per second per resolved client address. These are initial
values for validation, not measured production capacity. Bursts are admitted
without delay. All API and locale-prefixed PDF locations receive the policy,
including locations with longer output timeouts. Login starts receive both
policies; callbacks receive the general API policy. Readiness retains its
separate allowlist and limit contract.

The trusted-proxy allowlist and recursive address resolution define the key.
Direct ingress ignores caller forwarding headers. Never use an identity
header or an unchecked forwarding chain for admission. Each Nginx instance
shares counters among its workers. Separate edge replicas have separate
counters: distributing traffic can increase aggregate allowance. App replicas
share actor usage in SQL regardless of edge topology. Below the aggregate IP
threshold, people behind one corporate proxy have independent actor quotas.
Above that threshold, everyone sharing the address can receive edge 429.

An organizational ingress may supply equivalent API and login limits if its
operators document the trusted address chain, rates, bursts, counter scope,
error contract and evidence. No organizational protection is assumed here.
Observe edge limit rejections and privacy-safe capacity events while tuning.
Keep settings generous enough for normal shared-proxy traffic.

## Data and rollout

`export_actor_quota_entries` stores short-lived pseudonymized operational
state: operation ID, fingerprint, admitted time, released time and recovery
time. It stores no raw identity, export target, document contents or client
address. Person-data export matches the exact HSA fingerprint and includes
times without exposing fingerprints or operation IDs. Erasure deletes exact
matching state, but requires active work to finish first. Erasure resets
remaining rate usage as an explicit privileged privacy action.

Scheduled transient cleanup deletes expired entries in bounded batches.
Cleanup compatibility includes the new table and skips it only when absence
can be proven. Migration 0065 adds the table and settings. No archive export
is required before transient quota cleanup.

Drain all old application nodes and generated-output requests, apply the
migration and required seed, install the matching cleanup and ingress bundle,
then start enforcing nodes together. Mixed versions are not supported: old
nodes lack enforcement. Keep the fingerprint secret consistent across nodes;
rotate it only during a coordinated drained restart. Validate two-person
admission, both address trust modes, localization and cleanup before rollout
completion. Migration rollback fails deliberately. To roll back application
binaries, drain every enforcing node and retain the added schema. Restoring an
old version removes the new protection and requires an explicit operational
risk decision or equivalent ingress restrictions.
