Repository: /workspace. This is an authorized defensive repository audit. Read applicable AGENTS.md/repository instructions. Source-only review. NO target execution: bwrap namespace creation denied. No network, dependencies, shared services, credential reads, source edits or subagents. No runtime evidence has been established; do not claim an observed execution result. Review/refute the source claims and bounded validation handoff without developing executable exploits. You may write only /workspace/tmp/sec-audit/agents/verify-14/scratch. Parent owns artifacts; promotion allowlist empty; all byte limits zero.

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
  "fingerprint": "specification-preload/authorization-error-partial-data-disclosure",
  "title": "Specification preload may disclose parent data when authorization fails with an internal error",
  "description": "A signed-in user without Admin, Reviewer or an assignment to another owner's specification can supply its numeric/code page selector. The preload obtains raw parent metadata, needs-reference descriptions and selected packages while a separate available-requirements service call performs read authorization. Healthy 401/403 denials discard these raw values. A selective assignment-query error, or a denial-audit failure converted to internal error, instead reaches the generic partial-data fallback and leaves those values in client initialData without a successful read decision. This requires successful route/parent and uncaught coauthor reads and successful reads of the claimed disclosed fields. Source review did not establish a rendered unauthorized response, user-controlled failure induction or deployment occurrence.",
  "claimed_root_cause": "The preload conflates non-401/403 failures before successful authorization with optional-resource failures after authorization. It has no separately established positive read decision before serializing raw parent-derived data, and the shared authorization helper can replace a real denial with an internal error when mandatory denial auditing fails.",
  "trace": [
    {
      "kind": "entrypoint",
      "file": "app/[locale]/specifications/[specificationId]/page.tsx",
      "line": 26,
      "scope": "Specification detail Server Component",
      "description": "The authenticated browser supplies a numeric/code specification selector; the page resolves it then calls the preload without its own assignment predicate."
    },
    {
      "kind": "propagation",
      "file": "lib/specifications/preload.ts",
      "line": 219,
      "scope": "Raw parent and parallel preload reads",
      "description": "getSpecificationById loads the parent before service authorization completes. The uncaught coauthor read at line 245 must also succeed. Needs references at line 290 and the package query at line 352 use direct database helpers without actor authorization."
    },
    {
      "kind": "propagation",
      "file": "lib/requirements/service-specifications.ts",
      "line": 342,
      "scope": "getAvailableSpecificationRequirements",
      "description": "The service authorizes first, so a successful call and recognized 401/403 are strong controls. Assignment lookup or denial-audit failures may instead reject with an internal/non-service error."
    },
    {
      "kind": "propagation",
      "file": "lib/specifications/preload.ts",
      "line": 374,
      "scope": "Authorization-dependent error handling",
      "description": "Recognized 401/403 discard raw data for a limited forbidden summary. Other errors at :398-407 replace only available requirements and retain previously loaded parent/needs/package data in :410-438."
    },
    {
      "kind": "sink",
      "file": "app/[locale]/specifications/[specificationId]/page.tsx",
      "line": 103,
      "scope": "Client component initialData serialization",
      "description": "After notFound/forbidden checks, initialData is passed directly to the use-client RequirementsSpecificationDetailClient. The source has no additional assignment admission at this boundary; actual serialized response behavior remains unexecuted."
    }
  ],
  "evidence": [
    {
      "file": "docs/governance/beh\u00f6righeter.md",
      "line": 163,
      "description": "Admin/Reviewer may read all specifications; other signed-in users may read only specifications where they are responsible or coauthors. A direct link does not grant access to an unassigned specification. The limited forbidden guidance is implemented separately in the page/preload, rather than specified in this policy passage."
    },
    {
      "file": "proxy.ts",
      "line": 328,
      "description": "The proxy enforces a valid signed-in cookie for the page. This is an authenticated assignment-boundary claim, not anonymous access."
    },
    {
      "file": "lib/requirements/server-component-context.ts",
      "line": 6,
      "description": "The Server Component context derives HSA identity and roles from the validated session, not caller-supplied identity headers."
    },
    {
      "file": "lib/requirements/assignment-authorization.ts",
      "line": 153,
      "description": "The parameterized isSpecificationAuthor query tests responsible/coauthor assignment. assertAuthorized requires authentication at line 676, allows Admin at line 704, routes specification reads at line 719, and requires Reviewer or successful author lookup at lines 828-845. An assignment-query exception is not a positive read decision."
    },
    {
      "file": "lib/requirements/service-shared.ts",
      "line": 197,
      "description": "authorize awaits denial auditing before rethrowing the original authorization error; it does not preserve a separate successful-decision token."
    },
    {
      "file": "lib/requirements/security-audit.ts",
      "line": 477,
      "description": "Required denial auditing catches audit errors and throws internalError at line 507, replacing the original forbidden error; errors.ts maps internal to HTTP 500. Non-service database errors bypass denial-audit classification at line 517 and propagate from authorize unchanged."
    },
    {
      "file": "lib/dal/requirements-specifications.ts",
      "line": 1654,
      "description": "The raw needs-reference helper returns text and description by specification_id only; it has no actor parameter. Parent metadata similarly comes from getSpecificationById :927."
    },
    {
      "file": "lib/specifications/permissions.ts",
      "line": 69,
      "description": "The computed permissions describe edit/manage/review/AI capabilities; they do not filter the preloaded data or prove canReadSpecification."
    },
    {
      "file": "lib/specifications/preload.ts",
      "line": 475,
      "description": "Sibling catalog preload uses listSpecificationsForActorCatalog with actor identity/canReadAll and an empty capture fallback. The comparable REST detail GET at app/api/requirements-specifications/[id]/route.ts:55 awaits authorization before returning content; its catch returns an error rather than the already-read parent."
    },
    {
      "file": "tests/unit/specifications-preload.test.ts",
      "line": 339,
      "description": "Source tests expect assignment guidance for mocked forbidden rejection and parent retention for generic resource failures at line 386. They mock the available-requirements service and do not exercise real assignment authorization plus a denial-audit failure. No tests were executed."
    },
    {
      "file": "lib/requirements/server.ts",
      "line": 37,
      "description": "Production preload runtime constructs the default authorization service; auth.ts:306 returns AssignmentBasedAuthorizationService, so the reviewed assignment and audit path is not merely an unused implementation."
    },
    {
      "file": "lib/requirements/specification-requirement-packages.ts",
      "line": 76,
      "description": "Package query normalizes limits/search/include IDs and binds cursors to specification/query, then loads rows and selected packages by specificationId without an actor or authorization call. These controls do not admit the reader."
    },
    {
      "file": "app/[locale]/specifications/[specificationId]/requirements-specification-detail-client.tsx",
      "line": 1,
      "description": "The sink target is explicitly a client component. It initializes specification state from initialData.spec at line 562 and needs-reference state from initialData.availableNeedsRefs at line 806; edit permissions do not redact those props."
    },
    {
      "file": "lib/specifications/preload.ts",
      "line": 445,
      "description": "Numeric selectors use the positive integer schema; code and ID resolution use parameterized DAL queries and the page redirects to the canonical numeric route. No successful assignment decision is established by resolution."
    }
  ],
  "blockers": [
    "The required OS-enforced sandbox is unavailable: the supplied capability probe reported No permissions to create new namespace. No target code, test, rendered response or failure fixture was executed.",
    "Decisive local evidence must show a selective assignment-query or required-denial-audit failure while route resolution, parent lookup, uncaught coauthor lookup and the claimed raw data reads succeed, then establish that the dummy private marker crosses the page/client serialization boundary. A total database outage, early uncaught coauthor error or healthy recognized 401/403 does not establish disclosure.",
    "Source does not establish an ordinary user's ability to induce the selective failure, its deployment frequency or an affected production response. The impact remains a conditional read of another assignment owner's specification metadata/needs/package selection, without demonstrated child-content or mutation impact."
  ],
  "validation_plan": {
    "local": "In a future approved offline OS sandbox with read-only target/tools, empty allowlisted environment, scratch-only writes and low time/resource limits, use dummy owner and unassigned authenticated actors without Admin/Reviewer and one dummy specification containing a unique non-sensitive needs-description marker. Keep route resolution, parent, coauthor and raw needs/package reads successful. Through the real default authorization path, first verify healthy negative assignment lookup returns a limited forbidden shell; then narrowly fail only its required denial-audit database write. Alternatively narrowly fail its assignment lookup. Invoke the preload/page boundary and inspect client-prop serialization for the one marker; do not merely mock getAvailableSpecificationRequirements to reject. Compare an authorized optional-resource failure and total database failure. Stop at the minimum dummy boundary result or refutation; no network, shared services or induced outage. Predeclare any required evidence artifact and trusted promotion limits before execution.",
    "deployment": "The owner may inspect existing sanitized telemetry for selective assignment-query or denial-audit errors and the deployed revision/framework response handling. Do not generate errors, send new audit traffic or inspect private specification contents. Establish whether parent/coauthor reads remained successful during any relevant failure; existing telemetry calibrates occurrence but does not substitute for the isolated dummy serialization fixture."
  },
  "verdict": "needs_validation"
}
## Final record verification
### Phase 5: Verify the final records with fresh eyes

Launch one fresh `research` verifier per final `confirmed` and `needs_validation` record, in parallel. This verifier checks the structured record, not the hunter write-up, and remains inside source/local boundaries.

In a `quick` run, Phase 3 and Phase 5 merge: the Phase 3 verifier also performs these record checks and returns the final schema-shaped record, so each candidate gets one fresh independent reviewer instead of two. Every other profile keeps the two passes separate. Never skip independent review of a `confirmed` record in any profile.

For `confirmed`, require it to check:

1. Every repository-relative trace/evidence path, line, scope, and described operation.
2. Real entry interface and exact local input shape.
3. Every condition, parser/policy step, source-visible preventing layer, and observed local result.
4. Affected principal/resource and demonstrated impact.
5. Severity separation: realistic likelihood, demonstrated impact, overall no greater than impact.
6. Remediation strategy and any `code_changes`, including whether the fix enforces the invariant without merely moving trust.

For `needs_validation`, require it to check:

1. The source path is real and supports only the `claimed_root_cause` stated.
2. Every listed blocker is decisive and not already answerable locally.
3. The candidate names a boundary and a possible concrete result rather than a generic concern.
4. At least one validation-plan field is present and exact. `local` uses a bounded fixture; `deployment` asks an owner to observe a configuration, identity, route, policy, or runtime fact. Do not invent a plan for an inapplicable context, and never send audit traffic to a deployment.
5. The fingerprint matches prior/current records for the same root cause.

Each verifier returns exactly one JSON object: `{"decision":"verified","fingerprint":"..."}` or `{"decision":"replace","reason":"...","record":{...}}`, with no surrounding prose. A replacement record must match its `confirmed`, `needs_validation`, or `rejected` schema branch. Treat a malformed or prose-wrapped Phase 5 result the same way as in Phase 3: discard it without repairing it and re-run with a fresh verifier when the budget permits.

Do not apply a Phase 5 replacement as final when it promotes a record to a stronger verdict, including any promotion to `confirmed`, or materially changes the root cause, trace, execution input or observed result, demonstrated impact, or severity. Give that complete replacement to a new independent verifier that did not hunt, perform Phase 3 validation, or propose the Phase 5 replacement. The new verifier rechecks the current source and independently reproduces any decisive local result under the execution boundary, then returns `verified` or another replacement. Apply a material replacement only after this fresh verification. If another material replacement results, repeat with a fresh verifier. If budget or independence is unavailable, remove the disputed record from `findings.json`, keep its ledger unit as an unresolved candidate, and set `run_status: "incomplete"` with an exact `incomplete_reason`. Non-material wording or repository-line corrections may be applied directly when they do not change meaning or evidence.

After every applied replacement, rerun both validators and update linked ledger decisions. If a final verifier identifies a separate root cause, assign a new fingerprint and send it through independent candidate validation before inclusion. Set `run_status: "complete"` only when every ledger candidate has an independent final disposition and every retained record passes Phase 5.

Do not verify only `confirmed` records. A misleading `needs_validation` handoff wastes owner time and can preserve a false premise.


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

No compatible prior-run records with this fingerprint exist. Save your exact JSON response to scratch/result.json and return that JSON with no prose. Do not read any other verifier output or final reports. Logical reviewer ID: verify-14