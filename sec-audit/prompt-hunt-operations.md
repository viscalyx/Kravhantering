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
    "coverage_id": "containers%2Fproduction%2Fbin%23operator%20inputs::containers%2Fproduction%2Fbin%2Fkravhantering-quadlet.sh%23host%20authority::containers%2Fproduction::ATTACK-CLASSES.md%23Injection",
    "canonical_refs": {
      "surface": "containers/production/bin#operator inputs",
      "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
      "subsystem": "containers/production",
      "attack_class": "ATTACK-CLASSES.md#Injection"
    },
    "surface": "containers/production/bin#operator inputs",
    "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
    "subsystem": "containers/production",
    "attack_class": "Injection",
    "starting_paths": [
      "containers/production",
      "scripts/azure-dev.ps1",
      "scripts/azure-dev",
      "scripts/containers",
      "scripts/db-sqlserver-admin.mjs",
      "lib/typeorm",
      "typeorm",
      "lib/transient-cleanup",
      "containers/app/start-runtime.mjs",
      ".devcontainer",
      ".env.example",
      ".env.production"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Injection",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Workload identity overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Cross-account or cross-tenant role confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Application authorization delegated to cloud metadata",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Trusted-proxy and mesh identity bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Metadata and internal-service reachability",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Admission and policy path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Object and signed-URL policy confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Event-source identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Edge/runtime boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Custom-scheme and deep-link ambiguity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#App and account handoff confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#File-open and intent authority confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Navigation-origin to bridge confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Over-broad native bridge capabilities",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Webview file and universal access",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Claimed principal versus channel identity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Exported service, activity, receiver, or provider overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC lifecycle and correlation confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Install, update, and repair path trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Account switch, logout, and device restore leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Pending-action and user-presence confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-operations",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "operations"
  },
  {
    "coverage_id": "containers%2Fproduction%2Fbin%23operator%20inputs::containers%2Fproduction%2Fbin%2Fkravhantering-quadlet.sh%23host%20authority::containers%2Fproduction::ATTACK-CLASSES.md%23Obvious%20things",
    "canonical_refs": {
      "surface": "containers/production/bin#operator inputs",
      "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
      "subsystem": "containers/production",
      "attack_class": "ATTACK-CLASSES.md#Obvious things"
    },
    "surface": "containers/production/bin#operator inputs",
    "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
    "subsystem": "containers/production",
    "attack_class": "Obvious things",
    "starting_paths": [
      "containers/production",
      "scripts/azure-dev.ps1",
      "scripts/azure-dev",
      "scripts/containers",
      "scripts/db-sqlserver-admin.mjs",
      "lib/typeorm",
      "typeorm",
      "lib/transient-cleanup",
      "containers/app/start-runtime.mjs",
      ".devcontainer",
      ".env.example",
      ".env.production"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Obvious things",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Workload identity overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Cross-account or cross-tenant role confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Application authorization delegated to cloud metadata",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Trusted-proxy and mesh identity bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Metadata and internal-service reachability",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Admission and policy path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Object and signed-URL policy confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Event-source identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Edge/runtime boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Custom-scheme and deep-link ambiguity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#App and account handoff confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#File-open and intent authority confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Navigation-origin to bridge confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Over-broad native bridge capabilities",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Webview file and universal access",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Claimed principal versus channel identity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Exported service, activity, receiver, or provider overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC lifecycle and correlation confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Install, update, and repair path trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Account switch, logout, and device restore leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Pending-action and user-presence confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-operations",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "operations"
  },
  {
    "coverage_id": "containers%2Fproduction%2Fbin%23operator%20inputs::containers%2Fproduction%2Fbin%2Fkravhantering-quadlet.sh%23host%20authority::containers%2Fproduction::ATTACK-CLASSES.md%23Resource%20and%20file%20handling",
    "canonical_refs": {
      "surface": "containers/production/bin#operator inputs",
      "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
      "subsystem": "containers/production",
      "attack_class": "ATTACK-CLASSES.md#Resource and file handling"
    },
    "surface": "containers/production/bin#operator inputs",
    "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
    "subsystem": "containers/production",
    "attack_class": "Resource and file handling",
    "starting_paths": [
      "containers/production",
      "scripts/azure-dev.ps1",
      "scripts/azure-dev",
      "scripts/containers",
      "scripts/db-sqlserver-admin.mjs",
      "lib/typeorm",
      "typeorm",
      "lib/transient-cleanup",
      "containers/app/start-runtime.mjs",
      ".devcontainer",
      ".env.example",
      ".env.production"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Resource and file handling",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Workload identity overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Cross-account or cross-tenant role confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Application authorization delegated to cloud metadata",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Trusted-proxy and mesh identity bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Metadata and internal-service reachability",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Admission and policy path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Object and signed-URL policy confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Event-source identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Edge/runtime boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Custom-scheme and deep-link ambiguity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#App and account handoff confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#File-open and intent authority confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Navigation-origin to bridge confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Over-broad native bridge capabilities",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Webview file and universal access",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Claimed principal versus channel identity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Exported service, activity, receiver, or provider overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC lifecycle and correlation confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Install, update, and repair path trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Account switch, logout, and device restore leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Pending-action and user-presence confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-operations",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "operations"
  },
  {
    "coverage_id": "containers%2Fproduction%2Fbin%23operator%20inputs::containers%2Fproduction%2Fbin%2Fkravhantering-quadlet.sh%23host%20authority::containers%2Fproduction::CLOUD-AND-DEPLOYMENT.md%23Credential%20renewal%20and%20outage%20fallback",
    "canonical_refs": {
      "surface": "containers/production/bin#operator inputs",
      "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
      "subsystem": "containers/production",
      "attack_class": "CLOUD-AND-DEPLOYMENT.md#Credential renewal and outage fallback"
    },
    "surface": "containers/production/bin#operator inputs",
    "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
    "subsystem": "containers/production",
    "attack_class": "Credential renewal and outage fallback",
    "starting_paths": [
      "containers/production",
      "scripts/azure-dev.ps1",
      "scripts/azure-dev",
      "scripts/containers",
      "scripts/db-sqlserver-admin.mjs",
      "lib/typeorm",
      "typeorm",
      "lib/transient-cleanup",
      "containers/app/start-runtime.mjs",
      ".devcontainer",
      ".env.example",
      ".env.production"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Credential renewal and outage fallback",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Workload identity overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Cross-account or cross-tenant role confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Application authorization delegated to cloud metadata",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Trusted-proxy and mesh identity bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Metadata and internal-service reachability",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Admission and policy path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Object and signed-URL policy confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Event-source identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Edge/runtime boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Custom-scheme and deep-link ambiguity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#App and account handoff confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#File-open and intent authority confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Navigation-origin to bridge confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Over-broad native bridge capabilities",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Webview file and universal access",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Claimed principal versus channel identity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Exported service, activity, receiver, or provider overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC lifecycle and correlation confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Install, update, and repair path trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Account switch, logout, and device restore leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Pending-action and user-presence confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-operations",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "operations"
  },
  {
    "coverage_id": "containers%2Fproduction%2Fbin%23operator%20inputs::containers%2Fproduction%2Fbin%2Fkravhantering-quadlet.sh%23host%20authority::containers%2Fproduction::CLOUD-AND-DEPLOYMENT.md%23Host%20or%20control-plane%20capability%20exposure",
    "canonical_refs": {
      "surface": "containers/production/bin#operator inputs",
      "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
      "subsystem": "containers/production",
      "attack_class": "CLOUD-AND-DEPLOYMENT.md#Host or control-plane capability exposure"
    },
    "surface": "containers/production/bin#operator inputs",
    "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
    "subsystem": "containers/production",
    "attack_class": "Host or control-plane capability exposure",
    "starting_paths": [
      "containers/production",
      "scripts/azure-dev.ps1",
      "scripts/azure-dev",
      "scripts/containers",
      "scripts/db-sqlserver-admin.mjs",
      "lib/typeorm",
      "typeorm",
      "lib/transient-cleanup",
      "containers/app/start-runtime.mjs",
      ".devcontainer",
      ".env.example",
      ".env.production"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Host or control-plane capability exposure",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Workload identity overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Cross-account or cross-tenant role confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Application authorization delegated to cloud metadata",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Trusted-proxy and mesh identity bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Metadata and internal-service reachability",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Admission and policy path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Object and signed-URL policy confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Event-source identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Edge/runtime boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Custom-scheme and deep-link ambiguity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#App and account handoff confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#File-open and intent authority confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Navigation-origin to bridge confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Over-broad native bridge capabilities",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Webview file and universal access",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Claimed principal versus channel identity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Exported service, activity, receiver, or provider overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC lifecycle and correlation confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Install, update, and repair path trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Account switch, logout, and device restore leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Pending-action and user-presence confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-operations",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "operations"
  },
  {
    "coverage_id": "containers%2Fproduction%2Fbin%23operator%20inputs::containers%2Fproduction%2Fbin%2Fkravhantering-quadlet.sh%23host%20authority::containers%2Fproduction::CLOUD-AND-DEPLOYMENT.md%23Secret%20exposure%20across%20workload%20boundaries",
    "canonical_refs": {
      "surface": "containers/production/bin#operator inputs",
      "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
      "subsystem": "containers/production",
      "attack_class": "CLOUD-AND-DEPLOYMENT.md#Secret exposure across workload boundaries"
    },
    "surface": "containers/production/bin#operator inputs",
    "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
    "subsystem": "containers/production",
    "attack_class": "Secret exposure across workload boundaries",
    "starting_paths": [
      "containers/production",
      "scripts/azure-dev.ps1",
      "scripts/azure-dev",
      "scripts/containers",
      "scripts/db-sqlserver-admin.mjs",
      "lib/typeorm",
      "typeorm",
      "lib/transient-cleanup",
      "containers/app/start-runtime.mjs",
      ".devcontainer",
      ".env.example",
      ".env.production"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Secret exposure across workload boundaries",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Workload identity overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Cross-account or cross-tenant role confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Application authorization delegated to cloud metadata",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Trusted-proxy and mesh identity bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Metadata and internal-service reachability",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Admission and policy path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Object and signed-URL policy confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Event-source identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Edge/runtime boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Custom-scheme and deep-link ambiguity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#App and account handoff confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#File-open and intent authority confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Navigation-origin to bridge confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Over-broad native bridge capabilities",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Webview file and universal access",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Claimed principal versus channel identity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Exported service, activity, receiver, or provider overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC lifecycle and correlation confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Install, update, and repair path trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Account switch, logout, and device restore leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Pending-action and user-presence confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-operations",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "operations"
  },
  {
    "coverage_id": "containers%2Fproduction%2Fbin%23operator%20inputs::containers%2Fproduction%2Fbin%2Fkravhantering-quadlet.sh%23host%20authority::containers%2Fproduction::CLOUD-AND-DEPLOYMENT.md%23Security-control%20precedence%20drift",
    "canonical_refs": {
      "surface": "containers/production/bin#operator inputs",
      "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
      "subsystem": "containers/production",
      "attack_class": "CLOUD-AND-DEPLOYMENT.md#Security-control precedence drift"
    },
    "surface": "containers/production/bin#operator inputs",
    "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
    "subsystem": "containers/production",
    "attack_class": "Security-control precedence drift",
    "starting_paths": [
      "containers/production",
      "scripts/azure-dev.ps1",
      "scripts/azure-dev",
      "scripts/containers",
      "scripts/db-sqlserver-admin.mjs",
      "lib/typeorm",
      "typeorm",
      "lib/transient-cleanup",
      "containers/app/start-runtime.mjs",
      ".devcontainer",
      ".env.example",
      ".env.production"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Security-control precedence drift",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Workload identity overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Cross-account or cross-tenant role confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Application authorization delegated to cloud metadata",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Trusted-proxy and mesh identity bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Metadata and internal-service reachability",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Admission and policy path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Object and signed-URL policy confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Event-source identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Edge/runtime boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Custom-scheme and deep-link ambiguity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#App and account handoff confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#File-open and intent authority confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Navigation-origin to bridge confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Over-broad native bridge capabilities",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Webview file and universal access",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Claimed principal versus channel identity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Exported service, activity, receiver, or provider overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC lifecycle and correlation confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Install, update, and repair path trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Account switch, logout, and device restore leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Pending-action and user-presence confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-operations",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "operations"
  },
  {
    "coverage_id": "containers%2Fproduction%2Fbin%23operator%20inputs::containers%2Fproduction%2Fbin%2Fkravhantering-quadlet.sh%23host%20authority::containers%2Fproduction::CLOUD-AND-DEPLOYMENT.md%23Unexpected%20service%20or%20management-plane%20reachability",
    "canonical_refs": {
      "surface": "containers/production/bin#operator inputs",
      "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
      "subsystem": "containers/production",
      "attack_class": "CLOUD-AND-DEPLOYMENT.md#Unexpected service or management-plane reachability"
    },
    "surface": "containers/production/bin#operator inputs",
    "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
    "subsystem": "containers/production",
    "attack_class": "Unexpected service or management-plane reachability",
    "starting_paths": [
      "containers/production",
      "scripts/azure-dev.ps1",
      "scripts/azure-dev",
      "scripts/containers",
      "scripts/db-sqlserver-admin.mjs",
      "lib/typeorm",
      "typeorm",
      "lib/transient-cleanup",
      "containers/app/start-runtime.mjs",
      ".devcontainer",
      ".env.example",
      ".env.production"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Unexpected service or management-plane reachability",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Workload identity overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Cross-account or cross-tenant role confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Application authorization delegated to cloud metadata",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Trusted-proxy and mesh identity bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Metadata and internal-service reachability",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Admission and policy path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Object and signed-URL policy confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Event-source identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Edge/runtime boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Custom-scheme and deep-link ambiguity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#App and account handoff confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#File-open and intent authority confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Navigation-origin to bridge confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Over-broad native bridge capabilities",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Webview file and universal access",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Claimed principal versus channel identity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Exported service, activity, receiver, or provider overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC lifecycle and correlation confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Install, update, and repair path trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Account switch, logout, and device restore leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Pending-action and user-presence confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-operations",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "operations"
  },
  {
    "coverage_id": "containers%2Fproduction%2Fbin%23operator%20inputs::containers%2Fproduction%2Fbin%2Fkravhantering-quadlet.sh%23host%20authority::containers%2Fproduction::DESKTOP-MOBILE-AND-LOCAL-IPC.md%23Local%20file%20ownership%20and%20TOCTOU",
    "canonical_refs": {
      "surface": "containers/production/bin#operator inputs",
      "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
      "subsystem": "containers/production",
      "attack_class": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Local file ownership and TOCTOU"
    },
    "surface": "containers/production/bin#operator inputs",
    "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
    "subsystem": "containers/production",
    "attack_class": "Local file ownership and TOCTOU",
    "starting_paths": [
      "containers/production",
      "scripts/azure-dev.ps1",
      "scripts/azure-dev",
      "scripts/containers",
      "scripts/db-sqlserver-admin.mjs",
      "lib/typeorm",
      "typeorm",
      "lib/transient-cleanup",
      "containers/app/start-runtime.mjs",
      ".devcontainer",
      ".env.example",
      ".env.production"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Core discipline",
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Local file ownership and TOCTOU",
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Universal moves",
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Workload identity overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Cross-account or cross-tenant role confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Application authorization delegated to cloud metadata",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Trusted-proxy and mesh identity bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Metadata and internal-service reachability",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Admission and policy path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Object and signed-URL policy confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Event-source identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Edge/runtime boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Custom-scheme and deep-link ambiguity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#App and account handoff confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#File-open and intent authority confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Navigation-origin to bridge confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Over-broad native bridge capabilities",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Webview file and universal access",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Claimed principal versus channel identity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Exported service, activity, receiver, or provider overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC lifecycle and correlation confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Install, update, and repair path trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Account switch, logout, and device restore leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Pending-action and user-presence confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-operations",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "operations"
  },
  {
    "coverage_id": "containers%2Fproduction%2Fbin%23operator%20inputs::containers%2Fproduction%2Fbin%2Fkravhantering-quadlet.sh%23host%20authority::containers%2Fproduction::DESKTOP-MOBILE-AND-LOCAL-IPC.md%23Privileged%20helper%20as%20confused%20deputy",
    "canonical_refs": {
      "surface": "containers/production/bin#operator inputs",
      "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
      "subsystem": "containers/production",
      "attack_class": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Privileged helper as confused deputy"
    },
    "surface": "containers/production/bin#operator inputs",
    "boundary": "containers/production/bin/kravhantering-quadlet.sh#host authority",
    "subsystem": "containers/production",
    "attack_class": "Privileged helper as confused deputy",
    "starting_paths": [
      "containers/production",
      "scripts/azure-dev.ps1",
      "scripts/azure-dev",
      "scripts/containers",
      "scripts/db-sqlserver-admin.mjs",
      "lib/typeorm",
      "typeorm",
      "lib/transient-cleanup",
      "containers/app/start-runtime.mjs",
      ".devcontainer",
      ".env.example",
      ".env.production"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Core discipline",
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Privileged helper as confused deputy",
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Universal moves",
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "ATTACK-CLASSES.md#Important",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Workload identity overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Cross-account or cross-tenant role confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Application authorization delegated to cloud metadata",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Trusted-proxy and mesh identity bypass",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Metadata and internal-service reachability",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Admission and policy path inconsistency",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Object and signed-URL policy confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Event-source identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "CLOUD-AND-DEPLOYMENT.md#Edge/runtime boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Custom-scheme and deep-link ambiguity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#App and account handoff confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#File-open and intent authority confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Navigation-origin to bridge confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Over-broad native bridge capabilities",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Webview file and universal access",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Claimed principal versus channel identity",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Exported service, activity, receiver, or provider overreach",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC lifecycle and correlation confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Install, update, and repair path trust",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Account switch, logout, and device restore leakage",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Pending-action and user-presence confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "in_progress",
    "agent_id": "hunt-operations",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "operations"
  }
]
## Selected blocks verbatim
**Injection** (subagent_type: `general`)
Trace untrusted input from entry point to dangerous sink. What counts as a "dangerous sink" depends on the application:
- Web apps: SQL queries, HTML output, shell commands, template engines, file paths, HTTP redirects, deserialization
- Libraries: any function that processes caller-supplied data without validation — buffer operations, parsers, format strings
- CLI tools: shell command construction, file path handling, environment variable interpolation
- Services: query construction, message serialization, log injection, LDAP/XPATH queries
- Client-side (browser/JS): DOM XSS, prototype pollution, `postMessage`/origin trust, and other browser-side classes — covered by the [CLIENT-SIDE.md](CLIENT-SIDE.md) companion blocks when selected

Do not stop at the obvious direct paths. Look for indirect injection: data stored safely, then retrieved and used in a dangerous context by different code. Look for injection through field names, keys, headers, and metadata — not just values. Look for injection into secondary systems (logs, caches, search indexes, analytics).

**Obvious things** (subagent_type: `general`)
Other agents hunt subtle bugs. This agent checks the basic exposures that are easy to overlook because everyone assumes someone else already checked them:
- Are there any hardcoded passwords, API keys, tokens, or secrets in the source? (grep for `password`, `secret`, `apikey`, `token`, `Bearer`, `-----BEGIN`, common default passwords)
- Are there any TODO/FIXME/HACK/XXX comments that reference security? (`TODO: add auth`, `FIXME: validate input`, `HACK: skip permission check`)
- Is debug mode / dev mode properly gated? Can it be enabled in production via environment variable, query parameter, or header?
- Are there test/example/seed credentials that work in production?
- Is there a `/debug`, `/admin`, `/test`, `/status`, `/health`, `/metrics`, `/env`, `/.env`, `/config` endpoint that is unprotected?
- Are there any `.env`, `.env.local`, `credentials.json`, `*.pem`, `*.key` files checked into the repo?
- Does the `.gitignore` actually cover secrets, uploads, and local config?
- Are dependencies pinned? Are there known CVEs in the dependency tree? (check lockfiles)
- Are there any `eval()`, `exec()`, `child_process`, `Function()`, `vm.runInContext`, `import()` with dynamic input?
- Are CORS headers set to `*` or overly permissive? Is `Access-Control-Allow-Credentials` combined with a wildcard origin?
- Are cookies missing `HttpOnly`, `Secure`, or `SameSite` attributes?
- Are there any open redirects? (parameters named `redirect`, `return`, `next`, `url`, `goto`, `continue` that feed into redirects without validation)
- Is TLS enforced? Are there any HTTP-only endpoints?
- Are error responses in production returning stack traces, internal paths, or SQL errors?

This agent does not need to be creative. It needs to be thorough and literal. Check every item. Report each result.

**Resource and file handling** (subagent_type: `general`)
- Path traversal (reading/writing outside intended directories) — including through symlinks, encoded sequences, and null bytes
- SSRF (making the application fetch attacker-controlled URLs) — including through redirects, DNS rebinding, and URL parser differentials
- Unsafe deserialization, archive extraction (zip slip), temp file handling
- Memory safety (if applicable): buffer overflows, use-after-free, integer overflow
- Race conditions on file operations (TOCTOU between check and use)

## Core discipline (include in every agent prompt for this domain)

```
- Do not infer a live exposure from a manifest alone. Establish which environment consumes it, what defaults or overlays modify it, and whether the source path is active.
- Map each workload's identity to specific operations and resources. Broad policy is a finding only when lower-trust input can reach an unauthorized action.
- Ingress, proxies, service mesh, metadata services, and admission policy are real boundaries, but only count a control when its configuration and attachment are visible.
- Secret references are not secret disclosure. Require a lower-trust reader, output, artifact, log path, or unsafe fallback.
- Use `confirmed` for active in-repo configurations and local rendering/policy validation. Use `needs_validation` for account policy, network attachment, runtime admission, hosted metadata, or drift that needs owner observation.
```

**Credential renewal and outage fallback**
Failure to mount, refresh, rotate, or revoke a workload credential causes stale credentials to remain active or an app to accept a less trusted identity mode. Review startup, readiness, reconnect, and cached-client behavior.

**Host or control-plane capability exposure**
A lower-trust workload can select privileged mode, capabilities, host namespaces, host paths, device mounts, container runtime sockets, or service-account tokens that cross into node/control-plane authority. Bare absence of seccomp or read-only filesystem is hardening unless a reachable operation crosses that boundary.

**Secret exposure across workload boundaries**
Secrets enter logs, crash reports, process arguments, shared environment, broad volumes, build outputs, service discovery, or read APIs accessible to another workload or tenant. Check secret type and authority; a public endpoint or key ID is not a credential.

**Security-control precedence drift**
Development values, chart defaults, environment variables, command-line flags, feature gates, sidecar injection, or per-region overlays disable authentication, transport security, tenant scoping, or audit policy in a deployed environment. Render the final configuration for each maintained deployment, not just the base file.

**Unexpected service or management-plane reachability**
An ingress, service, listener, security group, load-balancer annotation, port mapping, or server bind exposes an admin, debug, metrics, node, control-plane, or internal API to a lower-trust network. Missing network controls alone are `needs_validation`; a repository-controlled public route to a sensitive handler can be `confirmed`.

## Universal moves (apply across the above)

- Render every maintained environment and make a matrix of external port, workload identity, network peers, mounted secrets, and cloud resources. Differences require an owner or policy explanation.
- Follow a lower-trust request, object, label, or event into cloud policy. Show which workload credential performs the final operation and what condition should scope it.
- Diff normal deploy, migration, restore, node maintenance, failover, and local/emulator paths. Review behavior when mesh, admission, identity, secret, or policy service is unavailable.

## Validation rules (apply before reporting ANY finding here)

1. Establish the active source path and effective deployment object; otherwise use `needs_validation` and state which rendered manifest or owner-observed attachment is missing.
2. Name the lower-trust caller/workload, cloud or application identity, controllable selector, affected resource, and unauthorized operation or disclosure.
3. Verify provider and orchestrator defaults at the pinned version. Do not assume a public IP, reachable metadata service, permissive firewall, or absent admission attachment.
4. Local validation may render templates, evaluate policy, inspect container/user namespaces in an isolated fixture, or run an emulator with dummy identities. Do not probe live endpoints or alter shared cloud resources.
5. Return `confirmed` only with a complete active source trace and concrete boundary result. Return `needs_validation` with the exact deployed policy, identity attachment, overlay, network, or drift observation needed.

## Core discipline (include in every agent prompt for this domain)

```
- Establish the realistic local or remote-content attacker: another app, another OS user, a sandboxed child, an untrusted document, or a remote origin. Self-harm within the same account and authority is not a boundary violation.
- Paths, process names, bundle/package IDs, and claimed sender fields are not peer authentication. Use OS peer credentials, code identity, capability handles, or protected channel state.
- The native bridge or helper must authorize each operation and final resource after parsing. A trusted UI or broker does not make attacker-influenceable arguments trusted.
- OS sandbox, signing, entitlements, permissions, keychain ACLs, exported-component policy, and prompt behavior are real controls when pinned and visible.
- Use `confirmed` for source evidence plus bounded local/emulator tests. Use `needs_validation` when signing, manifest merge, OS version, device policy, installer ACL, or packaging is required but not observable.
```

**Local file ownership and TOCTOU**
The app checks a file/path then follows replacement, symlink, mount, or case/normalization changes during a privileged read/write. Use descriptor-relative operations and verify final ownership. Focus `MEMORY-SAFETY-AND-BINARY.md` on parsing after the file is opened.

**Privileged helper as confused deputy**
A low-privilege caller can select a privileged command, file, service, user, or system setting without per-operation authorization. Review sudo/polkit/UAC/XPC helper rules and ensure the helper independently validates normalized arguments.

## Universal moves (apply across the above)

- Enumerate every process, app component, local endpoint, URI scheme, file association, webview origin, and helper. Record OS identity, runtime privilege, caller, and callable operation.
- Read final packaging inputs: merged manifest, entitlements, installer rules, native-messaging registration, protocol handlers, and ACL creation. Source declarations can be overwritten downstream.
- Validate with dummy profiles and non-sensitive local fixtures on an isolated machine/emulator. Do not interact with other users' apps, credentials, or production services.

## Validation rules (apply before reporting ANY finding here)

1. Name the attacker starting capability, OS/app principal crossed, entry channel, accepted argument or state, and unauthorized operation or disclosure.
2. Confirm OS sandbox, peer credential, signing, entitlement, permission, user-consent, and installer controls that apply. Unknown packaging/runtime facts require `needs_validation`.
3. For webview bridges, cite both navigation/origin control and privileged native sink. For IPC, cite peer authentication and per-resource authorization. For helpers, verify final normalized destination.
4. Keep local tests bounded and use dummy content/accounts. Stop after proving the boundary result; do not extend proof into persistence or broader system modification.
5. Return `confirmed` only with a complete source and local evidence chain. Return `needs_validation` with the exact OS, manifest, signing, ACL, or device-lifecycle fact required.
## Exclusions
[
  {
    "block": "ATTACK-CLASSES.md#Access control",
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
    "block": "ATTACK-CLASSES.md#Important",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLOUD-AND-DEPLOYMENT.md#Workload identity overreach",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLOUD-AND-DEPLOYMENT.md#Cross-account or cross-tenant role confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLOUD-AND-DEPLOYMENT.md#Application authorization delegated to cloud metadata",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLOUD-AND-DEPLOYMENT.md#Trusted-proxy and mesh identity bypass",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLOUD-AND-DEPLOYMENT.md#Metadata and internal-service reachability",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLOUD-AND-DEPLOYMENT.md#Admission and policy path inconsistency",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLOUD-AND-DEPLOYMENT.md#Object and signed-URL policy confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLOUD-AND-DEPLOYMENT.md#Event-source identity confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "CLOUD-AND-DEPLOYMENT.md#Edge/runtime boundary mismatch",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Custom-scheme and deep-link ambiguity",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#App and account handoff confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#File-open and intent authority confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Navigation-origin to bridge confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Over-broad native bridge capabilities",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Webview file and universal access",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Claimed principal versus channel identity",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Exported service, activity, receiver, or provider overreach",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC lifecycle and correlation confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Install, update, and repair path trust",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Credential-store and local-secret boundary mismatch",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Account switch, logout, and device restore leakage",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Pending-action and user-presence confusion",
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
No prior findings. Other assignment groups are peer-owned: ai, auth, browser, hsa, mcp, outputs, release, requirements, specifications. Inspect shared helpers only as needed for your boundary; report unrelated gaps under uncovered.

## Assignment identity and execution
Agent ID: hunt-operations
Write only to /workspace/tmp/sec-audit/agents/hunt-operations/scratch. Retained artifacts path /workspace/tmp/sec-audit/agents/hunt-operations/artifacts is parent-owned and must not be written. Promotion allowlist: empty, all byte limits zero. NO target execution: namespace creation denied. No network or shared-service access. Source checks only, artifact:null. Read applicable repo instructions. No source edits or child agents.
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
