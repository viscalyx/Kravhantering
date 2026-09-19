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
    "coverage_id": "app%2Fapi%2Fai%23AI%20requests::lib%2Fai%2Frun-trust-boundary.ts%23provider%20and%20content%20authority::lib%2Fai::AI-AND-LLM.md%23Excessive%20agency%20and%20confused-deputy%20authority",
    "canonical_refs": {
      "surface": "app/api/ai#AI requests",
      "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
      "subsystem": "lib/ai",
      "attack_class": "AI-AND-LLM.md#Excessive agency and confused-deputy authority"
    },
    "surface": "app/api/ai#AI requests",
    "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
    "subsystem": "lib/ai",
    "attack_class": "Excessive agency and confused-deputy authority",
    "starting_paths": [
      "lib/ai",
      "app/api/ai",
      "app/api/admin/ai-connections",
      "app/api/admin/ai-settings",
      "app/api/admin/ai-run-profiles",
      "app/api/admin/ai-forensic-captures",
      "lib/dal/ai-connection-admin.ts",
      "scripts/ai-provider-secret-maintenance.mjs",
      "scripts/ai-provider-secret-restore-cli.mjs"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#Excessive agency and confused-deputy authority",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "AI-AND-LLM.md#Cross-session or cross-tenant context bleed",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Prompt role and provenance confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-argument injection into a downstream sink",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Action-confirmation and approval binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-schema and dispatcher disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Unbounded delegated action loops",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Sub-agent and MCP trust inheritance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP server and tool identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP metadata and schema as policy",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
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
    "agent_id": "hunt-ai",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ai"
  },
  {
    "coverage_id": "app%2Fapi%2Fai%23AI%20requests::lib%2Fai%2Frun-trust-boundary.ts%23provider%20and%20content%20authority::lib%2Fai::AI-AND-LLM.md%23Indirect%20injection%20through%20retrieved%20or%20ingested%20content",
    "canonical_refs": {
      "surface": "app/api/ai#AI requests",
      "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
      "subsystem": "lib/ai",
      "attack_class": "AI-AND-LLM.md#Indirect injection through retrieved or ingested content"
    },
    "surface": "app/api/ai#AI requests",
    "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
    "subsystem": "lib/ai",
    "attack_class": "Indirect injection through retrieved or ingested content",
    "starting_paths": [
      "lib/ai",
      "app/api/ai",
      "app/api/admin/ai-connections",
      "app/api/admin/ai-settings",
      "app/api/admin/ai-run-profiles",
      "app/api/admin/ai-forensic-captures",
      "lib/dal/ai-connection-admin.ts",
      "scripts/ai-provider-secret-maintenance.mjs",
      "scripts/ai-provider-secret-restore-cli.mjs"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#Indirect injection through retrieved or ingested content",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "AI-AND-LLM.md#Cross-session or cross-tenant context bleed",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Prompt role and provenance confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-argument injection into a downstream sink",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Action-confirmation and approval binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-schema and dispatcher disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Unbounded delegated action loops",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Sub-agent and MCP trust inheritance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP server and tool identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP metadata and schema as policy",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
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
    "agent_id": "hunt-ai",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ai"
  },
  {
    "coverage_id": "app%2Fapi%2Fai%23AI%20requests::lib%2Fai%2Frun-trust-boundary.ts%23provider%20and%20content%20authority::lib%2Fai::AI-AND-LLM.md%23Insecure%20output%20rendering",
    "canonical_refs": {
      "surface": "app/api/ai#AI requests",
      "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
      "subsystem": "lib/ai",
      "attack_class": "AI-AND-LLM.md#Insecure output rendering"
    },
    "surface": "app/api/ai#AI requests",
    "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
    "subsystem": "lib/ai",
    "attack_class": "Insecure output rendering",
    "starting_paths": [
      "lib/ai",
      "app/api/ai",
      "app/api/admin/ai-connections",
      "app/api/admin/ai-settings",
      "app/api/admin/ai-run-profiles",
      "app/api/admin/ai-forensic-captures",
      "lib/dal/ai-connection-admin.ts",
      "scripts/ai-provider-secret-maintenance.mjs",
      "scripts/ai-provider-secret-restore-cli.mjs"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#Insecure output rendering",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "AI-AND-LLM.md#Cross-session or cross-tenant context bleed",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Prompt role and provenance confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-argument injection into a downstream sink",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Action-confirmation and approval binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-schema and dispatcher disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Unbounded delegated action loops",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Sub-agent and MCP trust inheritance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP server and tool identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP metadata and schema as policy",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
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
    "agent_id": "hunt-ai",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ai"
  },
  {
    "coverage_id": "app%2Fapi%2Fai%23AI%20requests::lib%2Fai%2Frun-trust-boundary.ts%23provider%20and%20content%20authority::lib%2Fai::AI-AND-LLM.md%23Sensitive%20context%20extraction",
    "canonical_refs": {
      "surface": "app/api/ai#AI requests",
      "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
      "subsystem": "lib/ai",
      "attack_class": "AI-AND-LLM.md#Sensitive context extraction"
    },
    "surface": "app/api/ai#AI requests",
    "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
    "subsystem": "lib/ai",
    "attack_class": "Sensitive context extraction",
    "starting_paths": [
      "lib/ai",
      "app/api/ai",
      "app/api/admin/ai-connections",
      "app/api/admin/ai-settings",
      "app/api/admin/ai-run-profiles",
      "app/api/admin/ai-forensic-captures",
      "lib/dal/ai-connection-admin.ts",
      "scripts/ai-provider-secret-maintenance.mjs",
      "scripts/ai-provider-secret-restore-cli.mjs"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#Sensitive context extraction",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "AI-AND-LLM.md#Cross-session or cross-tenant context bleed",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Prompt role and provenance confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-argument injection into a downstream sink",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Action-confirmation and approval binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-schema and dispatcher disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Unbounded delegated action loops",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Sub-agent and MCP trust inheritance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP server and tool identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP metadata and schema as policy",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
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
    "agent_id": "hunt-ai",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ai"
  },
  {
    "coverage_id": "app%2Fapi%2Fai%23AI%20requests::lib%2Fai%2Frun-trust-boundary.ts%23provider%20and%20content%20authority::lib%2Fai::ATTACK-CLASSES.md%23Business%20logic",
    "canonical_refs": {
      "surface": "app/api/ai#AI requests",
      "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
      "subsystem": "lib/ai",
      "attack_class": "ATTACK-CLASSES.md#Business logic"
    },
    "surface": "app/api/ai#AI requests",
    "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
    "subsystem": "lib/ai",
    "attack_class": "Business logic",
    "starting_paths": [
      "lib/ai",
      "app/api/ai",
      "app/api/admin/ai-connections",
      "app/api/admin/ai-settings",
      "app/api/admin/ai-run-profiles",
      "app/api/admin/ai-forensic-captures",
      "lib/dal/ai-connection-admin.ts",
      "scripts/ai-provider-secret-maintenance.mjs",
      "scripts/ai-provider-secret-restore-cli.mjs"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "AI-AND-LLM.md#Cross-session or cross-tenant context bleed",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Prompt role and provenance confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-argument injection into a downstream sink",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Action-confirmation and approval binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-schema and dispatcher disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Unbounded delegated action loops",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Sub-agent and MCP trust inheritance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP server and tool identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP metadata and schema as policy",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
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
    "agent_id": "hunt-ai",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ai"
  },
  {
    "coverage_id": "app%2Fapi%2Fai%23AI%20requests::lib%2Fai%2Frun-trust-boundary.ts%23provider%20and%20content%20authority::lib%2Fai::ATTACK-CLASSES.md%23Cryptography%20and%20secrets",
    "canonical_refs": {
      "surface": "app/api/ai#AI requests",
      "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
      "subsystem": "lib/ai",
      "attack_class": "ATTACK-CLASSES.md#Cryptography and secrets"
    },
    "surface": "app/api/ai#AI requests",
    "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
    "subsystem": "lib/ai",
    "attack_class": "Cryptography and secrets",
    "starting_paths": [
      "lib/ai",
      "app/api/ai",
      "app/api/admin/ai-connections",
      "app/api/admin/ai-settings",
      "app/api/admin/ai-run-profiles",
      "app/api/admin/ai-forensic-captures",
      "lib/dal/ai-connection-admin.ts",
      "scripts/ai-provider-secret-maintenance.mjs",
      "scripts/ai-provider-secret-restore-cli.mjs"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Cryptography and secrets",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "AI-AND-LLM.md#Cross-session or cross-tenant context bleed",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Prompt role and provenance confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-argument injection into a downstream sink",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Action-confirmation and approval binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-schema and dispatcher disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Unbounded delegated action loops",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Sub-agent and MCP trust inheritance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP server and tool identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP metadata and schema as policy",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
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
    "agent_id": "hunt-ai",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ai"
  },
  {
    "coverage_id": "app%2Fapi%2Fai%23AI%20requests::lib%2Fai%2Frun-trust-boundary.ts%23provider%20and%20content%20authority::lib%2Fai::ATTACK-CLASSES.md%23Resource%20and%20file%20handling",
    "canonical_refs": {
      "surface": "app/api/ai#AI requests",
      "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
      "subsystem": "lib/ai",
      "attack_class": "ATTACK-CLASSES.md#Resource and file handling"
    },
    "surface": "app/api/ai#AI requests",
    "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
    "subsystem": "lib/ai",
    "attack_class": "Resource and file handling",
    "starting_paths": [
      "lib/ai",
      "app/api/ai",
      "app/api/admin/ai-connections",
      "app/api/admin/ai-settings",
      "app/api/admin/ai-run-profiles",
      "app/api/admin/ai-forensic-captures",
      "lib/dal/ai-connection-admin.ts",
      "scripts/ai-provider-secret-maintenance.mjs",
      "scripts/ai-provider-secret-restore-cli.mjs"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Resource and file handling",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "AI-AND-LLM.md#Cross-session or cross-tenant context bleed",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Prompt role and provenance confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-argument injection into a downstream sink",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Action-confirmation and approval binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-schema and dispatcher disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Unbounded delegated action loops",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Sub-agent and MCP trust inheritance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP server and tool identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP metadata and schema as policy",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
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
    "agent_id": "hunt-ai",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ai"
  },
  {
    "coverage_id": "app%2Fapi%2Fai%23AI%20requests::lib%2Fai%2Frun-trust-boundary.ts%23provider%20and%20content%20authority::lib%2Fai::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Detached%20work%20after%20cancellation",
    "canonical_refs": {
      "surface": "app/api/ai#AI requests",
      "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
      "subsystem": "lib/ai",
      "attack_class": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation"
    },
    "surface": "app/api/ai#AI requests",
    "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
    "subsystem": "lib/ai",
    "attack_class": "Detached work after cancellation",
    "starting_paths": [
      "lib/ai",
      "app/api/ai",
      "app/api/admin/ai-connections",
      "app/api/admin/ai-settings",
      "app/api/admin/ai-run-profiles",
      "app/api/admin/ai-forensic-captures",
      "lib/dal/ai-connection-admin.ts",
      "scripts/ai-provider-secret-maintenance.mjs",
      "scripts/ai-provider-secret-restore-cli.mjs"
    ],
    "ordinary_attack_class_block": null,
    "selected_companion_blocks": [
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Core discipline",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Universal moves",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "AI-AND-LLM.md#Cross-session or cross-tenant context bleed",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Prompt role and provenance confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-argument injection into a downstream sink",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Action-confirmation and approval binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-schema and dispatcher disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Unbounded delegated action loops",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Sub-agent and MCP trust inheritance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP server and tool identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP metadata and schema as policy",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
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
    "agent_id": "hunt-ai",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ai"
  },
  {
    "coverage_id": "app%2Fapi%2Fai%23AI%20requests::lib%2Fai%2Frun-trust-boundary.ts%23provider%20and%20content%20authority::lib%2Fai::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Quota-accounting%20scope%20and%20reset%20gaps",
    "canonical_refs": {
      "surface": "app/api/ai#AI requests",
      "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
      "subsystem": "lib/ai",
      "attack_class": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Quota-accounting scope and reset gaps"
    },
    "surface": "app/api/ai#AI requests",
    "boundary": "lib/ai/run-trust-boundary.ts#provider and content authority",
    "subsystem": "lib/ai",
    "attack_class": "Quota-accounting scope and reset gaps",
    "starting_paths": [
      "lib/ai",
      "app/api/ai",
      "app/api/admin/ai-connections",
      "app/api/admin/ai-settings",
      "app/api/admin/ai-run-profiles",
      "app/api/admin/ai-forensic-captures",
      "lib/dal/ai-connection-admin.ts",
      "scripts/ai-provider-secret-maintenance.mjs",
      "scripts/ai-provider-secret-restore-cli.mjs"
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
        "block": "ATTACK-CLASSES.md#Access control",
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
        "block": "AI-AND-LLM.md#Cross-session or cross-tenant context bleed",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Prompt role and provenance confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-argument injection into a downstream sink",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Action-confirmation and approval binding",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Tool-schema and dispatcher disagreement",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Unbounded delegated action loops",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#Sub-agent and MCP trust inheritance",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP server and tool identity confusion",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "AI-AND-LLM.md#MCP metadata and schema as policy",
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
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
        "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
      },
      {
        "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
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
    "agent_id": "hunt-ai",
    "reviewed_paths": [],
    "local_checks": [],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ai"
  }
]
## Selected blocks verbatim
## Core discipline (include in every agent prompt for this domain)

```
- Prompt injection alone is not a finding. Require a code-level boundary failure: content reaches another principal's context, invokes authority the requester lacks, discloses data they cannot read, or drives a sink they cannot reach directly.
- Model output, memory, tool descriptions, and MCP responses are untrusted inputs. Point to the code that grants authority, trusts output, writes durable state, or feeds a sink.
- A guardrail prompt is not a security boundary. Count only deterministic checks, resource-scoped authorization, isolation, binding, and constrained credentials.
- State the attacker, affected principal, effective execution identity, resource, exact action, authority used, and observable impact. An intentional direct request to use the requester's existing authority is not a delegation defect merely because a model executes it.
- Authorization and action binding are separate controls. Attacker-controlled content that causes an action under an affected principal's valid authority is an action-binding failure when that principal did not intentionally request or approve the exact action.
- Classify every candidate as `confirmed` only after source evidence and bounded local validation establish the boundary and result. Use `needs_validation` when a required provider, deployment, model, renderer, or identity behavior is not observable locally.
```

**Excessive agency and confused-deputy authority**
The agent uses a service identity or broad credential, while the tool handler does not re-check the requesting principal's permission on the named resource. Verify both the effective identity and whether the caller could perform that exact operation through the normal product interface. A shared credential with enforced per-user query scope is not a defect.

**Indirect injection through retrieved or ingested content**
An attacker can write a RAG document, indexed page, file, email, issue body, tool response, or metadata that enters a different principal's model context. Trace who can write each source, how retrieval scopes it, whose session consumes it, and what capability is enabled there. Check isolation, resource authorization, and binding to the consuming principal's intent separately. The defect is a missing deterministic control, not persuasive text by itself.

**Insecure output rendering**
Model output reaches an executing HTML, Markdown, template, URL, or command sink without the sink's required encoding and policy. For browser rendering, verify auto-loaded resources and CSP or sanitization in `CLIENT-SIDE.md`; renderer behavior outside the repository makes the candidate `needs_validation`.

**Sensitive context extraction**
The assembled context contains credentials, another user's data, private source, or policy values that themselves grant access, and user-influenced output exposes them. Read prompt assembly and data-fetch code. Disclosure of generic instructions or behavior that does not cross a data boundary is not a finding.

## Universal moves (apply across the above)

- Draw four maps first: each execution identity, each capability, every writable context or memory source, and each output destination. Then connect the principal at the start to the authority at the end.
- Start at side-effecting tools and work backward through dispatcher, schema, confirmation, model context, retrieval, and ingestion. Start at durable memory reads and trace every writer.
- Compare direct, queued, retry, resume, batch, and delegated paths for the same action. The strongest gate must apply after arguments are final and before every side effect.

## Validation rules (apply before reporting ANY finding here)

1. Name the crossed boundary and observable result: attacker, affected principal or shared resource, execution identity, target, and unauthorized or unrequested action or disclosure.
2. For confused-deputy authority claims, prove the tool lacks requester-and-resource authorization and that the attacker cannot perform the same action normally. For action-binding claims, instead prove attacker-controlled content caused an action under the affected principal's authority that the principal did not intentionally request or approve. Valid generic authorization does not establish that intent.
3. For memory or retrieval claims, cite both the attacker-controlled write and the later cross-principal read or privileged decision. A shared record without a reachable consumer is not enough.
4. For action binding, establish the intentional request or normalized approved object, if any, and compare it with the object the handler uses. Confirm a locally observable unrequested action, mutation, duplicate, or authority change without extending the test into harmful execution. For schema disagreement, compare the normalized validated object with the handler's object.
5. For MCP identity claims, verify the authenticated connection, request correlation, tool namespace, and effective credential. Mark `needs_validation` if external server identity or deployment routing is required.
6. Return `confirmed` findings only with a complete source trace and meaningful result. Return `needs_validation` for a specific unresolved boundary fact and state the bounded local or owner-observed check needed to resolve it.

**Business logic** (subagent_type: `general`)
Hunt logic errors by hand: standard scanners cannot find them, and they yield high-impact findings. For each major workflow:
- **State machine violations**: Can you skip steps? Go backwards? Reach an invalid state? What happens if you replay a completed flow? What about partial failure — if step 2 of 3 fails, is step 1 rolled back?
- **Race conditions with business impact**: Concurrent operations that produce invalid states (double-spend, double-approve, lost updates). Focus on operations that check-then-act non-atomically.
- **Numeric/quantity manipulation**: Negative values, zero values, overflow, precision loss, type coercion between string and number.
- **Access boundary violations**: Not "does the permission check exist" but "is it the right check for the business rule?" Can input to one operation bypass a restriction enforced on a different operation for the same effect?
- **Implicit trust assumptions**: Data from storage, config, other components, or plugins assumed safe because "we validated it on the way in." What if a different code path wrote it?
- **Time-based logic**: Expiry checks, scheduling, rate windows, clock skew. What happens at exact boundary moments? What about timezone differences between components?
- **Default and fallback behavior**: What is the security posture when config is missing? When a feature flag is off? When a dependency is unavailable? When the system is mid-migration?

**Cryptography and secrets** (subagent_type: `general`)
- Weak randomness for security-critical values (tokens, keys, nonces)
- Hardcoded secrets, secrets in logs, error messages, URLs, or client-visible responses
- Broken key derivation, missing HMAC verification, nonce reuse
- Timing side-channels on secret comparison
- Misuse of crypto primitives (ECB mode, unauthenticated encryption, static IVs, etc.)
- What happens when crypto operations fail? Does the error path fall back to no-crypto?

**Resource and file handling** (subagent_type: `general`)
- Path traversal (reading/writing outside intended directories) — including through symlinks, encoded sequences, and null bytes
- SSRF (making the application fetch attacker-controlled URLs) — including through redirects, DNS rebinding, and URL parser differentials
- Unsafe deserialization, archive extraction (zip slip), temp file handling
- Memory safety (if applicable): buffer overflows, use-after-free, integer overflow
- Race conditions on file operations (TOCTOU between check and use)

## Core discipline (include in every agent prompt for this domain)

```
- Require an input-to-cost path, a missing effective bound, and impact on another user, shared service, safety function, or operator-owned spend. Self-limiting work in the requester's own process is not a service vulnerability.
- A missing rate limit is not enough. Check body/message/file caps, concurrency, queues, deadlines, database constraints, upstream gateways, and per-tenant quotas before calling a path unbounded.
- Do not run stress, saturation, or production tests. Use asymptotic analysis, small boundary fixtures, mocked paid calls, strict local resource limits, and deterministic cancellation tests.
- State attacker cost, service work, persistence, scope, and recovery. One bounded input with superlinear or persistent shared effect is materially different from sustained volume.
- Use `confirmed` for source-visible bounds failures demonstrated safely. Use `needs_validation` when upstream caps, deployed topology, autoscaling, paid quota, or recovery behavior is outside the repository.
```

**Detached work after cancellation**
Client timeout, disconnect, canceled job, or failed authorization returns control but leaves database, model, network, or worker work running. Trace cancellation and deadline propagation through every layer.

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
## Exclusions
[
  {
    "block": "ATTACK-CLASSES.md#Injection",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "ATTACK-CLASSES.md#Access control",
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
    "block": "AI-AND-LLM.md#Cross-session or cross-tenant context bleed",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "AI-AND-LLM.md#Persistent memory poisoning",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "AI-AND-LLM.md#Prompt role and provenance confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "AI-AND-LLM.md#Tool-argument injection into a downstream sink",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "AI-AND-LLM.md#Action-confirmation and approval binding",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "AI-AND-LLM.md#Tool-schema and dispatcher disagreement",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "AI-AND-LLM.md#Unbounded delegated action loops",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "AI-AND-LLM.md#Sub-agent and MCP trust inheritance",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "AI-AND-LLM.md#MCP server and tool identity confusion",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "AI-AND-LLM.md#MCP metadata and schema as policy",
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
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#File descriptor, handle, and temporary-resource leaks",
    "reason": "Outside this assignment boundary; source-wide review is split by subsystem. Return an uncovered entry if this class is reachable here."
  },
  {
    "block": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
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
No prior findings. Other assignment groups are peer-owned: auth, browser, hsa, mcp, operations, outputs, release, requirements, specifications. Inspect shared helpers only as needed for your boundary; report unrelated gaps under uncovered.

## Assignment identity and execution
Agent ID: hunt-ai
Write only to /workspace/tmp/sec-audit/agents/hunt-ai/scratch. Retained artifacts path /workspace/tmp/sec-audit/agents/hunt-ai/artifacts is parent-owned and must not be written. Promotion allowlist: empty, all byte limits zero. NO target execution: namespace creation denied. No network or shared-service access. Source checks only, artifact:null. Read applicable repo instructions. No source edits or child agents.
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
