Repository: /workspace. This is an authorized defensive repository audit. Read applicable AGENTS.md/repository instructions. Source-only review. NO target execution: bwrap namespace creation denied. No network, dependencies, shared services, credential reads, source edits or subagents. No runtime evidence has been established; do not claim an observed execution result. Review/refute the source claims and bounded validation handoff without developing executable exploits. You may write only /workspace/tmp/sec-audit/agents/verify-09/scratch. Parent owns artifacts; promotion allowlist empty; all byte limits zero.

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
  "verdict": "needs_validation",
  "fingerprint": "requirement-delete-draft-status-check-write-race",
  "title": "Draft deletion may remove a version after it enters Review",
  "description": "An authenticated author assigned to the requirement area can request draft deletion and a permitted Draft-to-Review transition. Source permits deletion to read Draft, the transition to commit Review, and deletion to subsequently target the same version by id. If this schedule commits on SQL Server, it violates the explicit Draft-only deletion invariant and can remove the requirement when this was its sole version. Authentication, same-origin policy, assignment authorization and atomic audit/deletion do not themselves preserve the checked status through the delete. No execution or committed deletion of a Review version has been observed; the minimum validation is limited to Review, without claiming demonstrated removal of Published content.",
  "claimed_root_cause": "deleteDraftVersion opens a transaction without an explicit isolation override, reads getLatestVersionLite without lockForUpdate, checks the returned Draft status, then removes associations and deletes requirement_versions by id alone. The configured isolation is READ COMMITTED. There is no repeated lifecycle check or status/revision predicate at the delete. The nearby edit path explicitly uses SERIALIZABLE and UPDLOCK/HOLDLOCK, but those controls do not cover draft deletion.",
  "trace": [
    {
      "kind": "entrypoint",
      "file": "app/api/requirements/[id]/delete-draft/route.ts",
      "line": 50,
      "scope": "POST",
      "description": "Browser-callable mutation validates the requirement reference, applies manage_requirement/delete_draft authorization, and invokes the shared service at line 67."
    },
    {
      "kind": "propagation",
      "file": "lib/requirements/service-requirements.ts",
      "line": 805,
      "scope": "manageRequirement",
      "description": "Repeats shared operation authorization before resolving and mutating the requirement."
    },
    {
      "kind": "propagation",
      "file": "lib/requirements/service-requirements.ts",
      "line": 1111,
      "scope": "manageRequirement delete_draft branch",
      "description": "Calls deleteDraftVersion with an audit callback inside the deletion transaction; supplies no expected revision or lifecycle predicate."
    },
    {
      "kind": "propagation",
      "file": "lib/dal/requirements.ts",
      "line": 1140,
      "scope": "deleteDraftVersion",
      "description": "Reads latest version without the available update/hold lock option, then rejects unless the returned status is Draft."
    },
    {
      "kind": "sink",
      "file": "lib/dal/requirements.ts",
      "line": 1164,
      "scope": "deleteDraftVersion",
      "description": "Deletes the previously read version by id without requiring its status or revision still to match the checked Draft."
    }
  ],
  "evidence": [
    {
      "file": "lib/http/secure-mutation-route.ts",
      "line": 291,
      "description": "Wrapper requires authenticated context; lines 306-311 validate params and lines 343-357 authorize before invoking the handler."
    },
    {
      "file": "lib/http/route-security-policy.ts",
      "line": 1584,
      "description": "Delete-draft REST policy declares session authentication and same-origin CSRF protection. These protect request admission, not concurrent lifecycle consistency."
    },
    {
      "file": "lib/requirements/assignment-authorization.ts",
      "line": 901,
      "description": "Non-Admin delete_draft authorization resolves the requirement and requires area authorship; assertAreaAuthor at lines 848-856 binds the assignment to actor HSA-id. The global Admin bypass is at lines 704-705."
    },
    {
      "file": "lib/requirements/assignment-authorization.ts",
      "line": 908,
      "description": "Transition authorization allows an assigned area author to request Draft-to-Review; publishing, archiving and exits from Review require Reviewer. This does not authorize deletion of a Review version."
    },
    {
      "file": "typeorm/seed-required.mjs",
      "line": 441,
      "description": "Required transition seed permits Draft (1) to Review (2); the minimum validation does not depend on a publication decision."
    },
    {
      "file": "lib/dal/requirements.ts",
      "line": 704,
      "description": "getLatestVersionLite emits WITH (UPDLOCK, HOLDLOCK) only when explicitly requested. deleteDraftVersion does not request it."
    },
    {
      "file": "lib/typeorm/sqlserver-config.ts",
      "line": 201,
      "description": "DataSource uses DEFAULT_TRANSACTION_ISOLATION_LEVEL, defined as READ COMMITTED at line 12. deleteDraftVersion calls db.transaction without overriding it."
    },
    {
      "file": "lib/dal/requirements.ts",
      "line": 1141,
      "description": "Explicit invariant rejects non-Draft versions at the initial read; the later delete at line 1164 uses id equality only. Remaining-version counting can then cause deletion of the requirement at line 1188."
    },
    {
      "file": "lib/dal/requirements.ts",
      "line": 1328,
      "description": "transitionStatus updates status and revision_token on the current version id and then runs its audit callback. Its earlier current-status and configured-transition checks are at lines 1219-1244."
    },
    {
      "file": "lib/dal/requirements.ts",
      "line": 813,
      "description": "Comparable edit path uses SERIALIZABLE, a locked latest-version read and base-version/revision checks, establishing source-visible concurrency protection that is absent from deletion."
    },
    {
      "file": "typeorm/migrations/0003_explicit_fk_actions.mjs",
      "line": 82,
      "description": "Specification-item references to requirement_versions use ON DELETE NO ACTION, so referenced data can prevent deletion; validation must use an unreferenced disposable version."
    }
  ],
  "blockers": [
    "Required OS-enforced execution sandbox is unavailable: the parent bubblewrap namespace probe failed with No permissions to create new namespace. No target code, HTTP request, or SQL concurrency fixture was executed.",
    "The decisive SQL Server outcome remains unobserved: the authorized Draft-to-Review transition must commit after deletion reads Draft and before it resumes, and deletion must then commit despite lock, foreign-key and audit interactions. Source supports the schedule but does not establish its observed execution."
  ],
  "validation_plan": {
    "local": "In a future approved offline OS-isolated sandbox, use a disposable SQL Server database with repository migrations, required status/transition seed, and a dummy area-author principal. Create one Draft version without specification, local-requirement, suggestion, package or other external referencing records. First verify a sequential deletion request against Review is rejected. For the bounded concurrency case, start authorized delete_draft through the shared service and pause inside deleteDraftVersion immediately after its successful Draft check, before any following query. On a separate connection invoke the normal authorized transitionRequirement service with toStatusId 2 and require its transaction to commit. Resume deletion, record both transaction outcomes and inspect the version id and parent requirement. Confirm only if deletion commits and removes the now-Review row; blocking, rollback or rejection is not successful reproduction. Stop after this minimum outcome and destroy only the disposable fixture. Do not use shared development services or real records.",
    "deployment": "No live destructive validation is needed. An owner may repeat the same dummy-record schedule in an isolated staging database with the deployed schema and isolation configuration if those differ; report any differences and actual outcomes without deleting production content."
  }
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

No compatible prior-run records with this fingerprint exist. Save your exact JSON response to scratch/result.json and return that JSON with no prose. Do not read any other verifier output or final reports. Logical reviewer ID: verify-09