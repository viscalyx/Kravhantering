Repository: /workspace. This is an authorized defensive repository audit. Read applicable AGENTS.md/repository instructions. Source-only review. NO target execution: bwrap namespace creation denied. No network, dependencies, shared services, credential reads, source edits or subagents. No runtime evidence has been established; do not claim an observed execution result. Review/refute the source claims and bounded validation handoff without developing executable exploits. You may write only /workspace/tmp/sec-audit/agents/validate-09/scratch. Parent owns artifacts; promotion allowlist empty; all byte limits zero.

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
  "fingerprint": "requirement-delete-draft-status-check-write-race",
  "title": "Draft deletion can act on a version that left Draft after its check",
  "description": "An area author may start draft deletion while a version is Draft, then have deletion commit after another authorized request moves that same version into Review or Published. The delete path checks the lifecycle state before an unconditional id-based DELETE, potentially removing content now protected by a non-draft lifecycle state.",
  "claimed_root_cause": "deleteDraftVersion uses a default-isolation transaction and getLatestVersionLite without its lockForUpdate option. After checking status it deletes associations and the version by id, without a status/revision predicate or repeated check.",
  "trace": [
    {
      "kind": "entrypoint",
      "file": "app/api/requirements/[id]/delete-draft/route.ts",
      "line": 50,
      "scope": "POST",
      "description": "Accepts an area-author-authorized delete_draft operation for the selected requirement."
    },
    {
      "kind": "propagation",
      "file": "lib/requirements/service-requirements.ts",
      "line": 805,
      "scope": "manageRequirement",
      "description": "Authorizes resource/operation, then later invokes draft deletion."
    },
    {
      "kind": "propagation",
      "file": "lib/dal/requirements.ts",
      "line": 1140,
      "scope": "deleteDraftVersion",
      "description": "Reads latest version without update/hold lock and checks Draft."
    },
    {
      "kind": "sink",
      "file": "lib/dal/requirements.ts",
      "line": 1164,
      "scope": "deleteDraftVersion",
      "description": "Deletes requirement_versions by the previously read id without status or revision matching."
    }
  ],
  "evidence": [
    {
      "file": "lib/requirements/assignment-authorization.ts",
      "line": 901,
      "description": "Non-Reviewer-only manage operations use area-author authority."
    },
    {
      "file": "lib/dal/requirements.ts",
      "line": 704,
      "description": "getLatestVersionLite adds UPDLOCK/HOLDLOCK only when explicitly requested; deletion does not request it."
    },
    {
      "file": "lib/dal/requirements.ts",
      "line": 1141,
      "description": "Intended lifecycle invariant is explicit: Only draft versions can be deleted."
    },
    {
      "file": "lib/typeorm/sqlserver-config.ts",
      "line": 12,
      "description": "Configured default transaction isolation is READ COMMITTED."
    },
    {
      "file": "lib/dal/requirements.ts",
      "line": 1164,
      "description": "Final version DELETE contains only id equality."
    }
  ],
  "blockers": [
    "Required OS-enforced execution sandbox is unavailable: parent bwrap --unshare-all probe failed with No permissions to create new namespace. No target code, HTTP route or SQL concurrency fixture was executed; the source-derived boundary result remains unobserved.",
    "Actual SQL Server lock/FK behavior for the proposed two-connection schedule is not observed. Use a disposable draft with no external referencing records and verify the state transition commits before deletion resumes."
  ],
  "validation_plan": {
    "local": "In an offline disposable SQL Server fixture, create one area-author-owned Draft without specification/suggestion foreign references. Pause deleteDraftVersion immediately after its successful Draft read. On a second connection commit Draft-to-Review through the normal authorized service. Resume deletion and inspect only whether the Review row is removed despite the Draft-only invariant. If testing Published instead, use an authorized dummy Reviewer to publish before resumption. Record transaction outcomes; do not infer successful deletion from source alone."
  },
  "verdict": "needs_validation"
}
## Linked source checks (deduplicated without omission)
{
  "units": [
    {
      "coverage_id": "app%2Fapi%2Frequirements%23REST%20workflows::lib%2Frequirements%2Fassignment-authorization.ts%23requirement%20authority::lib%2Frequirements::ATTACK-CLASSES.md%23Business%20logic",
      "check_indices": [
        0
      ]
    }
  ],
  "checks": [
    {
      "agent_id": "hunt-requirements",
      "reviewed_paths": [
        "app/api/requirements/[id]/delete-draft/route.ts",
        "app/api/requirement-transitions/[id]/route.ts",
        "lib/requirements/service-requirements.ts",
        "lib/requirements/assignment-authorization.ts",
        "lib/dal/requirements.ts",
        "lib/typeorm/sqlserver-config.ts",
        "typeorm/seed-required.mjs"
      ],
      "invariant": "Draft deletion and Reviewer-only transitions must remain valid at the committed write.",
      "method": "source",
      "result": "Edit has locked/CAS protection (requirements DAL:813 onward), but deleteDraftVersion checks an unlocked latest row then deletes by id (1140-1166); default isolation is READ COMMITTED (sqlserver-config.ts:12). Transition service authorizes before DAL rereads current status (service:1264-1286; DAL:1219-1240), allowing the distinct Draft-to-Review interleaving described in the candidate. Seed permits Review-to-Draft (seed-required.mjs:443).",
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

No compatible prior-run records with this fingerprint exist. Save your exact JSON response to scratch/result.json and return that JSON with no prose. Do not read any other verifier output or final reports. Logical reviewer ID: validate-09