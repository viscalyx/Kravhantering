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
    "coverage_id": "components%23browser%20rendering::lib%2Fnorm-references%2Fbrowser-link-uri.ts%23untrusted%20content%20rendering::components::ATTACK-CLASSES.md%23Feature%20abuse%20and%20data%20leakage",
    "canonical_refs": {
      "surface": "components#browser rendering",
      "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
      "subsystem": "components",
      "attack_class": "ATTACK-CLASSES.md#Feature abuse and data leakage"
    },
    "surface": "components#browser rendering",
    "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
    "subsystem": "components",
    "attack_class": "Feature abuse and data leakage",
    "starting_paths": [
      "components",
      "app/[locale]",
      "hooks",
      "lib/norm-references/browser-link-uri.ts",
      "lib/browser-download.ts",
      "lib/export-csv.ts",
      "next.config.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Resource and file handling",
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
        "block": "CLIENT-SIDE.md#DOM clobbering",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#`postMessage` origin and source trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-site WebSocket request use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker registration and scope takeover",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker cache and identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-context storage and broadcast confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#XS-Leaks and cross-origin state oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Window and opener state disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-browser",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "browser"
  },
  {
    "coverage_id": "components%23browser%20rendering::lib%2Fnorm-references%2Fbrowser-link-uri.ts%23untrusted%20content%20rendering::components::ATTACK-CLASSES.md%23Injection",
    "canonical_refs": {
      "surface": "components#browser rendering",
      "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
      "subsystem": "components",
      "attack_class": "ATTACK-CLASSES.md#Injection"
    },
    "surface": "components#browser rendering",
    "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
    "subsystem": "components",
    "attack_class": "Injection",
    "starting_paths": [
      "components",
      "app/[locale]",
      "hooks",
      "lib/norm-references/browser-link-uri.ts",
      "lib/browser-download.ts",
      "lib/export-csv.ts",
      "next.config.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Injection",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Resource and file handling",
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
        "block": "CLIENT-SIDE.md#DOM clobbering",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#`postMessage` origin and source trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-site WebSocket request use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker registration and scope takeover",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker cache and identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-context storage and broadcast confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#XS-Leaks and cross-origin state oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Window and opener state disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-browser",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "browser"
  },
  {
    "coverage_id": "components%23browser%20rendering::lib%2Fnorm-references%2Fbrowser-link-uri.ts%23untrusted%20content%20rendering::components::CLIENT-SIDE.md%23Browser-storage%20disclosure%20and%20stale%20authorization",
    "canonical_refs": {
      "surface": "components#browser rendering",
      "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
      "subsystem": "components",
      "attack_class": "CLIENT-SIDE.md#Browser-storage disclosure and stale authorization"
    },
    "surface": "components#browser rendering",
    "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
    "subsystem": "components",
    "attack_class": "Browser-storage disclosure and stale authorization",
    "starting_paths": [
      "components",
      "app/[locale]",
      "hooks",
      "lib/norm-references/browser-link-uri.ts",
      "lib/browser-download.ts",
      "lib/export-csv.ts",
      "next.config.ts"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "CLIENT-SIDE.md#Core discipline",
      "CLIENT-SIDE.md#Browser-storage disclosure and stale authorization",
      "CLIENT-SIDE.md#Universal moves",
      "CLIENT-SIDE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Resource and file handling",
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
        "block": "CLIENT-SIDE.md#DOM clobbering",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#`postMessage` origin and source trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-site WebSocket request use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker registration and scope takeover",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker cache and identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-context storage and broadcast confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#XS-Leaks and cross-origin state oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Window and opener state disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-browser",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "browser"
  },
  {
    "coverage_id": "components%23browser%20rendering::lib%2Fnorm-references%2Fbrowser-link-uri.ts%23untrusted%20content%20rendering::components::CLIENT-SIDE.md%23Clickjacking",
    "canonical_refs": {
      "surface": "components#browser rendering",
      "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
      "subsystem": "components",
      "attack_class": "CLIENT-SIDE.md#Clickjacking"
    },
    "surface": "components#browser rendering",
    "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
    "subsystem": "components",
    "attack_class": "Clickjacking",
    "starting_paths": [
      "components",
      "app/[locale]",
      "hooks",
      "lib/norm-references/browser-link-uri.ts",
      "lib/browser-download.ts",
      "lib/export-csv.ts",
      "next.config.ts"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "CLIENT-SIDE.md#Core discipline",
      "CLIENT-SIDE.md#Clickjacking",
      "CLIENT-SIDE.md#Universal moves",
      "CLIENT-SIDE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Resource and file handling",
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
        "block": "CLIENT-SIDE.md#DOM clobbering",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#`postMessage` origin and source trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-site WebSocket request use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker registration and scope takeover",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker cache and identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-context storage and broadcast confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#XS-Leaks and cross-origin state oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Window and opener state disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-browser",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "browser"
  },
  {
    "coverage_id": "components%23browser%20rendering::lib%2Fnorm-references%2Fbrowser-link-uri.ts%23untrusted%20content%20rendering::components::CLIENT-SIDE.md%23Client-side%20navigation%20confusion",
    "canonical_refs": {
      "surface": "components#browser rendering",
      "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
      "subsystem": "components",
      "attack_class": "CLIENT-SIDE.md#Client-side navigation confusion"
    },
    "surface": "components#browser rendering",
    "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
    "subsystem": "components",
    "attack_class": "Client-side navigation confusion",
    "starting_paths": [
      "components",
      "app/[locale]",
      "hooks",
      "lib/norm-references/browser-link-uri.ts",
      "lib/browser-download.ts",
      "lib/export-csv.ts",
      "next.config.ts"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "CLIENT-SIDE.md#Core discipline",
      "CLIENT-SIDE.md#Client-side navigation confusion",
      "CLIENT-SIDE.md#Universal moves",
      "CLIENT-SIDE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Resource and file handling",
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
        "block": "CLIENT-SIDE.md#DOM clobbering",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#`postMessage` origin and source trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-site WebSocket request use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker registration and scope takeover",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker cache and identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-context storage and broadcast confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#XS-Leaks and cross-origin state oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Window and opener state disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-browser",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "browser"
  },
  {
    "coverage_id": "components%23browser%20rendering::lib%2Fnorm-references%2Fbrowser-link-uri.ts%23untrusted%20content%20rendering::components::CLIENT-SIDE.md%23Credentialed%20CORS%20trust",
    "canonical_refs": {
      "surface": "components#browser rendering",
      "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
      "subsystem": "components",
      "attack_class": "CLIENT-SIDE.md#Credentialed CORS trust"
    },
    "surface": "components#browser rendering",
    "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
    "subsystem": "components",
    "attack_class": "Credentialed CORS trust",
    "starting_paths": [
      "components",
      "app/[locale]",
      "hooks",
      "lib/norm-references/browser-link-uri.ts",
      "lib/browser-download.ts",
      "lib/export-csv.ts",
      "next.config.ts"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "CLIENT-SIDE.md#Core discipline",
      "CLIENT-SIDE.md#Credentialed CORS trust",
      "CLIENT-SIDE.md#Universal moves",
      "CLIENT-SIDE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Resource and file handling",
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
        "block": "CLIENT-SIDE.md#DOM clobbering",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#`postMessage` origin and source trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-site WebSocket request use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker registration and scope takeover",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker cache and identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-context storage and broadcast confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#XS-Leaks and cross-origin state oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Window and opener state disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-browser",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "browser"
  },
  {
    "coverage_id": "components%23browser%20rendering::lib%2Fnorm-references%2Fbrowser-link-uri.ts%23untrusted%20content%20rendering::components::CLIENT-SIDE.md%23DOM-based%20XSS",
    "canonical_refs": {
      "surface": "components#browser rendering",
      "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
      "subsystem": "components",
      "attack_class": "CLIENT-SIDE.md#DOM-based XSS"
    },
    "surface": "components#browser rendering",
    "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
    "subsystem": "components",
    "attack_class": "DOM-based XSS",
    "starting_paths": [
      "components",
      "app/[locale]",
      "hooks",
      "lib/norm-references/browser-link-uri.ts",
      "lib/browser-download.ts",
      "lib/export-csv.ts",
      "next.config.ts"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "CLIENT-SIDE.md#Core discipline",
      "CLIENT-SIDE.md#DOM-based XSS",
      "CLIENT-SIDE.md#Universal moves",
      "CLIENT-SIDE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Resource and file handling",
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
        "block": "CLIENT-SIDE.md#DOM clobbering",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#`postMessage` origin and source trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-site WebSocket request use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker registration and scope takeover",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker cache and identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-context storage and broadcast confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#XS-Leaks and cross-origin state oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Window and opener state disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-browser",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "browser"
  },
  {
    "coverage_id": "components%23browser%20rendering::lib%2Fnorm-references%2Fbrowser-link-uri.ts%23untrusted%20content%20rendering::components::CLIENT-SIDE.md%23Prototype%20pollution%20and%20gadget%20chain",
    "canonical_refs": {
      "surface": "components#browser rendering",
      "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
      "subsystem": "components",
      "attack_class": "CLIENT-SIDE.md#Prototype pollution and gadget chain"
    },
    "surface": "components#browser rendering",
    "boundary": "lib/norm-references/browser-link-uri.ts#untrusted content rendering",
    "subsystem": "components",
    "attack_class": "Prototype pollution and gadget chain",
    "starting_paths": [
      "components",
      "app/[locale]",
      "hooks",
      "lib/norm-references/browser-link-uri.ts",
      "lib/browser-download.ts",
      "lib/export-csv.ts",
      "next.config.ts"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "CLIENT-SIDE.md#Core discipline",
      "CLIENT-SIDE.md#Prototype pollution and gadget chain",
      "CLIENT-SIDE.md#Universal moves",
      "CLIENT-SIDE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Resource and file handling",
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
        "block": "CLIENT-SIDE.md#DOM clobbering",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#`postMessage` origin and source trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-site WebSocket request use",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker registration and scope takeover",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Service-worker cache and identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Cross-context storage and broadcast confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#XS-Leaks and cross-origin state oracles",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLIENT-SIDE.md#Window and opener state disclosure",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-browser",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "browser"
  }
]
## Selected blocks verbatim
**Feature abuse and data leakage** (subagent_type: `general`)
Legitimate features used for unintended purposes. Look for bugs in the design, not only in the code:
- **Export/backup as exfiltration**: Can a low-privilege user trigger an export, snapshot, or backup that includes data above their access level? Can they export other users' data? Does the export include deleted/draft/private content? Revision history that was supposed to be pruned?
- **Import/restore as injection**: Can import overwrite existing data? Can it create records that bypass normal validation? Can it inject content into collections the user has no write access to? Does it respect the same permission model as the UI?
- **Search/filter/sort as oracle**: Can search queries reveal whether content exists that the user cannot directly access? Do filter parameters let users probe statuses, roles, or fields they should not know about? Does sorting by a hidden field reveal its values through result ordering?
- **Enumeration through side effects**: Do error messages differ between "does not exist" and "no access"? Do response times differ? Response sizes? HTTP status codes? Can you enumerate users through password reset, invite, or registration flows?
- **Preview/draft/staging leakage**: Are preview tokens scoped to one item or do they unlock broader access? Can draft content be discovered through search, RSS feeds, sitemaps, or API listing endpoints? Can cache headers cause a CDN to serve private content publicly?
- **Notification/webhook as SSRF**: Can a user set a notification URL, webhook URL, or callback URL that the server fetches? Is it validated against internal networks? What about after a redirect?

**Injection** (subagent_type: `general`)
Trace untrusted input from entry point to dangerous sink. What counts as a "dangerous sink" depends on the application:
- Web apps: SQL queries, HTML output, shell commands, template engines, file paths, HTTP redirects, deserialization
- Libraries: any function that processes caller-supplied data without validation — buffer operations, parsers, format strings
- CLI tools: shell command construction, file path handling, environment variable interpolation
- Services: query construction, message serialization, log injection, LDAP/XPATH queries
- Client-side (browser/JS): DOM XSS, prototype pollution, `postMessage`/origin trust, and other browser-side classes — covered by the [CLIENT-SIDE.md](CLIENT-SIDE.md) companion blocks when selected

Do not stop at the obvious direct paths. Look for indirect injection: data stored safely, then retrieved and used in a dangerous context by different code. Look for injection through field names, keys, headers, and metadata — not just values. Look for injection into secondary systems (logs, caches, search indexes, analytics).

**Browser-storage disclosure and stale authorization**
Tokens, private responses, draft data, or authorization decisions remain in `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, extension storage, or client state and become readable by another account or less-trusted same-origin component. Storage of a token alone is not a finding; require a realistic reader with less authority, or continued use after revocation/logout.

**Clickjacking**
A framed, state-changing action lacks effective `frame-ancestors`, `X-Frame-Options`, or equivalent UI isolation. Require the sensitive action and confirm it can complete in the framed state; missing headers on read-only content are hardening notes.

**Client-side navigation confusion**
A client source controls redirect or navigation without scheme and destination policy, including executable `javascript:` or `data:` destinations. Reverse tabnabbing applies only where code explicitly keeps `window.opener`, uses `window.open` without isolation, or supports a browser without implicit `noopener`.

## Core discipline (include in every agent prompt for this domain)

```
- A client-side candidate needs a controllable source and an executing or disclosing sink. Name both and show attacker-influenced data reaching the sink.
- The impact must reach a victim's session, another origin, or shared persistence. Self-injection and disclosure of the attacker's own data are not findings.
- Framework escaping, browser same-origin policy, CSP, COOP/CORP, service-worker scope, and modern noopener defaults are real controls. Verify them before assigning impact.
- Browser storage and caches are shared by origin and may outlive login state. Identify who writes, who reads, and which account, tenant, or worker lifecycle clears each record.
- Use `confirmed` only for complete source evidence plus bounded local browser tests. Use `needs_validation` when renderer, extension permission, deployed header, or browser-policy behavior is required but unavailable.
```

**Credentialed CORS trust**
The server reflects or weakly matches `Origin` while allowing credentials and returns sensitive responses. A bare wildcard with credentials is rejected by browsers; report only the actual reflected/allowed origin path and cross-origin data or mutation.

**DOM-based XSS**
Trace `location` fields, `document.referrer`, `window.name`, message data, storage, and browser-controlled document state into `innerHTML`, `outerHTML`, `document.write`, string-evaluating APIs, executable URLs, jQuery HTML APIs, or framework escape hatches. Interpolation escaped by the framework is not a finding.

**Prototype pollution and gadget chain**
An attacker-controlled key reaches a recursive write such as deep merge or path assignment and modifies prototype state. Then a reachable gadget consumes the polluted property to change authorization, execution, navigation, or rendering. `JSON.parse`, a shallow copy, or pollution without a gadget is not enough.

## Universal moves (apply across the above)

- Start from DOM, navigation, worker, message, and storage sinks, then trace backward to browser-only and server-controlled sources. Record the browser policy that should stop the path.
- Test account switch, logout, worker update, offline fallback, and stale-tab state with a local test origin and dummy accounts. Do not use production users, origins, or shared services.
- For XS-Leaks, list only predicates proved by source and local browser behavior. Then identify the response headers or rendering choice that would remove the oracle.

## Validation rules (apply before reporting ANY finding here)

1. Cite the source, sink, browser policy, affected origin/session, and observable mutation or disclosure.
2. For prototype pollution, prove the recursive write and a security-relevant gadget. For DOM clobbering, prove the markup survives and the shadowed value is used.
3. For service workers and storage, prove lifecycle reachability: an attacker-controlled write or cache entry must reach a different account, tenant, or later authorization state.
4. For messaging, CORS, WebSocket, and XS-Leaks, show exact origin/source validation and the protected state or action exposed. Confirm that CSP, COOP/CORP, cookies, and SameSite policy do not already block it.
5. Return `confirmed` findings only with a complete client path and bounded local evidence. Return `needs_validation` with the precise deployed header, extension permission, browser version, or renderer behavior an owner must verify.
## Exclusions
[
  {
    "block": "ATTACK-CLASSES.md#Access control",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "ATTACK-CLASSES.md#Resource and file handling",
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
    "block": "CLIENT-SIDE.md#DOM clobbering",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLIENT-SIDE.md#`postMessage` origin and source trust",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLIENT-SIDE.md#Cross-site WebSocket request use",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLIENT-SIDE.md#Service-worker registration and scope takeover",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLIENT-SIDE.md#Service-worker cache and identity confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLIENT-SIDE.md#Cross-context storage and broadcast confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLIENT-SIDE.md#XS-Leaks and cross-origin state oracles",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLIENT-SIDE.md#Window and opener state disclosure",
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
No prior findings. Other assignment groups are peer-owned: ai, auth, hsa, mcp, operations, outputs, release, requirements, specifications. Inspect shared helpers only as needed for your boundary; report unrelated gaps under uncovered.

## Assignment identity and execution
Agent ID: hunt-browser
Write only to /workspace/tmp/sec-audit/agents/hunt-browser/scratch. Retained artifacts path /workspace/tmp/sec-audit/agents/hunt-browser/artifacts is parent-owned and must not be written. Promotion allowlist: empty, all byte limits zero. NO target execution: namespace creation denied. No network or shared-service access. Source checks only, artifact:null. Read applicable repo instructions. No source edits or child agents.
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
