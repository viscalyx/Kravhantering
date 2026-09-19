Repository: /workspace. This is an authorized defensive repository audit. Read applicable AGENTS.md/repository instructions. Source-only review. NO target execution: bwrap namespace creation denied. No network, dependencies, shared services, credential reads, source edits or subagents. No runtime evidence has been established; do not claim an observed execution result. Review/refute the source claims and bounded validation handoff without developing executable exploits. You may write only /workspace/tmp/sec-audit/agents/validate-07/scratch. Parent owns artifacts; promotion allowlist empty; all byte limits zero.

## Architecture
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

## Record
{
  "fingerprint": "norm-reference-linked-requirements-nonpublic-projection",
  "title": "Taxonomy details may expose nonpublic library and specification-local requirement descriptions",
  "description": "An authenticated user without Reviewer/Admin role or authorship in a requirement area can request a linked norm reference or priority level and receive nonpublic library requirement descriptions. Norm reference detail returns all linked versions; priority detail returns the latest version matching that priority, even if it is Draft or Review. Normal requirement reads restrict these versions. Both taxonomy projections appear to cross the same content boundary. The priority-level endpoint also returns local requirement descriptions from specifications outside the caller's assignments, including retained historical bindings. Primary specification child APIs enforce assignment-scoped read authority.",
  "claimed_root_cause": "Taxonomy-detail GET handlers call linked-requirement queries without actor context. Norm-reference SQL filters only norm_reference_id; priority SQL selects the latest matching library version using only priority_level_id. Both project descriptions and return them without published-or-area-author filtering. The priority query's local-requirement UNION similarly filters only priority, without specification assignment or current-content filtering.",
  "trace": [
    {
      "kind": "entrypoint",
      "file": "app/api/norm-references/[id]/route.ts",
      "line": 58,
      "scope": "GET",
      "description": "Parses caller-selected norm-reference id; transport policy requires only a session."
    },
    {
      "kind": "propagation",
      "file": "lib/dal/norm-references.ts",
      "line": 249,
      "scope": "getLinkedRequirements",
      "description": "Joins links to all requirement_versions and returns description, version and status; sole predicate is norm-reference id."
    },
    {
      "kind": "sink",
      "file": "app/api/norm-references/[id]/route.ts",
      "line": 69,
      "scope": "GET response",
      "description": "Serializes linkedRequirements without per-requirement or version authorization."
    }
  ],
  "evidence": [
    {
      "file": "lib/http/route-security-policy.ts",
      "line": 674,
      "description": "Norm-reference detail GET has session/authenticated policy, not Reviewer or area-author policy."
    },
    {
      "file": "lib/requirements/assignment-authorization.ts",
      "line": 865,
      "description": "Explicit nonpublished version access requires history authority, which requires Reviewer or area authorship."
    },
    {
      "file": "lib/requirements/service-requirements.ts",
      "line": 705,
      "description": "Direct requirement reads authorize the actual requested version status."
    },
    {
      "file": "lib/dal/norm-references.ts",
      "line": 258,
      "description": "Description is projected for every linked version; WHERE at 273 lacks visibility predicates."
    },
    {
      "file": "lib/dal/requirement-packages.ts",
      "line": 471,
      "description": "Sibling package-linked descriptions explicitly require published status."
    },
    {
      "file": "app/api/priority-levels/[id]/route.ts",
      "line": 53,
      "description": "GET passes caller-selected priority id to getLinkedRequirements and directly serializes the result at line 54."
    },
    {
      "file": "lib/dal/priority-levels.ts",
      "line": 143,
      "description": "Library subquery projects description; its WHERE at 158 filters only priority id, and rowNumber=1 at 160 does not enforce publication/area authority."
    },
    {
      "file": "lib/http/route-security-policy.ts",
      "line": 719,
      "description": "Priority-level detail GET is session/authenticated only."
    },
    {
      "file": "lib/specifications/permissions.ts",
      "line": 47,
      "description": "Source-of-truth read policy limits specifications to Admin/Reviewer or responsible/co-author HSA assignments."
    },
    {
      "file": "app/api/requirements-specifications/[id]/local-requirements/[localRequirementId]/route.ts",
      "line": 78,
      "description": "Primary local detail API authorizes the actual specification child before reading its content."
    },
    {
      "file": "lib/requirements/assignment-authorization.ts",
      "line": 311,
      "description": "Child resolution rejects mismatched parents; author/read checks then require the owning specification assignment."
    },
    {
      "file": "lib/dal/priority-levels.ts",
      "line": 163,
      "description": "Alternate local projection uses no assignment or actor predicate and returns description directly."
    },
    {
      "file": "lib/http/route-security-policy.ts",
      "line": 717,
      "description": "The taxonomy GET transport policy is session-authenticated rather than administrative."
    },
    {
      "file": "lib/dal/requirements-specifications.ts",
      "line": 2288,
      "description": "Primary detail loads a current local requirement and binds both local requirement ID and specification ID; the alternate projection lacks these controls."
    }
  ],
  "blockers": [
    "Required OS-enforced execution sandbox is unavailable: parent bwrap --unshare-all probe failed with No permissions to create new namespace. No target code, HTTP route or SQL concurrency fixture was executed; the source-derived boundary result remains unobserved."
  ],
  "validation_plan": {
    "local": "In the required offline sandbox with disposable SQL fixtures, create area A with author Alice and unassigned authenticated Bob. Link one draft with unique dummy description to a norm reference. Establish Bob is denied that version by the direct requirement endpoint, then request GET /api/norm-references/{normId} as Bob and inspect only whether the dummy description is present. Repeat with one historical version if needed; stop on the first unauthorized dummy description. Assign the same dummy draft a priority level, call GET /api/priority-levels/{id} as Bob, and check its library-source linked entry against the direct-read denial. Validate the two projection variants independently. Specification-local variant: In an approved network-isolated sandbox, seed two dummy specifications with distinct HSA assignees and one local requirement carrying a harmless marker and shared priority. Call the priority-level GET as the unrelated ordinary assignee, then call the protected local detail route for the target. Observe whether the taxonomy response contains the marker while the direct route denies access. Include one retired binding to characterize historical exposure without asserting an erasure guarantee."
  },
  "verdict": "needs_validation"
}
## Linked source checks (deduplicated without omission)
{
  "units": [
    {
      "coverage_id": "app%2Fapi%2Frequirements%23REST%20workflows::lib%2Frequirements%2Fassignment-authorization.ts%23requirement%20authority::lib%2Frequirements::ATTACK-CLASSES.md%23Access%20control",
      "check_indices": [
        0
      ]
    },
    {
      "coverage_id": "app%2Fapi%2Frequirements%23REST%20workflows::lib%2Frequirements%2Fassignment-authorization.ts%23requirement%20authority::lib%2Frequirements::DATA-ISOLATION-AND-LIFECYCLE.md%23Policy%20and%20query%20disagreement",
      "check_indices": [
        1
      ]
    },
    {
      "coverage_id": "app%2Fapi%2Frequirements-specifications%23REST%20workflows::lib%2Fspecifications%2Fpermissions.ts%23specification%20authority::lib%2Fspecifications::ATTACK-CLASSES.md%23Access%20control",
      "check_indices": [
        2
      ]
    },
    {
      "coverage_id": "app%2Fapi%2Frequirements-specifications%23REST%20workflows::lib%2Fspecifications%2Fpermissions.ts%23specification%20authority::lib%2Fspecifications::DATA-ISOLATION-AND-LIFECYCLE.md%23Missing%20tenant%20or%20owner%20enforcement",
      "check_indices": [
        3
      ]
    },
    {
      "coverage_id": "app%2Fapi%2Frequirements-specifications%23REST%20workflows::lib%2Fspecifications%2Fpermissions.ts%23specification%20authority::lib%2Fspecifications::DATA-ISOLATION-AND-LIFECYCLE.md%23Policy%20and%20query%20disagreement",
      "check_indices": [
        4
      ]
    }
  ],
  "checks": [
    {
      "agent_id": "hunt-requirements",
      "reviewed_paths": [
        "app/api/norm-references/[id]/route.ts",
        "lib/dal/norm-references.ts",
        "lib/requirements/assignment-authorization.ts",
        "lib/requirements/service-requirements.ts",
        "lib/requirements/requirement-package-permissions.ts",
        "app/api/requirement-areas/[id]/route.ts",
        "app/api/requirement-selection-questions/_authorization.ts",
        "app/api/priority-levels/[id]/route.ts",
        "lib/dal/priority-levels.ts",
        "app/api/requirement-categories/route.ts",
        "app/api/requirement-types/route.ts",
        "app/api/quality-characteristics/route.ts"
      ],
      "invariant": "Nonpublic requirement content and lifecycle changes must require the current resource authority.",
      "method": "source",
      "result": "Direct reads require published status or Reviewer/area-author authority (assignment-authorization.ts:860-879; service-requirements.ts:705-749). Area mutation is manager-gated (requirement-areas route:113-130), package mutations resolve package-specific authority, and selection question/answer policy resolves database ownership. Norm detail bypasses content visibility (norm route:62-69; norm DAL:249-284). Transition authorization uses a pretransaction status snapshot (assignment-authorization.ts:908-924; service-requirements.ts:1264-1286). Same omission exists in priority-level detail: route:41-54 returns library descriptions from priority DAL:143-160 without status/area visibility. Category/type/quality GETs return taxonomy metadata only.",
      "artifact": null
    },
    {
      "agent_id": "hunt-requirements",
      "reviewed_paths": [
        "lib/requirements/list-query.ts",
        "lib/requirements/visibility.ts",
        "lib/requirements/assignment-authorization.ts",
        "lib/requirements/service-requirements.ts",
        "lib/dal/requirements-list-sql.mjs",
        "app/api/norm-references/[id]/route.ts",
        "lib/dal/norm-references.ts",
        "lib/dal/requirement-packages.ts",
        "app/api/priority-levels/[id]/route.ts",
        "lib/dal/priority-levels.ts",
        "app/api/requirement-categories/route.ts",
        "app/api/requirement-types/route.ts",
        "app/api/quality-characteristics/route.ts"
      ],
      "invariant": "All requirement-description projections must apply equivalent published-or-author visibility.",
      "method": "source",
      "result": "List service computes current actor visibility and cursor fingerprint server-side (list-query.ts:238-290); SQL enforces published/authorized area visibility (requirements-list-sql.mjs:62-70). Direct versions enforce actual status (service-requirements.ts:705-717), and package-linked descriptions filter Published (package DAL:471). Norm-linked descriptions omit both status and area predicates (norm DAL:255-274) and return directly (norm route:69). Same omission exists in priority-level detail: route:41-54 returns library descriptions from priority DAL:143-160 without status/area visibility. Category/type/quality GETs return taxonomy metadata only.",
      "artifact": null
    },
    {
      "agent_id": "hunt-specifications",
      "reviewed_paths": [
        "app/api/priority-levels/[id]/route.ts",
        "lib/dal/priority-levels.ts",
        "lib/http/route-security-policy.ts",
        "lib/specifications/permissions.ts",
        "app/api/requirements-specifications/[id]/local-requirements/[localRequirementId]/route.ts",
        "lib/requirements/assignment-authorization.ts",
        "app/api/requirements-specifications/schema.ts",
        "app/api/requirements-specifications/[id]/responsible/route.ts",
        "app/api/requirements-specifications/[id]/co-authors/route.ts"
      ],
      "invariant": "Specification-local content requires owning-specification read authority; assignment changes require manager authority.",
      "method": "source",
      "result": "Primary local reads resolve the child owner before authorizing (local route:78; assignment-authorization.ts:250-323). Update schemas exclude responsibleHsaId; dedicated assignment routes require managers. However priority-levels/[id]/route.ts:54 returns local descriptions through priority-levels.ts:163-175 without actor or specification filtering. Registry:717 requires only a session. This independently establishes the specification-local variant of the shared taxonomy-projection candidate.",
      "artifact": null
    },
    {
      "agent_id": "hunt-specifications",
      "reviewed_paths": [
        "app/api/priority-levels/[id]/route.ts",
        "lib/dal/priority-levels.ts",
        "lib/http/route-security-policy.ts",
        "lib/specifications/permissions.ts",
        "app/api/requirements-specifications/[id]/local-requirements/[localRequirementId]/route.ts",
        "lib/requirements/assignment-authorization.ts",
        "lib/requirements/service-specifications.ts",
        "lib/dal/requirements-specifications.ts",
        "lib/requirements/requirement-application-mutations.ts",
        "lib/specifications/agreement-selection.ts"
      ],
      "invariant": "Lists, child lookups and batch operations must remain within the authenticated actor's specification assignments.",
      "method": "source",
      "result": "service-specifications.ts:234 uses the actor-filtered catalog; requirements-specifications.ts:519 binds responsible/co-author HSA IDs. requirement-application-mutations.ts:105-149 rejects foreign children and repeats target resolution within mutations. agreement-selection.ts:20 binds selected agreement IDs to their parent. The alternate priority-level projection omits the same ownership predicate and returns descriptions from unassigned specifications, linked to the existing taxonomy-projection fingerprint.",
      "artifact": null
    },
    {
      "agent_id": "hunt-specifications",
      "reviewed_paths": [
        "app/api/priority-levels/[id]/route.ts",
        "lib/dal/priority-levels.ts",
        "lib/http/route-security-policy.ts",
        "lib/specifications/permissions.ts",
        "app/api/requirements-specifications/[id]/local-requirements/[localRequirementId]/route.ts",
        "lib/requirements/assignment-authorization.ts",
        "lib/dal/requirements-specifications.ts",
        "lib/specifications/agreements.ts",
        "lib/requirements/specification-item-page.ts",
        "lib/dal/specification-item-page.ts"
      ],
      "invariant": "Alternate projections must enforce the same specification visibility policy as direct reads and paginated queries.",
      "method": "source",
      "result": "permissions.ts:47 permits specification reads only for assignments, Admin or Reviewer. Direct child reads and agreement reads enforce that policy; paginated library/local branches bind specificationId. priority-levels.ts:163-175 instead joins raw local requirements to status metadata using only priority_level_id. Its authenticated GET accepts no actor context and returns those rows, creating a concrete policy/query disagreement under the consolidated taxonomy finding.",
      "artifact": null
    }
  ]
}
## Candidate verifier instructions
You did not write this candidate. Try to refute it from repository source and bounded
local evidence. Do not contact deployed endpoints or external/shared services. Run
target-controlled code only inside the approved OS-enforced sandbox: no external
network, empty allowlisted environment, read-only target and tools, scratch-only
writes, and explicit low resource and wall-clock limits. If any control is unavailable,
do not execute; retain the exact missing capability as a needs_validation blocker.
Treat every scratch entry as target-controlled after execution. After the sandbox and
all its processes terminate, only trusted parent-side code may promote a predeclared
scratch-relative file, following the promotion procedure block included verbatim in
this prompt. You and target code never write retained artifacts. If promotion is
unavailable or fails, do not use that file as evidence.

1. Verify every trace and evidence file, positive line number, scope, and description.
   Confirm the first entry is a real lower-trust entrypoint and the last is the
   claimed sink or boundary effect.
2. Reconstruct the strongest source-visible validation, identity, authorization,
   normalization, lifecycle, framework, and containment controls on the path.
   Where the architecture summary names a comparable baseline, note whether it
   shares the pattern — as calibration, never as grounds to dismiss.
3. For a proposed confirmed candidate, independently reproduce the minimum observed
   result when possible. Verify inputs, interface shape, conditions, and affected
   dummy principal/resource. Do not infer a stronger result or continue after it.
4. Verify that likelihood, impact, confidence, and the proposed source fix match only
   what the evidence establishes.
5. For a proposed needs_validation candidate, decide whether the blocker is genuinely
   outside source/local observation. If source refutes the trace, reject it. If the
   missing fact remains decisive, keep needs_validation and make the local and
   owner-observed plans exact and non-destructive.
6. Preserve the fingerprint for the same source-derived root cause across every state.

Return exactly one JSON object and no surrounding prose:
{"decision": "confirmed|needs_validation|rejected", "record": { ... }}
where record exactly matches the decision's verdict branch of the schema included
in this prompt. A corrected record replaces the hunter's wording.
## Relevant companion validation blocks
## Validation rules (apply before reporting ANY finding here)

1. Name attacker or lower-trust principal, protected data/state, affected owner/tenant, alternate copy or operation, and unauthorized disclosure or mutation.
2. Cite both intended source-of-truth policy and the path that omits or disagrees with it. Confirm another layer does not enforce the same tenant/lifecycle condition.
3. Use local dummy tenants and non-sensitive fixtures to prove cross-scope access or stale lifecycle behavior. Stop at the minimum observable record or operation.
4. If external cache, object storage, replicas, analytics, backup, or retention policy is required, classify `needs_validation` and state the owner-observed check.
5. Return `confirmed` only with complete lineage and concrete boundary impact. Return `needs_validation` with the exact unresolved storage, ACL, invalidation, retention, or restore fact.
## Promotion procedure
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
## Schema verbatim
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

No compatible prior-run records with this fingerprint exist. Save your exact JSON response to scratch/result.json and return that JSON with no prose. Do not read any other verifier output or final reports. Logical reviewer ID: validate-07