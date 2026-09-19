Repository: /workspace. This is an authorized defensive repository audit. Read applicable AGENTS.md/repository instructions. Source-only review. NO target execution: bwrap namespace creation denied. No network, dependencies, shared services, credential reads, source edits or subagents. No runtime evidence has been established; do not claim an observed execution result. Review/refute the source claims and bounded validation handoff without developing executable exploits. You may write only /workspace/tmp/sec-audit/agents/verify-00/scratch. Parent owns artifacts; promotion allowlist empty; all byte limits zero.

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
  "fingerprint": "ai-forensic-capture/purge-before-close-retained-evidence",
  "title": "Concurrent capture may retain forensic evidence after a successful purge",
  "description": "An authenticated author allowed to generate requirements can submit safety-blocked input during an approved capture while a PrivacyOfficer purges that capture. Source permits the candidate interleave in which one bounded, redacted evidence event is inserted after the purge DELETE and before the parent is marked purged. If SQL Server permits that interleave, the application would report successful disposal while the organization's protected forensic store still contains an excerpt of the author's submitted text, potentially including residual personal data. Scheduled evidence cleanup excludes the purged parent. This is a retention and disposal-integrity claim, not unauthorized application reading or cross-tenant disclosure. It requires enabled AI generation, scope authorization, an independently approved matching active window below its collection cap, a concurrent authorized purge, and a successful database interleave; no execution result has been observed.",
  "claimed_root_cause": "transitionAiForensicCapture opens a transaction without an explicit stronger isolation level, deletes child evidence first, and only then updates and locks the capture to set stopped_at and purged_at. The application SQL Server configuration specifies READ COMMITTED. persistAiForensicEvidence rechecks approval, lifecycle, expiry, operation/direction and the collection cap under UPDLOCK/HOLDLOCK, but those conditions remain true until the purge updates the parent. There is no preceding parent lock in the manual-purge branch and no second deletion before commit. Whether the DELETE's actual locks allow a concurrent insertion remains decisive. The cleanup query selects only captures with purged_at IS NULL.",
  "trace": [
    {
      "kind": "entrypoint",
      "file": "app/api/ai/generate-requirement-import/route.ts",
      "line": 175,
      "scope": "POST",
      "description": "A scope-authorized authenticated author supplies bounded JSON containing need text. Requirements authorization, throttling and the effective-generation availability check precede input screening; line 232 passes body.need to the safety guard."
    },
    {
      "kind": "propagation",
      "file": "app/api/ai/requirement-import-shared.ts",
      "line": 176,
      "scope": "guardAiInput",
      "description": "When screening rejects the submitted input, await recordAiSafetyBlock before returning the blocked response."
    },
    {
      "kind": "propagation",
      "file": "lib/ai/safety.ts",
      "line": 671,
      "scope": "recordAiSafetyBlock",
      "description": "Attempt bounded forensic persistence for the rejected input and matching operation/direction; persistence failures are contained and fall back to metadata-only recording."
    },
    {
      "kind": "propagation",
      "file": "app/api/admin/ai-forensic-captures/route.ts",
      "line": 91,
      "scope": "PATCH concurrent administrative operation",
      "description": "A separately authenticated PrivacyOfficer supplies a strict action/captureWindowId body and requests purge. Role and human-identity checks apply; active captures are not excluded by the purge service."
    },
    {
      "kind": "propagation",
      "file": "lib/ai/forensic-capture.ts",
      "line": 476,
      "scope": "transitionAiForensicCapture manual purge",
      "description": "Inside the purge transaction, delete matching evidence before acquiring the parent update lock or marking the capture stopped/purged. The bounded candidate uses an approved active capture with zero evidence events."
    },
    {
      "kind": "propagation",
      "file": "lib/ai/forensic-evidence.ts",
      "line": 286,
      "scope": "persistAiForensicEvidence concurrent insertion",
      "description": "The INSERT SELECT rechecks the matching active parent and evidence count under UPDLOCK/HOLDLOCK. An insertion committing between the purge DELETE and parent UPDATE would still see approval, null stopped/purged timestamps, unexpired state and available collection capacity."
    },
    {
      "kind": "sink",
      "file": "lib/ai/forensic-capture.ts",
      "line": 480,
      "scope": "transitionAiForensicCapture purge completion",
      "description": "Update the parent to purged/stopped with UPDLOCK/ROWLOCK and commit without another evidence deletion. A child inserted in the proposed gap would survive the successful purged result and audit event."
    }
  ],
  "evidence": [
    {
      "file": "docs/security-privacy/informationsmangder-kravhantering.md",
      "line": 158,
      "description": "Intended disposal policy: fixed evidence retention of 72 hours after stop/expiry, with immediate PrivacyOfficer purge permitted. This application retention boundary cannot be extended by legal hold."
    },
    {
      "file": "docs/governance/admin-center.md",
      "line": 346,
      "description": "Evidence is isolated, redacted and bounded but remains sensitive after masking; it may still contain personal or secret information. The excerpt is not ordinary application/security log content."
    },
    {
      "file": "lib/ai/forensic-capture.ts",
      "line": 107,
      "description": "Capture creation uses SERIALIZABLE, permits only one open window, and validates a SQL-time expiry 5\u201360 minutes ahead. The insert at line 152 sets 8192 bytes, eight items per event and 1000 events per capture."
    },
    {
      "file": "lib/ai/forensic-capture.ts",
      "line": 359,
      "description": "Purge and approval require PrivacyOfficer; stop permits Admin or PrivacyOfficer. Both transition authorization and execution require a human actor snapshot. Approval additionally requires a different HSA-id from the requester at line 418."
    },
    {
      "file": "lib/ai/forensic-capture.ts",
      "line": 402,
      "description": "Transition transaction has no explicit isolation argument. In its manual-purge branch the first database action is the child DELETE at line 476, followed by the parent UPDATE at line 480."
    },
    {
      "file": "lib/typeorm/sqlserver-config.ts",
      "line": 12,
      "description": "The configured default isolation level is READ COMMITTED and is supplied as isolationLevel at line 201. lib/db.ts aliases SqlServerDatabase to the TypeORM DataSource; the application factory adds no enclosing stronger transaction."
    },
    {
      "file": "lib/ai/forensic-evidence.ts",
      "line": 304,
      "description": "Strongest insertion control: UPDLOCK/HOLDLOCK on the parent and evidence-count query; rechecks approval, stopped/purged timestamps, expiry, operation, direction and collection capacity in the INSERT statement. These protections may serialize the proposed interleave through actual SQL locks, which has not been observed."
    },
    {
      "file": "lib/ai/forensic-evidence.ts",
      "line": 154,
      "description": "Normalize and redact evidence before selecting trigger-centered excerpts. Per-event byte/item limits and the empty-evidence check at line 284 bound the retained copy; actor identity is a capture-specific fingerprint."
    },
    {
      "file": "typeorm/migrations/0058_ai_forensic_evidence_store.mjs",
      "line": 71,
      "description": "The child foreign key cascades parent deletion and has ON UPDATE NO ACTION. Manual purge updates lifecycle columns rather than deleting the parent. This migration defines no lifecycle trigger; line 79 indexes the child capture ID."
    },
    {
      "file": "lib/ai/forensic-capture.ts",
      "line": 307,
      "description": "Evidence reads require purged_at IS NULL, a stopped/expired capture, the requester/approver HSA-id, and current Admin/PrivacyOfficer role. A surviving row is therefore not exposed by this application evidence-read path."
    },
    {
      "file": "lib/transient-cleanup/ai-forensic-evidence.ts",
      "line": 136,
      "description": "Scheduled evidence deletion requires capture.purged_at IS NULL and stop/expiry at least 72 hours ago. A survivor under a manually purged capture is excluded even after aging; backlog inspection has the same purge-state exclusion at line 84."
    },
    {
      "file": "lib/privacy/erasure.ts",
      "line": 1189,
      "description": "Explicit privacy erasure independently deletes evidence associated with matching capture parties or exact actor fingerprints; its outer transaction at line 1386 is SERIALIZABLE. This separate user-triggered operation can remove copies but is not routine cleanup guaranteeing disposal after manual forensic purge."
    },
    {
      "file": "tests/unit/ai-forensic-capture.test.ts",
      "line": 206,
      "description": "The test named atomic purge uses mocked query results and checks that both calls use one transaction. It does not establish SQL Server key/range locks or the concurrent producer/purge outcome."
    }
  ],
  "blockers": [
    "The required OS-enforced sandbox is unavailable: the trusted bubblewrap probe failed with 'No permissions to create new namespace'. No target code, SQL fixtures or shared services were executed during this review.",
    "The decisive fact is whether real SQL Server locks for the empty matching-evidence DELETE and the producer's UPDLOCK/HOLDLOCK INSERT allow the producer to commit before the purge parent UPDATE. Source order and mocked tests do not establish that observed interleave; blocking or deadlock may prevent the claimed surviving row."
  ],
  "validation_plan": {
    "local": "In a future approved OS-isolated fixture with external networking disabled, scratch-only writes, dummy data, bounded resources and no shared services, use the repository schema/indexes and actual DataSource configuration on a dedicated SQL Server. Create one valid matching approved active input capture through the capture services using distinct dummy Admin/PrivacyOfficer HSA-ids, with zero evidence and unused collection capacity. Use two dedicated database connections. Pause the real purge transaction immediately after its child DELETE completes and before its parent UPDATE. On the second connection call persistAiForensicEvidence once with a one-item non-sensitive screening fixture shaped like the existing SQL integration test and a unique event ID. Allow at most five seconds for its insertion to complete; capture whether it commits, blocks, deadlocks or errors. If blocked, resume purge and await both bounded operations rather than inferring survival from a timeout. Inspect only the dummy parent lifecycle fields and its child count. The proposed impact is demonstrated only if purge succeeds with purged_at/stopped_at set and one child remains. If there is a survivor, move only the dummy timestamps beyond the 72-hour threshold while preserving the 5\u201360-minute requested_at/expires_at constraint, run one cleanup batch with limit one, and check the same child count. Stop after this single-row result and dispose of the isolated fixture. If locks prevent survival, refute the proposed interleave; do not develop broader payloads or scan data.",
    "deployment": "The owner can compare the deployed revision, SQL Server version, schema/indexes, transaction configuration and database isolation options against the isolated fixture using configuration or catalog metadata only. No production capture, purge, excerpt read or timing experiment is needed. A deployment-specific lock behavior differing from the isolated result must remain an explicit applicability limit."
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

No compatible prior-run records with this fingerprint exist. Save your exact JSON response to scratch/result.json and return that JSON with no prose. Do not read any other verifier output or final reports. Logical reviewer ID: verify-00