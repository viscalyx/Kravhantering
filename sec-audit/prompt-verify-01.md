Repository: /workspace. This is an authorized defensive repository audit. Read applicable AGENTS.md/repository instructions. Source-only review. NO target execution: bwrap namespace creation denied. No network, dependencies, shared services, credential reads, source edits or subagents. No runtime evidence has been established; do not claim an observed execution result. Review/refute the source claims and bounded validation handoff without developing executable exploits. You may write only /workspace/tmp/sec-audit/agents/verify-01/scratch. Parent owns artifacts; promotion allowlist empty; all byte limits zero.

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
  "fingerprint": "archiving/confirmation-candidate-keys/stale-child-content-deletion",
  "title": "Archive confirmation does not bind needs references created after export",
  "description": "Source supports an archive-preservation gap when an authenticated specification responsible person or coauthor creates a needs reference after a PrivacyOfficer exports an eligible specification. The insert changes neither the parent updated_at nor the candidate keys used by confirmation. If the officer then executes disposal on the same UTC day, within the 15-minute token lifetime and in the process holding the token, execution can still select that specification and delete the new child absent from the earlier archive. The protected state is the specification owner's business history. This is conditional on exact-content archival preservation being mandatory and on no operational write freeze or legal hold covering the specification. It is not a role bypass, cross-specification write, or demonstrated runtime deletion. The original UPDATE example is not supported under the managed runtime permission contract, which grants this table SELECT, INSERT and DELETE but no UPDATE; creation is the corrected source-grounded operation for the same confirmation-binding root cause.",
  "claimed_root_cause": "The export confirmation records policy identity, policy revision, a day-rounded cutoff and parent candidate identifiers, without an archive-content digest or revision covering child creation. Retention eligibility uses the parent updated_at, while the needs-reference creation path only inserts the child. A SERIALIZABLE execution transaction rechecks current eligibility but does not compare the child state with the previously exported state.",
  "trace": [
    {
      "kind": "entrypoint",
      "file": "app/api/requirements-specifications/[id]/needs-references/route.ts",
      "line": 70,
      "scope": "Authenticated specification author's needs-reference creation",
      "description": "POST validates a specification identifier and strict text/description body, applies manage_specification_needs_reference/create authorization and forwards the request to the shared service. This is the lower-trust content entrypoint after a separate officer has completed the archive export."
    },
    {
      "kind": "propagation",
      "file": "lib/requirements/service-needs-references.ts",
      "line": 120,
      "scope": "Shared authorization and creation dispatch",
      "description": "The service authorizes the requested operation, verifies that the specification exists and dispatches create at line 152 to createSpecificationNeedsReference without an archive-confirmation or retention-state check."
    },
    {
      "kind": "propagation",
      "file": "lib/dal/requirements-specifications.ts",
      "line": 1894,
      "scope": "Child insertion without parent revision change",
      "description": "The creation helper normalizes nonempty text, checks uniqueness and inserts the needs reference with its own created_at and updated_at. The exported wrapper at line 1922 calls this helper directly; neither path updates requirements_specifications.updated_at."
    },
    {
      "kind": "propagation",
      "file": "lib/archiving/retention.ts",
      "line": 966,
      "scope": "Previously issued archive confirmation identity",
      "description": "previewTokenFor hashes only sorted candidate keys, cutoff, policy ID and policy updated_at. mintExportToken at line 999 stores that hash and export candidate keys; consumeExportToken at line 1019 compares the same values. Needs-reference rows and their timestamps are absent from all comparisons."
    },
    {
      "kind": "propagation",
      "file": "app/api/admin/archiving/runs/route.ts",
      "line": 38,
      "scope": "PrivacyOfficer's subsequent disposal request",
      "description": "The secure mutation wrapper requires PrivacyOfficer authorization, validates policy and confirmation inputs and invokes executeArchivingRetention with a human actor snapshot. The author cannot independently invoke the disposal path."
    },
    {
      "kind": "propagation",
      "file": "lib/archiving/retention.ts",
      "line": 1306,
      "scope": "Transactional eligibility and confirmation recheck",
      "description": "A SERIALIZABLE transaction recomputes preview, rejects changed preview tokens, requires a live one-use export token for export-required candidates and then executes the selected deletion SQL. A child insert completed before this transaction does not alter the source-visible preview inputs."
    },
    {
      "kind": "sink",
      "file": "lib/archiving/retention.ts",
      "line": 545,
      "scope": "Deletion of all selected specification needs references",
      "description": "The obsolete-specification deletion batch deletes every specification_needs_references row for the selected specification ID before deleting the parent, without restricting child IDs or versions to the exported archive."
    }
  ],
  "evidence": [
    {
      "file": "docs/security-privacy/informationsmangder-kravhantering.md",
      "line": 130,
      "description": "Defines archive export as preserving business history outside the active database. The matrix at line 152 requires export confirmation before specification and needs-reference deletion, with needs references included in anonymized JSON; it also names active work, business need and legal hold as exceptions. It does not explicitly define concurrent-edit or exact-version semantics."
    },
    {
      "file": "docs/governance/admin-center.md",
      "line": 566,
      "description": "Operator guidance requires anonymized JSON before obsolete-specification deletion and explicitly includes needs references in the archive."
    },
    {
      "file": "lib/requirements/assignment-authorization.ts",
      "line": 746,
      "description": "Needs-reference mutations require specification authorship. assertSpecificationAuthor at line 836 checks the authenticated actor HSA-id against the responsible person or coauthor lookup at line 153; those checks do not impose a lifecycle or archive write freeze. Admin has an explicit earlier allowance."
    },
    {
      "file": "app/api/admin/archiving/exports/route.ts",
      "line": 35,
      "description": "Archive export is a strict-schema secure POST requiring PrivacyOfficer; it collects the archive and exportToken through the bounded structured-output runner. lib/privacy/route-helpers.ts:19 additionally requires a human actor snapshot."
    },
    {
      "file": "lib/archiving/retention.ts",
      "line": 559,
      "description": "Obsolete-specification eligibility uses parent updated_at, excludes management lifecycle and current/pending agreements, and applies active retention exceptions. It does not inspect needs-reference creation or update timestamps. previewArchivingRetention at line 1159 also rejects disabled policies."
    },
    {
      "file": "lib/archiving/retention.ts",
      "line": 871,
      "description": "The cutoff is rounded to UTC midnight before subtracting policy age, so same-day export and execution use the same cutoff. The export token is process-local, random, one-use and expires after the 15 minutes configured at line 168; a process change or expiry prevents this sequence."
    },
    {
      "file": "lib/archiving/retention.ts",
      "line": 1489,
      "description": "Archive collection selects needs-reference ID, text, description and created/updated timestamps. A child created after the completed export cannot appear in this previously returned payload."
    },
    {
      "file": "typeorm/runtime-permission-manifest.mjs",
      "line": 173,
      "description": "The runtime table contract grants READ_CREATE_DELETE, defined at line 8 as SELECT, INSERT and DELETE. The current manifest preserves this entry. This prevents the original UPDATE example when the managed least-privilege role is enforced, but does not prevent the corrected INSERT operation."
    },
    {
      "file": "lib/dal/requirements-specifications.ts",
      "line": 1965,
      "description": "The originally cited UPDATE does write only child text, description and updated_at inside a parent-locked transaction, but runtime UPDATE permission is missing. It is not used as the corrected validation sequence."
    },
    {
      "file": "typeorm/migrations/0017_specification_needs_reference_description.mjs",
      "line": 2,
      "description": "Adds child description and updated_at and backfills the timestamp. Source inspection of migrations found no needs-reference trigger updating the parent; migration 0004_specification_needs_reference_cascade.mjs:3 establishes the child-to-parent foreign key with delete cascade, not a parent timestamp update."
    }
  ],
  "blockers": [
    "No target execution is permitted: the required OS sandbox cannot create its bubblewrap namespace (No permissions to create new namespace). Consequently no isolated SQL database, actual migrations/runtime-role sequence, API response or committed deletion was exercised.",
    "The information owner must establish that the archive-before-disposal guarantee covers every child present at deletion, including content created after export, and whether active-work exceptions or an enforced operational write freeze prevent this interval. If an earlier point-in-time archive intentionally suffices, source establishes a correctness or hardening concern rather than the claimed security boundary impact."
  ],
  "validation_plan": {
    "local": "Only in a future approved network-isolated sandbox with disposable SQL storage, apply the actual migrations and managed runtime permission manifest. Prepare exactly one synthetic obsolete specification assigned to a dummy non-PrivacyOfficer coauthor, with parent updated_at older than policy age, no current or pending agreement, no hold and no unrelated dependent data. Keep the policy/candidate set fixed. As a separate dummy PrivacyOfficer obtain preview and complete the archive export; retain the returned archive only within disposable scratch. As the assigned coauthor POST one unique non-sensitive needs reference through the actual route/service, confirm successful insertion and read the unchanged parent timestamp. On the same UTC day, before token expiry and in the same app process, let the dummy officer submit the original preview/export tokens once. Observe rejection or the minimum database result showing whether that one new child and parent were deleted; compare the new child ID with the earlier archive. Do not substitute UPDATE, grant extra permissions, touch shared services, or infer success from a mocked query result. Stop at this result and destroy the isolated fixture.",
    "deployment": "Have the information owner review the documented retention/export requirement and explicitly decide whether the final destroyed child content must be archived. Have the operator document any enforced write freeze or active-work exception that covers the full export-to-disposal interval, including API and MCP writes. Review these controls and runtime-role grants without executing disposal against deployed data."
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

No compatible prior-run records with this fingerprint exist. Save your exact JSON response to scratch/result.json and return that JSON with no prose. Do not read any other verifier output or final reports. Logical reviewer ID: verify-01