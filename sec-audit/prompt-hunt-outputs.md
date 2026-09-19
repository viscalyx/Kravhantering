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
    "coverage_id": "app%2Fapi%2Fprivacy%23exports%20and%20reports::lib%2Fprivacy%2Froute-helpers.ts%23derived%20data%20authority::lib%2Fprivacy::ATTACK-CLASSES.md%23Access%20control",
    "canonical_refs": {
      "surface": "app/api/privacy#exports and reports",
      "boundary": "lib/privacy/route-helpers.ts#derived data authority",
      "subsystem": "lib/privacy",
      "attack_class": "ATTACK-CLASSES.md#Access control"
    },
    "surface": "app/api/privacy#exports and reports",
    "boundary": "lib/privacy/route-helpers.ts#derived data authority",
    "subsystem": "lib/privacy",
    "attack_class": "Access control",
    "starting_paths": [
      "lib/privacy",
      "lib/access-review",
      "lib/archiving",
      "lib/audit",
      "lib/reports",
      "lib/pdf",
      "lib/generated-output",
      "lib/transient-cleanup",
      "app/api/privacy",
      "app/api/admin/access-reviews",
      "app/api/admin/archiving",
      "app/api/admin/audit-events",
      "app/api/requirements/export",
      "app/api/requirements-specifications"
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
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Composite-key and namespace collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Policy and query disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Blob and signed-reference overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Search, cache, and index ACL drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Enumeration and aggregate oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Import and restore authority expansion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Migration default and ownership confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Backup and replication boundary drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Soft-delete and tombstone bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Stale authorization and derived copy use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Restore reintroduces invalid state",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality",
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
    "agent_id": "hunt-outputs",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "outputs"
  },
  {
    "coverage_id": "app%2Fapi%2Fprivacy%23exports%20and%20reports::lib%2Fprivacy%2Froute-helpers.ts%23derived%20data%20authority::lib%2Fprivacy::ATTACK-CLASSES.md%23Feature%20abuse%20and%20data%20leakage",
    "canonical_refs": {
      "surface": "app/api/privacy#exports and reports",
      "boundary": "lib/privacy/route-helpers.ts#derived data authority",
      "subsystem": "lib/privacy",
      "attack_class": "ATTACK-CLASSES.md#Feature abuse and data leakage"
    },
    "surface": "app/api/privacy#exports and reports",
    "boundary": "lib/privacy/route-helpers.ts#derived data authority",
    "subsystem": "lib/privacy",
    "attack_class": "Feature abuse and data leakage",
    "starting_paths": [
      "lib/privacy",
      "lib/access-review",
      "lib/archiving",
      "lib/audit",
      "lib/reports",
      "lib/pdf",
      "lib/generated-output",
      "lib/transient-cleanup",
      "app/api/privacy",
      "app/api/admin/access-reviews",
      "app/api/admin/archiving",
      "app/api/admin/audit-events",
      "app/api/requirements/export",
      "app/api/requirements-specifications"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
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
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Composite-key and namespace collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Policy and query disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Blob and signed-reference overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Search, cache, and index ACL drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Enumeration and aggregate oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Import and restore authority expansion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Migration default and ownership confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Backup and replication boundary drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Soft-delete and tombstone bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Stale authorization and derived copy use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Restore reintroduces invalid state",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality",
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
    "agent_id": "hunt-outputs",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "outputs"
  },
  {
    "coverage_id": "app%2Fapi%2Fprivacy%23exports%20and%20reports::lib%2Fprivacy%2Froute-helpers.ts%23derived%20data%20authority::lib%2Fprivacy::ATTACK-CLASSES.md%23Resource%20and%20file%20handling",
    "canonical_refs": {
      "surface": "app/api/privacy#exports and reports",
      "boundary": "lib/privacy/route-helpers.ts#derived data authority",
      "subsystem": "lib/privacy",
      "attack_class": "ATTACK-CLASSES.md#Resource and file handling"
    },
    "surface": "app/api/privacy#exports and reports",
    "boundary": "lib/privacy/route-helpers.ts#derived data authority",
    "subsystem": "lib/privacy",
    "attack_class": "Resource and file handling",
    "starting_paths": [
      "lib/privacy",
      "lib/access-review",
      "lib/archiving",
      "lib/audit",
      "lib/reports",
      "lib/pdf",
      "lib/generated-output",
      "lib/transient-cleanup",
      "app/api/privacy",
      "app/api/admin/access-reviews",
      "app/api/admin/archiving",
      "app/api/admin/audit-events",
      "app/api/requirements/export",
      "app/api/requirements-specifications"
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
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Composite-key and namespace collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Policy and query disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Blob and signed-reference overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Search, cache, and index ACL drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Enumeration and aggregate oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Import and restore authority expansion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Migration default and ownership confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Backup and replication boundary drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Soft-delete and tombstone bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Stale authorization and derived copy use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Restore reintroduces invalid state",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality",
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
    "agent_id": "hunt-outputs",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "outputs"
  },
  {
    "coverage_id": "app%2Fapi%2Fprivacy%23exports%20and%20reports::lib%2Fprivacy%2Froute-helpers.ts%23derived%20data%20authority::lib%2Fprivacy::DATA-ISOLATION-AND-LIFECYCLE.md%23Analytics%2C%20logs%2C%20traces%2C%20and%20diagnostics%20as%20alternate%20readers",
    "canonical_refs": {
      "surface": "app/api/privacy#exports and reports",
      "boundary": "lib/privacy/route-helpers.ts#derived data authority",
      "subsystem": "lib/privacy",
      "attack_class": "DATA-ISOLATION-AND-LIFECYCLE.md#Analytics, logs, traces, and diagnostics as alternate readers"
    },
    "surface": "app/api/privacy#exports and reports",
    "boundary": "lib/privacy/route-helpers.ts#derived data authority",
    "subsystem": "lib/privacy",
    "attack_class": "Analytics, logs, traces, and diagnostics as alternate readers",
    "starting_paths": [
      "lib/privacy",
      "lib/access-review",
      "lib/archiving",
      "lib/audit",
      "lib/reports",
      "lib/pdf",
      "lib/generated-output",
      "lib/transient-cleanup",
      "app/api/privacy",
      "app/api/admin/access-reviews",
      "app/api/admin/archiving",
      "app/api/admin/audit-events",
      "app/api/requirements/export",
      "app/api/requirements-specifications"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "DATA-ISOLATION-AND-LIFECYCLE.md#Core discipline",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Analytics, logs, traces, and diagnostics as alternate readers",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Universal moves",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Validation rules"
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
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Composite-key and namespace collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Policy and query disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Blob and signed-reference overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Search, cache, and index ACL drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Enumeration and aggregate oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Import and restore authority expansion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Migration default and ownership confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Backup and replication boundary drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Soft-delete and tombstone bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Stale authorization and derived copy use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Restore reintroduces invalid state",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality",
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
    "agent_id": "hunt-outputs",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "outputs"
  },
  {
    "coverage_id": "app%2Fapi%2Fprivacy%23exports%20and%20reports::lib%2Fprivacy%2Froute-helpers.ts%23derived%20data%20authority::lib%2Fprivacy::DATA-ISOLATION-AND-LIFECYCLE.md%23Export%20and%20backup%20scope%20expansion",
    "canonical_refs": {
      "surface": "app/api/privacy#exports and reports",
      "boundary": "lib/privacy/route-helpers.ts#derived data authority",
      "subsystem": "lib/privacy",
      "attack_class": "DATA-ISOLATION-AND-LIFECYCLE.md#Export and backup scope expansion"
    },
    "surface": "app/api/privacy#exports and reports",
    "boundary": "lib/privacy/route-helpers.ts#derived data authority",
    "subsystem": "lib/privacy",
    "attack_class": "Export and backup scope expansion",
    "starting_paths": [
      "lib/privacy",
      "lib/access-review",
      "lib/archiving",
      "lib/audit",
      "lib/reports",
      "lib/pdf",
      "lib/generated-output",
      "lib/transient-cleanup",
      "app/api/privacy",
      "app/api/admin/access-reviews",
      "app/api/admin/archiving",
      "app/api/admin/audit-events",
      "app/api/requirements/export",
      "app/api/requirements-specifications"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "DATA-ISOLATION-AND-LIFECYCLE.md#Core discipline",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Export and backup scope expansion",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Universal moves",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Validation rules"
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
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Composite-key and namespace collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Policy and query disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Blob and signed-reference overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Search, cache, and index ACL drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Enumeration and aggregate oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Import and restore authority expansion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Migration default and ownership confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Backup and replication boundary drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Soft-delete and tombstone bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Stale authorization and derived copy use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Restore reintroduces invalid state",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality",
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
    "agent_id": "hunt-outputs",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "outputs"
  },
  {
    "coverage_id": "app%2Fapi%2Fprivacy%23exports%20and%20reports::lib%2Fprivacy%2Froute-helpers.ts%23derived%20data%20authority::lib%2Fprivacy::DATA-ISOLATION-AND-LIFECYCLE.md%23Retention%20and%20queued-work%20overrun",
    "canonical_refs": {
      "surface": "app/api/privacy#exports and reports",
      "boundary": "lib/privacy/route-helpers.ts#derived data authority",
      "subsystem": "lib/privacy",
      "attack_class": "DATA-ISOLATION-AND-LIFECYCLE.md#Retention and queued-work overrun"
    },
    "surface": "app/api/privacy#exports and reports",
    "boundary": "lib/privacy/route-helpers.ts#derived data authority",
    "subsystem": "lib/privacy",
    "attack_class": "Retention and queued-work overrun",
    "starting_paths": [
      "lib/privacy",
      "lib/access-review",
      "lib/archiving",
      "lib/audit",
      "lib/reports",
      "lib/pdf",
      "lib/generated-output",
      "lib/transient-cleanup",
      "app/api/privacy",
      "app/api/admin/access-reviews",
      "app/api/admin/archiving",
      "app/api/admin/audit-events",
      "app/api/requirements/export",
      "app/api/requirements-specifications"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "DATA-ISOLATION-AND-LIFECYCLE.md#Core discipline",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Retention and queued-work overrun",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Universal moves",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Validation rules"
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
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Composite-key and namespace collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Policy and query disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Blob and signed-reference overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Search, cache, and index ACL drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Enumeration and aggregate oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Import and restore authority expansion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Migration default and ownership confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Backup and replication boundary drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Soft-delete and tombstone bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Stale authorization and derived copy use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Restore reintroduces invalid state",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality",
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
    "agent_id": "hunt-outputs",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "outputs"
  },
  {
    "coverage_id": "app%2Fapi%2Fprivacy%23exports%20and%20reports::lib%2Fprivacy%2Froute-helpers.ts%23derived%20data%20authority::lib%2Fprivacy::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23File%20descriptor%2C%20handle%2C%20and%20temporary-resource%20leaks",
    "canonical_refs": {
      "surface": "app/api/privacy#exports and reports",
      "boundary": "lib/privacy/route-helpers.ts#derived data authority",
      "subsystem": "lib/privacy",
      "attack_class": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks"
    },
    "surface": "app/api/privacy#exports and reports",
    "boundary": "lib/privacy/route-helpers.ts#derived data authority",
    "subsystem": "lib/privacy",
    "attack_class": "File descriptor, handle, and temporary-resource leaks",
    "starting_paths": [
      "lib/privacy",
      "lib/access-review",
      "lib/archiving",
      "lib/audit",
      "lib/reports",
      "lib/pdf",
      "lib/generated-output",
      "lib/transient-cleanup",
      "app/api/privacy",
      "app/api/admin/access-reviews",
      "app/api/admin/archiving",
      "app/api/admin/audit-events",
      "app/api/requirements/export",
      "app/api/requirements-specifications"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Core discipline",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
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
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Composite-key and namespace collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Policy and query disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Blob and signed-reference overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Search, cache, and index ACL drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Enumeration and aggregate oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Import and restore authority expansion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Migration default and ownership confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Backup and replication boundary drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Soft-delete and tombstone bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Stale authorization and derived copy use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Restore reintroduces invalid state",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality",
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
    "agent_id": "hunt-outputs",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "outputs"
  },
  {
    "coverage_id": "app%2Fapi%2Fprivacy%23exports%20and%20reports::lib%2Fprivacy%2Froute-helpers.ts%23derived%20data%20authority::lib%2Fprivacy::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Quota-accounting%20scope%20and%20reset%20gaps",
    "canonical_refs": {
      "surface": "app/api/privacy#exports and reports",
      "boundary": "lib/privacy/route-helpers.ts#derived data authority",
      "subsystem": "lib/privacy",
      "attack_class": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Quota-accounting scope and reset gaps"
    },
    "surface": "app/api/privacy#exports and reports",
    "boundary": "lib/privacy/route-helpers.ts#derived data authority",
    "subsystem": "lib/privacy",
    "attack_class": "Quota-accounting scope and reset gaps",
    "starting_paths": [
      "lib/privacy",
      "lib/access-review",
      "lib/archiving",
      "lib/audit",
      "lib/reports",
      "lib/pdf",
      "lib/generated-output",
      "lib/transient-cleanup",
      "app/api/privacy",
      "app/api/admin/access-reviews",
      "app/api/admin/archiving",
      "app/api/admin/audit-events",
      "app/api/requirements/export",
      "app/api/requirements-specifications"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Core discipline",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Quota-accounting scope and reset gaps",
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
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Composite-key and namespace collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Policy and query disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Blob and signed-reference overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Search, cache, and index ACL drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Enumeration and aggregate oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Import and restore authority expansion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Migration default and ownership confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Backup and replication boundary drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Soft-delete and tombstone bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Stale authorization and derived copy use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Restore reintroduces invalid state",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality",
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
    "agent_id": "hunt-outputs",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "outputs"
  },
  {
    "coverage_id": "app%2Fapi%2Fprivacy%23exports%20and%20reports::lib%2Fprivacy%2Froute-helpers.ts%23derived%20data%20authority::lib%2Fprivacy::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Worker%2C%20pool%2C%20and%20priority%20starvation",
    "canonical_refs": {
      "surface": "app/api/privacy#exports and reports",
      "boundary": "lib/privacy/route-helpers.ts#derived data authority",
      "subsystem": "lib/privacy",
      "attack_class": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation"
    },
    "surface": "app/api/privacy#exports and reports",
    "boundary": "lib/privacy/route-helpers.ts#derived data authority",
    "subsystem": "lib/privacy",
    "attack_class": "Worker, pool, and priority starvation",
    "starting_paths": [
      "lib/privacy",
      "lib/access-review",
      "lib/archiving",
      "lib/audit",
      "lib/reports",
      "lib/pdf",
      "lib/generated-output",
      "lib/transient-cleanup",
      "app/api/privacy",
      "app/api/admin/access-reviews",
      "app/api/admin/archiving",
      "app/api/admin/audit-events",
      "app/api/requirements/export",
      "app/api/requirements-specifications"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Core discipline",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation",
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
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Composite-key and namespace collision",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Policy and query disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Blob and signed-reference overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Search, cache, and index ACL drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Enumeration and aggregate oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Import and restore authority expansion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Migration default and ownership confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Backup and replication boundary drift",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Soft-delete and tombstone bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Stale authorization and derived copy use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Restore reintroduces invalid state",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality",
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
    "agent_id": "hunt-outputs",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "outputs"
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

**Feature abuse and data leakage** (subagent_type: `general`)
Legitimate features used for unintended purposes. Look for bugs in the design, not only in the code:
- **Export/backup as exfiltration**: Can a low-privilege user trigger an export, snapshot, or backup that includes data above their access level? Can they export other users' data? Does the export include deleted/draft/private content? Revision history that was supposed to be pruned?
- **Import/restore as injection**: Can import overwrite existing data? Can it create records that bypass normal validation? Can it inject content into collections the user has no write access to? Does it respect the same permission model as the UI?
- **Search/filter/sort as oracle**: Can search queries reveal whether content exists that the user cannot directly access? Do filter parameters let users probe statuses, roles, or fields they should not know about? Does sorting by a hidden field reveal its values through result ordering?
- **Enumeration through side effects**: Do error messages differ between "does not exist" and "no access"? Do response times differ? Response sizes? HTTP status codes? Can you enumerate users through password reset, invite, or registration flows?
- **Preview/draft/staging leakage**: Are preview tokens scoped to one item or do they unlock broader access? Can draft content be discovered through search, RSS feeds, sitemaps, or API listing endpoints? Can cache headers cause a CDN to serve private content publicly?
- **Notification/webhook as SSRF**: Can a user set a notification URL, webhook URL, or callback URL that the server fetches? Is it validated against internal networks? What about after a redirect?

**Resource and file handling** (subagent_type: `general`)
- Path traversal (reading/writing outside intended directories) — including through symlinks, encoded sequences, and null bytes
- SSRF (making the application fetch attacker-controlled URLs) — including through redirects, DNS rebinding, and URL parser differentials
- Unsafe deserialization, archive extraction (zip slip), temp file handling
- Memory safety (if applicable): buffer overflows, use-after-free, integer overflow
- Race conditions on file operations (TOCTOU between check and use)

**Analytics, logs, traces, and diagnostics as alternate readers**
Private content or credentials are emitted into systems with broader access, longer retention, or tenant mixing. Confirm the data class and realistic reader; field names, public identifiers, and operator-only content under intended policy are not enough.

## Core discipline (include in every agent prompt for this domain)

```
- A tenant or owner field on a record is not isolation. Find the query, key, path, policy, or row-level control that enforces it for each read and write path.
- Trace derived copies. Sanitized primary data can become unsafe in search, cache, analytics, export, previews, logs, replicas, and backups with different ACL and retention rules.
- Deletion and revocation are lifecycle contracts. Check current, historical, cached, indexed, exported, restored, and queued copies within the product's stated boundary.
- Privacy or retention preference is not automatically a security vulnerability. Require an explicit data-access boundary or deletion/revocation guarantee and an unauthorized reader or later operation.
- Use `confirmed` for complete source-visible lineage and bounded dummy-tenant tests. Use `needs_validation` when external storage policy, retention, CDN behavior, replica lag, or backup access is unavailable.
```

**Export and backup scope expansion**
An export, snapshot, portability package, report, or backup includes other tenants, inaccessible object fields, soft-deleted data, secret values, or history above the requester's access. Check per-item authorization after selection and authorization to download the final artifact.

**Retention and queued-work overrun**
Deletion completes in primary storage while queued processors, retries, exports, analytics, or generated artifacts recreate or retain the data beyond the promised boundary. Find idempotent deletion and tombstone propagation.

## Universal moves (apply across the above)

- Pick one protected record and draw primary write, query, cache, index, event, export, backup, deletion, and restore paths. Mark principal and tenant at every edge.
- Compare two dummy tenants through the same local service methods, then repeat after ACL change, deletion, account switch, and restore. Do not use real user data.
- Start at bypass clients, background jobs, migrations, global uniqueness, and cache keys. These paths commonly omit request-scoped identity that interactive endpoints carry.

## Validation rules (apply before reporting ANY finding here)

1. Name attacker or lower-trust principal, protected data/state, affected owner/tenant, alternate copy or operation, and unauthorized disclosure or mutation.
2. Cite both intended source-of-truth policy and the path that omits or disagrees with it. Confirm another layer does not enforce the same tenant/lifecycle condition.
3. Use local dummy tenants and non-sensitive fixtures to prove cross-scope access or stale lifecycle behavior. Stop at the minimum observable record or operation.
4. If external cache, object storage, replicas, analytics, backup, or retention policy is required, classify `needs_validation` and state the owner-observed check.
5. Return `confirmed` only with complete lineage and concrete boundary impact. Return `needs_validation` with the exact unresolved storage, ACL, invalidation, retention, or restore fact.

## Core discipline (include in every agent prompt for this domain)

```
- Require an input-to-cost path, a missing effective bound, and impact on another user, shared service, safety function, or operator-owned spend. Self-limiting work in the requester's own process is not a service vulnerability.
- A missing rate limit is not enough. Check body/message/file caps, concurrency, queues, deadlines, database constraints, upstream gateways, and per-tenant quotas before calling a path unbounded.
- Do not run stress, saturation, or production tests. Use asymptotic analysis, small boundary fixtures, mocked paid calls, strict local resource limits, and deterministic cancellation tests.
- State attacker cost, service work, persistence, scope, and recovery. One bounded input with superlinear or persistent shared effect is materially different from sustained volume.
- Use `confirmed` for source-visible bounds failures demonstrated safely. Use `needs_validation` when upstream caps, deployed topology, autoscaling, paid quota, or recovery behavior is outside the repository.
```

**File descriptor, handle, and temporary-resource leaks**
Malformed or canceled work misses cleanup and retains sockets, files, database cursors, timers, subprocesses, temporary files, or object references. Confirm the leak repeats through bounded local iterations and affects a shared pool.

**Quota-accounting scope and reset gaps**
Accounting uses attacker-influenceable IP, route, tenant, key prefix, task ID, or other dimension, allowing one principal's work to escape its intended budget or consume another principal's allocation. Review integer overflow, distributed races, retries, reconnects, and account switching.

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

**Worker, pool, and priority starvation**
Low-priority or attacker-controlled jobs hold shared locks, workers, database pools, event-loop turns, or scheduler priority needed by unrelated users. Require a path that bypasses queue/concurrency fairness or retains a slot beyond its deadline.
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
    "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Composite-key and namespace collision",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Policy and query disagreement",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Blob and signed-reference overreach",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Search, cache, and index ACL drift",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Enumeration and aggregate oracles",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Import and restore authority expansion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Migration default and ownership confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Backup and replication boundary drift",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Soft-delete and tombstone bypass",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Stale authorization and derived copy use",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DATA-ISOLATION-AND-LIFECYCLE.md#Restore reintroduces invalid state",
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
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality",
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
No prior findings. Other assignment groups are peer-owned: ai, auth, browser, hsa, mcp, operations, release, requirements, specifications. Inspect shared helpers only as needed for your boundary; report unrelated gaps under uncovered.

## Assignment identity and execution
Agent ID: hunt-outputs
Write only to /workspace/tmp/sec-audit/agents/hunt-outputs/scratch. Retained artifacts path /workspace/tmp/sec-audit/agents/hunt-outputs/artifacts is parent-owned and must not be written. Promotion allowlist: empty, all byte limits zero. NO target execution: namespace creation denied. No network or shared-service access. Source checks only, artifact:null. Read applicable repo instructions. No source edits or child agents.
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
