# CSP violation reporting

Production application pages and API documentation use an enforcing CSP with
`report-to csp` and `Reporting-Endpoints: csp="/api/security/csp-reports"`.
The policy uses modern reporting only, avoiding the deprecated `report-uri`
directive and its ZAP CSP notice (rule `10055-3`).
The application is the internal collector. No external destination, subscription
or separate service is needed. The bundled nginx serves the documentation with
the same policy and a single value for each security header; application page
nonces remain per request.

The receiver accepts anonymous native browser POSTs with
`application/reports+json` batches or `application/csp-report` envelopes. It ignores
unsupported report types. Cookies may accompany browser delivery but are never
used as report-author identity. No custom application header is required. Other
REST operations retain their registry policies; see
[ADR 0062](../adr/0062-anonym-native-csp-rapportering.md).

## Logging and privacy

Filter platform JSON logs on `channel: security-audit` and
`event: security.csp.violation_reported`. Events are untrusted diagnostic telemetry,
not evidence of a successful attack or a verified user action. `outcome: success`
means the collector accepted the report for logging; it does not describe whether
an attack succeeded. `actor.source` is always `anonymous`. Request metadata is
fixed to `POST /api/security/csp-reports`, without a request ID.

Only these diagnostic fields reach `recordSecurityEvent()`:

<!-- markdownlint-disable MD013 -->

| Field | Values |
| --- | --- |
| `directive` | Recognized CSP directive name, otherwise `unknown` |
| `blockedResource` | `inline`, `eval`, `wasm-eval`, `data`, `blob`, `same-origin`, `cross-origin`, `unknown` |
| `surface` | `application`, `api-documentation`, `unknown` |
| `environment` | Server deployment environment or NODE_ENV: `production`, `staging`, `prodlike`, `development`, `test`, `unknown` |
| `version` | Application package version from the deployed build |

<!-- markdownlint-enable MD013 -->

The top-level `ts` is server receipt time, never a browser timestamp. Surface
classification uses the configured public OIDC redirect origin, as CSRF does,
not the internal proxy address or untrusted Host/Origin headers: `/en`, `/sv`,
their descendants
and `/` are application pages; `/api-docs` and its descendants are documentation.
It is diagnostic classification, not proof of the originating page. Raw URLs,
paths, queries, fragments, referrers, policy text, nonces, samples, nested extras,
cookies, credentials, identities, IPs and user agents are discarded before logging.
Rejected input creates no report-specific error log and is never reflected in a
response. URL values are never fetched.

Security-log collection, restricted access, retention and optional SIEM forwarding
remain owned by the deployment's operations/security process. Use the existing
approved security-log retention schedule and authorized log-reader roles; this
feature does not create an application viewer, SQL store or a new retention
schedule. Existing [access-log privacy and client-IP trust rules](access-log-and-client-ip-trust.md)
continue to apply, including overwriting the trusted client-IP header at the edge.

## Admin control and upgrade

Migration `0066_csp_violation_logging.mjs` adds
`application_settings.is_csp_violation_logging_enabled` as a non-null SQL `bit`
with default `1`, including existing installations. Both seed profiles initialize
it to true and required seed preserves committed settings. Apply the normal
migration/required-seed release step before starting the updated application.
Deploy the matching nginx configuration with the application. No new environment
variable, SQL permission or external service is required.

In Admin Center > Settings > Security, `Log CSP violations` saves a Boolean
immediately using the existing Admin authorization, CSRF and transactional action
and privileged-security audit contracts. This switch only controls logging.
Disabled collectors still bound and discard incoming reports with empty `204`
responses. Browsers, queued reports and static documentation may continue sending;
CSP enforcement remains active.

After admission checks every receiver reads the setting without caching. A
committed change therefore applies across instances without restart. A request
whose settings read precedes the commit may finish with its earlier value.
A settings-read failure returns empty `503` and drops the report; it never restores
the enabled default. At most once per minute per process it emits the fixed
warning `CSP report logging unavailable: settings read failed`, without an exception
message or report content. Investigate database readiness using ordinary platform
health signals.

## Fixed safety limits

All limits are per application process, including while logging is disabled.
Instances have independent budgets; they are not a deployment-wide distributed
quota. Fixed windows last 60 seconds and reset counters and source state together.
Restarts reset transient state. A shared trusted source, including a shared NAT,
shares its source budget; missing trusted IPs share one `unknown` bucket. IPs are
held only for admission, cleared each window, and never included in CSP events.

<!-- markdownlint-disable MD013 -->

| Limit | Default |
| --- | --- |
| Actual streamed bytes before JSON parsing | 65,536 (64 KiB), regardless of Content-Length |
| Native batch length | 20 entries, including unsupported types |
| Parsed string / object-key length | 4,096 / 128 characters |
| Parsed depth / visited values | 8 / 2,048, root at depth zero |
| Body read deadline | 5 seconds for the entire stream |
| Concurrent processing requests | 8 |
| Requests per source / total per window | 30 / 120, including rejected input |
| Accepted CSP report events per source / total per window | 60 / 240 |
| Distinct tracked sources | 64; new sources are rejected when full, no eviction |

<!-- markdownlint-enable MD013 -->

Ordinary inline/external violation envelopes are generally a few kilobytes;
64 KiB permits a small batch with policy text, while the 20-entry cap prevents
small reports bypassing event budgets. The event allowance supports three full
batches per source and twelve per process per minute. Budgets are reserved before
settings/SQL work, also for disabled logging, with no refund. Technical limits are
not exposed as Admin controls.

Responses have no body and use registry-owned `no-store`: `204` accepted/discarded,
`400` malformed or field/depth bounds, `413` byte/batch limit, `415` unsupported
media, `408` body deadline, `429` rate/capacity/source limit, `503` settings unavailable.
The collector does not promise retry or report delivery.

## Synthetic verification and browser compatibility

Use the production-like Playwright AUTH-13 scenario with captured server stdout:
`npm run test:integration:prodlike -- --chunk prodlike-runtime-contract`.
For an already running server, set `CSP_REPORT_SERVER_LOG` to its captured stdout
file. The test uses native reporting, attempts a nonce-free inline script on both
surfaces, verifies that it never executes, and checks sanitized server JSON with
logging enabled, disabled and re-enabled. ADMIN-30 covers switch persistence/help.
Each round loads fresh documents before changing the switch, then triggers the
violation in those already-loaded pages; Chromium suppressed repeated identical
violations from the same document during local verification.

Verified locally with Chromium 153.0.8010.12: native modern reports reached the
collector from authenticated application pages and anonymous API documentation,
with enforcement active in both toggle states. AUTH-13 creates an ephemeral HTTPS
edge, pins its test certificate and grants background-sync permission; Chromium
requires an HTTPS reporting destination. Headers and payloads pass through
unchanged. The test edge uses a different port from the configured public origin,
so its diagnostic surface is `unknown`; receiver tests independently verify
application/documentation classification behind a production reverse proxy.

Native delivery requires browser support for `report-to` and
`Reporting-Endpoints`. Browsers without that support still enforce the CSP but
do not send violation reports. The collector accepts legacy envelopes from
already-loaded documents and normalizes them to the same event contract;
focused tests cover that input format. Firefox and WebKit native delivery have
not been verified here. The attempted Firefox run could not start within this
workspace's browser sandbox. No delivery guarantee is claimed for any engine.
Delivery is best effort; blocking enforcement does not depend on a report
reaching the receiver.

Native delivery semantics follow the
[Reporting API](https://www.w3.org/TR/reporting-1/#delivery) and
[CSP reporting specification](https://www.w3.org/TR/CSP3/#report-violation).
