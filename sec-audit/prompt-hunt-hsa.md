Find source-grounded security invariant failures in your assigned units. Return exactly one JSON object matching the structured-result contract at the end of this prompt.

# Architecture and audit scope

This standard-profile audit covers the repository at commit
`d39bb52daa5446392cc825dca40325f49b9e3241`, including the existing untracked
`.github/skills/security-audit/` tooling. No prior compatible audit ledger was
found under repository temporary output or the default audit location.

Kravhantering is a requirements-management application. Ordinary users read
published requirements; area owners/coauthors author requirements. Specification
responsible people/coauthors manage their assigned specifications. Reviewers
make explicit review decisions. Admin and PrivacyOfficer are separate global
roles. The main isolation boundary is assignment-scoped objects in a shared SQL
Server database, not a tenant-ID partition. Protected resources include drafts,
specifications, assignments, personal identity, privacy exports, audit records,
AI provider credentials, and release/deployment authority.

The application uses Next.js 16, React 19, TypeScript, SQL Server/TypeORM,
openid-client, jose, iron-session, MCP SDK, Sharp and React PDF. Browser identity
uses OIDC code flow with state, nonce and PKCE; sealed cookies carry identity and
expiry. The proxy strips identity headers. REST transport policy is centralized;
mutation wrappers enforce authentication, same-origin checks and declared
policies. Shared services and assignment authorization mediate resource access.
MCP uses separately validated bearer identity and a stateless transport, then
calls shared services. Important starting points are `proxy.ts`, `lib/auth/`,
`lib/http/`, `lib/requirements/assignment-authorization.ts`, and `lib/mcp/`.

Business inputs include route/query identifiers, JSON mutations, imported
requirements, stored text/URLs, state transitions and optimistic revision tokens.
Review requirements, specifications/agreements/deviations/RFI, import validation
sessions, and alternate REST/MCP paths separately. Database writes and locks live
in `lib/dal/`; schema/migrations and required/demo seeds live under `typeorm/`.
Statistics terminology exists, but reconnaissance found no separate implemented
statistics API to invent as an active subsystem.

AI generation and repair accept text and bounded images, construct provider
requests, inspect generated content, and produce candidates for human import.
Models have no intended autonomous publication authority. Connection trust checks
origins, DNS, pinned transport and redirects. Server-held encrypted provider
secrets and operator root keyrings are distinct trust boundaries. Review
`lib/ai/`, `app/api/ai/`, and AI admin routes, including forensic copies, cost
coordination, cancellation, and external management operations.

Exports, PDF/CSV generation, privacy operations, access reviews, archiving,
audit events and cleanup create derived copies and lifetime boundaries. Review
`lib/privacy/`, `lib/archiving/`, `lib/access-review/`, `lib/reports/`,
`lib/generated-output/`, `lib/pdf/`, and `lib/transient-cleanup/`. Browser rendering,
URL policy, client state and MCP HTML are parallel output sinks.

HSA person lookup is a separate identity subsystem: application requests,
REST-to-SOAP adapter, directory mock, strict certificate validation, and test PKI
provisioner. Inspect `lib/hsa/` and the three `containers/hsa-*` service packages.
Business listeners use mTLS; health listeners are separate. Certificate renewal,
subject binding, XML parsing and returned-person binding require their own units.

Production deployment supports standalone Next runtime, separate database/cleanup
jobs, nginx, and Quadlet templates for single-node, app-node HTTP and app-node TLS.
Hardened/local Keycloak and external OIDC variants select different ingress paths.
Release scripts validate provenance and publish artifacts; GitHub workflows own
privileged release credentials. Azure development scripts provision hosts and
remote bootstrap state. Starting paths include `.github/workflows/`,
`scripts/release/`, `scripts/containers/`, `containers/production/`, and
`scripts/azure-dev/`. Glossary-only Deployment Composer concepts are not presumed
to have an implementation.

Selected companion domains are HTTP/auth, browser, AI/MCP, data lifecycle,
resource availability, RPC/SOAP, supply chain, cloud/deployment and privileged
local files. Each ledger unit records exact selected and excluded blocks.
No application-owned native binary parser, mobile app, broker or webhook entry
was found; dependency internals and externally deployed policy are not assumed
safe or vulnerable. No meaningful comparable requirements product was established.

Execution is source-only: the trusted bubblewrap capability probe failed with
`No permissions to create new namespace`. Required network/mount isolation is
unavailable, so no target tests/builds/processes or live/shared services may run.
Runtime-dependent leads need bounded validation in a suitable future sandbox.
Offline fixtures exist, but builds write generated source/`.next`; SQL and
Playwright workflows may touch development services and are prohibited here.
No dependency installation or vulnerability-database refresh is performed.

Source establishes intended controls, not actual IdP claim issuance, proxy
attachment, cloud/DB grants, network exposure, secret provisioning, provider data
handling, branch protections or deployed revisions. Report precise missing facts.

## Assigned units and exact block map
[
  {
    "coverage_id": "containers%2Fhsa-person-lookup-adapter%2Fsrc%2Fstrict-server.mjs%23HSA%20ingress::lib%2Fhsa%2Fstrict-certificate-validation.mjs%23peer%20identity::containers%2Fhsa-person-lookup-adapter::ATTACK-CLASSES.md%23Access%20control",
    "canonical_refs": {
      "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
      "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
      "subsystem": "containers/hsa-person-lookup-adapter",
      "attack_class": "ATTACK-CLASSES.md#Access control"
    },
    "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
    "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
    "subsystem": "containers/hsa-person-lookup-adapter",
    "attack_class": "Access control",
    "starting_paths": [
      "lib/hsa",
      "lib/requirements/responsibility-person-verification.ts",
      "app/api/requirement-responsibility-people",
      "containers/hsa-person-lookup-adapter",
      "containers/hsa-directory-mock",
      "containers/hsa-mtls-provisioner",
      "containers/hsa-mtls-topology"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Wildcard",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Obvious things",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Request framing and desynchronization",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Web cache poisoning through unkeyed input",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cache deception and private-response caching",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Host and forwarded-header trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Response-header injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Ordinary CSRF",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Session fixation and invalidation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cookie scope and transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#JWT verification and claim binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#MFA enrollment and assurance downgrade",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Step-up binding and bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#WebAuthn and passkey verification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Account linking and identity collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Password reset and broader recovery",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key scope and resource binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key exposure and unsafe transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Union, enum, and default confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Interceptor and method-path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Peer identity to application-principal confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Per-item and streaming authorization gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Topic, routing-key, and subscription scope gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Dead-letter, retry, and diagnostic disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Untrusted producer treated as control plane",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Out-of-order and stale message acceptance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Acknowledgment/commit ordering defects",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Partial multi-consumer transitions",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Superlinear parsing, matching, or evaluation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Decompression and representation amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Database and downstream query amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Quota-accounting scope and reset gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Reachable fatal error or deadlock",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Retry storm and fail-open amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Poison-record and head-of-line blocking",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unsafe recovery and capacity rollback",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-hsa",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "hsa"
  },
  {
    "coverage_id": "containers%2Fhsa-person-lookup-adapter%2Fsrc%2Fstrict-server.mjs%23HSA%20ingress::lib%2Fhsa%2Fstrict-certificate-validation.mjs%23peer%20identity::containers%2Fhsa-person-lookup-adapter::ATTACK-CLASSES.md%23Resource%20and%20file%20handling",
    "canonical_refs": {
      "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
      "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
      "subsystem": "containers/hsa-person-lookup-adapter",
      "attack_class": "ATTACK-CLASSES.md#Resource and file handling"
    },
    "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
    "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
    "subsystem": "containers/hsa-person-lookup-adapter",
    "attack_class": "Resource and file handling",
    "starting_paths": [
      "lib/hsa",
      "lib/requirements/responsibility-person-verification.ts",
      "app/api/requirement-responsibility-people",
      "containers/hsa-person-lookup-adapter",
      "containers/hsa-directory-mock",
      "containers/hsa-mtls-provisioner",
      "containers/hsa-mtls-topology"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Resource and file handling",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Wildcard",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Obvious things",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Request framing and desynchronization",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Web cache poisoning through unkeyed input",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cache deception and private-response caching",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Host and forwarded-header trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Response-header injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Ordinary CSRF",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Session fixation and invalidation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cookie scope and transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#JWT verification and claim binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#MFA enrollment and assurance downgrade",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Step-up binding and bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#WebAuthn and passkey verification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Account linking and identity collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Password reset and broader recovery",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key scope and resource binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key exposure and unsafe transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Union, enum, and default confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Interceptor and method-path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Peer identity to application-principal confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Per-item and streaming authorization gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Topic, routing-key, and subscription scope gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Dead-letter, retry, and diagnostic disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Untrusted producer treated as control plane",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Out-of-order and stale message acceptance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Acknowledgment/commit ordering defects",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Partial multi-consumer transitions",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Superlinear parsing, matching, or evaluation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Decompression and representation amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Database and downstream query amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Quota-accounting scope and reset gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Reachable fatal error or deadlock",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Retry storm and fail-open amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Poison-record and head-of-line blocking",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unsafe recovery and capacity rollback",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-hsa",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "hsa"
  },
  {
    "coverage_id": "containers%2Fhsa-person-lookup-adapter%2Fsrc%2Fstrict-server.mjs%23HSA%20ingress::lib%2Fhsa%2Fstrict-certificate-validation.mjs%23peer%20identity::containers%2Fhsa-person-lookup-adapter::PROTOCOLS-RPC-AND-MESSAGING.md%23Callback%20and%20reply-correlation%20confusion",
    "canonical_refs": {
      "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
      "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
      "subsystem": "containers/hsa-person-lookup-adapter",
      "attack_class": "PROTOCOLS-RPC-AND-MESSAGING.md#Callback and reply-correlation confusion"
    },
    "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
    "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
    "subsystem": "containers/hsa-person-lookup-adapter",
    "attack_class": "Callback and reply-correlation confusion",
    "starting_paths": [
      "lib/hsa",
      "lib/requirements/responsibility-person-verification.ts",
      "app/api/requirement-responsibility-people",
      "containers/hsa-person-lookup-adapter",
      "containers/hsa-directory-mock",
      "containers/hsa-mtls-provisioner",
      "containers/hsa-mtls-topology"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Callback and reply-correlation confusion",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Universal moves",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Wildcard",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Obvious things",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Request framing and desynchronization",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Web cache poisoning through unkeyed input",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cache deception and private-response caching",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Host and forwarded-header trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Response-header injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Ordinary CSRF",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Session fixation and invalidation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cookie scope and transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#JWT verification and claim binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#MFA enrollment and assurance downgrade",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Step-up binding and bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#WebAuthn and passkey verification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Account linking and identity collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Password reset and broader recovery",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key scope and resource binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key exposure and unsafe transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Union, enum, and default confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Interceptor and method-path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Peer identity to application-principal confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Per-item and streaming authorization gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Topic, routing-key, and subscription scope gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Dead-letter, retry, and diagnostic disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Untrusted producer treated as control plane",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Out-of-order and stale message acceptance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Acknowledgment/commit ordering defects",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Partial multi-consumer transitions",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Superlinear parsing, matching, or evaluation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Decompression and representation amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Database and downstream query amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Quota-accounting scope and reset gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Reachable fatal error or deadlock",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Retry storm and fail-open amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Poison-record and head-of-line blocking",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unsafe recovery and capacity rollback",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-hsa",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "hsa"
  },
  {
    "coverage_id": "containers%2Fhsa-person-lookup-adapter%2Fsrc%2Fstrict-server.mjs%23HSA%20ingress::lib%2Fhsa%2Fstrict-certificate-validation.mjs%23peer%20identity::containers%2Fhsa-person-lookup-adapter::PROTOCOLS-RPC-AND-MESSAGING.md%23Envelope%20and%20payload%20identity%20mismatch",
    "canonical_refs": {
      "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
      "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
      "subsystem": "containers/hsa-person-lookup-adapter",
      "attack_class": "PROTOCOLS-RPC-AND-MESSAGING.md#Envelope and payload identity mismatch"
    },
    "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
    "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
    "subsystem": "containers/hsa-person-lookup-adapter",
    "attack_class": "Envelope and payload identity mismatch",
    "starting_paths": [
      "lib/hsa",
      "lib/requirements/responsibility-person-verification.ts",
      "app/api/requirement-responsibility-people",
      "containers/hsa-person-lookup-adapter",
      "containers/hsa-directory-mock",
      "containers/hsa-mtls-provisioner",
      "containers/hsa-mtls-topology"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Envelope and payload identity mismatch",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Universal moves",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Wildcard",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Obvious things",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Request framing and desynchronization",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Web cache poisoning through unkeyed input",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cache deception and private-response caching",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Host and forwarded-header trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Response-header injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Ordinary CSRF",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Session fixation and invalidation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cookie scope and transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#JWT verification and claim binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#MFA enrollment and assurance downgrade",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Step-up binding and bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#WebAuthn and passkey verification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Account linking and identity collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Password reset and broader recovery",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key scope and resource binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key exposure and unsafe transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Union, enum, and default confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Interceptor and method-path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Peer identity to application-principal confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Per-item and streaming authorization gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Topic, routing-key, and subscription scope gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Dead-letter, retry, and diagnostic disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Untrusted producer treated as control plane",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Out-of-order and stale message acceptance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Acknowledgment/commit ordering defects",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Partial multi-consumer transitions",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Superlinear parsing, matching, or evaluation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Decompression and representation amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Database and downstream query amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Quota-accounting scope and reset gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Reachable fatal error or deadlock",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Retry storm and fail-open amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Poison-record and head-of-line blocking",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unsafe recovery and capacity rollback",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-hsa",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "hsa"
  },
  {
    "coverage_id": "containers%2Fhsa-person-lookup-adapter%2Fsrc%2Fstrict-server.mjs%23HSA%20ingress::lib%2Fhsa%2Fstrict-certificate-validation.mjs%23peer%20identity::containers%2Fhsa-person-lookup-adapter::PROTOCOLS-RPC-AND-MESSAGING.md%23Message%20boundary%20and%20canonicalization%20disagreement",
    "canonical_refs": {
      "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
      "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
      "subsystem": "containers/hsa-person-lookup-adapter",
      "attack_class": "PROTOCOLS-RPC-AND-MESSAGING.md#Message boundary and canonicalization disagreement"
    },
    "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
    "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
    "subsystem": "containers/hsa-person-lookup-adapter",
    "attack_class": "Message boundary and canonicalization disagreement",
    "starting_paths": [
      "lib/hsa",
      "lib/requirements/responsibility-person-verification.ts",
      "app/api/requirement-responsibility-people",
      "containers/hsa-person-lookup-adapter",
      "containers/hsa-directory-mock",
      "containers/hsa-mtls-provisioner",
      "containers/hsa-mtls-topology"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Message boundary and canonicalization disagreement",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Universal moves",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Wildcard",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Obvious things",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Request framing and desynchronization",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Web cache poisoning through unkeyed input",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cache deception and private-response caching",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Host and forwarded-header trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Response-header injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Ordinary CSRF",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Session fixation and invalidation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cookie scope and transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#JWT verification and claim binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#MFA enrollment and assurance downgrade",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Step-up binding and bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#WebAuthn and passkey verification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Account linking and identity collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Password reset and broader recovery",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key scope and resource binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key exposure and unsafe transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Union, enum, and default confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Interceptor and method-path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Peer identity to application-principal confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Per-item and streaming authorization gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Topic, routing-key, and subscription scope gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Dead-letter, retry, and diagnostic disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Untrusted producer treated as control plane",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Out-of-order and stale message acceptance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Acknowledgment/commit ordering defects",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Partial multi-consumer transitions",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Superlinear parsing, matching, or evaluation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Decompression and representation amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Database and downstream query amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Quota-accounting scope and reset gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Reachable fatal error or deadlock",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Retry storm and fail-open amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Poison-record and head-of-line blocking",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unsafe recovery and capacity rollback",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-hsa",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "hsa"
  },
  {
    "coverage_id": "containers%2Fhsa-person-lookup-adapter%2Fsrc%2Fstrict-server.mjs%23HSA%20ingress::lib%2Fhsa%2Fstrict-certificate-validation.mjs%23peer%20identity::containers%2Fhsa-person-lookup-adapter::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Unbounded%20buffering%20and%20cardinality",
    "canonical_refs": {
      "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
      "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
      "subsystem": "containers/hsa-person-lookup-adapter",
      "attack_class": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality"
    },
    "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
    "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
    "subsystem": "containers/hsa-person-lookup-adapter",
    "attack_class": "Unbounded buffering and cardinality",
    "starting_paths": [
      "lib/hsa",
      "lib/requirements/responsibility-person-verification.ts",
      "app/api/requirement-responsibility-people",
      "containers/hsa-person-lookup-adapter",
      "containers/hsa-directory-mock",
      "containers/hsa-mtls-provisioner",
      "containers/hsa-mtls-topology"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Core discipline",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Universal moves",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Wildcard",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Obvious things",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Request framing and desynchronization",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Web cache poisoning through unkeyed input",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cache deception and private-response caching",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Host and forwarded-header trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Response-header injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Ordinary CSRF",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Session fixation and invalidation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cookie scope and transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#JWT verification and claim binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#MFA enrollment and assurance downgrade",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Step-up binding and bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#WebAuthn and passkey verification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Account linking and identity collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Password reset and broader recovery",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key scope and resource binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key exposure and unsafe transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Union, enum, and default confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Interceptor and method-path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Peer identity to application-principal confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Per-item and streaming authorization gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Topic, routing-key, and subscription scope gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Dead-letter, retry, and diagnostic disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Untrusted producer treated as control plane",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Out-of-order and stale message acceptance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Acknowledgment/commit ordering defects",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Partial multi-consumer transitions",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Superlinear parsing, matching, or evaluation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Decompression and representation amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Database and downstream query amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Quota-accounting scope and reset gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Reachable fatal error or deadlock",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Retry storm and fail-open amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Poison-record and head-of-line blocking",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unsafe recovery and capacity rollback",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-hsa",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "hsa"
  },
  {
    "coverage_id": "containers%2Fhsa-person-lookup-adapter%2Fsrc%2Fstrict-server.mjs%23HSA%20ingress::lib%2Fhsa%2Fstrict-certificate-validation.mjs%23peer%20identity::containers%2Fhsa-person-lookup-adapter::WEB-PROTOCOL-AND-AUTH.md%23Certificate%20lifecycle%20fallback",
    "canonical_refs": {
      "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
      "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
      "subsystem": "containers/hsa-person-lookup-adapter",
      "attack_class": "WEB-PROTOCOL-AND-AUTH.md#Certificate lifecycle fallback"
    },
    "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
    "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
    "subsystem": "containers/hsa-person-lookup-adapter",
    "attack_class": "Certificate lifecycle fallback",
    "starting_paths": [
      "lib/hsa",
      "lib/requirements/responsibility-person-verification.ts",
      "app/api/requirement-responsibility-people",
      "containers/hsa-person-lookup-adapter",
      "containers/hsa-directory-mock",
      "containers/hsa-mtls-provisioner",
      "containers/hsa-mtls-topology"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "WEB-PROTOCOL-AND-AUTH.md#Core discipline",
      "WEB-PROTOCOL-AND-AUTH.md#Certificate lifecycle fallback",
      "WEB-PROTOCOL-AND-AUTH.md#Universal moves",
      "WEB-PROTOCOL-AND-AUTH.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Wildcard",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Obvious things",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Request framing and desynchronization",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Web cache poisoning through unkeyed input",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cache deception and private-response caching",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Host and forwarded-header trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Response-header injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Ordinary CSRF",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Session fixation and invalidation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cookie scope and transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#JWT verification and claim binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#MFA enrollment and assurance downgrade",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Step-up binding and bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#WebAuthn and passkey verification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Account linking and identity collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Password reset and broader recovery",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key scope and resource binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key exposure and unsafe transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Union, enum, and default confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Interceptor and method-path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Peer identity to application-principal confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Per-item and streaming authorization gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Topic, routing-key, and subscription scope gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Dead-letter, retry, and diagnostic disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Untrusted producer treated as control plane",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Out-of-order and stale message acceptance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Acknowledgment/commit ordering defects",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Partial multi-consumer transitions",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Superlinear parsing, matching, or evaluation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Decompression and representation amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Database and downstream query amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Quota-accounting scope and reset gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Reachable fatal error or deadlock",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Retry storm and fail-open amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Poison-record and head-of-line blocking",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unsafe recovery and capacity rollback",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-hsa",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "hsa"
  },
  {
    "coverage_id": "containers%2Fhsa-person-lookup-adapter%2Fsrc%2Fstrict-server.mjs%23HSA%20ingress::lib%2Fhsa%2Fstrict-certificate-validation.mjs%23peer%20identity::containers%2Fhsa-person-lookup-adapter::WEB-PROTOCOL-AND-AUTH.md%23mTLS%20peer%20and%20application-identity%20confusion",
    "canonical_refs": {
      "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
      "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
      "subsystem": "containers/hsa-person-lookup-adapter",
      "attack_class": "WEB-PROTOCOL-AND-AUTH.md#mTLS peer and application-identity confusion"
    },
    "surface": "containers/hsa-person-lookup-adapter/src/strict-server.mjs#HSA ingress",
    "boundary": "lib/hsa/strict-certificate-validation.mjs#peer identity",
    "subsystem": "containers/hsa-person-lookup-adapter",
    "attack_class": "mTLS peer and application-identity confusion",
    "starting_paths": [
      "lib/hsa",
      "lib/requirements/responsibility-person-verification.ts",
      "app/api/requirement-responsibility-people",
      "containers/hsa-person-lookup-adapter",
      "containers/hsa-directory-mock",
      "containers/hsa-mtls-provisioner",
      "containers/hsa-mtls-topology"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "WEB-PROTOCOL-AND-AUTH.md#Core discipline",
      "WEB-PROTOCOL-AND-AUTH.md#mTLS peer and application-identity confusion",
      "WEB-PROTOCOL-AND-AUTH.md#Universal moves",
      "WEB-PROTOCOL-AND-AUTH.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Wildcard",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Obvious things",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Request framing and desynchronization",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Web cache poisoning through unkeyed input",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cache deception and private-response caching",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Host and forwarded-header trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Response-header injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Ordinary CSRF",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Session fixation and invalidation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Cookie scope and transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#JWT verification and claim binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#MFA enrollment and assurance downgrade",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Step-up binding and bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#WebAuthn and passkey verification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Account linking and identity collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#Password reset and broader recovery",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key scope and resource binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#API-key exposure and unsafe transport",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Union, enum, and default confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Interceptor and method-path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Peer identity to application-principal confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Per-item and streaming authorization gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Topic, routing-key, and subscription scope gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Dead-letter, retry, and diagnostic disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Untrusted producer treated as control plane",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Out-of-order and stale message acceptance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Acknowledgment/commit ordering defects",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Partial multi-consumer transitions",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Superlinear parsing, matching, or evaluation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Decompression and representation amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Database and downstream query amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Quota-accounting scope and reset gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Reachable fatal error or deadlock",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Retry storm and fail-open amplification",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Poison-record and head-of-line blocking",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unsafe recovery and capacity rollback",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-hsa",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "hsa"
  }
]
## Selected blocks verbatim
**Access control** (subagent_type: `general`)
Verify that a caller cannot do something outside its authority. Go beyond checking whether permission checks exist — verify they check the *right* permission for the *right* resource via the *right* mechanism:
- Is there a path to the same state change that checks a different (weaker) permission?
- Can a field in the request body override what the permission system intended to restrict?
- Are there endpoints that gate on authentication but forget authorization?
- Does the same resource have multiple access paths with inconsistent checks?
- What about bulk/batch/export/import operations — do they enforce per-item permissions?

For complex access models, split into separate agents for auth bypass vs authorization logic.

**Resource and file handling** (subagent_type: `general`)
- Path traversal (reading/writing outside intended directories) — including through symlinks, encoded sequences, and null bytes
- SSRF (making the application fetch attacker-controlled URLs) — including through redirects, DNS rebinding, and URL parser differentials
- Unsafe deserialization, archive extraction (zip slip), temp file handling
- Memory safety (if applicable): buffer overflows, use-after-free, integer overflow
- Race conditions on file operations (TOCTOU between check and use)

**Callback and reply-correlation confusion**
Predictable, reused, or cross-tenant correlation IDs let a response, webhook, cancellation, or acknowledgment satisfy another caller's pending operation. Bind each outstanding request to authenticated peer, tenant, operation, and lifecycle.

## Core discipline (include in every agent prompt for this domain)

```
- "Internal" is not authentication. Name the peer identity at every hop and show how it becomes the application principal used for authorization.
- Schema validation proves message shape, not provenance, resource authority, ordering, or safe values. Follow decoded fields to policy and side effects.
- Broker guarantees and application guarantees differ. Write down retry, ordering, acknowledgement, deduplication, and transaction behavior before evaluating state changes.
- Parser disagreement requires two concrete consumers, schema versions, or wire representations and one security-relevant divergent value.
- Use `confirmed` for source-complete paths plus bounded local producer/consumer tests. Use `needs_validation` for broker ACL, service-mesh identity, topic attachment, or compatibility behavior outside the repository.
```

**Envelope and payload identity mismatch**
Authorization uses trusted-looking routing or envelope metadata while the handler acts on a conflicting tenant, account, subject, object, or sender in the body. Identify which source is authoritative and ensure clients cannot override it.

**Message boundary and canonicalization disagreement**
Components disagree on length, compression, duplicate fields, unknown fields, encoding, numeric width, normalization, or envelope/body precedence. Compare generated and custom parsers, gateways, language bindings, and version converters. Confirm which principal, resource, or operation differs after decoding.

## Universal moves (apply across the above)

- Draw producer → broker/transport → gateway → consumer → storage for each message family. At each hop record authenticated peer, authoritative tenant/resource fields, validation, and side effect.
- Feed the same small fixture to every in-repo schema version or language binding. Test duplicate, missing, unknown, boundary, replayed, and reordered messages without producing load.
- Compare normal, retry, dead-letter, replay, migration, reflection, stream, and gateway-transcoded routes. Security policy must survive transport changes.

## Validation rules (apply before reporting ANY finding here)

1. Name the realistic producer or peer, accepted message, authenticated channel identity, affected principal/resource, and unauthorized mutation or disclosure.
2. For disagreement claims, cite both parsers/consumers and the divergent decoded value. Safe rejection by either side prevents confirmation.
3. For replay/order claims, establish actual delivery guarantees and reproduce the invariant failure with a bounded local/in-memory transport.
4. For authorization and isolation, verify all interceptor, broker ACL, gateway, and consumer layers visible in source. External attachments make the candidate `needs_validation`.
5. Return `confirmed` only with the complete message lifecycle and observed meaningful result. Return `needs_validation` with the exact broker, service identity, route, or delivery fact required.

## Core discipline (include in every agent prompt for this domain)

```
- Require an input-to-cost path, a missing effective bound, and impact on another user, shared service, safety function, or operator-owned spend. Self-limiting work in the requester's own process is not a service vulnerability.
- A missing rate limit is not enough. Check body/message/file caps, concurrency, queues, deadlines, database constraints, upstream gateways, and per-tenant quotas before calling a path unbounded.
- Do not run stress, saturation, or production tests. Use asymptotic analysis, small boundary fixtures, mocked paid calls, strict local resource limits, and deterministic cancellation tests.
- State attacker cost, service work, persistence, scope, and recovery. One bounded input with superlinear or persistent shared effect is materially different from sustained volume.
- Use `confirmed` for source-visible bounds failures demonstrated safely. Use `needs_validation` when upstream caps, deployed topology, autoscaling, paid quota, or recovery behavior is outside the repository.
```

**Unbounded buffering and cardinality**
Bodies, out-of-order streams, uploads, sessions, unique cache keys, metrics labels, log fields, subscriptions, or pending jobs accumulate without per-item and aggregate limits. Find cleanup and expiration on disconnect, timeout, cancellation, and partial parse.

## Universal moves (apply across the above)

- Build an input-to-resource table: earliest accepted size/cardinality, work before auth, downstream fan-out, persistence, shared pool, limit and cleanup owner, recovery.
- Compare aggregate limits with per-object limits. Ten thousand valid one-byte items may evade a per-message cap while exhausting tenant-wide or process-wide state.
- Validate only in an isolated fixture with strict CPU/memory/time limits and small growth points. Mock external and paid calls and stop once the missing bound or cancellation is observable.

## Validation rules (apply before reporting ANY finding here)

1. Name untrusted input, requester work, service amplification or retained resource, shared blast radius, and recovery. Missing limits without concrete shared impact are hardening.
2. Confirm no source-visible upstream, parser, queue, tenant, or framework bound prevents the path. Unknown deployed controls require `needs_validation`.
3. For superlinear behavior, establish the accepted complexity and bounded local growth. For leaks, show repeatable retention after cleanup should occur. For fatal paths, identify process/supervisor isolation.
4. Prioritize by low requester work, unauthenticated reachability, cross-tenant scope, persistence, and poor recovery; do not validate with availability impact.
5. Return `confirmed` only with safe local proof and meaningful shared effect. Return `needs_validation` with the exact upstream limit, topology, quota, or recovery observation an owner must check.

**Certificate lifecycle fallback**
Expired, revoked, missing, or renewal-failed certificates cause silent fallback to bearer-only or anonymous operation, or long-lived pooled connections retain authorization after revocation. Missing deployment revocation data makes the result `needs_validation`; an in-repo fail-open branch is source-confirmable.

## Core discipline (include in every agent prompt for this domain)

```
- Framing and cache findings require two interpretations of the same request, response, or key. Name both components and the exact normalized value on each side.
- For every credential, find the signature or secret verification and every binding required for its role: issuer, audience, origin, RP, client, session, principal, resource, assurance, expiry, and one-time state.
- Host, Forwarded, X-Forwarded-*, Origin, Referer, redirect targets, callback state, and request-derived URLs are trust decisions. Trace each to the affected identity or response.
- A missing header, cookie attribute, MFA prompt, or rate limit is not a finding alone. Require an accepted invalid request, cross-principal impact, assurance downgrade, or credential disclosure.
- Classify `confirmed` only from complete source evidence and bounded local request/token tests. Use `needs_validation` when proxy, IdP, browser, certificate, secret, or deployed configuration is required but not visible.
```

## Universal moves (apply across the above)

- Walk issue → store → transmit → consume → refresh → revoke for every credential and challenge. Compare normal, error, retry, migration, legacy, and account-switch paths.
- Enumerate every door to the same identity and every route to the same sensitive operation. The effective policy is the weakest parallel path, not the most polished UI.
- Diff parser, proxy, router, cache, and application normalization side by side. For local validation, feed identical bounded request fixtures into each component rather than sending traffic to a live deployment.
- For recovery and linking, draw the account before/after graph. Each edge must name the current principal, proof of the new identity, required assurance, callback/session binding, and revocation effect.

## Validation rules (apply before reporting ANY finding here)

1. Apply a source-visibility gate. Proxy chains, edge cache keys, IdP policy, certificate trust, browser cookie behavior, secrets, and deployed auth modes may be outside the repository. Record a precise `needs_validation` candidate instead of asserting missing infrastructure behavior.
2. For framing and cache findings, name both components and the divergent parse/key. Confirm cross-request, cross-user, or private-response impact with bounded local fixtures.
3. For token, MFA, passkey, account-link, recovery, API-key, and mTLS findings, cite the verification line and missing principal/session/resource/origin/audience/action/assurance binding. Prove the server accepts the invalid transition or credential.
4. For CSRF, name the ambient credential, state-changing route, accepted cross-site request shape, browser cookie policy, and missing effective check. Read-only actions and routes requiring a non-ambient bearer token do not qualify.
5. Verify framework and library defaults. If version or configuration is unknown, use `needs_validation`; do not turn an unverified critical claim into a lower-severity confirmed finding.
6. Return `confirmed` only with a complete source trace and observable unauthorized identity, state, or disclosure. For `needs_validation`, name the missing fact and safe local or owner-observed check that resolves it.

**mTLS peer and application-identity confusion**
A process trusts client-certificate identity headers from any network peer, verifies a chain but maps attacker-influenceable subject text to an account incorrectly, or accepts a certificate for the wrong trust domain, extended usage, audience, or validity policy. Where a trusted proxy terminates mTLS, verify only that proxy can connect, it removes incoming identity headers, and the backend binds the sanitized identity to the request.
## Exclusions
[
  {
    "block": "ATTACK-CLASSES.md#Injection",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "ATTACK-CLASSES.md#Cryptography and secrets",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "ATTACK-CLASSES.md#Business logic",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "ATTACK-CLASSES.md#Wildcard",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "ATTACK-CLASSES.md#Obvious things",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "ATTACK-CLASSES.md#Important",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#Request framing and desynchronization",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#Web cache poisoning through unkeyed input",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#Cache deception and private-response caching",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#Host and forwarded-header trust",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#Response-header injection",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#Ordinary CSRF",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#Session fixation and invalidation",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#Cookie scope and transport",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#JWT verification and claim binding",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#OAuth/OIDC request and callback binding",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#MFA enrollment and assurance downgrade",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#Step-up binding and bypass",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#WebAuthn and passkey verification",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#Account linking and identity collision",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#Password reset and broader recovery",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#API-key scope and resource binding",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#API-key exposure and unsafe transport",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Union, enum, and default confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Interceptor and method-path inconsistency",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Peer identity to application-principal confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Per-item and streaming authorization gaps",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Topic, routing-key, and subscription scope gaps",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Dead-letter, retry, and diagnostic disclosure",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Untrusted producer treated as control plane",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Out-of-order and stale message acceptance",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Acknowledgment/commit ordering defects",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "PROTOCOLS-RPC-AND-MESSAGING.md#Partial multi-consumer transitions",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Superlinear parsing, matching, or evaluation",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Decompression and representation amplification",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Database and downstream query amplification",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Quota-accounting scope and reset gaps",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Reachable fatal error or deadlock",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Retry storm and fail-open amplification",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Poison-record and head-of-line blocking",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unsafe recovery and capacity rollback",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  }
]
#### Core hunting method — include in every hunter prompt

```text
## Defensive vulnerability-finding method

Your goal is to find source-grounded security invariant failures and the smallest fix,
not to expand harm beyond the boundary result. Stay within source review and bounded local execution.
Do not contact deployed endpoints, provider APIs, registries, identity systems,
message brokers, shared services, or other users. Use local dummy data only.

READ THE CODE AT DEPTH. Follow each assigned input through parsing, identity,
authorization, normalization, state, derived copies, and the final sink. Read sibling,
legacy, batch, retry, cancellation, migration, and error paths that produce the same
effect. Compare sibling controls for equivalence, not only presence, and compare what
one component guarantees with what the next component assumes.

WORK FROM A CONCRETE INVARIANT:
1. Name the lower-trust principal and starting capability.
2. Name the accepted value, action, state transition, or resource selector.
3. Locate the control that should reject, bind, isolate, limit, or revoke it.
4. Trace the exact source path after that decision.
5. Stop at the smallest affected dummy record, wrong return value, process-integrity
   effect, or locally observable shared-resource effect.
6. State a source-level change and regression case that enforce the invariant.

DEPTH BOUND: trace only paths that can reach your assigned boundary or whose
guarantees that boundary relies on. Stop a line of investigation as soon as the
invariant is settled either way, and record the result in your structured output —
a covered, candidate, or blocked disposition, or an `uncovered` entry — instead of
continuing to search.

TEST SAD PATHS AND DISAGREEMENTS. Check absent, empty, zero, negative, maximum,
over-limit, duplicate, mixed encoding, stale, revoked, reordered, concurrent,
partially migrated, failed dependency, and rollback state only where the interface
accepts them. Compare canonicalization and units at every parser or policy handoff.
For multi-step issues, treat each output as a prerequisite and do not assume a later
boundary. If any prerequisite is not established, record a blocker.

When a proposed high or critical candidate reveals a reusable root cause, search paths
owned by the assigned coverage IDs for lexical, structural, and logical variants.
Consolidate the same root cause, but establish each variant's conditions and impact
independently. Do not investigate peer-owned units. Return a variant with no current
coverage unit as `uncovered`.

USE THE NARROWEST LOCAL CHECK THAT SETTLES THE CLAIM. Target-controlled builds,
tests, processes, browsers, emulators, fuzzers, and fixture processing may run only
inside the parent-approved OS-enforced sandbox. It must disable external networking,
start from an empty allowlisted environment, expose target and tools read-only, permit
writes only to your scratch directory, and apply low CPU, memory, process, file-size,
disk, and wall-clock limits. Isolated loopback is allowed only for a local fixture.
If any control is unavailable, do not execute: return needs_validation with that exact
blocker. Prefer an existing unit test, minimal function harness, dummy-tenant service
call, small malformed fixture, deterministic race schedule, or locally rendered policy.
Do not install or fetch tools.

Record the exact input, command, limits, and minimum result. For the environment,
record only allowlisted variable names and safe non-secret values needed to reproduce
the check. Never capture the ambient environment, inherited variables, credentials,
authentication state, or unrelated host paths. The target-controlled process writes
only in scratch. After the sandbox and all its processes terminate, only trusted
parent-side code may promote predeclared scratch-relative files, following the
promotion procedure block included verbatim in this prompt. You and target code never
write retained artifacts. If promotion is unavailable or fails for decisive evidence,
return needs_validation with the exact promotion blocker.
Never stress availability, invoke a live target, use a real credential, publish an
artifact, or continue past the minimum observed effect.

A deployment, browser, provider, broker, OS, proxy, package, secret, or identity fact
outside source is not proof either way. If one such fact is decisive, return a
needs_validation record with the exact missing observation and safe owner-observed check.
```

#### Promotion procedure — copy this promotion procedure verbatim into every hunter prompt

```text
Artifact promotion procedure (trusted parent-side code only):
Reference only for you: the parent performs these steps; you never perform them.

Before execution, the parent opens and retains trusted, non-inheritable directory
descriptors for the agent's scratch/ and artifacts/ roots, and records an allowlist
of expected scratch-relative artifact files plus explicit per-file and cumulative
byte limits. Never pass those descriptors to the agent or sandbox. After the sandbox
and all its processes terminate, trusted parent-side code promotes each allowlisted
file separately:

1. Validate the declared relative path: reject absolute, empty, `.`, `..`, or
   symlinked components.
2. Walk each parent component from the retained scratch-root descriptor with
   no-follow directory-relative operations; never reopen by path.
3. Open the leaf no-follow and nonblocking.
4. Verify with `fstat` that it is a regular file with link count exactly one and
   within the recorded per-file and cumulative byte limits.
5. Enforce those limits again while reading from that descriptor.
6. Copy exactly the verified size, repeat `fstat`, and reject a changed identity,
   type, link count, or size.
7. For the destination, walk every parent component from the retained
   artifacts-root descriptor with no-follow directory-relative operations; require
   each existing component to be a real directory, and create any missing directory
   exclusively before reopening and verifying it no-follow.
8. Create the leaf exclusively without following links, verify that the opened
   destination is a regular file with link count exactly one, and copy from the
   verified source descriptor without reopening either path.
9. Use equivalent race-safe APIs on non-POSIX systems.
10. Never recursively copy or glob scratch, extract an archive into artifacts, or
    open or promote a symlink, FIFO, socket, device, directory, hard-linked file,
    changing file, or file that exceeds its bound.
11. If any check is unavailable, cannot be enforced, or fails, discard the scratch
    entry; if it is decisive evidence, retain `needs_validation` with the exact
    promotion blocker.
```

#### Core validation rules — include in every hunter prompt

```text
## Candidate gate

1. A candidate needs a complete repository-relative source trace and evidence for the
   claimed root cause, including the strongest source-visible control.
2. A proposed confirmed record needs a bounded local observed result, meaningful impact
   across a stated boundary, complete conditions, and no visible preventing layer.
3. Do not strengthen a crash into code execution, ordinary work into shared availability,
   or a same-principal action into privilege gain.
4. If a required fact is not source-visible or locally observable, use
   needs_validation. Name exact blockers; do not give it severity or speculative completion.
5. A missing best practice with no affected principal/resource is excluded or hardening,
   not a finding. A candidate disproved by source is not needs_validation.
6. Use the same source-derived fingerprint for the same root cause in every state.
   It must match `^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$` and must not include a line,
   wave, agent, severity, or verdict.
7. Return an empty candidate array when nothing survives these gates.
```

## Local validation boundaries

Local execution is for confirmation, not impact expansion:

- **Allowed only in the required OS sandbox:** offline builds with present dependencies; isolated-loopback processes using dummy state; unit and integration tests; small fixture processing; sanitizers; bounded fuzz/regression tests; deterministic concurrency checks; local browser/emulator tests with dummy accounts; rendered manifests and policy evaluation with dummy identities; mocked external or paid calls.
- **Disallowed:** live or deployed traffic; requests to services not started for this isolated check; network dependency installation; real accounts or credentials; production data; shared queues, cloud resources, runners, registries, signing or release services; publishing; stress, saturation, or cost generation; any work after the minimum dummy-data boundary result.

The sandbox starts with an empty environment, gives target code no external network or host writable path, and enforces explicit low resource and time limits for every check, not only checks expected to be expensive. Scratch output remains target-controlled after exit. Promote it only with the no-follow, path-confined, regular-file, bounded-size host procedure in `SKILL.md`. Missing any sandbox or promotion capability does not erase a source-grounded candidate; represent the exact blocker in `needs_validation`.

## Structured hunter result

Return exactly one JSON object, with no surrounding prose:

```json
{
  "units": [
    {
      "coverage_id": "one assigned ID",
      "disposition": "covered|candidate|blocked",
      "reviewed_paths": ["repo/relative/path"],
      "checks": [
        {
          "agent_id": "canonical owner of this check",
          "reviewed_paths": ["repo/relative/path owned by this check"],
          "invariant": "specific control checked for this unit",
          "method": "source|local",
          "result": "what source or the bounded check established",
          "artifact": "agents/<agent-id>/artifacts/file for local, null for source"
        }
      ],
      "candidate_fingerprints": [],
      "unresolved": []
    }
  ],
  "candidates": [],
  "hardening": ["concrete non-finding note"],
  "uncovered": [
    {
      "surface": "...",
      "boundary": "...",
      "subsystem": "...",
      "attack_class": "...",
      "starting_paths": ["repo/relative/path"],
      "reason": "why this needs its own deterministic coverage unit"
    }
  ]
}
```

Each `candidates` entry is schema-shaped except that it uses `proposed_verdict` in place of `verdict`:

- `proposed_verdict: "confirmed"`: include every field required by the `confirmed` branch of `report-schema.json` other than `verdict`: `fingerprint`, title, description, `root_cause`, `intended_behavior`, ordered `trace`, `evidence`, `conditions`, target-neutral `execution`, `remediation`, `severity`, and `confidence`. The execution instructions describe only the bounded local check already performed. `payloads` holds the minimum test input, fixture, or native invocation. `observed_result` records actual local output. Overall severity must not exceed observed impact.
- `proposed_verdict: "needs_validation"`: include every field required by that schema branch other than `verdict`: `fingerprint`, title, description, `claimed_root_cause`, ordered `trace`, `evidence`, nonempty `blockers`, and `validation_plan` with at least one applicable `local` or `deployment` step. Do not invent an inapplicable context. Do not include severity, execution, remediation, reason, or a confirmed `root_cause`. `deployment` is an owner-observed check, not a request to probe a live target.

Every assigned coverage ID appears exactly once in `units`. A `covered` unit needs an owner, nonempty `reviewed_paths` and `checks`, no unresolved fact, and no candidate. A `candidate` unit has the same owned evidence and is the only state that carries linked fingerprints. A `blocked` unit is an owned partial review with nonempty paths, checks, and unresolved facts but no fingerprint. All source paths are repository-relative, never absolute or traversal paths. A trace with several entries begins at `entrypoint`, ends at `sink`, and labels intermediate steps `propagation`. Every check has its own canonical lowercase `agent_id` and nonempty `reviewed_paths`; the unit-level list is exactly the union of those owned paths. A `source` check uses `artifact: null`. A `local` check uses one successfully parent-promoted regular file beneath `agents/<check.agent_id>/artifacts/`; this permits a verifier to add independently owned evidence without taking ownership from the hunter. Never link scratch, an output-root file, or another check owner's artifact.


## Prior exclusions and peer ownership
No prior findings. Other assignment groups are peer-owned: ai, auth, browser, mcp, operations, outputs, release, requirements, specifications. Inspect shared helpers only as needed for your boundary; report unrelated gaps under uncovered.

## Assignment identity and execution
Agent ID: hunt-hsa
Write only to /workspace/tmp/sec-audit/agents/hunt-hsa/scratch. Retained artifacts path /workspace/tmp/sec-audit/agents/hunt-hsa/artifacts is parent-owned and must not be written. Promotion allowlist: empty, all byte limits zero. NO target execution: namespace creation denied. No network or shared-service access. Source checks only, artifact:null. Read applicable repo instructions. No source edits or child agents.
Also save the identical final JSON object in your scratch/result.json for parent ingestion; this is source-review output, not target-produced evidence. Use one concise source check per unit with exact paths and source-line references in the result. Ensure reviewed_paths exactly equals the union of check paths. Do not call a unit covered without tracing its boundary. Return every assigned unit exactly once. Unexpected paths or insufficient depth go in uncovered/blocked, not guessed coverage.
## Full schema verbatim
{
  "$comment": "Top-level contract for findings.json. validate-findings.cjs interprets and checks this schema directly.",
  "type": "array",
  "items": {
    "oneOf": [
      {
        "type": "object",
        "description": "A source-grounded vulnerability that was independently demonstrated.",
        "properties": {
          "verdict": {
            "type": "string",
            "const": "confirmed"
          },
          "fingerprint": {
            "type": "string",
            "minLength": 1,
            "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$",
            "description": "A stable source-derived identifier that does not change between validation states."
          },
          "title": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "root_cause": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "intended_behavior": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "trace": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": ["entrypoint", "propagation", "sink"]
                },
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "scope": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["kind", "file", "line", "scope", "description"],
              "additionalProperties": false
            }
          },
          "evidence": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["file", "line", "description"],
              "additionalProperties": false
            }
          },
          "conditions": {
            "type": "array",
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": ["authentication_level", "authorization_role", "user_interaction", "system_configuration", "network_routing", "environmental_dependency", "data_state", "timing_dependency", "third_party_dependency"]
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["kind", "description"],
              "additionalProperties": false
            }
          },
          "execution": {
            "type": "object",
            "description": "Target-neutral reproduction in the target's native interface.",
            "properties": {
              "attacker_perspective": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              },
              "payloads": {
                "type": "array",
                "minItems": 1,
                "uniqueItems": true,
                "items": {
                  "type": "string"
                }
              },
              "instructions": {
                "type": "array",
                "minItems": 1,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "observed_result": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              }
            },
            "required": ["attacker_perspective", "payloads", "instructions", "observed_result"],
            "additionalProperties": false
          },
          "remediation": {
            "type": "object",
            "properties": {
              "strategy": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              },
              "code_changes": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "file_name": {
                      "type": "string",
                      "minLength": 1
                    },
                    "fixed_code": {
                      "type": "string"
                    }
                  },
                  "required": ["file_name", "fixed_code"],
                  "additionalProperties": false
                }
              }
            },
            "required": ["strategy"],
            "additionalProperties": false
          },
          "severity": {
            "type": "object",
            "properties": {
              "likelihood": {
                "type": "object",
                "properties": {
                  "score": {
                    "type": "string",
                    "enum": ["informational", "low", "medium", "high", "critical"]
                  },
                  "reason": {
                    "type": "string",
                    "minLength": 1,
                    "visibleContent": true
                  }
                },
                "required": ["score", "reason"],
                "additionalProperties": false
              },
              "impact": {
                "type": "object",
                "properties": {
                  "score": {
                    "type": "string",
                    "enum": ["informational", "low", "medium", "high", "critical"]
                  },
                  "reason": {
                    "type": "string",
                    "minLength": 1,
                    "visibleContent": true
                  }
                },
                "required": ["score", "reason"],
                "additionalProperties": false
              },
              "overall_severity": {
                "type": "string",
                "enum": ["informational", "low", "medium", "high", "critical"]
              }
            },
            "required": ["likelihood", "impact", "overall_severity"],
            "additionalProperties": false
          },
          "confidence": {
            "type": "object",
            "properties": {
              "score": {
                "type": "string",
                "enum": ["low", "medium", "high"]
              },
              "reason": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              }
            },
            "required": ["score", "reason"],
            "additionalProperties": false
          }
        },
        "required": ["verdict", "fingerprint", "title", "description", "root_cause", "intended_behavior", "trace", "evidence", "conditions", "execution", "remediation", "severity", "confidence"],
        "additionalProperties": false
      },
      {
        "type": "object",
        "description": "A source-grounded candidate whose decisive validation is blocked.",
        "properties": {
          "verdict": {
            "type": "string",
            "const": "needs_validation"
          },
          "fingerprint": {
            "type": "string",
            "minLength": 1,
            "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$"
          },
          "title": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "claimed_root_cause": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "trace": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": ["entrypoint", "propagation", "sink"]
                },
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "scope": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["kind", "file", "line", "scope", "description"],
              "additionalProperties": false
            }
          },
          "evidence": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["file", "line", "description"],
              "additionalProperties": false
            }
          },
          "blockers": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "string",
              "minLength": 1,
              "visibleContent": true
            }
          },
          "validation_plan": {
            "type": "object",
            "properties": {
              "local": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              },
              "deployment": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              }
            },
            "additionalProperties": false
          }
        },
        "required": ["verdict", "fingerprint", "title", "description", "claimed_root_cause", "trace", "evidence", "blockers", "validation_plan"],
        "additionalProperties": false
      },
      {
        "type": "object",
        "description": "A source-grounded candidate refuted during validation.",
        "properties": {
          "verdict": {
            "type": "string",
            "const": "rejected"
          },
          "fingerprint": {
            "type": "string",
            "minLength": 1,
            "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$"
          },
          "title": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "claimed_root_cause": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "trace": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": ["entrypoint", "propagation", "sink"]
                },
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "scope": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["kind", "file", "line", "scope", "description"],
              "additionalProperties": false
            }
          },
          "evidence": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["file", "line", "description"],
              "additionalProperties": false
            }
          },
          "reason": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          }
        },
        "required": ["verdict", "fingerprint", "title", "description", "claimed_root_cause", "trace", "evidence", "reason"],
        "additionalProperties": false
      }
    ]
  }
}
