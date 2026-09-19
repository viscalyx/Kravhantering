Repository: /workspace. This is an authorized defensive repository audit. Read applicable AGENTS.md/repository instructions. Source-only review. NO target execution: bwrap namespace creation denied. No network, dependencies, shared services, credential reads, source edits or subagents. No runtime evidence has been established; do not claim an observed execution result. Review/refute the source claims and bounded validation handoff without developing executable exploits. You may write only /workspace/tmp/sec-audit/agents/validate-12/scratch. Parent owns artifacts; promotion allowlist empty; all byte limits zero.

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
  "fingerprint": "selection-visibility/recursive-condition-rows/duplicate-path-amplification",
  "title": "Visibility descendant queries can multiply equivalent dependency paths",
  "description": "An authenticated area author permitted to save visibility conditions can cause a small edit to traverse an existing valid acyclic question graph. Multiple allowed answer/group conditions between the same questions are separate SQL rows, and the descendant query carries their multiplicity through recursive UNION ALL before returning distinct question IDs. This creates a source-grounded hypothesis of disproportionate work in the shared application database compared with the distinct affected questions. The default 15-second SQL request timeout, driver cancellation, rollback and edge rate limits constrain the operation. No SQL execution, resource consumption, failure to cancel, or impact on another request was observed; this is not a demonstrated denial of service.",
  "claimed_root_cause": "The descendant relation traverses visibility-condition rows rather than unique question dependencies and has no visited-question set or intermediate deduplication. Its depth limit and final DISTINCT do not bound intermediate path multiplicity. Valid alternative answers/groups can represent equivalent parent-child edges, so cycle rejection and per-question input cardinality limits do not establish work proportional to the graph\u2019s distinct nodes or edges.",
  "trace": [
    {
      "kind": "entrypoint",
      "file": "app/api/requirement-selection-questions/[id]/visibility/route.ts",
      "line": 18,
      "scope": "PUT visibility edit",
      "description": "An authenticated owning-area author/Admin passes the mutation policy and supplies schema-bounded visibility groups for an existing question."
    },
    {
      "kind": "propagation",
      "file": "lib/dal/requirement-selection-questions.ts",
      "line": 2019,
      "scope": "replaceRequirementSelectionQuestionVisibilityGroups transaction",
      "description": "Checks the target, normalizes and validates the replacement, then stores each allowed answer condition as a separate row; no cycle is needed for this hypothesis."
    },
    {
      "kind": "propagation",
      "file": "lib/dal/requirement-selection-questions.ts",
      "line": 2078,
      "scope": "affected question discovery before history propagation",
      "description": "The same transaction calls listVisibilityAffectedQuestionIds even when its final result contains only a small number of distinct question identities."
    },
    {
      "kind": "sink",
      "file": "lib/dal/requirement-selection-questions.ts",
      "line": 1927,
      "scope": "recursive visibility_descendants query on shared SQL Server",
      "description": "The anchor includes every matching condition row; UNION ALL and the recursive join at :1944 preserve and extend duplicate dependency paths. Only :1948 deduplicates the result after traversal; the query runs on the shared application database connection."
    }
  ],
  "evidence": [
    {
      "file": "app/api/requirement-selection-questions/_schemas.ts",
      "line": 33,
      "description": "Finite request schema caps are 50 groups, 50 conditions per group and 200 answer IDs per condition. Multiple answers and groups are valid inputs, not malformed encodings."
    },
    {
      "file": "lib/requirements/assignment-authorization.ts",
      "line": 697,
      "description": "The strongest entry authorization resolves the real owning area and requires area authorship unless Admin; this is not anonymous or ordinary-reader access."
    },
    {
      "file": "lib/dal/requirement-selection-questions.ts",
      "line": 1797,
      "description": "Normalization uses a Set of answer IDs for each parent within a group. It does not collapse separate answers/groups into one stored parent-child dependency."
    },
    {
      "file": "typeorm/migrations/0027_requirement_selection_question_visibility.mjs",
      "line": 25,
      "description": "Uniqueness is on visibility_group_id, parent_question_id and answer_id. Foreign keys and parent/answer validation prevent invalid references but permit multiple valid rows for one question dependency."
    },
    {
      "file": "lib/dal/requirement-selection-questions.ts",
      "line": 1866,
      "description": "Cycle checking uses distinct parent sets and visited nodes; an acyclic graph can pass independently of condition-row multiplicity in the later SQL traversal."
    },
    {
      "file": "lib/dal/requirement-selection-questions.ts",
      "line": 1946,
      "description": "The recursive predicate limits depth to 100; final SELECT DISTINCT at :1948 does not express an intermediate cardinality or visited-question limit."
    },
    {
      "file": "lib/typeorm/sqlserver-config.ts",
      "line": 11,
      "description": "Default SQL request timeout is 15000 ms and is passed into DataSource options at :227; pool max defaults to 10. These controls constrain duration/concurrency and must be retained in validation."
    },
    {
      "file": "lib/db.ts",
      "line": 45,
      "description": "The application caches and reuses its DataSource rather than assigning a private database pool to each caller, establishing the shared resource whose actual impact needs measurement."
    },
    {
      "file": "node_modules/tedious/lib/connection.js",
      "line": 1321,
      "description": "Installed driver calls request.cancel on its request timeout. TypeORM EntityManager.js:86-98 attempts rollback and releases the query runner after errors; no indefinite retained connection is established."
    },
    {
      "file": "containers/production/nginx/templates/edge-rate.conf.template",
      "line": 12,
      "description": "Production ingress applies configured per-client API rate limiting; app-node-tls.conf.template:39 attaches the zone. Request rate limits do not themselves determine work within one admitted recursive query."
    },
    {
      "file": "tests/unit/requirement-selection-questions-dal.test.ts",
      "line": 668,
      "description": "The relevant test substitutes a precomputed descendant list when it sees the recursive query. It verifies affected-specification scoping, not SQL intermediate row growth or cancellation."
    }
  ],
  "blockers": [
    "The required OS-enforced sandbox is unavailable: the parent namespace probe failed with No permissions to create new namespace. No target code, SQL query, fixture or availability experiment was executed.",
    "The real SQL Server execution plan and actual intermediate-work growth for valid repeated dependency edges are unobserved. An optimizer transformation or effective workload governor may prevent the hypothesized disproportionate work.",
    "Meaningful impact beyond the editing user is not established. Effective request timeout/cancellation, SQL workload isolation, concurrent-reader behavior, memory/CPU allocation and deployment ingress controls require bounded local measurement and owner configuration evidence."
  ],
  "validation_plan": {
    "local": "In a future approved offline disposable SQL fixture, use only tiny acyclic graphs with a few questions and alternate valid answers/groups. Compare unique-edge and equivalent repeated-condition graphs with the same distinct descendants, exercising the real route/service validation and migrations. Inspect actual plan row counts or bounded work counters and rollback/cancellation behavior under strict CPU, memory, time and row limits. Stop after establishing or refuting growth; do not scale to saturation or attempt an outage. A benign second fixture request may establish whether the work crosses a shared-resource boundary within those strict bounds. Refute the availability hypothesis if effective controls prevent material shared effects.",
    "deployment": "The owner can inspect effective DB_REQUEST_TIMEOUT_MS, DB_POOL_MAX, SQL resource/workload isolation, runtime topology and nginx admission settings without generating traffic or exposing secrets. Source defaults alone do not establish deployed impact."
  },
  "verdict": "needs_validation"
}
## Linked source checks (deduplicated without omission)
{
  "units": [
    {
      "coverage_id": "app%2Fapi%2Frequirement-selection-questions%2F%5Bid%5D%2Fvisibility%2Froute.ts%23visibility%20dependency%20propagation::lib%2Fdal%2Frequirement-selection-questions.ts%23recursive%20descendant%20query%20and%20per-specification%20visibility%20recomputation::lib%2Frequirements%2Fselection-visibility::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Database%20and%20downstream%20query%20amplification",
      "check_indices": [
        0
      ]
    }
  ],
  "checks": [
    {
      "agent_id": "hunt-wave4-visibility",
      "reviewed_paths": [
        "app/api/requirement-selection-questions/[id]/visibility/route.ts",
        "app/api/requirement-selection-questions/_schemas.ts",
        "app/api/requirement-selection-questions/_authorization.ts",
        "lib/requirements/assignment-authorization.ts",
        "lib/dal/requirement-selection-questions.ts",
        "lib/http/secure-mutation-route.ts",
        "lib/http/validation.ts",
        "lib/db.ts",
        "lib/typeorm/data-source.ts",
        "lib/typeorm/sqlserver-config.ts",
        "typeorm/migrations/0027_requirement_selection_question_visibility.mjs",
        "docs/adr/0022-synlighetsvillkor-for-kravurvalsfragor.md",
        "containers/production/nginx/templates/edge-rate.conf.template",
        "containers/production/nginx/templates/app-node-tls.conf.template",
        "tests/unit/requirement-selection-questions-dal.test.ts",
        "node_modules/typeorm/entity-manager/EntityManager.js",
        "node_modules/typeorm/driver/sqlserver/SqlServerQueryRunner.js",
        "node_modules/mssql/lib/tedious/connection-pool.js",
        "node_modules/tedious/lib/connection.js"
      ],
      "invariant": "An authorized visibility edit should compute affected question identities without multiplying equivalent condition paths into disproportionate shared SQL work; timeouts and rollback must bound failure.",
      "method": "source",
      "result": "Route:18-35 and assignment-authorization.ts:697-702 require the owning area author/Admin. _schemas.ts:33-51 caps 50 groups, 50 conditions/group and 200 answers/condition. DAL:1767-1918 deduplicates answers within groups, binds parents and rejects cycles; migration0027:25 uniquely binds group/parent/answer, permitting several condition rows per graph edge. DAL:1927-1957 recursively UNION ALLs those rows and only then SELECT DISTINCTs question IDs; repeated answer/group edges therefore remain multiplicative in the recursive relation. The depth-100 predicate bounds depth, not intermediate multiplicity. DAL:1969-2008 limits subsequent updates to affected saved answers; per-specification recomputation is intentional under ADR0022 and computeVisibleQuestionIds:482 memoizes evaluation. Shared DataSource:lib/db.ts:45-85 uses SQL pool defaults 10 connections and 15-second request timeout (sqlserver-config.ts:6-11,216-229). Installed tedious connection.js:1321 cancels on timeout; EntityManager.js:86-98 rolls back/releases on error. Production nginx rate limits requests. These are real preventing/containment controls; no missing-timeout or indefinite-leak claim is made. Tests:668 mock the recursive query result. Actual SQL plan, bounded growth and unrelated-request impact remain unobserved, so the multiplicative-query hypothesis requires validation.",
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

1. Name untrusted input, requester work, service amplification or retained resource, shared blast radius, and recovery. Missing limits without concrete shared impact are hardening.
2. Confirm no source-visible upstream, parser, queue, tenant, or framework bound prevents the path. Unknown deployed controls require `needs_validation`.
3. For superlinear behavior, establish the accepted complexity and bounded local growth. For leaks, show repeatable retention after cleanup should occur. For fatal paths, identify process/supervisor isolation.
4. Prioritize by low requester work, unauthenticated reachability, cross-tenant scope, persistence, and poor recovery; do not validate with availability impact.
5. Return `confirmed` only with safe local proof and meaningful shared effect. Return `needs_validation` with the exact upstream limit, topology, quota, or recovery observation an owner must check.
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

No compatible prior-run records with this fingerprint exist. Save your exact JSON response to scratch/result.json and return that JSON with no prose. Do not read any other verifier output or final reports. Logical reviewer ID: validate-12