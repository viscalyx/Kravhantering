# Repository security audit

Standard profile; whole repository review starting at
`d39bb52daa5446392cc825dca40325f49b9e3241`. Concurrent changes through
`2771a3b8b8798ee224350d741bb1e165ec5d2dd0` were separately reviewed and hashed
(17 paths). Existing untracked `.github/skills/security-audit/` was included.
The audit made no application source changes.

## Scope and evidence limits

This is a source-only review under the skill's sandboxed source-and-local-only
execution policy. The required OS sandbox could not be created
(`bwrap: No permissions to create new namespace`). No target builds, tests,
services, live endpoints, dependency installations, vulnerability-database
refreshes, or shared infrastructure were used. Runtime-dependent leads remain
unconfirmed.

No prior compatible ledger was found. There are no carried confirmations or
changed-source revalidations. No strict agent budget was set. The initial plan
contained 87 units in 10 hunter assignments, four reconnaissance assignments, at
least two critics, and two independent reviews per candidate; 67 delegated
assignments were spent. Parent source hunts are counted separately in metadata.

All repository subsystems were in scope. External deployment facts, provider
policies and branch protections could only be assessed where represented in
source. Dependency supply-chain controls were reviewed; this was not a refreshed
dependency CVE scan. Native application parsers, mobile applications and message
brokers were not identified as implemented surfaces. The ledger records
class-specific selections and exclusions. One pass does not exhaust the
repository.

## Result

No vulnerabilities met the skill's runtime-confirmed evidence bar. 16
independently reviewed source-grounded leads need validation. This does not
establish that the repository is free of vulnerabilities. Authorization is
generally centralized and explicit; the retained leads identify specific
possible exceptions and lifecycle/resource-control failures.

## Confirmed findings

<!-- markdownlint-disable MD013 -->

| Severity | Title | Boundary | Observed result |
| --- | --- | --- | --- |
| — | None | — | No target execution was permitted |

<!-- markdownlint-enable MD013 -->

## NEEDS VALIDATION

These are leads, without severity assignments. Validation starts with direct
visibility and bounded computation checks, then state-dependent and
deployment-dependent paths. Full verified traces, blockers and bounded plans are
in [NEEDS-VALIDATION.md](NEEDS-VALIDATION.md).

<!-- markdownlint-disable MD013 -->

| Lead | Source entry / sink | Validation blocker | Bounded next step | Owner observation |
| --- | --- | --- | --- | --- |
| Taxonomy detail projections may disclose nonpublic library and specification-local requirement descriptions | `app/api/norm-references/[id]/route.ts:58` → `app/api/norm-references/[id]/route.ts:69` | The parent reports that the required OS-enforced sandbox probe failed with 'No permissions to create new namespace'. Namespace-based network/mount isolation is unavailable, so no target code, HTTP route, database query or dummy fixture was executed. The decisive unresolved observation is whether the taxonomy JSON includes a dummy description for a principal denied that exact version or owning specification by the direct API. | Only in an approved OS-isolated offline environment with read-only target/tools, scratch-only writes, an empty allowlisted environment, explicit resource/time limits, and disposable SQL plus synthetic authentication: create ordinary principals Alice and Bob with distinct dummy HSA identities, neither Admin nor Reviewer. Assign Alice area A and specification A; give Bob no assignment in either. Seed one Draft library version with a harmless unique marker, linked to existing dummy norm N and system priority P. Verify Alice can read it and Bob is denied GET /api/requirements/{requirementId}/versions/{versionNumber}. As Bob request GET /api/norm-references/{N}; inspect only whether linkedRequirements contains that marker, then stop that variant. Independently request GET /api/priority-levels/{P} as Bob and inspect only the marker in source='library', then stop that variant. For the local variant seed one current local requirement in Alice's specification A with another harmless marker and priority P. Verify Bob is denied GET /api/requirements-specifications/{A}/local-requirements/{localId}, then inspect the priority GET for that marker in source='specificationLocal' and stop. If historical scope must be characterized, use one separate dummy retained binding with valid_until in the past and a distinct marker; compare the normal local detail's absence with priority output without claiming deletion or erasure failure. Record only fixture identifiers, principal roles/assignments, response statuses and marker-presence booleans; never use production data, credentials or shared services. | Not needed to resolve this source/runtime hypothesis; no deployment probing. |
| Specification preload may disclose parent data when authorization fails with an internal error | `app/[locale]/specifications/[specificationId]/page.tsx:26` → `app/[locale]/specifications/[specificationId]/page.tsx:103` | The required OS-enforced sandbox is unavailable: the supplied capability probe reported No permissions to create new namespace. No target code, test, rendered response or failure fixture was executed. Decisive local evidence must show a selective assignment-query or required-denial-audit failure while route resolution, parent lookup, uncaught coauthor lookup and the claimed raw data reads succeed, then establish that the dummy private marker crosses the page/client serialization boundary. A total database outage, early uncaught coauthor error or healthy recognized 401/403 does not establish disclosure. Source does not establish an ordinary user's ability to induce the selective failure, its deployment frequency or an affected production response. The impact remains a conditional read of another assignment owner's specification metadata/needs/package selection, without demonstrated child-content or mutation impact. | In a future approved offline OS sandbox with read-only target/tools, empty allowlisted environment, scratch-only writes and low time/resource limits, use dummy owner and unassigned authenticated actors without Admin/Reviewer and one dummy specification containing a unique non-sensitive needs-description marker. Keep route resolution, parent, coauthor and raw needs/package reads successful. Through the real default authorization path, first verify healthy negative assignment lookup returns a limited forbidden shell; then narrowly fail only its required denial-audit database write. Alternatively narrowly fail its assignment lookup. Invoke the preload/page boundary and inspect client-prop serialization for the one marker; do not merely mock getAvailableSpecificationRequirements to reject. Compare an authorized optional-resource failure and total database failure. Stop at the minimum dummy boundary result or refutation; no network, shared services or induced outage. Predeclare any required evidence artifact and trusted promotion limits before execution. | The owner may inspect existing sanitized telemetry for selective assignment-query or denial-audit errors and the deployed revision/framework response handling. Do not generate errors, send new audit traffic or inspect private specification contents. Establish whether parent/coauthor reads remained successful during any relevant failure; existing telemetry calibrates occurrence but does not substitute for the isolated dummy serialization fixture. |
| Suggestion detail can expose a nonpublic requirement-version description | `app/api/improvement-suggestions/[id]/route.ts:31` → `app/api/improvement-suggestions/[id]/route.ts:56` | Required OS-enforced execution isolation is unavailable: the trusted bubblewrap capability probe reported No permissions to create new namespace. Target execution, SQL-backed fixtures and HTTP requests are prohibited in this audit environment. The source path survives refutation, but no independent runtime observation establishes the paired direct-version denial and suggestion-description disclosure. | In a future approved sandbox with no external network, a read-only target/tools mount, an empty allowlisted environment, scratch-only writes and explicit low resource/time limits, use a disposable local application and SQL fixture. Provision a dummy area author and an unrelated authenticated reader with no Admin or Reviewer role and no assignment in that area. Give one requirement a published version and a draft sibling whose description has a unique harmless marker absent from the published description and suggestion content. Through the normal authenticated author flow, POST /api/requirement-suggestions/{requirementId} with benign content and requirementVersionId equal to the draft row ID; retain the returned suggestion ID. As the reader, first establish a successful published-version read and a 403 from GET /api/requirements/{requirementId}/versions/{draftVersionNumber}. Then GET /api/improvement-suggestions/{suggestionId} and inspect only the status and whether requirementDescription contains the dummy marker. Check GET /api/requirement-suggestions/{requirementId} omits that description. Start with no implementation evidence, so implementation masking cannot change the result. Stop after these bounded checks; preserve only dummy status/field observations through the approved promotion procedure and discard the disposable fixture. | An authorized owner can check the deployed revision and, using existing approved administrative access, determine whether suggestions link to currently nonpublic versions of requirements that also have a published version. Record only whether such a data state exists, without exporting real descriptions or personal information. Reproduce the paired authorization/disclosure check only with dummy records in an isolated staging fixture; no production probing or mutation is needed to establish the code behavior. |
| Review PDF model computes a quadratic text diff on the application thread | `app/[locale]/requirements/reports/pdf/review/[id]/route.ts:22` → `lib/reports/text-diff.ts:69` | The authorized OS-enforced sandbox is unavailable: the supplied trusted bubblewrap probe failed with 'No permissions to create new namespace'. Target execution is prohibited, so no bounded growth, event-loop delay, allocation, cancellation, or shared-request experiment was performed. Actual report reachability requires an authorized lifecycle-created Review revision and a long Published or Archived baseline under a deployed item limit of at least two. The schema and draft creation path support the proposed state, but its complete lifecycle and route admission have not been exercised. Meaningful shared effect depends on actual Node worker topology, main-process heap and container limits, any external report isolation or upstream rejection, and supervisor recovery. Source alone does not establish elapsed delay, memory consumption, process failure, or service-wide outage. | In a disposable OS-isolated environment with no external network, an empty allowlisted environment, read-only target/tools, scratch-only writes, and hard CPU, memory and wall-clock limits, use small unequal 128-token and 256-token comparisons to count matrix dimensions and measure bounded event-loop delay. Stop after establishing growth and scheduling behavior; do not allocate the proposed 100-million-cell matrix or attempt saturation. Use dummy authorized principals and a local disposable database to create a legitimate published baseline, edit with current revision preconditions, transition the draft to Review through the supported workflow, and request the real review PDF with an item quota of at least two. Replace the matrix allocation with a sentinel in a focused harness if verifying full-size token counts. Record only the minimum observed result and a harmless same-process scheduling probe; do not claim crash or outage without evidence. | Have the owner confirm configured PDF item limits and admission quotas, whether model construction shares a Node process with unrelated routes, any earlier text/token-product limits or dedicated report process, main-process memory/CPU limits, and supervisor restart behavior. Check configuration and topology records only; no production load test or full-size request is needed. |
| Draft deletion may remove a version after it enters Review | `app/api/requirements/[id]/delete-draft/route.ts:50` → `lib/dal/requirements.ts:1164` | Required OS-enforced execution sandbox is unavailable: the parent bubblewrap namespace probe failed with No permissions to create new namespace. No target code, HTTP request, or SQL concurrency fixture was executed. The decisive SQL Server outcome remains unobserved: the authorized Draft-to-Review transition must commit after deletion reads Draft and before it resumes, and deletion must then commit despite lock, foreign-key and audit interactions. Source supports the schedule but does not establish its observed execution. | In a future approved offline OS-isolated sandbox, use a disposable SQL Server database with repository migrations, required status/transition seed, and a dummy area-author principal. Create one Draft version without specification, local-requirement, suggestion, package or other external referencing records. First verify a sequential deletion request against Review is rejected. For the bounded concurrency case, start authorized delete_draft through the shared service and pause inside deleteDraftVersion immediately after its successful Draft check, before any following query. On a separate connection invoke the normal authorized transitionRequirement service with toStatusId 2 and require its transaction to commit. Resume deletion, record both transaction outcomes and inspect the version id and parent requirement. Confirm only if deletion commits and removes the now-Review row; blocking, rollback or rejection is not successful reproduction. Stop after this minimum outcome and destroy only the disposable fixture. Do not use shared development services or real records. | No live destructive validation is needed. An owner may repeat the same dummy-record schedule in an isolated staging database with the deployed schema and isolation configuration if those differ; report any differences and actual outcomes without deleting production content. |
| Concurrent status change can bypass Reviewer-only Review-to-Draft authorization | `app/api/requirement-transitions/[id]/route.ts:29` → `lib/dal/requirements.ts:1328` | The required OS-enforced execution sandbox is unavailable: the parent's bubblewrap namespace probe failed with No permissions to create new namespace. No target code, route, or SQL fixture was executed. The decisive missing observation is whether the complete transaction, including auditing and cleanup, commits the proposed Review-to-Draft change for the non-Reviewer under the specified interleaving. | In a future approved offline disposable sandbox, use actual assignment authorization, the REST/service path, required schema and seed graph, and an isolated SQL Server fixture. Create one dummy requirement with a single Draft version, null archive_initiated_at, and one authenticated assigned area author without Reviewer or Admin. Let a request targeting Draft pass route and final service authorization, pausing immediately after service-requirements.ts line 1273 and before transitionStatus. Fully commit a normal Draft-to-Review request by that author, then resume the first request. Inspect the final version status and transaction audit to determine whether unauthorized Review-to-Draft committed. As controls, verify that a sequential Review-to-Draft request by the author is forbidden and an uninterrupted Draft-to-Draft request conflicts on the graph. Preserve real authorization and SQL behavior; do not mock authorization success. Stop after these bounded dummy operations and discard the fixture. Do not use shared or deployed services. | Not needed to resolve this source/runtime hypothesis; no deployment probing. |
| Concurrent capture may retain forensic evidence after a successful purge | `app/api/ai/generate-requirement-import/route.ts:175` → `lib/ai/forensic-capture.ts:480` | The required OS-enforced sandbox is unavailable: the trusted bubblewrap probe failed with 'No permissions to create new namespace'. No target code, SQL fixtures or shared services were executed during this review. The decisive fact is whether real SQL Server locks for the empty matching-evidence DELETE and the producer's UPDLOCK/HOLDLOCK INSERT allow the producer to commit before the purge parent UPDATE. Source order and mocked tests do not establish that observed interleave; blocking or deadlock may prevent the claimed surviving row. | In a future approved OS-isolated fixture with external networking disabled, scratch-only writes, dummy data, bounded resources and no shared services, use the repository schema/indexes and actual DataSource configuration on a dedicated SQL Server. Create one valid matching approved active input capture through the capture services using distinct dummy Admin/PrivacyOfficer HSA-ids, with zero evidence and unused collection capacity. Use two dedicated database connections. Pause the real purge transaction immediately after its child DELETE completes and before its parent UPDATE. On the second connection call persistAiForensicEvidence once with a one-item non-sensitive screening fixture shaped like the existing SQL integration test and a unique event ID. Allow at most five seconds for its insertion to complete; capture whether it commits, blocks, deadlocks or errors. If blocked, resume purge and await both bounded operations rather than inferring survival from a timeout. Inspect only the dummy parent lifecycle fields and its child count. The proposed impact is demonstrated only if purge succeeds with purged_at/stopped_at set and one child remains. If there is a survivor, move only the dummy timestamps beyond the 72-hour threshold while preserving the 5–60-minute requested_at/expires_at constraint, run one cleanup batch with limit one, and check the same child count. Stop after this single-row result and dispose of the isolated fixture. If locks prevent survival, refute the proposed interleave; do not develop broader payloads or scan data. | The owner can compare the deployed revision, SQL Server version, schema/indexes, transaction configuration and database isolation options against the isolated fixture using configuration or catalog metadata only. No production capture, purge, excerpt read or timing experiment is needed. A deployment-specific lock behavior differing from the isolated result must remain an explicit applicability limit. |
| Parent retention deletion can bypass an active child-row legal hold | `app/api/admin/archiving/runs/route.ts:38` → `lib/archiving/retention.ts:331` | No target execution is permitted because the required OS-enforced sandbox could not create a bubblewrap namespace (No permissions to create new namespace). Consequently no isolated SQL/application reproduction has established the decisive result: a committed parent retention run deleting the held child while its active exception remains. Source-visible dependencies and the runtime permission manifest support the path but are not an observed database outcome. | After approved isolation is available, use a disposable SQL Server/application fixture with repository migrations and runtime-role grants, dummy human PrivacyOfficer and dummy assigned area author. Enable rfi_questions_retention_delete. Create a historical inactive version under a still-unarchived question with no specification list rows, assessments or suggestions. Give the child an old updated_at, verify its preview candidacy, then create an indefinite exception through POST /api/admin/archiving/exceptions using that policy's ID, sourceKey rfi_question_versions.historical_unreferenced, subjectTable rfi_question_versions, the child ID and a dummy reason. Verify the child remains stored and is excluded from its preview. Archive the parent through its authorized lifecycle and use fixture timestamps to place archived_at beyond the policy age. Obtain a fresh POST /api/admin/archiving/preview token and submit policyId plus previewToken to POST /api/admin/archiving/runs as the PrivacyOfficer. Inspect only fixture parent, child, exception and transaction outcome. Stop at child deletion with a still-active exception, or the exact preventing guard/constraint. Separately repeat with archived_requirement_selection_delete and a held archived answer using sourceKey requirement_selection_answers.archived and subjectTable requirement_selection_answers; all siblings must be archived, with no saved specification answers or external question references. Keep every mutation confined to disposable dummy data; do not execute against shared or production services. | An owner can read-only verify whether the deployed revision, enabled policies, schema constraints and effective runtime DELETE grants match this source. Confirm the intended preservation meaning of active child exceptions. If additional deployed controls could prevent the path, reproduce those controls only in the disposable local fixture. Do not run retention against real held records to validate this candidate. |
| Archive confirmation does not bind needs references created after export | `app/api/requirements-specifications/[id]/needs-references/route.ts:70` → `lib/archiving/retention.ts:545` | No target execution is permitted: the required OS sandbox cannot create its bubblewrap namespace (No permissions to create new namespace). Consequently no isolated SQL database, actual migrations/runtime-role sequence, API response or committed deletion was exercised. The information owner must establish that the archive-before-disposal guarantee covers every child present at deletion, including content created after export, and whether active-work exceptions or an enforced operational write freeze prevent this interval. If an earlier point-in-time archive intentionally suffices, source establishes a correctness or hardening concern rather than the claimed security boundary impact. | Only in a future approved network-isolated sandbox with disposable SQL storage, apply the actual migrations and managed runtime permission manifest. Prepare exactly one synthetic obsolete specification assigned to a dummy non-PrivacyOfficer coauthor, with parent updated_at older than policy age, no current or pending agreement, no hold and no unrelated dependent data. Keep the policy/candidate set fixed. As a separate dummy PrivacyOfficer obtain preview and complete the archive export; retain the returned archive only within disposable scratch. As the assigned coauthor POST one unique non-sensitive needs reference through the actual route/service, confirm successful insertion and read the unchanged parent timestamp. On the same UTC day, before token expiry and in the same app process, let the dummy officer submit the original preview/export tokens once. Observe rejection or the minimum database result showing whether that one new child and parent were deleted; compare the new child ID with the earlier archive. Do not substitute UPDATE, grant extra permissions, touch shared services, or infer success from a mocked query result. Stop at this result and destroy the isolated fixture. | Have the information owner review the documented retention/export requirement and explicitly decide whether the final destroyed child content must be archived. Have the operator document any enforced write freeze or active-work exception that covers the full export-to-disposal interval, including API and MCP writes. Review these controls and runtime-role grants without executing disposal against deployed data. |
| Azure bootstrap consumes root helpers from an unchecked shared temporary parent | `scripts/azure-dev/AzureDev.Bootstrap.psm1:497` → `scripts/azure-dev/templates/bootstrap-host.sh:173` | The authorized audit handoff reports that bubblewrap namespace creation was denied with No permissions to create new namespace. Required OS-enforced network and mount isolation is unavailable, so no target code, multi-UID replacement experiment, or root helper-consumption step was executed. There is no observed execution result. Deployment applicability requires a distinct non-sudo local OS principal with access to the host /tmp namespace who can precreate /tmp/krav-azure-dev before staging, allow the operator's child creation, and replace the tooling child before root opens the helper. Actual principal isolation, ownership/ACLs, temporary-directory lifecycle, and applicable OS restrictions are not established by repository source. Existing secure operator-owned staging would not give that principal the claimed initial capability. | In a future disposable OS-enforced sandbox, use dummy operator and attacker UIDs plus confined root, a private shared-temporary-directory fixture, no network, an empty allowlisted environment, read-only source/tools, scratch-only writes, and explicit low resource/time limits. Model the exact source staging commands with dummy files beneath an attacker-owned parent that permits operator staging. Pause after upload, attempt replacement of only the tooling child as the attacker, and run only the source-equivalent existence check and helper invocation with a harmless identity marker. Stop at the helper identity result; do not run package installation or the complete bootstrap. Predeclare any evidence file and parent-side safe-promotion bounds before execution; the current empty promotion allowlist cannot retain runtime artifacts. | The VM owner should inspect existing configuration records or perform an approved offline assessment of intended users/services, sudo grants, host temporary-directory namespace access, parent ownership/ACLs and cleanup lifecycle. Establish whether any principal distinct from the operator and lacking sudo can obtain the precise precreation and replacement capability before an intended setup or rerun. Do not create the parent, alter permissions, replace helpers, probe services, or reproduce on the shared VM. |
| Private advisory updates trust a body marker instead of automation ownership | `scripts/release/container-vulnerability-monitor.mjs:1015` → `scripts/release/container-vulnerability-monitor.mjs:1047` | The required target-execution sandbox is unavailable: the supplied capability result reports bubblewrap namespace creation denied with No permissions to create new namespace. This independent review ran no target code, tests, network requests or provider calls; there is no observed runtime result. Repository source cannot establish GitHub's decisive hosted controls: whether a lower-trust reporter can submit a marker-bearing description, whether this unfiltered listing returns that report to the configured credential in draft or triage state, whether the PATCH payload is accepted for it, and whether the reporter can read the overwritten fields afterward. No provider policy or deployment permissions were inspected. No active confidential finding was inspected. The reporter must know or predict its exact vulnerability identifier, image role and package, and their report must be the first matching advisory in listing order. A prior match or non-updatable state can prevent the claimed update. | Only after the required OS-enforced isolation is available, use the exported synchronizeTracking interface with one synthetic confidential finding, a dummy token, publicMutationAllowed false, and a recording runCommand adapter that never launches gh. Keep temporary body files under the permitted scratch root. Supply enabled private reporting and a paginated synthetic reporter-authored advisory with the matching marker. Check the selected GHSA ID and dummy confidential fields in the requested PATCH separately for draft and triage. Compare a nonmatching marker, a matching published advisory, missing credentials and disabled reporting. Stop at the recorded dummy command and payload; this establishes only local selection, not hosted disclosure. | An owner should inspect authoritative GitHub policy and existing non-sensitive configuration/metadata for the actual credential and repository. Establish reporter submission/body control, default listing inclusion and order, permitted draft/triage PATCH operations including this payload, and retained reporter access after an update. Separately determine whether marker inputs for the relevant confidential scanner class are knowable without the disclosed details. Do not create a report, mutate an advisory, expose real scan content or read credential values. If any decisive prerequisite fails, reject the disclosure claim for that deployment. |
| Untrusted tracker comments can block scheduled container vulnerability scans | `scripts/release/container-vulnerability-monitor.mjs:849` → `.github/workflows/container-vulnerability-monitor.yml:82` | The required target-execution isolation is unavailable: the audit capability probe reported bubblewrap namespace creation failed with No permissions to create new namespace. No target code or tests were executed, so source-predicted CLI failure has not been independently observed. The decisive hosted reachability facts are unavailable from repository source: an existing valid automation-owned tracker must be commentable by an account lacking automation/repository-write authority, and the scheduled main-branch workflow must be enabled at this revision. Issue locks, repository interaction limits, access policy, and current workflow state were not inspected through GitHub or any external service. | After the required isolated sandbox becomes available, call the exported main terminal-boundary interface using an injected tracker adapter with one valid dummy owned issue, an in-memory filesystem, and recorded mutation calls. Establish a successful baseline with an ordinary human comment; repeat with the identical issue and comments plus a non-automation author's comment whose body is container-vulnerability-reconciliation:. Verify the second call returns 1, reports the invalid automation marker, writes no terminal boundary, and performs no mutations. Read the workflow dependency conditions to map that result to skipped selection and scans. Do not invoke gh, contact GitHub, start a hosted workflow, or execute outside the approved sandbox. | The repository owner should inspect existing tracker ownership labels and valid bodies, issue locks and interaction restrictions, the effective comment rights of a lower-trust account, and whether this scheduled main-branch workflow is enabled and deployed. Use existing state and access-policy inspection only; do not post a test comment, modify an issue, or trigger monitoring. Confirm whether at least one such tracker is readable by the workflow and writable in its comment surface by that account. |
| Developer Keycloak publishes its HTTP port without a loopback bind and supplies public administrator defaults | `.devcontainer/docker-compose.yml:128` → `.devcontainer/docker-compose.yml:125` | The effective Compose manifest, environment overrides, container-engine version and forwarding defaults, host bind, firewall, and route from a non-developer peer were not observed. Source port publication does not establish lower-trust reachability. Acceptance of the legacy KEYCLOAK_ADMIN settings by the pinned Keycloak 26.7.4-0 image and the effective bootstrap administrator state were not verified. Existing container state or overrides can make the public defaults inactive. The effective master realm sslRequired policy and the origin classification of forwarded requests remain decisive. The repository describes an external-HTTPS default; the devcontainer helper attempts to relax it but tolerates failure, and standalone Compose has no equivalent step. Provider behavior at the pinned version was not independently verified. The required OS-enforced execution sandbox is unavailable because the trusted bubblewrap probe could not create a namespace. No Compose rendering, target execution, management authentication, or runtime observation was performed. | In a future approved OS-isolated sandbox with no external network, empty allowlisted environment, read-only target and tools, scratch-only writes, and explicit resource/time limits, render each of the three maintained Compose profiles using dummy configuration. Use a pre-provisioned disposable fixture for the exact pinned Keycloak image and fresh dummy state to verify bootstrap-setting acceptance and the master realm HTTPS policy. Compare the standalone path with the devcontainer helper path, recording whether that helper actually changes the policy. Inspect the resulting publication and request-origin behavior from an isolated peer. Attempt only one harmless authorized management read of a dummy realm using the intentional public test administrator after policy and bootstrap conditions are established; stop at the boundary result. Do not change shared services or use real users, secrets, or realms. | The owner should inspect the active profile and effective manifest, sanitized bootstrap-setting status, existing administrator state, master realm HTTPS policy, actual container port bindings and forwarding configuration, host firewall, and applicable network routing. Establish whether a specifically identified non-developer principal has a permitted route to the development IdP and whether public bootstrap credentials are still active. Use configuration inspection and owner-held records without disclosing secrets or probing live management login. Keep standalone, ordinary devcontainer, elevated devcontainer, Azure, and production conclusions separate. |
| Cached developer sessions send cookies outside their recorded destination scope | `scripts/lib/dev-login-core.mjs:35` → `scripts/lib/dev-login-core.mjs:321` | Required OS-enforced target-execution isolation is unavailable: the audit's bubblewrap capability probe failed with No permissions to create new namespace. No target code, tests, network requests or runtime reproduction were executed during this validation. No deployment configuration or real cookie cache was inspected. Sensitive impact requires a non-public, still-usable session cookie scoped outside the selected recipient's authority and an operator workflow that exposes that cache to the recipient. Public fixture passwords alone do not establish this. | In a future approved sandbox with no external network, an empty allowlisted environment, read-only target/tools, scratch-only writes and low resource/time limits, invoke the exported isJarStillValid interface with injected existsSyncImpl/readFileSyncImpl returning a synthetic Netscape jar and a recording fetchImpl. Use only dummy host-only app-a.test and idp.test cookies, select https://app-b.test, and have fetchImpl return ok:true with authenticated:false. Check that the recorded target is https://app-b.test/api/auth/me, the recorded Cookie contains both dummy markers despite incompatible source hosts, and validation returns false after the call. Compare against CookieJar.header for the same destination with equivalent synthetic cookie state. Separately check the parseArgs default cache path is unchanged across A/B. Stop after that boundary observation; do not invoke live login, use real credentials, or replay cookies. Any retained execution evidence requires a new parent-owned promotion allowlist and limits because this run's allowlist is empty. | The owner can inspect cookie metadata and developer workflow configuration locally, without copying values or sending requests, to determine whether a default username cache contains a non-public app or IdP session, whether it is still usable under its issuer's session policy, and whether the same cache is reused for a separately administered destination without --force or an explicit per-destination jar. Establish who controls the selected recipient and whether the developer intentionally authorized that recipient to receive the source sessions. Report only metadata and the resulting trust relationship. |
| Visibility descendant queries can multiply equivalent dependency paths | `app/api/requirement-selection-questions/[id]/visibility/route.ts:16` → `lib/dal/requirement-selection-questions.ts:1927` | The required OS-enforced sandbox is unavailable: the parent namespace probe failed with No permissions to create new namespace. This verifier performed source inspection only; no target code, SQL query, fixture or availability experiment was executed. The SQL Server execution plan and bounded actual intermediate-work growth are unobserved. Source expresses repeated-path multiplicity, but actual physical work and the effectiveness of SQL workload controls remain decisive runtime facts. Meaningful impact on another request is unestablished. The default 15000 ms request timeout, driver cancellation, transaction rollback and shared pool are source-visible controls; their effective timings, resource isolation and deployed ingress settings have not been measured or owner-verified. | Only after an approved OS-enforced offline sandbox is available, use a disposable SQL Server fixture with dummy identities and the real migrations and visibility route validation. Predeclare a fixed tiny corpus of at most five questions with one or two valid answer conditions per dependency, comparing acyclic cases with identical distinct descendants. Limit the runner to one edit at a time, at most one benign concurrent fixture request, explicit CPU and memory ceilings, an external wall-clock cutoff, and a cap on measured query rows; retain the configured request timeout and cancellation controls. Inspect actual plan row counts or bounded work counters, transaction rollback and connection release. Do not enlarge the corpus to force a timeout or availability degradation; if the fixed bounds cannot settle shared effects, retain the blocker. Stop immediately once growth is established or refuted. Separately observe cancellation only using a predeclared lower fixture timeout without increasing graph size. No production or shared development traffic is permitted. | The owner should inspect effective DB_REQUEST_TIMEOUT_MS, DB_POOL_MAX, pool acquisition limits, SQL resource/workload isolation, runtime instances sharing the database, and nginx API rate/burst attachment without traffic generation or secret disclosure. Verify recovery/cancellation telemetry if it already exists. Source defaults and a small local growth result alone do not establish meaningful deployed shared impact. |
| Ordinary specification deletion may erase preserved confirmed-agreement history | `app/api/requirements-specifications/[id]/route.ts:119` → `lib/dal/requirements-specifications.ts:1560` | Required OS-enforced execution isolation is unavailable: the audit capability probe reported No permissions to create new namespace. No target process, SQL fixture, deletion, foreign-key interaction or retained-history readback was executed. The information owner must resolve whether the documented cancelled-confirmation preservation contract applies to explicitly authorized whole-specification deletion. If such deletion intentionally permits erasing this history without export, the security claim is not established. A future isolated migrated SQL fixture must establish the minimum deletion outcome, including actual foreign keys and retained audit, for a specification with only its first cancelled confirmed agreement. This source review does not claim universal or observed deletion success. | Only after an approved isolated offline sandbox is available, use a disposable migrated SQL fixture with dummy responsible and separate coauthor identities and strict resource limits. Legitimately establish a first future agreement, record a correction if testing correction-history loss, cancel it as the responsible person, and verify retained confirmation/content. Invoke the ordinary DELETE route once as the assigned coauthor and inspect only that specification's agreement, correction and item rows plus the retained action audit. Include a separate pending/current agreement control that must reject deletion. Account for all actual foreign keys and stop after this bounded result; never use existing services or real records. | Obtain an owner decision on explicit whole-specification deletion under ADR 0063 and the information-asset preservation rule. Reject the security claim if erasure is explicitly permitted. If preservation is required, confirm the deployed revision, schema constraints and runtime grants through read-only owner inspection; do not test deletion against deployed data. |

<!-- markdownlint-enable MD013 -->

Concurrent workspace changes: 17 UI, component, test and documentation paths
changed during the audit. Parent reviewed their source diffs and preserved them.
Exact paths and supplemental hashes are recorded in run-metadata.json; the
initial manifest is retained. No audit finding trace changed.

## Hardening notes

These are separate from security findings.

- AI deployment evidence assessment validates supplied structured evidence and
matching path identities; actual evidence provenance, staging environment
configuration and production attachment remain operator-observed facts.

- AI settings PATCH (lib/dal/ai-settings.ts:780) merges a pretransaction read
into a complete update. Field-specific transactional updates or a revision
check would avoid lost concurrent Admin changes. No lower-privilege action or
operator-guard bypass was established.

- Area/package grant routes authorize before entering their serializable
mutation transaction. If the intended policy requires transfers to cancel
already-admitted grant writes, pass actor identity into the locked mutation
and recheck authority there. This optional stronger revocation invariant is
not established by current governance; no security bypass is asserted.

- Authoring routes provide a five-minute deadline, but integration passes only
abortSignal to the coordinator, which derives a fresh deadline from the
operator profile (integration-layer.ts:583; run-coordinator.ts:664). Clarify
or clamp the deadline contract; finite profile budgets prevent treating this
alone as unbounded work.

- Azure resource ownership tags are management metadata rather than independent
IAM authorization. No source-backed lesser principal able to retag resources
for this operator was established; no cross-account escalation is claimed.

- For REST specification imports, consider matching MCP durable-session behavior
by rechecking assignment authority inside the write transaction. The current
per-request authorization plus immediate capacity admission has no established
stale-job exploit; an ordinary in-flight revocation race alone is not a
finding.

- Graph validation at lib/dal/requirement-selection-questions.ts:1866-1918 reads
a snapshot before replacement, and history marking races with ordinary answer
writes without an explicit shared graph/specification lock. An isolated
concurrency regression would clarify cycle/history consistency. No runtime
schedule, deadlock, or unauthorized result was observed because target
execution is prohibited.

- Lifecycle routes write action audit after the DAL transaction, for example
app/api/requirement-selection-questions/[id]/_state.ts:36. An audit storage
failure can leave a committed authorized mutation with an error response;
transaction-scoped audit would avoid that mismatch. No caller-controlled audit
failure, unauthorized operation or separate security consequence was
established.

- Lifecycle usability is not uniformly enforced:
deleteRequirementSelectionAnswer at
lib/dal/requirement-selection-questions.ts:1494 lacks the last-active-answer
guard used by deactivate/archive, and updateRequirementSelectionQuestion:1053
permits changing multiple to single without reconciling existing multiple
selections. Shared parent locking and consistent reconciliation would improve
correctness under sequential or concurrent edits. The affected filter is
optional and Published-only; no new authority or protected-data access is
established.

- MCP output escaping was inspected in source; the external MCP host's sandbox,
navigation and rendering behavior were not exercised.

- Production app-node-http deliberately relies on an external TLS edge and
network attachment; reviewed source normalizes forwarded headers and validates
trusted-proxy CIDR files, but owner deployment evidence is necessary to claim
operational isolation.

- Scope limitation: this follow-up documents existing controls only, as
instructed. No new vulnerability assessment, exploit design, execution or
external verification was performed. The forensic fingerprint references the
already tracked record without restating or extending it.

- Shared HSA fingerprint accounting assumes consistently provisioned server
secrets and stable authenticated actor identity across nodes. No deployment
secret values or identity-provider behavior were inspected.

- Stateless browser sessions intentionally retain IdP role snapshots until
expiry and cannot revoke a copied cookie individually; operators should retain
the documented short access-token lifetime and coordinated secret-rotation
response. This is not reported as a new vulnerability.

- The elevated devcontainer intentionally grants SYS_ADMIN and unconfined
sandbox options to trusted developer code. That opt-in alone is not a
demonstrated escape or privilege escalation.

- The existing descendant-history note remains applicable: state changes at
lib/dal/requirement-selection-questions.ts:1151 and :1458 mark only direct
saved selections, while ADR0022 also calls for newly hidden descendants to
become historical. Reactivation itself does not clear historical flags, and
current readers independently recompute visibility. Preserve this as the
existing lifecycle correctness issue rather than duplicating the visibility
unit or claiming a demonstrated security impact.

- The per-specification loop at lib/dal/requirement-selection-questions.ts:1981
intentionally propagates stewardship changes only to specifications with
affected current answers; ADR0022 explicitly requires that behavior. Its
breadth alone is not an authorization or availability finding. Memoized
visibility evaluation at :482 avoids repeated recursive computation within
each specification.

- Use getBrowserLinkUri consistently for requirement-detail norm links:
requirement-detail-client.tsx:555 and
stewardship/requirement-selection-questions-client.tsx:765 currently pass raw
stored URI to RequirementDetailSections. React javascript rejection, opener
isolation and CSP prevent a demonstrated XSS here; this is policy consistency
advice.

- containers/app/Dockerfile.dockerignore omits .local/, while
scripts/provision-ai-provider-secret-keyring.mjs:72 defaults a private keyring
there and Dockerfile:48 copies the build context. Exclude .local/ to avoid
unnecessary builder exposure. No final-image disclosure, exported builder
cache, or less-trusted builder principal was established.

- containers/app/Dockerfile:1 selects docker/dockerfile:1.7 by mutable tag while
its builder/runtime bases are digest-pinned. Pinning the frontend digest would
improve reproducibility; tag mutability alone did not establish an
attacker-controlled publication boundary.

- kravhantering-images.sh:106-111 executes the selected env file, while the
disconnected guides generate it from offline-manifest imageRefs. A strict
allowlisted assignment parser and image-reference validation would reduce
reliance on executable operator configuration. No source-established lesser
writer of the authenticated handoff or operator file was found; this is not a
command-execution finding.

- kravhantering-images.sh:344 extracts the transport archive before checking its
internal hashes and :355 loads OCI data before final image verification.
Explicit archive entry/type/path and size checks would strengthen handling of
malformed transport inputs. The current contract relies on approved transport
and trusted operator artifacts; no archive escape, resource impact or bypass
of the independent installed image lock was established.

- lib/dal/requirement-selection-questions.ts:1150-1184 and :1456-1492 mark only
directly changed question/answer selections historical when deactivating or
archiving; unlike visibility replacement, they do not run descendant-history
propagation. docs/adr/0022-synlighetsvillkor-for-kravurvalsfragor.md requires
newly hidden saved descendants to become historical. Current read/filter paths
still recompute visibility and exclude hidden answers, so this is a lifecycle
correctness issue rather than an established authorization bypass; review
restoration semantics before changing it.

- lib/pdf/server-response.tsx:20 uses renderToBuffer without checking
pdfReportMaxFileBytes, while docs/operations/capacity-management.md:110
describes shared PDF byte limits. Worker memory isolation is explicitly
limited to worker-rendered PDFs. No separate resource-impact finding is
asserted solely from the missing byte check.

- scripts/lib/dev-login-core.mjs:202 logs complete cookie headers under explicit
debug mode and :372 sets mode only when creating a file. No lower-trust
log/file reader or active permissive existing-file deployment was established,
so these are not additional findings.

- tests/unit/requirements-service.test.ts:2035,2111 describe source access as
unnecessary while the fixture injects a no-op authorizer at :326. Rename these
isolated workflow tests and add a real-authorizer regression for source-only,
target-only and dual-assigned actors when test execution is available;
production source enforces both assignments.

## Positive source patterns

- OIDC callback binding, sealed session cookies, stripped identity headers,
same-origin mutation checks and centralized route policies establish explicit
identity boundaries.
- Requirement/specification primary reads and mutations use assignment-aware
services; many stateful writes bind parents, use locks and enforce revision or
status predicates.
- MCP validates bearer identity and reuses application authorization; AI
provider destinations and model output pass dedicated trust checks.
- HSA lookup uses layered certificate identity checks and binds signed
verification evidence to actor, person, purpose, scope and expiry.
- Browser Markdown is rendered through constrained components; reviewed external
links isolate openers and page responses establish CSP/frame controls.
- Release/deployment paths contain provenance checks, pinned images, separated
runtime/jobs and bounded shared quota mechanisms. Source controls do not prove
deployed configuration.

## Coverage

Ledger: 115 units; 90 covered, 23 candidate, 2 blocked, 0 deferred, 0
out_of_scope, 0 not_applicable.

Source checks name 500 distinct repository paths. A covered unit means its
recorded source boundary was traced; it does not mean every file or runtime
condition was proven safe. Candidate units may share one deduplicated record.

<!-- markdownlint-disable MD013 -->

| Assignment group | Units | Covered | Candidate | Blocked / deferred |
| --- | ---: | ---: | ---: | ---: |
| ai | 9 | 8 | 1 | 0 |
| auth | 11 | 11 | 0 | 0 |
| browser | 8 | 8 | 0 | 0 |
| hsa | 8 | 8 | 0 | 0 |
| mcp | 8 | 8 | 0 | 0 |
| operations | 10 | 5 | 5 | 0 |
| outputs | 9 | 7 | 2 | 0 |
| release | 10 | 10 | 0 | 0 |
| requirements | 7 | 3 | 4 | 0 |
| specifications | 6 | 3 | 3 | 0 |
| wave2-ai | 5 | 3 | 1 | 1 |
| wave2-business | 6 | 3 | 2 | 1 |
| wave2-database | 2 | 2 | 0 | 0 |
| wave2-operations | 3 | 1 | 2 | 0 |
| wave3-1 | 1 | 1 | 0 | 0 |
| wave3-2 | 1 | 1 | 0 | 0 |
| wave4-1 | 1 | 0 | 1 | 0 |
| wave5-agreements | 1 | 1 | 0 | 0 |
| wave6-1 | 1 | 1 | 0 | 0 |
| wave6-2 | 1 | 1 | 0 | 0 |
| wave7-1 | 1 | 1 | 0 | 0 |
| wave7-2 | 1 | 1 | 0 | 0 |
| wave7-3 | 1 | 1 | 0 | 0 |
| wave7-4 | 1 | 1 | 0 | 0 |
| wave8-1 | 1 | 0 | 1 | 0 |
| wave8-2 | 1 | 1 | 0 | 0 |
| wave9-1 | 1 | 0 | 1 | 0 |

<!-- markdownlint-enable MD013 -->

Nine hunter waves expanded 87 initial units to 115. The immediate post-wave-nine
critic and a distinct fresh final-clean critic both accepted no missing units or
reassignments. No planned or in-progress units remain. This closes the
standard-profile source coverage loop, not every possible runtime or deployment
question; two explicit external blockers remain.

**blocked: app/api/privacy/erasure-requests/route.ts#privacy erasure** — The
owner-approved erasure boundary for rfi_question_versions.created_by_*,
specification_rfi_lists locked/changed actor fields, and
rfi_question_suggestions created/resolved actor fields is not established by the
reviewed policy. These stored identities are absent from GROUP_POLICIES;
determine whether each requires erasure or an explicit retention exception
before claiming complete multi-copy erasure coverage. No unauthorized retention
consequence is asserted without this policy fact.

**blocked: lib/transient-cleanup/cli.ts#release-independent cleanup** — No
execution was permitted. The actual producer termination boundary following
lease loss or force-close, including external provider completion, remains
unverified. The deployed cleanup image, mounted compatibility contract,
old/new-schema verification matrix, scheduler cadence and restored database
state were not available. Source parsing and fencing controls do not establish
those operational facts.

Initial turn rejected by automated cybersecurity screening. Retried as narrower
defensive source-control documentation; no exploit design or execution.
Remaining gaps require explicit blocked dispositions.

## Audit artifacts

- [Structured records](findings.json), with one final disposition per candidate.
- [Coverage ledger](coverage-ledger.json), with source checks and candidate
dispositions.
- [Architecture](architecture.md), [run metadata](run-metadata.json), and
[source integrity](source-integrity.json).
- [Confirmed finding detail](FINDINGS-DETAIL.md) and
[validation handoff](NEEDS-VALIDATION.md).
