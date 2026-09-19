# Needs validation

16 independently reviewed source-grounded leads remain unconfirmed. No severity
is assigned. No live or shared service should be probed to resolve them.

All future local checks require an OS-enforced sandbox with no external network,
an empty allowlisted environment, read-only source/tools, scratch-only writes,
dummy identities/data and low CPU, memory, process, file-size, disk and
wall-clock limits. Follow the bounded plan for each lead and stop at the minimum
observable result. Source-only review cannot substitute for that observation.

## 1. Taxonomy detail projections may disclose nonpublic library and specification-local requirement descriptions

Fingerprint: `norm-reference-linked-requirements-nonpublic-projection`

Source review supports an alternate-read authorization gap for an authenticated
ordinary user who has neither Admin/Reviewer roles nor authorship in the
affected area or specification. Norm-reference detail projects descriptions of
every linked library version, including nonpublished versions belonging to
another area's authors. Priority-level detail independently projects the latest
library version matching that priority without visibility filtering and local
requirement descriptions from specifications outside the caller's assignments.
Its local branch also reads retained, noncurrent bindings. Direct version and
specification-child APIs enforce the corresponding content authority. No HTTP
response or SQL fixture was executed, so disclosure and historical exposure
remain source-derived predictions rather than observed results; historical
preservation itself is not asserted to violate an erasure guarantee.

Claimed root cause: The taxonomy GET handlers pass only a validated taxonomy ID
and a shared database handle to linked-description queries. Norm-reference SQL
filters only the linked norm-reference ID. Priority-level SQL ranks library
versions after filtering by priority, without published-status or area-author
predicates, and unions local rows filtered only by priority, without
specification assignment or current-binding predicates. Neither handler applies
authorization or description filtering before JSON serialization. Session
authentication, integer validation, parameterized SQL and taxonomy existence
checks do not enforce these resource-level content boundaries.

### Source trace

- **entrypoint** `app/api/norm-references/[id]/route.ts:58` — GET route
parameter parsing: Accepts the caller-selected norm-reference ID through
idParamSchema; the registered transport policy permits a signed-in session.
- **propagation** `app/api/norm-references/[id]/route.ts:64` — GET linked
requirement lookup: Passes the database handle and parsed ID to
getLinkedRequirements without actor or assignment context.
- **propagation** `lib/dal/norm-references.ts:258` — getLinkedRequirements SQL
and return mapping: Projects linked requirement_versions.description, version
and status; WHERE at line 273 restricts only norm_reference_id. The mapping at
line 278 retains description and merely normalizes archiveInitiatedAt.
- **sink** `app/api/norm-references/[id]/route.ts:69` — GET JSON response: After
confirming the norm reference exists, serializes linkedRequirements without
per-requirement or per-version authorization.

### Verified source evidence

- `lib/http/route-security-policy.ts:674` — Norm-reference detail GET declares
session auth, no CSRF, authenticated sensitivity and framework-default cache
policy; it does not declare a role or assignment gate.
- `proxy.ts:343` — enforceAuth accepts an isSignedIn session. The API
continuation at lines 483-489 strips spoofable identity headers and forwards
the request without taxonomy-specific role or content authorization.
- `lib/http/validation.ts:152` — idParamSchema uses positiveIntegerStringSchema,
whose lines 51-56 validate and convert a positive SQL Server integer; this
constrains identifier shape, not object visibility.
- `lib/db.ts:87` — getRequestSqlServerDataSource returns the shared application
DataSource without receiving actor context. The connection cache at lines
63-72 is keyed by connection URL, not authenticated principal.
- `lib/requirements/assignment-authorization.ts:865` — Explicit Published
versions are readable; nonpublished versions require history authority, which
at lines 872-879 requires Reviewer or area authorship. The earlier Admin
bypass is at line 704.
- `lib/requirements/service-requirements.ts:705` — Direct version reads
authorize the actual selected version's status before selecting the response
content at lines 734-749.
- `app/api/requirements/[id]/versions/[version]/route.ts:36` — The protected
comparison endpoint calls service.getRequirement with the selected
versionNumber and view='version'.
- `lib/dal/requirement-packages.ts:471` — Comparable package-linked description
SQL explicitly requires STATUS_PUBLISHED, demonstrating a source-visible
visibility restriction absent from the norm and priority projections.
- `app/api/priority-levels/[id]/route.ts:53` — Sibling GET validates the ID and
checks priority existence, then passes only db and id to getLinkedRequirements
and directly serializes the returned descriptions at line 54.
- `lib/http/route-security-policy.ts:719` — Priority-level detail GET likewise
declares session authentication, with no administrative or
specification-assignment transport gate.
- `lib/dal/priority-levels.ts:143` — The library branch projects version
description and orders each requirement's versions descending after filtering
only by priority_level_id at line 158; rowNumber=1 selects the latest matching
version, not necessarily the latest overall or a Published version.
- `lib/dal/priority-levels.ts:163` — The specificationLocal UNION branch
projects local description from specification_local_requirements, with only
priority_level_id in its WHERE at line 175; it neither receives actor identity
nor joins specification assignments or a current-binding view.
- `lib/specifications/permissions.ts:47` — canReadSpecification requires
Admin/Reviewer or responsible/co-author HSA assignment; it does not permit
arbitrary authenticated users.
-
`app/api/requirements-specifications/[id]/local-requirements/[localRequirementId]/route.ts:78`
— Primary local requirement detail authorizes get_specification_child for both
supplied specification ID and local child ID before reading its description.
- `lib/requirements/assignment-authorization.ts:678` — Child authorization
resolves the actual owner and then requires Admin or specification-read
authority. Owner resolution at lines 258-314 rejects mismatched parents; lines
828-845 allow Reviewer or owning-specification authorship.
- `lib/dal/requirements-specifications.ts:2288` — Default direct local detail
uses LOCAL_REQUIREMENT_DETAIL_SELECT, whose line 2185 reads
current_specification_local_requirements, and binds both local ID and
specification ID at line 2306.
- `typeorm/migrations/0069_specification_agreements.mjs:22` — The current
local-requirements view excludes bindings whose valid_until is past and whose
valid_from is future. Priority detail instead reads the underlying table;
retained historical rows are therefore within its source-visible query domain.

### Exact blockers

- The parent reports that the required OS-enforced sandbox probe failed with 'No
permissions to create new namespace'. Namespace-based network/mount isolation
is unavailable, so no target code, HTTP route, database query or dummy fixture
was executed. The decisive unresolved observation is whether the taxonomy JSON
includes a dummy description for a principal denied that exact version or
owning specification by the direct API.

### Bounded local validation

Only in an approved OS-isolated offline environment with read-only target/tools,
scratch-only writes, an empty allowlisted environment, explicit resource/time
limits, and disposable SQL plus synthetic authentication: create ordinary
principals Alice and Bob with distinct dummy HSA identities, neither Admin nor
Reviewer. Assign Alice area A and specification A; give Bob no assignment in
either. Seed one Draft library version with a harmless unique marker, linked to
existing dummy norm N and system priority P. Verify Alice can read it and Bob is
denied GET /api/requirements/{requirementId}/versions/{versionNumber}. As Bob
request GET /api/norm-references/{N}; inspect only whether linkedRequirements
contains that marker, then stop that variant. Independently request GET
/api/priority-levels/{P} as Bob and inspect only the marker in source='library',
then stop that variant. For the local variant seed one current local requirement
in Alice's specification A with another harmless marker and priority P. Verify
Bob is denied GET
/api/requirements-specifications/{A}/local-requirements/{localId}, then inspect
the priority GET for that marker in source='specificationLocal' and stop. If
historical scope must be characterized, use one separate dummy retained binding
with valid_until in the past and a distinct marker; compare the normal local
detail's absence with priority output without claiming deletion or erasure
failure. Record only fixture identifiers, principal roles/assignments, response
statuses and marker-presence booleans; never use production data, credentials or
shared services.

## 2. Specification preload may disclose parent data when authorization fails with an internal error

Fingerprint: `specification-preload/authorization-error-partial-data-disclosure`

A signed-in user without Admin, Reviewer or an assignment to another owner's
specification can supply its numeric/code page selector. The preload obtains raw
parent metadata, needs-reference descriptions and selected packages while a
separate available-requirements service call performs read authorization.
Healthy 401/403 denials discard these raw values. A selective assignment-query
error, or a denial-audit failure converted to internal error, instead reaches
the generic partial-data fallback and leaves those values in client initialData
without a successful read decision. This requires successful route/parent and
uncaught coauthor reads and successful reads of the claimed disclosed fields.
Source review did not establish a rendered unauthorized response,
user-controlled failure induction or deployment occurrence.

Claimed root cause: The preload conflates non-401/403 failures before successful
authorization with optional-resource failures after authorization. It has no
separately established positive read decision before serializing raw
parent-derived data, and the shared authorization helper can replace a real
denial with an internal error when mandatory denial auditing fails.

### Source trace

- **entrypoint** `app/[locale]/specifications/[specificationId]/page.tsx:26` —
Specification detail Server Component: The authenticated browser supplies a
numeric/code specification selector; the page resolves it then calls the
preload without its own assignment predicate.
- **propagation** `lib/specifications/preload.ts:219` — Raw parent and parallel
preload reads: getSpecificationById loads the parent before service
authorization completes. The uncaught coauthor read at line 245 must also
succeed. Needs references at line 290 and the package query at line 352 use
direct database helpers without actor authorization.
- **propagation** `lib/requirements/service-specifications.ts:342` —
getAvailableSpecificationRequirements: The service authorizes first, so a
successful call and recognized 401/403 are strong controls. Assignment lookup
or denial-audit failures may instead reject with an internal/non-service
error.
- **propagation** `lib/specifications/preload.ts:374` — Authorization-dependent
error handling: Recognized 401/403 discard raw data for a limited forbidden
summary. Other errors at :398-407 replace only available requirements and
retain previously loaded parent/needs/package data in :410-438.
- **sink** `app/[locale]/specifications/[specificationId]/page.tsx:103` — Client
component initialData serialization: After notFound/forbidden checks,
initialData is passed directly to the use-client
RequirementsSpecificationDetailClient. The source has no additional assignment
admission at this boundary; actual serialized response behavior remains
unexecuted.

### Verified source evidence

- `docs/governance/behörigheter.md:163` — Admin/Reviewer may read all
specifications; other signed-in users may read only specifications where they
are responsible or coauthors. A direct link does not grant access to an
unassigned specification. The limited forbidden guidance is implemented
separately in the page/preload, rather than specified in this policy passage.
- `proxy.ts:328` — The proxy enforces a valid signed-in cookie for the page.
This is an authenticated assignment-boundary claim, not anonymous access.
- `lib/requirements/server-component-context.ts:6` — The Server Component
context derives HSA identity and roles from the validated session, not
caller-supplied identity headers.
- `lib/requirements/assignment-authorization.ts:153` — The parameterized
isSpecificationAuthor query tests responsible/coauthor assignment.
assertAuthorized requires authentication at line 676, allows Admin at line
704, routes specification reads at line 719, and requires Reviewer or
successful author lookup at lines 828-845. An assignment-query exception is
not a positive read decision.
- `lib/requirements/service-shared.ts:197` — authorize awaits denial auditing
before rethrowing the original authorization error; it does not preserve a
separate successful-decision token.
- `lib/requirements/security-audit.ts:477` — Required denial auditing catches
audit errors and throws internalError at line 507, replacing the original
forbidden error; errors.ts maps internal to HTTP 500. Non-service database
errors bypass denial-audit classification at line 517 and propagate from
authorize unchanged.
- `lib/dal/requirements-specifications.ts:1654` — The raw needs-reference helper
returns text and description by specification_id only; it has no actor
parameter. Parent metadata similarly comes from getSpecificationById :927.
- `lib/specifications/permissions.ts:69` — The computed permissions describe
edit/manage/review/AI capabilities; they do not filter the preloaded data or
prove canReadSpecification.
- `lib/specifications/preload.ts:475` — Sibling catalog preload uses
listSpecificationsForActorCatalog with actor identity/canReadAll and an empty
capture fallback. The comparable REST detail GET at
app/api/requirements-specifications/[id]/route.ts:55 awaits authorization
before returning content; its catch returns an error rather than the
already-read parent.
- `tests/unit/specifications-preload.test.ts:339` — Source tests expect
assignment guidance for mocked forbidden rejection and parent retention for
generic resource failures at line 386. They mock the available-requirements
service and do not exercise real assignment authorization plus a denial-audit
failure. No tests were executed.
- `lib/requirements/server.ts:37` — Production preload runtime constructs the
default authorization service; auth.ts:306 returns
AssignmentBasedAuthorizationService, so the reviewed assignment and audit path
is not merely an unused implementation.
- `lib/requirements/specification-requirement-packages.ts:76` — Package query
normalizes limits/search/include IDs and binds cursors to specification/query,
then loads rows and selected packages by specificationId without an actor or
authorization call. These controls do not admit the reader.
-
`app/[locale]/specifications/[specificationId]/requirements-specification-detail-client.tsx:1`
— The sink target is explicitly a client component. It initializes
specification state from initialData.spec at line 562 and needs-reference
state from initialData.availableNeedsRefs at line 806; edit permissions do not
redact those props.
- `lib/specifications/preload.ts:445` — Numeric selectors use the positive
integer schema; code and ID resolution use parameterized DAL queries and the
page redirects to the canonical numeric route. No successful assignment
decision is established by resolution.

### Exact blockers

- The required OS-enforced sandbox is unavailable: the supplied capability probe
reported No permissions to create new namespace. No target code, test,
rendered response or failure fixture was executed.
- Decisive local evidence must show a selective assignment-query or
required-denial-audit failure while route resolution, parent lookup, uncaught
coauthor lookup and the claimed raw data reads succeed, then establish that
the dummy private marker crosses the page/client serialization boundary. A
total database outage, early uncaught coauthor error or healthy recognized
401/403 does not establish disclosure.
- Source does not establish an ordinary user's ability to induce the selective
failure, its deployment frequency or an affected production response. The
impact remains a conditional read of another assignment owner's specification
metadata/needs/package selection, without demonstrated child-content or
mutation impact.

### Bounded local validation

In a future approved offline OS sandbox with read-only target/tools, empty
allowlisted environment, scratch-only writes and low time/resource limits, use
dummy owner and unassigned authenticated actors without Admin/Reviewer and one
dummy specification containing a unique non-sensitive needs-description marker.
Keep route resolution, parent, coauthor and raw needs/package reads successful.
Through the real default authorization path, first verify healthy negative
assignment lookup returns a limited forbidden shell; then narrowly fail only its
required denial-audit database write. Alternatively narrowly fail its assignment
lookup. Invoke the preload/page boundary and inspect client-prop serialization
for the one marker; do not merely mock getAvailableSpecificationRequirements to
reject. Compare an authorized optional-resource failure and total database
failure. Stop at the minimum dummy boundary result or refutation; no network,
shared services or induced outage. Predeclare any required evidence artifact and
trusted promotion limits before execution.

### Owner-observed configuration check

The owner may inspect existing sanitized telemetry for selective
assignment-query or denial-audit errors and the deployed revision/framework
response handling. Do not generate errors, send new audit traffic or inspect
private specification contents. Establish whether parent/coauthor reads remained
successful during any relevant failure; existing telemetry calibrates occurrence
but does not substitute for the isolated dummy serialization fixture.

## 3. Suggestion detail can expose a nonpublic requirement-version description

Fingerprint: `suggestion-original-version-description-nonpublic-projection`

Source review supports a disclosure path for an authenticated ordinary reader
who lacks area authorship and the Admin and Reviewer roles. If a requirement has
a published version and an existing suggestion linked to a nonpublic sibling
version, the direct suggestion-detail REST route authorizes the parent
requirement and returns the linked version's description. An authorized author
can create that link; the reader needs only the suggestion ID. The claim
concerns the joined requirementDescription, not intentionally readable
suggestion content. No runtime disclosure or deployed affected data state has
been demonstrated.

Claimed root cause: The get_improvement_suggestion action resolves the parent
requirement and tests whether any sibling version is currently published. It
does not resolve or authorize the suggestion's original requirementVersionId.
getSuggestion independently joins that original version and preserves
requirementDescription in its row mapper; the REST route spreads it into JSON.
Its separate implementing-version authorization masks implementation metadata
only. Source-visible session validation, positive numeric parameter validation,
parameterized SQL, same-parent creation validation, and no-store responses do
not enforce the missing original-version visibility check.

### Source trace

- **entrypoint** `app/api/improvement-suggestions/[id]/route.ts:31` — GET
getHandler: An authenticated caller selects a positive numeric suggestion ID
through the REST path. After route-param parsing and production runtime
creation, lines 41-45 authorize get_improvement_suggestion and line 46 reads
the suggestion.
- **propagation** `lib/requirements/assignment-authorization.ts:511` —
SqlAssignmentLookup.resolveSuggestionRequirementTarget: The parameterized
lookup binds the suggestion to its actual parent requirement and computes
hasPublishedVersion using any published sibling. It does not select the
original requirementVersionId or its current status.
- **propagation** `lib/requirements/assignment-authorization.ts:684` —
AssignmentBasedAuthorizationService.assertAuthorized: After
requireAuthenticated at line 676, the suggestion-read action passes its
resolved parent to assertCanReadRequirementTarget with the default detail
view. Admin has an explicit bypass.
- **propagation** `lib/requirements/assignment-authorization.ts:872` —
assertCanReadRequirementTarget: Line 877 allows a detail read when the parent
has a published version; otherwise Reviewer or an area author is required.
This allows an ordinary reader of the published parent regardless of the
linked original version's status.
- **propagation** `lib/dal/improvement-suggestions.ts:322` — getSuggestion SQL
projection: Selects requirement_version.description AS requirementDescription.
Lines 326-327 join by suggestion.requirement_version_id without a
published-status filter, and line 342 returns the mapped row.
- **propagation** `lib/dal/improvement-suggestions.ts:169` —
mapSqlServerSuggestionRow: Preserves a non-null requirementDescription as a
string without a visibility or lifecycle check.
- **sink** `app/api/improvement-suggestions/[id]/route.ts:56` — GET JSON
response projection: Spreads suggestion into NextResponse.json, including
requirementDescription. Lines 47-54 remove implementation-related fields only,
and lines 58-62 separately authorize implementation metadata.

### Verified source evidence

- `lib/http/route-security-policy.ts:628` — The direct suggestion-detail GET
declares session authentication, sensitive data and no-store caching; it does
not require area authorship at the transport boundary.
- `lib/requirements/auth.ts:306` — Production runtime uses
AssignmentBasedAuthorizationService. Session context at lines 318-346 checks
configured authentication, same-origin request handling and signed-in session
state before projecting identity and roles. The candidate assumes a legitimate
reader session.
- `app/api/requirement-suggestions/[id]/route.ts:24` — Creation accepts an
optional positive requirementVersionId, and the secure mutation policy at
lines 58-68 requires manage_suggestion/create for the parent requirement
before calling the shared service.
- `lib/requirements/service-suggestions.ts:127` — The shared mutation workflow
authorizes manage_suggestion and, for creation at lines 149-164, requires a
human actor snapshot, uses that actor's identity, and passes the requested
original version ID to createSuggestion.
- `lib/requirements/assignment-authorization.ts:951` — Suggestion management
requires authorship of the resolved requirement area, subject to the earlier
Admin bypass. No ordinary-reader mutation bypass is claimed.
- `lib/dal/improvement-suggestions.ts:372` — Creation validates that the
original version exists and belongs to the supplied requirement; the query has
no status condition. Lines 393-407 persist the supplied version ID. This
permits a legitimate same-parent nonpublic link.
- `lib/requirements/assignment-authorization.ts:860` — A direct version read
with a nonpublished status uses history authorization at lines 865-867,
requiring Reviewer, Admin or applicable area authorship rather than
published-parent detail permission.
- `lib/requirements/service-requirements.ts:705` — The direct-version workflow
authorizes the requested version using its actual loaded status. The version
REST route passes view=version and the requested version number, so a client
does not choose the status supplied to this check.
- `lib/requirements/suggestion-implementation.ts:43` —
readSuggestionImplementation authorizes the implementing version and replaces
its metadata with null on a 403. Without implementing evidence it returns
immediately. This control does not inspect the original version or
requirementDescription.
- `docs/governance/behörigheter.md:224` — The documented version-read policy
depends on current version status; draft, review and archived versions require
privileged roles or applicable authorship, including previously published
versions now archived.
- `docs/governance/behörigheter.md:246` — Suggestion reads intentionally follow
parent requirement read permission. This supports readable suggestion content
but does not override the separately stated version-content restriction.
- `lib/requirements/service-suggestions.ts:102` — The shared list response
explicitly maps suggestion fields and omits requirementDescription, although
it returns suggestion IDs. The reviewed disclosure sink is direct REST detail.
- `lib/http/response-policy.ts:84` — The response wrapper receives the completed
handler response and applies registry cache policy; it does not filter
successful suggestion JSON fields.

### Exact blockers

- Required OS-enforced execution isolation is unavailable: the trusted
bubblewrap capability probe reported No permissions to create new namespace.
Target execution, SQL-backed fixtures and HTTP requests are prohibited in this
audit environment. The source path survives refutation, but no independent
runtime observation establishes the paired direct-version denial and
suggestion-description disclosure.

### Bounded local validation

In a future approved sandbox with no external network, a read-only target/tools
mount, an empty allowlisted environment, scratch-only writes and explicit low
resource/time limits, use a disposable local application and SQL fixture.
Provision a dummy area author and an unrelated authenticated reader with no
Admin or Reviewer role and no assignment in that area. Give one requirement a
published version and a draft sibling whose description has a unique harmless
marker absent from the published description and suggestion content. Through the
normal authenticated author flow, POST
/api/requirement-suggestions/{requirementId} with benign content and
requirementVersionId equal to the draft row ID; retain the returned suggestion
ID. As the reader, first establish a successful published-version read and a 403
from GET /api/requirements/{requirementId}/versions/{draftVersionNumber}. Then
GET /api/improvement-suggestions/{suggestionId} and inspect only the status and
whether requirementDescription contains the dummy marker. Check GET
/api/requirement-suggestions/{requirementId} omits that description. Start with
no implementation evidence, so implementation masking cannot change the result.
Stop after these bounded checks; preserve only dummy status/field observations
through the approved promotion procedure and discard the disposable fixture.

### Owner-observed configuration check

An authorized owner can check the deployed revision and, using existing approved
administrative access, determine whether suggestions link to currently nonpublic
versions of requirements that also have a published version. Record only whether
such a data state exists, without exporting real descriptions or personal
information. Reproduce the paired authorization/disclosure check only with dummy
records in an isolated staging fixture; no production probing or mutation is
needed to establish the code behavior.

## 4. Review PDF model computes a quadratic text diff on the application thread

Fingerprint: `reports/review-diff/quadratic-main-thread-lcs`

An authenticated assigned area author can supply a requirement revision, and
that author or a Reviewer can request its review PDF. When a long published or
archived baseline and an unequal long review revision coexist, one admitted GET
synchronously constructs a Cartesian LCS matrix before PDF rendering. Two
9,999-character fields consisting of single-character words separated by single
spaces fit the text schema and each yield 9,999 tokens, implying 100,000,000
allocated matrix cells. This is a source-derived work count, not an observed
memory allocation or denial of service. The version-count check, actor admission
quota, and per-node concurrency limit constrain admission but do not bound the
token product within one accepted comparison. Synchronous work shares the
requesting Node process's event loop and heap; meaningful delay, memory
pressure, and impact on unrelated requests remain unmeasured. Work ends on
completion, failure, or process termination; an independent watchdog can kill
the entire process after its outer deadline, with recovery dependent on
deployment supervision.

Claimed root cause: The report accepts text bounded by character count and
collections bounded by version count, then synchronously allocates and traverses
a full token-product LCS matrix without a token-product limit or cooperative
cancellation. The report model is evaluated before the rendering function is
called, and generation abort checks surround the callback rather than interrupt
this computation.

### Source trace

- **entrypoint** `app/[locale]/requirements/reports/pdf/review/[id]/route.ts:22`
— Authenticated review PDF GET: The requester selects a stored requirement.
The route authorizes history access, enters actor/capacity admission, counts
versions against the configured item limit, and loads report data.
- **propagation**
`app/[locale]/requirements/reports/pdf/review/[id]/route.ts:49` — Synchronous
report model construction: buildReviewReport is evaluated as an argument
before renderReportModelPdfResponse is invoked, keeping model computation on
the route's application thread.
- **propagation** `lib/reports/templates/review-template.ts:277` — Baseline and
review text comparison: After selecting a Review version and a Published or
Archived baseline, the template passes their complete descriptions to diffText
and also compares acceptance criteria at line 286. Missing review or baseline
versions return earlier.
- **sink** `lib/reports/text-diff.ts:69` — Application-thread matrix allocation
and traversal: For unequal nonempty strings, computeLcs allocates (oldLen + 1)
rows times (newLen + 1) cells, then synchronously visits oldLen times newLen
cells without an abort check or token-product cap.

### Verified source evidence

- `lib/http/validation-constants.ts:2` — BUSINESS_TEXT_MAX_LENGTH is 10,000
characters.
- `lib/http/validation.ts:107` — businessTextSchema trims only surrounding
whitespace and accepts nonempty strings up to the business text limit;
alternating words with internal single spaces and word endpoints survive this
normalization.
- `app/api/requirements/[id]/route.ts:230` — The secure PUT mutation uses
requirementEditSchema, whose description is businessTextSchema at line 61, and
passes the accepted description to manageRequirement. It requires a base
version ID and revision token.
- `lib/requirements/service-requirements.ts:903` — The authorized edit path
trims description, requires edit preconditions and a human actor snapshot, and
passes description to editRequirement without reducing internal tokens.
- `lib/dal/requirements.ts:902` — Editing the latest Published version creates a
new Draft containing the supplied description while preserving the published
baseline. Earlier transaction guards reject stale revision tokens and direct
editing of Review or Archived versions. The new draft must subsequently enter
Review before this report comparison runs.
- `lib/requirements/assignment-authorization.ts:872` — History access requires
Reviewer or an area author assignment; the published-detail shortcut does not
apply to history. Ordinary unaffiliated readers cannot request this report.
- `lib/reports/templates/review-template.ts:182` — The template chooses the
latest Review version and prefers a Published baseline, falling back to
Archived. It returns without a diff when either required side is absent.
- `lib/reports/data/server.ts:101` — The route's versions collection limit
counts database versions, not characters or tokens;
collectRequirementForReport returns the stored versions at line 133 without
text truncation.
- `lib/reports/text-diff.ts:62` — Tokenization retains whitespace runs as
tokens. Unequal 9,999-character alternating single-character words and single
spaces give 9,999 tokens per side. Equal strings and empty sides are
explicitly short-circuited at lines 14-23 and do not exercise the matrix.
- `lib/pdf/synchronous-generation.ts:53` — Configured per-node concurrency is
acquired before work, and the configured version item limit is supplied to the
callback. Abort checks at lines 59 and 65 surround the entire awaited callback
and cannot interrupt its synchronous LCS.
- `lib/generated-output/operation.ts:95` — The generation deadline is a
main-thread setTimeout that aborts a signal; it cannot preempt a synchronous
matrix computation on that event loop.
- `lib/generated-output/actor-quota.ts:87` — Admission requires authenticated
identity with HSA ID and a database-backed actor quota before starting work.
The independent watchdog is armed at line 118 with an absolute 840,000 ms
fail-stop deadline defined at line 18.
- `lib/generated-output/actor-watchdog.ts:11` — A separate worker sends SIGKILL
to the process at its deadline. This bounds eventual live work through
whole-process termination rather than isolating or cancelling a single diff.
- `lib/application-settings.ts:12` — The configured PDF item limit can be
1-1,000, so setting it to 1 would reject the required two-version state.
Defaults at lines 61-65 are concurrency 3, item limit 1,000, timeout 180
seconds, and PDF worker memory 512 MiB; deployed values have not been
observed. Renderer-stage controls begin after model construction.

### Exact blockers

- The authorized OS-enforced sandbox is unavailable: the supplied trusted
bubblewrap probe failed with 'No permissions to create new namespace'. Target
execution is prohibited, so no bounded growth, event-loop delay, allocation,
cancellation, or shared-request experiment was performed.
- Actual report reachability requires an authorized lifecycle-created Review
revision and a long Published or Archived baseline under a deployed item limit
of at least two. The schema and draft creation path support the proposed
state, but its complete lifecycle and route admission have not been exercised.
- Meaningful shared effect depends on actual Node worker topology, main-process
heap and container limits, any external report isolation or upstream
rejection, and supervisor recovery. Source alone does not establish elapsed
delay, memory consumption, process failure, or service-wide outage.

### Bounded local validation

In a disposable OS-isolated environment with no external network, an empty
allowlisted environment, read-only target/tools, scratch-only writes, and hard
CPU, memory and wall-clock limits, use small unequal 128-token and 256-token
comparisons to count matrix dimensions and measure bounded event-loop delay.
Stop after establishing growth and scheduling behavior; do not allocate the
proposed 100-million-cell matrix or attempt saturation. Use dummy authorized
principals and a local disposable database to create a legitimate published
baseline, edit with current revision preconditions, transition the draft to
Review through the supported workflow, and request the real review PDF with an
item quota of at least two. Replace the matrix allocation with a sentinel in a
focused harness if verifying full-size token counts. Record only the minimum
observed result and a harmless same-process scheduling probe; do not claim crash
or outage without evidence.

### Owner-observed configuration check

Have the owner confirm configured PDF item limits and admission quotas, whether
model construction shares a Node process with unrelated routes, any earlier
text/token-product limits or dedicated report process, main-process memory/CPU
limits, and supervisor restart behavior. Check configuration and topology
records only; no production load test or full-size request is needed.

## 5. Draft deletion may remove a version after it enters Review

Fingerprint: `requirement-delete-draft-status-check-write-race`

An authenticated author assigned to the requirement area can request draft
deletion and a permitted Draft-to-Review transition. Source permits deletion to
read Draft, the transition to commit Review, and deletion to subsequently target
the same version by id. If this schedule commits on SQL Server, it violates the
explicit Draft-only deletion invariant and can remove the requirement when this
was its sole version. Authentication, same-origin policy, assignment
authorization and atomic audit/deletion do not themselves preserve the checked
status through the delete. No execution or committed deletion of a Review
version has been observed; the minimum validation is limited to Review, without
claiming demonstrated removal of Published content.

Claimed root cause: deleteDraftVersion opens a transaction without an explicit
isolation override, reads getLatestVersionLite without lockForUpdate, checks the
returned Draft status, then removes associations and deletes
requirement_versions by id alone. The configured isolation is READ COMMITTED.
There is no repeated lifecycle check or status/revision predicate at the delete.
The nearby edit path explicitly uses SERIALIZABLE and UPDLOCK/HOLDLOCK, but
those controls do not cover draft deletion.

### Source trace

- **entrypoint** `app/api/requirements/[id]/delete-draft/route.ts:50` — POST:
Browser-callable mutation validates the requirement reference, applies
manage_requirement/delete_draft authorization, and invokes the shared service
at line 67.
- **propagation** `lib/requirements/service-requirements.ts:805` —
manageRequirement: Repeats shared operation authorization before resolving and
mutating the requirement.
- **propagation** `lib/requirements/service-requirements.ts:1111` —
manageRequirement delete_draft branch: Calls deleteDraftVersion with an audit
callback inside the deletion transaction; supplies no expected revision or
lifecycle predicate.
- **propagation** `lib/dal/requirements.ts:1140` — deleteDraftVersion: Reads
latest version without the available update/hold lock option, then rejects
unless the returned status is Draft.
- **sink** `lib/dal/requirements.ts:1164` — deleteDraftVersion: Deletes the
previously read version by id without requiring its status or revision still
to match the checked Draft.

### Verified source evidence

- `lib/http/secure-mutation-route.ts:291` — Wrapper requires authenticated
context; lines 306-311 validate params and lines 343-357 authorize before
invoking the handler.
- `lib/http/route-security-policy.ts:1584` — Delete-draft REST policy declares
session authentication and same-origin CSRF protection. These protect request
admission, not concurrent lifecycle consistency.
- `lib/requirements/assignment-authorization.ts:901` — Non-Admin delete_draft
authorization resolves the requirement and requires area authorship;
assertAreaAuthor at lines 848-856 binds the assignment to actor HSA-id. The
global Admin bypass is at lines 704-705.
- `lib/requirements/assignment-authorization.ts:908` — Transition authorization
allows an assigned area author to request Draft-to-Review; publishing,
archiving and exits from Review require Reviewer. This does not authorize
deletion of a Review version.
- `typeorm/seed-required.mjs:441` — Required transition seed permits Draft (1)
to Review (2); the minimum validation does not depend on a publication
decision.
- `lib/dal/requirements.ts:704` — getLatestVersionLite emits WITH (UPDLOCK,
HOLDLOCK) only when explicitly requested. deleteDraftVersion does not request
it.
- `lib/typeorm/sqlserver-config.ts:201` — DataSource uses
DEFAULT_TRANSACTION_ISOLATION_LEVEL, defined as READ COMMITTED at line 12.
deleteDraftVersion calls db.transaction without overriding it.
- `lib/dal/requirements.ts:1141` — Explicit invariant rejects non-Draft versions
at the initial read; the later delete at line 1164 uses id equality only.
Remaining-version counting can then cause deletion of the requirement at line
1188.
- `lib/dal/requirements.ts:1328` — transitionStatus updates status and
revision_token on the current version id and then runs its audit callback. Its
earlier current-status and configured-transition checks are at lines
1219-1244.
- `lib/dal/requirements.ts:813` — Comparable edit path uses SERIALIZABLE, a
locked latest-version read and base-version/revision checks, establishing
source-visible concurrency protection that is absent from deletion.
- `typeorm/migrations/0003_explicit_fk_actions.mjs:82` — Specification-item
references to requirement_versions use ON DELETE NO ACTION, so referenced data
can prevent deletion; validation must use an unreferenced disposable version.

### Exact blockers

- Required OS-enforced execution sandbox is unavailable: the parent bubblewrap
namespace probe failed with No permissions to create new namespace. No target
code, HTTP request, or SQL concurrency fixture was executed.
- The decisive SQL Server outcome remains unobserved: the authorized
Draft-to-Review transition must commit after deletion reads Draft and before
it resumes, and deletion must then commit despite lock, foreign-key and audit
interactions. Source supports the schedule but does not establish its observed
execution.

### Bounded local validation

In a future approved offline OS-isolated sandbox, use a disposable SQL Server
database with repository migrations, required status/transition seed, and a
dummy area-author principal. Create one Draft version without specification,
local-requirement, suggestion, package or other external referencing records.
First verify a sequential deletion request against Review is rejected. For the
bounded concurrency case, start authorized delete_draft through the shared
service and pause inside deleteDraftVersion immediately after its successful
Draft check, before any following query. On a separate connection invoke the
normal authorized transitionRequirement service with toStatusId 2 and require
its transaction to commit. Resume deletion, record both transaction outcomes and
inspect the version id and parent requirement. Confirm only if deletion commits
and removes the now-Review row; blocking, rollback or rejection is not
successful reproduction. Stop after this minimum outcome and destroy only the
disposable fixture. Do not use shared development services or real records.

### Owner-observed configuration check

No live destructive validation is needed. An owner may repeat the same
dummy-record schedule in an isolated staging database with the deployed schema
and isolation configuration if those differ; report any differences and actual
outcomes without deleting production content.

## 6. Concurrent status change can bypass Reviewer-only Review-to-Draft authorization

Fingerprint: `requirement-transition-state-dependent-authority-race`

Source review supports a state-dependent authorization race affecting a
requirement in an author's assigned area. An authenticated area author without
Reviewer or Admin can request destination Draft while the latest version is
Draft; both route and service authorization permit that destination based on the
observed source state. If a second authorized Draft-to-Review request commits
after the first request's final service authorization but before its DAL read,
the first request can use the now-valid Review-to-Draft graph edge and update
the review version without a Reviewer decision. A sequential Review-to-Draft
request by the same author is forbidden. This is a source-derived interleaving,
not an observed execution result.

Claimed root cause: The shared assignment policy reads latestStatusId outside
the transition transaction. The service passes the requirement identifier and
destination to transitionStatus, without the authorized source status, revision
token, or an authorization callback. The DAL reads the latest version again,
validates lifecycle and graph rules for that new state, and updates by version
identifier without rechecking the actor's authority for leaving Review.

### Source trace

- **entrypoint** `app/api/requirement-transitions/[id]/route.ts:29` — POST:
Authenticated mutation wrapper accepts a positive statusId, authorizes a
transition_requirement action, and calls the shared transition service. Draft
destination 1 passes the body schema.
- **propagation** `lib/requirements/assignment-authorization.ts:912` —
assertCanTransitionRequirement: Reads current target state. Leaving Review
requires Reviewer; destination Draft while source remains Draft instead
requires area authorship.
- **propagation** `lib/requirements/service-requirements.ts:1264` —
transitionRequirement: Repeats authorization before the mutation. After
authorization completes at line 1273, line 1286 calls transitionStatus without
binding the authorized source status or actor authority to its transaction.
- **propagation** `lib/dal/requirements.ts:1219` — transitionStatus: Reads the
latest version inside its later transaction and checks the transition graph
using this newly observed status at lines 1232-1235.
- **sink** `lib/dal/requirements.ts:1328` — transitionStatus: Updates the
selected version's status by id, without comparing the source status or
revision from authorization; the audit callback runs afterward.

### Verified source evidence

- `lib/requirements/assignment-authorization.ts:916` — The intended policy
requires Reviewer for any destination other than Review when latestStatusId is
Review; assertReviewer at line 802 rejects actors lacking that role.
- `lib/requirements/assignment-authorization.ts:353` — resolveRequirementTarget
reads latest.requirement_status_id through a database query outside the
subsequent DAL transaction, rather than returning a transaction-bound
authorization guard.
- `app/api/requirement-transitions/[id]/route.ts:25` — The body schema accepts
any positive statusId and does not reject Draft-to-Draft before authorization.
- `lib/http/secure-mutation-route.ts:204` — The route wrapper invokes the shared
assignment authorization service before the handler. This additional check
does not close an interleaving after the later service authorization.
- `lib/requirements/service-requirements.ts:1286` — The DAL receives resource
and destination plus an audit callback. The callback records the successful
mutation and selection cleanup, not Reviewer authorization for the source
state actually changed.
- `lib/dal/requirements.ts:1243` — Lifecycle checks restrict archiving review
and prohibit archive destination from publishing review. They do not reject
ordinary publishing Review-to-Draft. The candidate therefore requires
archive_initiated_at to be null.
- `typeorm/seed-required.mjs:441` — The required seed graph includes
Draft-to-Review (1 to 2) and, at line 443, Review-to-Draft (2 to 1). The same
author can issue the intervening Draft-to-Review operation.
- `lib/dal/requirements.ts:1329` — The version update predicates only on version
id and generates a new revision token; it does not compare the status or
revision used for authorization.

### Exact blockers

- The required OS-enforced execution sandbox is unavailable: the parent's
bubblewrap namespace probe failed with No permissions to create new namespace.
No target code, route, or SQL fixture was executed. The decisive missing
observation is whether the complete transaction, including auditing and
cleanup, commits the proposed Review-to-Draft change for the non-Reviewer
under the specified interleaving.

### Bounded local validation

In a future approved offline disposable sandbox, use actual assignment
authorization, the REST/service path, required schema and seed graph, and an
isolated SQL Server fixture. Create one dummy requirement with a single Draft
version, null archive_initiated_at, and one authenticated assigned area author
without Reviewer or Admin. Let a request targeting Draft pass route and final
service authorization, pausing immediately after service-requirements.ts line
1273 and before transitionStatus. Fully commit a normal Draft-to-Review request
by that author, then resume the first request. Inspect the final version status
and transaction audit to determine whether unauthorized Review-to-Draft
committed. As controls, verify that a sequential Review-to-Draft request by the
author is forbidden and an uninterrupted Draft-to-Draft request conflicts on the
graph. Preserve real authorization and SQL behavior; do not mock authorization
success. Stop after these bounded dummy operations and discard the fixture. Do
not use shared or deployed services.

## 7. Concurrent capture may retain forensic evidence after a successful purge

Fingerprint: `ai-forensic-capture/purge-before-close-retained-evidence`

An authenticated author allowed to generate requirements can submit
safety-blocked input during an approved capture while a PrivacyOfficer purges
that capture. Source permits the candidate interleave in which one bounded,
redacted evidence event is inserted after the purge DELETE and before the parent
is marked purged. If SQL Server permits that interleave, the application would
report successful disposal while the organization's protected forensic store
still contains an excerpt of the author's submitted text, potentially including
residual personal data. Scheduled evidence cleanup excludes the purged parent.
This is a retention and disposal-integrity claim, not unauthorized application
reading or cross-tenant disclosure. It requires enabled AI generation, scope
authorization, an independently approved matching active window below its
collection cap, a concurrent authorized purge, and a successful database
interleave; no execution result has been observed.

Claimed root cause: transitionAiForensicCapture opens a transaction without an
explicit stronger isolation level, deletes child evidence first, and only then
updates and locks the capture to set stopped_at and purged_at. The application
SQL Server configuration specifies READ COMMITTED. persistAiForensicEvidence
rechecks approval, lifecycle, expiry, operation/direction and the collection cap
under UPDLOCK/HOLDLOCK, but those conditions remain true until the purge updates
the parent. There is no preceding parent lock in the manual-purge branch and no
second deletion before commit. Whether the DELETE's actual locks allow a
concurrent insertion remains decisive. The cleanup query selects only captures
with purged_at IS NULL.

### Source trace

- **entrypoint** `app/api/ai/generate-requirement-import/route.ts:175` — POST: A
scope-authorized authenticated author supplies bounded JSON containing need
text. Requirements authorization, throttling and the effective-generation
availability check precede input screening; line 232 passes body.need to the
safety guard.
- **propagation** `app/api/ai/requirement-import-shared.ts:176` — guardAiInput:
When screening rejects the submitted input, await recordAiSafetyBlock before
returning the blocked response.
- **propagation** `lib/ai/safety.ts:671` — recordAiSafetyBlock: Attempt bounded
forensic persistence for the rejected input and matching operation/direction;
persistence failures are contained and fall back to metadata-only recording.
- **propagation** `app/api/admin/ai-forensic-captures/route.ts:91` — PATCH
concurrent administrative operation: A separately authenticated PrivacyOfficer
supplies a strict action/captureWindowId body and requests purge. Role and
human-identity checks apply; active captures are not excluded by the purge
service.
- **propagation** `lib/ai/forensic-capture.ts:476` — transitionAiForensicCapture
manual purge: Inside the purge transaction, delete matching evidence before
acquiring the parent update lock or marking the capture stopped/purged. The
bounded candidate uses an approved active capture with zero evidence events.
- **propagation** `lib/ai/forensic-evidence.ts:286` — persistAiForensicEvidence
concurrent insertion: The INSERT SELECT rechecks the matching active parent
and evidence count under UPDLOCK/HOLDLOCK. An insertion committing between the
purge DELETE and parent UPDATE would still see approval, null stopped/purged
timestamps, unexpired state and available collection capacity.
- **sink** `lib/ai/forensic-capture.ts:480` — transitionAiForensicCapture purge
completion: Update the parent to purged/stopped with UPDLOCK/ROWLOCK and
commit without another evidence deletion. A child inserted in the proposed gap
would survive the successful purged result and audit event.

### Verified source evidence

- `docs/security-privacy/informationsmangder-kravhantering.md:158` — Intended
disposal policy: fixed evidence retention of 72 hours after stop/expiry, with
immediate PrivacyOfficer purge permitted. This application retention boundary
cannot be extended by legal hold.
- `docs/governance/admin-center.md:346` — Evidence is isolated, redacted and
bounded but remains sensitive after masking; it may still contain personal or
secret information. The excerpt is not ordinary application/security log
content.
- `lib/ai/forensic-capture.ts:107` — Capture creation uses SERIALIZABLE, permits
only one open window, and validates a SQL-time expiry 5–60 minutes ahead. The
insert at line 152 sets 8192 bytes, eight items per event and 1000 events per
capture.
- `lib/ai/forensic-capture.ts:359` — Purge and approval require PrivacyOfficer;
stop permits Admin or PrivacyOfficer. Both transition authorization and
execution require a human actor snapshot. Approval additionally requires a
different HSA-id from the requester at line 418.
- `lib/ai/forensic-capture.ts:402` — Transition transaction has no explicit
isolation argument. In its manual-purge branch the first database action is
the child DELETE at line 476, followed by the parent UPDATE at line 480.
- `lib/typeorm/sqlserver-config.ts:12` — The configured default isolation level
is READ COMMITTED and is supplied as isolationLevel at line 201. lib/db.ts
aliases SqlServerDatabase to the TypeORM DataSource; the application factory
adds no enclosing stronger transaction.
- `lib/ai/forensic-evidence.ts:304` — Strongest insertion control:
UPDLOCK/HOLDLOCK on the parent and evidence-count query; rechecks approval,
stopped/purged timestamps, expiry, operation, direction and collection
capacity in the INSERT statement. These protections may serialize the proposed
interleave through actual SQL locks, which has not been observed.
- `lib/ai/forensic-evidence.ts:154` — Normalize and redact evidence before
selecting trigger-centered excerpts. Per-event byte/item limits and the
empty-evidence check at line 284 bound the retained copy; actor identity is a
capture-specific fingerprint.
- `typeorm/migrations/0058_ai_forensic_evidence_store.mjs:71` — The child
foreign key cascades parent deletion and has ON UPDATE NO ACTION. Manual purge
updates lifecycle columns rather than deleting the parent. This migration
defines no lifecycle trigger; line 79 indexes the child capture ID.
- `lib/ai/forensic-capture.ts:307` — Evidence reads require purged_at IS NULL, a
stopped/expired capture, the requester/approver HSA-id, and current
Admin/PrivacyOfficer role. A surviving row is therefore not exposed by this
application evidence-read path.
- `lib/transient-cleanup/ai-forensic-evidence.ts:136` — Scheduled evidence
deletion requires capture.purged_at IS NULL and stop/expiry at least 72 hours
ago. A survivor under a manually purged capture is excluded even after aging;
backlog inspection has the same purge-state exclusion at line 84.
- `lib/privacy/erasure.ts:1189` — Explicit privacy erasure independently deletes
evidence associated with matching capture parties or exact actor fingerprints;
its outer transaction at line 1386 is SERIALIZABLE. This separate
user-triggered operation can remove copies but is not routine cleanup
guaranteeing disposal after manual forensic purge.
- `tests/unit/ai-forensic-capture.test.ts:206` — The test named atomic purge
uses mocked query results and checks that both calls use one transaction. It
does not establish SQL Server key/range locks or the concurrent producer/purge
outcome.

### Exact blockers

- The required OS-enforced sandbox is unavailable: the trusted bubblewrap probe
failed with 'No permissions to create new namespace'. No target code, SQL
fixtures or shared services were executed during this review.
- The decisive fact is whether real SQL Server locks for the empty
matching-evidence DELETE and the producer's UPDLOCK/HOLDLOCK INSERT allow the
producer to commit before the purge parent UPDATE. Source order and mocked
tests do not establish that observed interleave; blocking or deadlock may
prevent the claimed surviving row.

### Bounded local validation

In a future approved OS-isolated fixture with external networking disabled,
scratch-only writes, dummy data, bounded resources and no shared services, use
the repository schema/indexes and actual DataSource configuration on a dedicated
SQL Server. Create one valid matching approved active input capture through the
capture services using distinct dummy Admin/PrivacyOfficer HSA-ids, with zero
evidence and unused collection capacity. Use two dedicated database connections.
Pause the real purge transaction immediately after its child DELETE completes
and before its parent UPDATE. On the second connection call
persistAiForensicEvidence once with a one-item non-sensitive screening fixture
shaped like the existing SQL integration test and a unique event ID. Allow at
most five seconds for its insertion to complete; capture whether it commits,
blocks, deadlocks or errors. If blocked, resume purge and await both bounded
operations rather than inferring survival from a timeout. Inspect only the dummy
parent lifecycle fields and its child count. The proposed impact is demonstrated
only if purge succeeds with purged_at/stopped_at set and one child remains. If
there is a survivor, move only the dummy timestamps beyond the 72-hour threshold
while preserving the 5–60-minute requested_at/expires_at constraint, run one
cleanup batch with limit one, and check the same child count. Stop after this
single-row result and dispose of the isolated fixture. If locks prevent
survival, refute the proposed interleave; do not develop broader payloads or
scan data.

### Owner-observed configuration check

The owner can compare the deployed revision, SQL Server version, schema/indexes,
transaction configuration and database isolation options against the isolated
fixture using configuration or catalog metadata only. No production capture,
purge, excerpt read or timing experiment is needed. A deployment-specific lock
behavior differing from the isolated result must remain an explicit
applicability limit.

## 8. Parent retention deletion can bypass an active child-row legal hold

Fingerprint: `retention-parent-delete-bypasses-child-exception`

Source supports a lifecycle preservation gap for historical RFI versions and
archived requirement-selection answers in the shared application database. A
human PrivacyOfficer can create an indefinite child-row exception, then later
submit an ordinary confirmed retention run after the question becomes eligible.
Parent deletion SQL removes the held child without removing its exception. An
assigned area author can bring an RFI question into the archived lifecycle, but
cannot execute retention without the separate PrivacyOfficer role. The affected
protected state is held business history belonging to that question's area; no
tenant crossing or privilege escalation is claimed. Actual deletion under SQL
Server constraints and runtime permissions has not been observed.

Claimed root cause: ACTIVE_EXCEPTION_SQL matches only the selected candidate's
policy/source/table/id tuple. Parent eligibility does not check active holds on
dependent versions or answers, and parent deletion removes all those children.
Child selectors suppress separate candidates when the parent is eligible, so a
held child does not become a separately protected deletion subject in that run.
The SERIALIZABLE preview refresh, token comparison, dependency guards and
audited transaction preserve the incomplete predicate rather than adding
child-hold enforcement.

### Source trace

- **entrypoint** `app/api/admin/archiving/runs/route.ts:38` — POST retention
execution: Accepts a browser actor's policyId and previewToken through a
strict schema and secure mutation wrapper; the custom policy requires
PrivacyOfficer and verified human identity before retention execution. This is
an authorized administrative operation whose lifecycle behavior is under
review.
- **propagation** `lib/archiving/retention.ts:1306` — executeArchivingRetention:
Recomputes the enabled policy's preview within SERIALIZABLE, rejects a stale
token, checks export confirmation when required, and dispatches the recomputed
candidates.
- **propagation** `lib/archiving/retention.ts:179` — ACTIVE_EXCEPTION_SQL:
Excludes an active exception only when its policy, source key, subject table
and subject ID match the current candidate; no dependent-row exception is
matched.
- **propagation** `lib/archiving/retention.ts:715` — Archived RFI-question
retention source: Selects aged archived questions without list, assessment or
suggestion references and applies only the parent exception predicate. The
selection-question source at line 575 similarly checks saved answers and
unarchived children, but not child holds.
- **propagation** `lib/archiving/retention.ts:1236` — executeCandidate: Runs the
allowlisted source SQL with the numeric subject ID after source resolution; it
performs no additional descendant-hold check.
- **sink** `lib/archiving/retention.ts:331` — DELETE_RFI_QUESTION_SQL: After
parent dependency guards and link cleanup, deletes every version under the
question and then the question. The parallel selection sink at line 242
deletes every answer under its eligible parent. Neither sink consults
retention exceptions on the deleted children.

### Verified source evidence

- `docs/governance/admin-center.md:527` — Documents row-level exceptions for
legal hold or operational need. Lines 539-543 identify selection
questions/answers and RFI questions/versions as supported deletion subjects.
- `app/api/admin/archiving/exceptions/route.ts:32` — The strict exception schema
accepts policyId, sourceKey, subjectTable, subjectId, reason and optional
expiry; absent expiry becomes null. POST at line 57 requires PrivacyOfficer
and human identity and writes the exception with audit in a transaction.
- `lib/archiving/retention.ts:1867` — Exception creation validates the policy,
persists the supplied child tuple independently of any parent, stores null for
indefinite expiry and preserves an existing active exception.
- `lib/archiving/retention.ts:633` — The archived-answer selector suppresses a
separate child candidate when its parent meets deletion eligibility; the
historical RFI-version selector repeats this pattern at line 683. Neither
suppression propagates the child's hold to the parent.
- `lib/archiving/retention.ts:286` — RFI sink guards recheck archived state and
absence of list rows, assessments and suggestions. Selection guards at line
213 require no saved question answers or unarchived children. Fixtures must
satisfy these real safeguards. The sources do not require export, and
mapCandidate at line 933 defaults requiresExport to false.
- `app/api/rfi-questions/[id]/route.ts:100` — DELETE performs ordinary archiving
under the manage_rfi_question archive policy. The assignment policy resolves
the target's area and requires area authorship in
lib/requirements/assignment-authorization.ts at line 959.
- `lib/dal/rfi-questions.ts:862` — setRfiQuestionArchived records archived_at
and is_archived without changing retention exceptions, allowing a previously
held historical child to remain held as its parent ages into eligibility.
- `typeorm/migrations/0009_archiving_retention.mjs:40` — Exceptions store
textual subject identifiers and reference only the policy by foreign key at
line 55; they have no foreign key to prevent deletion of a held version or
answer.
- `typeorm/migrations/0035_rfi_questions.mjs:40` — RFI versions reference their
parent with ON DELETE CASCADE. Referenced list versions/questions have NO
ACTION constraints at lines 97-98, consistent with requiring an unreferenced
fixture.
- `typeorm/migrations/0021_requirement_selection_questions.mjs:84` — Selection
answers reference their parent with ON DELETE CASCADE; an exception record
does not add a preservation constraint.
- `typeorm/runtime-permission-manifest.mjs:150` — The source runtime contract
grants CRUD, including DELETE, on RFI versions/questions; lines 107 and 120
grant CRUD on selection answers/questions. These are declared grants, not
observed deployed permissions.
- `lib/privacy/route-helpers.ts:19` — assertPrivacyOfficer requires the explicit
PrivacyOfficer role and a human actor snapshot. Admin alone does not satisfy
this route policy.
- `lib/http/route-security-policy.ts:366` — The retention-run route declares
session authentication, same-origin CSRF, sensitive data and no-store. These
controls restrict who can initiate the run, without extending the retention
predicate to child exceptions.

### Exact blockers

- No target execution is permitted because the required OS-enforced sandbox
could not create a bubblewrap namespace (No permissions to create new
namespace). Consequently no isolated SQL/application reproduction has
established the decisive result: a committed parent retention run deleting the
held child while its active exception remains. Source-visible dependencies and
the runtime permission manifest support the path but are not an observed
database outcome.

### Bounded local validation

After approved isolation is available, use a disposable SQL Server/application
fixture with repository migrations and runtime-role grants, dummy human
PrivacyOfficer and dummy assigned area author. Enable
rfi_questions_retention_delete. Create a historical inactive version under a
still-unarchived question with no specification list rows, assessments or
suggestions. Give the child an old updated_at, verify its preview candidacy,
then create an indefinite exception through POST /api/admin/archiving/exceptions
using that policy's ID, sourceKey rfi_question_versions.historical_unreferenced,
subjectTable rfi_question_versions, the child ID and a dummy reason. Verify the
child remains stored and is excluded from its preview. Archive the parent
through its authorized lifecycle and use fixture timestamps to place archived_at
beyond the policy age. Obtain a fresh POST /api/admin/archiving/preview token
and submit policyId plus previewToken to POST /api/admin/archiving/runs as the
PrivacyOfficer. Inspect only fixture parent, child, exception and transaction
outcome. Stop at child deletion with a still-active exception, or the exact
preventing guard/constraint. Separately repeat with
archived_requirement_selection_delete and a held archived answer using sourceKey
requirement_selection_answers.archived and subjectTable
requirement_selection_answers; all siblings must be archived, with no saved
specification answers or external question references. Keep every mutation
confined to disposable dummy data; do not execute against shared or production
services.

### Owner-observed configuration check

An owner can read-only verify whether the deployed revision, enabled policies,
schema constraints and effective runtime DELETE grants match this source.
Confirm the intended preservation meaning of active child exceptions. If
additional deployed controls could prevent the path, reproduce those controls
only in the disposable local fixture. Do not run retention against real held
records to validate this candidate.

## 9. Archive confirmation does not bind needs references created after export

Fingerprint:
`archiving/confirmation-candidate-keys/stale-child-content-deletion`

Source supports an archive-preservation gap when an authenticated specification
responsible person or coauthor creates a needs reference after a PrivacyOfficer
exports an eligible specification. The insert changes neither the parent
updated_at nor the candidate keys used by confirmation. If the officer then
executes disposal on the same UTC day, within the 15-minute token lifetime and
in the process holding the token, execution can still select that specification
and delete the new child absent from the earlier archive. The protected state is
the specification owner's business history. This is conditional on exact-content
archival preservation being mandatory and on no operational write freeze or
legal hold covering the specification. It is not a role bypass,
cross-specification write, or demonstrated runtime deletion. The original UPDATE
example is not supported under the managed runtime permission contract, which
grants this table SELECT, INSERT and DELETE but no UPDATE; creation is the
corrected source-grounded operation for the same confirmation-binding root
cause.

Claimed root cause: The export confirmation records policy identity, policy
revision, a day-rounded cutoff and parent candidate identifiers, without an
archive-content digest or revision covering child creation. Retention
eligibility uses the parent updated_at, while the needs-reference creation path
only inserts the child. A SERIALIZABLE execution transaction rechecks current
eligibility but does not compare the child state with the previously exported
state.

### Source trace

- **entrypoint**
`app/api/requirements-specifications/[id]/needs-references/route.ts:70` —
Authenticated specification author's needs-reference creation: POST validates
a specification identifier and strict text/description body, applies
manage_specification_needs_reference/create authorization and forwards the
request to the shared service. This is the lower-trust content entrypoint
after a separate officer has completed the archive export.
- **propagation** `lib/requirements/service-needs-references.ts:120` — Shared
authorization and creation dispatch: The service authorizes the requested
operation, verifies that the specification exists and dispatches create at
line 152 to createSpecificationNeedsReference without an archive-confirmation
or retention-state check.
- **propagation** `lib/dal/requirements-specifications.ts:1894` — Child
insertion without parent revision change: The creation helper normalizes
nonempty text, checks uniqueness and inserts the needs reference with its own
created_at and updated_at. The exported wrapper at line 1922 calls this helper
directly; neither path updates requirements_specifications.updated_at.
- **propagation** `lib/archiving/retention.ts:966` — Previously issued archive
confirmation identity: previewTokenFor hashes only sorted candidate keys,
cutoff, policy ID and policy updated_at. mintExportToken at line 999 stores
that hash and export candidate keys; consumeExportToken at line 1019 compares
the same values. Needs-reference rows and their timestamps are absent from all
comparisons.
- **propagation** `app/api/admin/archiving/runs/route.ts:38` — PrivacyOfficer's
subsequent disposal request: The secure mutation wrapper requires
PrivacyOfficer authorization, validates policy and confirmation inputs and
invokes executeArchivingRetention with a human actor snapshot. The author
cannot independently invoke the disposal path.
- **propagation** `lib/archiving/retention.ts:1306` — Transactional eligibility
and confirmation recheck: A SERIALIZABLE transaction recomputes preview,
rejects changed preview tokens, requires a live one-use export token for
export-required candidates and then executes the selected deletion SQL. A
child insert completed before this transaction does not alter the
source-visible preview inputs.
- **sink** `lib/archiving/retention.ts:545` — Deletion of all selected
specification needs references: The obsolete-specification deletion batch
deletes every specification_needs_references row for the selected
specification ID before deleting the parent, without restricting child IDs or
versions to the exported archive.

### Verified source evidence

- `docs/security-privacy/informationsmangder-kravhantering.md:130` — Defines
archive export as preserving business history outside the active database. The
matrix at line 152 requires export confirmation before specification and
needs-reference deletion, with needs references included in anonymized JSON;
it also names active work, business need and legal hold as exceptions. It does
not explicitly define concurrent-edit or exact-version semantics.
- `docs/governance/admin-center.md:566` — Operator guidance requires anonymized
JSON before obsolete-specification deletion and explicitly includes needs
references in the archive.
- `lib/requirements/assignment-authorization.ts:746` — Needs-reference mutations
require specification authorship. assertSpecificationAuthor at line 836 checks
the authenticated actor HSA-id against the responsible person or coauthor
lookup at line 153; those checks do not impose a lifecycle or archive write
freeze. Admin has an explicit earlier allowance.
- `app/api/admin/archiving/exports/route.ts:35` — Archive export is a
strict-schema secure POST requiring PrivacyOfficer; it collects the archive
and exportToken through the bounded structured-output runner.
lib/privacy/route-helpers.ts:19 additionally requires a human actor snapshot.
- `lib/archiving/retention.ts:559` — Obsolete-specification eligibility uses
parent updated_at, excludes management lifecycle and current/pending
agreements, and applies active retention exceptions. It does not inspect
needs-reference creation or update timestamps. previewArchivingRetention at
line 1159 also rejects disabled policies.
- `lib/archiving/retention.ts:871` — The cutoff is rounded to UTC midnight
before subtracting policy age, so same-day export and execution use the same
cutoff. The export token is process-local, random, one-use and expires after
the 15 minutes configured at line 168; a process change or expiry prevents
this sequence.
- `lib/archiving/retention.ts:1489` — Archive collection selects needs-reference
ID, text, description and created/updated timestamps. A child created after
the completed export cannot appear in this previously returned payload.
- `typeorm/runtime-permission-manifest.mjs:173` — The runtime table contract
grants READ_CREATE_DELETE, defined at line 8 as SELECT, INSERT and DELETE. The
current manifest preserves this entry. This prevents the original UPDATE
example when the managed least-privilege role is enforced, but does not
prevent the corrected INSERT operation.
- `lib/dal/requirements-specifications.ts:1965` — The originally cited UPDATE
does write only child text, description and updated_at inside a parent-locked
transaction, but runtime UPDATE permission is missing. It is not used as the
corrected validation sequence.
- `typeorm/migrations/0017_specification_needs_reference_description.mjs:2` —
Adds child description and updated_at and backfills the timestamp. Source
inspection of migrations found no needs-reference trigger updating the parent;
migration 0004_specification_needs_reference_cascade.mjs:3 establishes the
child-to-parent foreign key with delete cascade, not a parent timestamp
update.

### Exact blockers

- No target execution is permitted: the required OS sandbox cannot create its
bubblewrap namespace (No permissions to create new namespace). Consequently no
isolated SQL database, actual migrations/runtime-role sequence, API response
or committed deletion was exercised.
- The information owner must establish that the archive-before-disposal
guarantee covers every child present at deletion, including content created
after export, and whether active-work exceptions or an enforced operational
write freeze prevent this interval. If an earlier point-in-time archive
intentionally suffices, source establishes a correctness or hardening concern
rather than the claimed security boundary impact.

### Bounded local validation

Only in a future approved network-isolated sandbox with disposable SQL storage,
apply the actual migrations and managed runtime permission manifest. Prepare
exactly one synthetic obsolete specification assigned to a dummy
non-PrivacyOfficer coauthor, with parent updated_at older than policy age, no
current or pending agreement, no hold and no unrelated dependent data. Keep the
policy/candidate set fixed. As a separate dummy PrivacyOfficer obtain preview
and complete the archive export; retain the returned archive only within
disposable scratch. As the assigned coauthor POST one unique non-sensitive needs
reference through the actual route/service, confirm successful insertion and
read the unchanged parent timestamp. On the same UTC day, before token expiry
and in the same app process, let the dummy officer submit the original
preview/export tokens once. Observe rejection or the minimum database result
showing whether that one new child and parent were deleted; compare the new
child ID with the earlier archive. Do not substitute UPDATE, grant extra
permissions, touch shared services, or infer success from a mocked query result.
Stop at this result and destroy the isolated fixture.

### Owner-observed configuration check

Have the information owner review the documented retention/export requirement
and explicitly decide whether the final destroyed child content must be
archived. Have the operator document any enforced write freeze or active-work
exception that covers the full export-to-disposal interval, including API and
MCP writes. Review these controls and runtime-role grants without executing
disposal against deployed data.

## 10. Azure bootstrap consumes root helpers from an unchecked shared temporary parent

Fingerprint:
`azure-bootstrap/predictable-staging-parent/root-helper-replacement`

Source supports a conditional local privilege-boundary failure: a local OS
principal other than the sudo-capable operator could precreate
/tmp/krav-azure-dev with permissions allowing operator staging while retaining
authority to replace its tooling child. An authenticated setup or setup rerun
uploads verify-apt-key.sh there, then invokes a root bootstrap that executes
that pathname. Replacing the child between upload and consumption could select
attacker-controlled helper content for root execution. The upload path checks,
SSH host authentication, child recreation, and service-env child mode do not
establish ownership of the common parent. No target execution or deployed
lower-privilege attacker was established; manipulation by vscode itself is
excluded because that account intentionally receives unrestricted sudo.

Claimed root cause: Copy-AzureDevDevelopmentToolFiles recreates a predictable
tooling child beneath an existing /tmp parent without authenticating the parent
owner or constraining parent replacement rights. Invoke-AzureDevBootstrap passes
the resulting pathname into sudo, and configure_repositories executes the
selected helper after only a regular-file existence check.

### Source trace

- **entrypoint** `scripts/azure-dev/AzureDev.Bootstrap.psm1:497` —
Invoke-AzureDevBootstrap: Selects /tmp/krav-azure-dev/tooling, accepting
preexisting common-parent filesystem state. The lower-trust input is that
state, conditional on a distinct non-sudo local principal being able to create
and control the parent before staging.
- **propagation** `scripts/azure-dev/AzureDev.Bootstrap.psm1:273` —
Copy-AzureDevDevelopmentToolFiles: The authenticated remote command removes
and recreates only the tooling child; scp subsequently uploads fixed local
helper files at lines 282-287. Neither operation authenticates or secures the
common parent.
- **propagation** `scripts/azure-dev/AzureDev.Bootstrap.psm1:546` —
Invoke-AzureDevBootstrap: The sudo env command begun at line 533 passes
AZURE_DEV_APT_KEY_VERIFIER pointing into the tooling child and executes the
bootstrap with bash at line 551.
- **propagation** `scripts/azure-dev/templates/bootstrap-host.sh:44` — bootstrap
environment initialization: Copies AZURE_DEV_APT_KEY_VERIFIER into
APT_KEY_VERIFIER without validating the selected file or its ancestors. main
calls install_host_packages, which calls configure_repositories.
- **sink** `scripts/azure-dev/templates/bootstrap-host.sh:173` —
configure_repositories: Executes bash on APT_KEY_VERIFIER in the sudo-launched
process after the -f existence check at line 168; no ownership,
ancestor-write, immutable-content, or no-follow check binds execution to the
uploaded helper.

### Verified source evidence

- `scripts/azure-dev/AzureDev.Bootstrap.psm1:245` — RemotePath must be absolute,
local helper files must exist at lines 263-266, and the remote path is
shell-quoted at line 270. These controls constrain interface shape and command
interpretation, but do not authenticate destination ancestry.
- `scripts/azure-dev/AzureDev.Bootstrap.psm1:442` — The service-env sibling
receives chmod 0700, but the common /tmp/krav-azure-dev parent and tooling
sibling receive no corresponding owner validation or protection.
- `scripts/azure-dev/AzureDev.Ssh.psm1:594` — Wait-AzureDevSsh retrieves Azure
VM host-key evidence, installs that trust at lines 612-615, and marks trust
established only after successful SSH at lines 632-634. This authenticates
transport; it does not protect uploaded paths from another local principal.
- `scripts/azure-dev/AzureDev.Bootstrap.psm1:493` — Bootstrap asserts
established SSH host trust before staging. ShouldProcess gates uploads and
root invocation, including line 554, so exploitation also requires an
authorized operator setup run.
- `scripts/azure-dev/templates/bootstrap-host.sh:106` — ensure_vscode_user
intentionally grants vscode NOPASSWD:ALL; the alleged boundary crossing
therefore requires a different non-sudo OS principal.
- `scripts/azure-dev/templates/main.bicep:24` — The VM administrator defaults to
vscode. This provisioning source does not establish an active separate
lower-privilege attacker with access to the shared host temporary directory.
- `scripts/azure-dev/templates/bootstrap-host.sh:1694` — main calls
install_host_packages first; that function calls configure_repositories at
line 218. Later user-root and sandbox setup does not validate the staged
helper before this sink.
- `containers/production/bin/kravhantering-quadlet.sh:369` — Comparable
production policy-file handling checks a nonsymlink leaf, root ownership,
mode, and service-account write access to ancestors through line 400. Unit
installation separately uses mktemp staging at lines 871 and 878. These
controls calibrate the Azure gap; they are not applied on its helper path.
- `containers/production/bin/kravhantering-cleanup.sh:123` — Comparable cleanup
installation creates a unique generation beneath STATE_DIR and switches the
current link at lines 142-143; it does not share the fixed Azure
shared-temporary-parent helper path.

### Exact blockers

- The authorized audit handoff reports that bubblewrap namespace creation was
denied with No permissions to create new namespace. Required OS-enforced
network and mount isolation is unavailable, so no target code, multi-UID
replacement experiment, or root helper-consumption step was executed. There is
no observed execution result.
- Deployment applicability requires a distinct non-sudo local OS principal with
access to the host /tmp namespace who can precreate /tmp/krav-azure-dev before
staging, allow the operator's child creation, and replace the tooling child
before root opens the helper. Actual principal isolation, ownership/ACLs,
temporary-directory lifecycle, and applicable OS restrictions are not
established by repository source. Existing secure operator-owned staging would
not give that principal the claimed initial capability.

### Bounded local validation

In a future disposable OS-enforced sandbox, use dummy operator and attacker UIDs
plus confined root, a private shared-temporary-directory fixture, no network, an
empty allowlisted environment, read-only source/tools, scratch-only writes, and
explicit low resource/time limits. Model the exact source staging commands with
dummy files beneath an attacker-owned parent that permits operator staging.
Pause after upload, attempt replacement of only the tooling child as the
attacker, and run only the source-equivalent existence check and helper
invocation with a harmless identity marker. Stop at the helper identity result;
do not run package installation or the complete bootstrap. Predeclare any
evidence file and parent-side safe-promotion bounds before execution; the
current empty promotion allowlist cannot retain runtime artifacts.

### Owner-observed configuration check

The VM owner should inspect existing configuration records or perform an
approved offline assessment of intended users/services, sudo grants, host
temporary-directory namespace access, parent ownership/ACLs and cleanup
lifecycle. Establish whether any principal distinct from the operator and
lacking sudo can obtain the precise precreation and replacement capability
before an intended setup or rerun. Do not create the parent, alter permissions,
replace helpers, probe services, or reproduce on the shared VM.

## 11. Private advisory updates trust a body marker instead of automation ownership

Fingerprint: `container-monitor/private-advisory/description-marker-ownership`

The trusted main-branch container monitor chooses the first repository security
advisory whose description contains a deterministic finding marker, then
overwrites a draft or triage match using its dedicated advisory credential. A
lower-trust private reporter could receive confidential scanner details if they
can place that marker in a report returned to the monitor, the monitor can
update it, and the reporter retains access. Source confirms the selection and
payload path, but does not establish those hosted permissions or an
attacker-knowable active confidential finding. No target code or provider call
was executed.

Claimed root cause: syncPrivateAdvisories uses a matching description substring
as the resource identity for a privileged update without checking automation
ownership, author, or collaborators. Repository validation, a configured
credential, enabled private reporting, and draft/triage state constrain the path
but do not authenticate the advisory's ownership. Exploitability depends on
whether GitHub exposes reporter-controlled records through this path with
retained reporter visibility.

### Source trace

- **entrypoint** `scripts/release/container-vulnerability-monitor.mjs:1015` —
syncPrivateAdvisories: The paginated repository security-advisories response
supplies descriptions, states and GHSA IDs. Reporter control of a returned
description is the unverified lower-trust entry condition.
- **propagation** `scripts/release/container-vulnerability-monitor.mjs:1036` —
syncPrivateAdvisories: Array.find selects the first advisory with a
description containing issueMarker(record.fingerprint); no creator,
collaborator or trusted ownership check participates.
- **propagation** `scripts/release/container-vulnerability-monitor.mjs:1039` —
syncPrivateAdvisories: renderPrivateAdvisory constructs a payload containing
the confidential record's identifier, image, package, exception state, scan
time, severity and affected releases, digests and versions.
- **sink** `scripts/release/container-vulnerability-monitor.mjs:1047` —
syncPrivateAdvisories: If the selected advisory is draft or triage,
privateAdvisoryApi sends a PATCH with that payload to its GHSA ID using the
dedicated token. Actual acceptance and reporter visibility are not
source-established.

### Verified source evidence

- `scripts/release/container-vulnerability-monitor.mjs:540` —
trackingFingerprint computes unkeyed SHA-256 over vulnerabilityId, image and
package separated by NUL; it is deterministic for known inputs.
- `scripts/release/container-vulnerability-monitor.mjs:600` — The fingerprint's
image input is the release image role, not the immutable digest. Whether a
reporter knows the other inputs for an active confidential record is
unresolved.
- `scripts/release/container-vulnerability-monitor.mjs:660` — issueMarker
requires a 64-character lowercase hexadecimal fingerprint and wraps it in a
predictable HTML comment; the format check does not authenticate the producer.
- `scripts/release/container-vulnerability-monitor.mjs:673` —
renderPrivateAdvisory puts confidential scan details in the description and
other advisory fields.
- `scripts/release/container-vulnerability-monitor.mjs:971` — privateAdvisoryApi
serializes the payload to a temporary body file and runs gh api with GH_TOKEN
set to the supplied dedicated token and command output captured or suppressed.
- `scripts/release/container-vulnerability-monitor.mjs:987` — Only records
without advisory URLs enter private synchronization. Missing credentials or
unavailable/disabled private reporting cause a skip; listing and mutation
errors become sanitized failures.
- `scripts/release/container-vulnerability-monitor.mjs:1036` — The first
matching description controls selection. Only draft/triage matches are
updated; other matching states are skipped, and absence of any match causes
creation.
- `.github/workflows/container-vulnerability-monitor.yml:21` — The job is
restricted to viscalyx/Kravhantering on main. The synchronization step
receives the separate advisory secret at line 251; these controls constrain
the trusted job but do not validate ownership of listed advisories.
- `scripts/__tests__/container-vulnerability-monitor.test.mjs:1511` — The
existing source test supplies a matching draft containing only description,
GHSA ID and state and expects an update using the narrow token. It does not
model reporter permissions and was not executed.
- `docs/development/trusted-container-publishing.md:329` — Documentation
classifies findings without authoritative public advisory URLs as confidential
and specifies a narrow Repository security advisories write credential for
private synchronization.
- `docs/operations/release-artifact-and-image-verification.md:233` — Operator
guidance prohibits placing confidential scanner observations in public issues.

### Exact blockers

- The required target-execution sandbox is unavailable: the supplied capability
result reports bubblewrap namespace creation denied with No permissions to
create new namespace. This independent review ran no target code, tests,
network requests or provider calls; there is no observed runtime result.
- Repository source cannot establish GitHub's decisive hosted controls: whether
a lower-trust reporter can submit a marker-bearing description, whether this
unfiltered listing returns that report to the configured credential in draft
or triage state, whether the PATCH payload is accepted for it, and whether the
reporter can read the overwritten fields afterward. No provider policy or
deployment permissions were inspected.
- No active confidential finding was inspected. The reporter must know or
predict its exact vulnerability identifier, image role and package, and their
report must be the first matching advisory in listing order. A prior match or
non-updatable state can prevent the claimed update.

### Bounded local validation

Only after the required OS-enforced isolation is available, use the exported
synchronizeTracking interface with one synthetic confidential finding, a dummy
token, publicMutationAllowed false, and a recording runCommand adapter that
never launches gh. Keep temporary body files under the permitted scratch root.
Supply enabled private reporting and a paginated synthetic reporter-authored
advisory with the matching marker. Check the selected GHSA ID and dummy
confidential fields in the requested PATCH separately for draft and triage.
Compare a nonmatching marker, a matching published advisory, missing credentials
and disabled reporting. Stop at the recorded dummy command and payload; this
establishes only local selection, not hosted disclosure.

### Owner-observed configuration check

An owner should inspect authoritative GitHub policy and existing non-sensitive
configuration/metadata for the actual credential and repository. Establish
reporter submission/body control, default listing inclusion and order, permitted
draft/triage PATCH operations including this payload, and retained reporter
access after an update. Separately determine whether marker inputs for the
relevant confidential scanner class are knowable without the disclosed details.
Do not create a report, mutate an advisory, expose real scan content or read
credential values. If any decisive prerequisite fails, reject the disclosure
claim for that deployment.

## 12. Untrusted tracker comments can block scheduled container vulnerability scans

Fingerprint: `container-monitor/untrusted-comment-markers/scan-preflight-block`

Source review supports a monitoring availability failure: an account permitted
to comment on an existing automation-owned release tracker issue can introduce
malformed reserved marker text through an ordinary comment. The
terminal-identity preflight processes that comment without authenticating its
producer, fails globally, and prevents supported-release selection and
downstream scans. The account need not change issue labels, the issue body,
repository source, or workflow configuration. Strict state validation,
restricted workflow identity, and the final failure step contain the result to a
visibly failed monitoring run; they do not prevent the comment-triggered
failure. No clean scan, release-code compromise, or secret disclosure is
established. No runtime reproduction or live comment-permission verification was
performed.

Claimed root cause: The preflight treats comments on an owned issue as
automation state solely from body marker text. Issue ownership-label and body
validation do not authenticate comment producers. Every comment enters strict
continuation and automation parsers, and a malformed reserved namespace throws
before a terminal boundary can be returned. Supported-release selection requires
that global preflight to succeed.

### Source trace

- **entrypoint** `scripts/release/container-vulnerability-monitor.mjs:849` —
createGitHubTrackerAdapter.listComments: Fetches the issue-comments endpoint
through paginatedGitHubItems, which flattens all returned pages without
filtering authors. An account allowed to comment controls its own comment body
in this response.
- **propagation**
`scripts/release/container-vulnerability-release-issues.mjs:2502` —
preflightReleaseIssues: After checking the issue ownership label and parsing
the issue body, loads its comments, validates public state, and passes the
complete comment array to continuation-state completion and
parseAutomationComments.
- **propagation**
`scripts/release/container-vulnerability-release-issues.mjs:2251` —
parseAutomationComments: Passes every comment body to parseExactMarker for
reconciliation or duplicate namespaces, with optional matching but no producer
authentication. Identity and journal consistency checks occur only after
marker parsing.
- **propagation**
`scripts/release/container-vulnerability-release-issues.mjs:174` —
parseExactMarker: A comment containing container-vulnerability-reconciliation:
without a complete marker has one namespace occurrence and zero candidates, so
the parser throws. Optional matching skips only text with no namespace and no
candidate.
- **propagation**
`scripts/release/container-vulnerability-release-issues.mjs:2525` —
buildTrustedTerminalIdentityBoundary: Preflights all owned issues before
constructing any terminal boundary; no per-comment or per-issue recovery
catches the malformed-marker exception.
- **propagation** `scripts/release/container-vulnerability-monitor.mjs:1158` —
main terminal-boundary command: Calls buildTrustedTerminalIdentityBoundary
before writing its output. The outer catch at lines 1294-1297 returns 1 on the
parsing exception, and direct CLI dispatch assigns that result to
process.exitCode at line 1306.
- **sink** `.github/workflows/container-vulnerability-monitor.yml:82` — Select
supported published releases: Selection requires tracker-preflight.outcome
success. A failed terminal-boundary step therefore prevents selection,
dependent attestation verification, and the supported-release scan step.

### Verified source evidence

- `scripts/release/container-vulnerability-monitor.mjs:737` — GitHub pagination
validates arrays and flattens them without author filtering. listIssues at
line 855 requests open and closed issues and excludes pull requests, so the
preflight is not restricted to currently open trackers.
- `scripts/release/container-vulnerability-release-issues.mjs:2222` — Ownership
gating checks the issue's automation label. parseOwnedIssue at line 198
additionally validates issue identity, context, state, digest, and
reconciliation time; none of these checks establishes commenter authority.
- `scripts/release/container-vulnerability-release-issues.mjs:51` — The
automation namespace regular expression matches reserved text anywhere in a
comment, while a candidate requires a complete HTML comment marker. The strict
cardinality check therefore also rejects ordinary prose mentioning an
incomplete namespace.
- `scripts/release/container-vulnerability-release-issues.mjs:2384` —
Continuation parsing likewise processes every comment without author checks.
Identity, slot-count, length, and content-hash validation protect
structured-state consistency but do not isolate untrusted comments before
strict parsing.
- `scripts/release/container-vulnerability-release-issues.mjs:1076` — Generated
issue instructions say automation replaces the issue body and direct human
analysis to comments, with the sentence completed by lifecycle text at lines
1046-1054. The comment surface intentionally mixes human and automation
producers.
- `scripts/__tests__/container-vulnerability-release-issues.test.mjs:4818` — An
existing source test supplies human analysis plus a malformed
reconciliation-marker comment and expects an invalid automation comment error
with only list-issues and list-comments calls. This supports intended
fail-stop parser behavior; the test was read, not executed, and does not
authenticate its fixture comment authors.
- `.github/workflows/container-vulnerability-monitor.yml:21` — The job is
restricted to the named repository and main branch. Its constrained token
permissions and pinned actions do not filter issue-comment producers. The
scheduled preflight runs terminal-boundary at line 75 before selection.
- `.github/workflows/container-vulnerability-monitor.yml:328` — The
unconditional final status step includes tracker-preflight among required
successful outcomes and exits 1 when any fails. The evaluation gate at lines
212-224 also blocks public mutation after failed preflight. Thus
continue-on-error preserves diagnostics without turning this path into a
successful clean scan.

### Exact blockers

- The required target-execution isolation is unavailable: the audit capability
probe reported bubblewrap namespace creation failed with No permissions to
create new namespace. No target code or tests were executed, so
source-predicted CLI failure has not been independently observed.
- The decisive hosted reachability facts are unavailable from repository source:
an existing valid automation-owned tracker must be commentable by an account
lacking automation/repository-write authority, and the scheduled main-branch
workflow must be enabled at this revision. Issue locks, repository interaction
limits, access policy, and current workflow state were not inspected through
GitHub or any external service.

### Bounded local validation

After the required isolated sandbox becomes available, call the exported main
terminal-boundary interface using an injected tracker adapter with one valid
dummy owned issue, an in-memory filesystem, and recorded mutation calls.
Establish a successful baseline with an ordinary human comment; repeat with the
identical issue and comments plus a non-automation author's comment whose body
is container-vulnerability-reconciliation:. Verify the second call returns 1,
reports the invalid automation marker, writes no terminal boundary, and performs
no mutations. Read the workflow dependency conditions to map that result to
skipped selection and scans. Do not invoke gh, contact GitHub, start a hosted
workflow, or execute outside the approved sandbox.

### Owner-observed configuration check

The repository owner should inspect existing tracker ownership labels and valid
bodies, issue locks and interaction restrictions, the effective comment rights
of a lower-trust account, and whether this scheduled main-branch workflow is
enabled and deployed. Use existing state and access-policy inspection only; do
not post a test comment, modify an issue, or trigger monitoring. Confirm whether
at least one such tracker is readable by the workflow and writable in its
comment surface by that account.

## 13. Developer Keycloak publishes its HTTP port without a loopback bind and supplies public administrator defaults

Fingerprint: `dev-keycloak/published-management/default-admin`

Both maintained devcontainer Compose profiles and standalone development Compose
publish Keycloak's HTTP port without an explicit loopback host address and
supply [public development values omitted] bootstrap defaults. A non-developer
network peer could gain
development IdP administrator authority if the effective publication is
reachable, those credentials are active, and the master realm permits that
peer's HTTP management authentication. The devcontainer startup helper attempts
to relax the master realm HTTPS requirement; this was not observed to succeed,
and standalone Compose does not invoke that helper. The potential resource
affected is the development realm and its identities, with realm configuration
or credential changes as the unauthorized operation. No network reachability,
successful authentication, production exposure, or application takeover was
demonstrated.

Claimed root cause: Development Compose publication lacks an explicit
host-loopback restriction while the same service is configured with intentional
public administrator credentials. The devcontainer also attempts to remove the
master realm HTTPS requirement for local console convenience. The comparable
Azure developer IdP explicitly binds its published port to 127.0.0.1.

### Source trace

- **entrypoint** `.devcontainer/docker-compose.yml:128` — services.idp.ports:
The HTTP publication defaults to 8080:8080 without an explicit host address.
This is the prospective entry for a lower-trust host-network peer; actual
non-loopback reachability depends on the effective engine configuration,
environment, and routing.
- **propagation** `.devcontainer/docker-compose.yml:118` — services.idp.command:
The published Keycloak 26.7.4-0 service runs start-dev with realm import and
HTTP port 8080, without a source-defined path-filtering proxy in this
publication.
- **propagation** `.devcontainer/start-keycloak-forwarder.sh:79` —
relax_master_ssl_required: The devcontainer startup helper attempts an
authenticated update setting the master realm sslRequired to NONE. It can
exhaust retries and return successfully without applying the change; source
does not establish the effective master realm policy.
- **sink** `.devcontainer/docker-compose.yml:125` — services.idp.environment:
KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD both default to admin, potentially
supplying the administrator identity for the exposed management surface if the
pinned image accepts these settings and the resulting credentials remain
active.

### Verified source evidence

- `.devcontainer/docker-compose.yml:125` — The default profile declares
[public development values omitted] bootstrap credentials and the HTTP
  publication at line 128; its
optional environment file and interpolation permit effective configuration to
differ.
- `.devcontainer/elevated/docker-compose.yml:143` — The elevated profile repeats
[public development values omitted] defaults, with the address-unspecified
  publication at line 146.
- `docker-compose.idp.yml:26` — Standalone development Compose repeats the
defaults and publication at line 29, but contains no master realm HTTPS
relaxation step.
- `.devcontainer/devcontainer.json:3` — The default devcontainer selects its
Compose file, includes idp in runServices at line 8, and invokes
start-keycloak-forwarder.sh through postStartCommand at line 254.
- `.devcontainer/elevated/devcontainer.json:254` — The elevated devcontainer
also invokes the forwarding and master realm relaxation helper.
- `.devcontainer/start-keycloak-forwarder.sh:44` — The socat hop binds only the
app container's loopback address. This does not restrict the separate Compose
host publication. The helper attempts the master realm update at lines 76-80,
then tolerates failure at lines 86-87.
- `docs/development/auth-developer-workflow.md:48` — Documentation distinguishes
the development realm's disabled HTTPS requirement from the master realm
restriction and the helper's attempted relaxation. It documents public
[public development values omitted] credentials at line 56 and says realm edits
  survive container
restart but not recreation at lines 38-42. These statements are source
guidance, not pinned-provider runtime evidence.
- `scripts/azure-dev/templates/quadlet/krav-idp.container:10` — The comparable
Azure developer IdP explicitly publishes 127.0.0.1:8080:8080, so it does not
share the address-unspecified publication.
-
`containers/production/nginx/templates/single-node-hardened-keycloak-tls.conf.template:120`
— The hardened production management listener requires a client certificate.
Its public listener separately allows selected realm/resource paths and
rejects other /auth/ paths at lines 49-73; these controls are not on the
development Compose publication.
- `containers/production/bin/kravhantering-quadlet.sh:333` — The hardened
production configuration requires an explicit management IPv4 bind, rejects
the wildcard address at lines 345-347, and requires management container port
9443 at lines 351-352.

### Exact blockers

- The effective Compose manifest, environment overrides, container-engine
version and forwarding defaults, host bind, firewall, and route from a
non-developer peer were not observed. Source port publication does not
establish lower-trust reachability.
- Acceptance of the legacy KEYCLOAK_ADMIN settings by the pinned Keycloak
26.7.4-0 image and the effective bootstrap administrator state were not
verified. Existing container state or overrides can make the public defaults
inactive.
- The effective master realm sslRequired policy and the origin classification of
forwarded requests remain decisive. The repository describes an external-HTTPS
default; the devcontainer helper attempts to relax it but tolerates failure,
and standalone Compose has no equivalent step. Provider behavior at the pinned
version was not independently verified.
- The required OS-enforced execution sandbox is unavailable because the trusted
bubblewrap probe could not create a namespace. No Compose rendering, target
execution, management authentication, or runtime observation was performed.

### Bounded local validation

In a future approved OS-isolated sandbox with no external network, empty
allowlisted environment, read-only target and tools, scratch-only writes, and
explicit resource/time limits, render each of the three maintained Compose
profiles using dummy configuration. Use a pre-provisioned disposable fixture for
the exact pinned Keycloak image and fresh dummy state to verify
bootstrap-setting acceptance and the master realm HTTPS policy. Compare the
standalone path with the devcontainer helper path, recording whether that helper
actually changes the policy. Inspect the resulting publication and
request-origin behavior from an isolated peer. Attempt only one harmless
authorized management read of a dummy realm using the intentional public test
administrator after policy and bootstrap conditions are established; stop at the
boundary result. Do not change shared services or use real users, secrets, or
realms.

### Owner-observed configuration check

The owner should inspect the active profile and effective manifest, sanitized
bootstrap-setting status, existing administrator state, master realm HTTPS
policy, actual container port bindings and forwarding configuration, host
firewall, and applicable network routing. Establish whether a specifically
identified non-developer principal has a permitted route to the development IdP
and whether public bootstrap credentials are still active. Use configuration
inspection and owner-held records without disclosing secrets or probing live
management login. Keep standalone, ordinary devcontainer, elevated devcontainer,
Azure, and production conclusions separate.

## 14. Cached developer sessions send cookies outside their recorded destination scope

Fingerprint: `dev-login/cached-jar/unscoped-cookie-header`

Source supports a conditional cookie-disclosure path: a party controlling
development endpoint B can receive cached cookies belonging to app A or its
separate IdP if a developer selects B through --base or DEV_LOGIN_BASE_URL while
reusing the same username cache without --force. The helper runs as the
developer's OS principal, reads that principal's local cache, and constructs an
outgoing Cookie header before checking whether B reports authentication.
Selecting B authorizes requests to B but does not grant B authority over
sessions scoped to A or the IdP. This requires operator interaction and a
recipient outside the source cookies' authority; no automatic attacker control
of local configuration is established. Non-public, usable cookies are necessary
for sensitive impact, and neither runtime disclosure nor production account
takeover has been demonstrated.

Claimed root cause: isJarStillValid reconstructs Cookie from only Netscape
name/value columns and discards recorded domain, host-only, path and expiry
constraints. The default cache path includes username but no destination. Fresh
CookieJar.header filters host, path and expiry, but is bypassed on cache
validation. Secure is also discarded by validation, although the fresh jar
deliberately ignores Secure for local development, so Secure omission is not the
distinguishing cause of this candidate. Manual redirect handling and mode 0600
on newly created cache files do not constrain the initial outgoing header.

### Source trace

- **entrypoint** `scripts/lib/dev-login-core.mjs:35` — parseArgs: The developer
can select a lower-trust destination B with DEV_LOGIN_BASE_URL or --base at
lines 45-46. The CLI flag removes one trailing slash; no origin binding to the
cache is applied. Attacker control of B and the developer's selection of B are
prerequisites, not capabilities established by source.
- **propagation** `scripts/lib/dev-login-core.mjs:58` — parseArgs: Absent --jar,
the cache remains .auth/<user>.cookies when the selected destination changes.
- **propagation** `scripts/lib/dev-login-core.mjs:356` — main: Unless --force is
present, the existing cache is checked against the selected base before any
fresh login; --print-jar returns earlier without validation.
- **propagation** `scripts/lib/dev-login-core.mjs:313` — isJarStillValid:
Nonempty, non-comment lines with at least seven tab-separated fields are
accepted; line 318 joins fields 5 and 6 into one Cookie header without
destination or expiry filtering.
- **sink** `scripts/lib/dev-login-core.mjs:321` — isJarStillValid: fetchImpl is
called with the selected base plus /api/auth/me and the aggregated cookie
header. redirect: manual constrains subsequent hops; non-ok and authenticated
checks occur after this request.

### Verified source evidence

- `scripts/lib/dev-login-core.mjs:58` — The default cache identity contains only
username, allowing the same stored jar to be selected for another base.
- `scripts/lib/dev-login-core.mjs:128` — CookieJar.header applies expiry,
host-only/domain and path checks; lines 139-141 explicitly document ignoring
Secure for development. This baseline supports the domain/path mismatch
without implying full browser cookie semantics.
- `scripts/lib/dev-login-core.mjs:158` — toNetscape writes domain,
include-subdomains, path, secure, expiry, name and value as non-comment
records, including cookies originally marked HttpOnly.
- `scripts/lib/dev-login-core.mjs:318` — Only names and values are retained when
rebuilding the cached header; recorded source scope has no effect on the
request.
- `scripts/lib/dev-login-core.mjs:372` — New cache files are written with mode
0600. Local file permissions do not stop the authorized developer process from
disclosing contents through its manually assembled request.
- `scripts/security/get-session-cookie.mjs:170` — The separate session-cookie
helper selects cookies from an origin-keyed in-memory map. It does not share
this username-cache aggregation pattern, though its comment explicitly
excludes other cookie attributes from its simplified model.
- `scripts/__tests__/dev-login-core.test.mjs:371` — The existing
cache-validation test supplies only one matching-host cookie and expects a
manual Cookie header; it does not cover cross-host cache reuse. Tests were
inspected as source only and were not executed.

### Exact blockers

- Required OS-enforced target-execution isolation is unavailable: the audit's
bubblewrap capability probe failed with No permissions to create new
namespace. No target code, tests, network requests or runtime reproduction
were executed during this validation.
- No deployment configuration or real cookie cache was inspected. Sensitive
impact requires a non-public, still-usable session cookie scoped outside the
selected recipient's authority and an operator workflow that exposes that
cache to the recipient. Public fixture passwords alone do not establish this.

### Bounded local validation

In a future approved sandbox with no external network, an empty allowlisted
environment, read-only target/tools, scratch-only writes and low resource/time
limits, invoke the exported isJarStillValid interface with injected
existsSyncImpl/readFileSyncImpl returning a synthetic Netscape jar and a
recording fetchImpl. Use only dummy host-only app-a.test and idp.test cookies,
select https://app-b.test, and have fetchImpl return ok:true with
authenticated:false. Check that the recorded target is
https://app-b.test/api/auth/me, the recorded Cookie contains both dummy markers
despite incompatible source hosts, and validation returns false after the call.
Compare against CookieJar.header for the same destination with equivalent
synthetic cookie state. Separately check the parseArgs default cache path is
unchanged across A/B. Stop after that boundary observation; do not invoke live
login, use real credentials, or replay cookies. Any retained execution evidence
requires a new parent-owned promotion allowlist and limits because this run's
allowlist is empty.

### Owner-observed configuration check

The owner can inspect cookie metadata and developer workflow configuration
locally, without copying values or sending requests, to determine whether a
default username cache contains a non-public app or IdP session, whether it is
still usable under its issuer's session policy, and whether the same cache is
reused for a separately administered destination without --force or an explicit
per-destination jar. Establish who controls the selected recipient and whether
the developer intentionally authorized that recipient to receive the source
sessions. Report only metadata and the resulting trust relationship.

## 15. Visibility descendant queries can multiply equivalent dependency paths

Fingerprint:
`selection-visibility/recursive-condition-rows/duplicate-path-amplification`

An authenticated area author permitted to save visibility conditions can cause a
small edit to traverse an existing valid acyclic question graph. Multiple
allowed answer/group conditions between the same questions are separate SQL
rows, and the descendant query carries their multiplicity through recursive
UNION ALL before returning distinct question IDs. This creates a source-grounded
hypothesis of disproportionate work in the shared application database compared
with the distinct affected questions. The default 15-second SQL request timeout,
driver cancellation, rollback and edge rate limits constrain the operation. No
SQL execution, resource consumption, failure to cancel, or impact on another
request was observed; this is not a demonstrated denial of service.

Claimed root cause: The descendant relation traverses visibility-condition rows
rather than unique question dependencies and has no visited-question set or
intermediate deduplication. Its depth limit and final DISTINCT do not bound
intermediate path multiplicity. Valid alternative answers/groups can represent
equivalent parent-child edges, so cycle rejection and per-question input
cardinality limits do not establish work proportional to the graph’s distinct
nodes or edges.

### Source trace

- **entrypoint**
`app/api/requirement-selection-questions/[id]/visibility/route.ts:16` — PUT
visibility edit: An authenticated owning-area author/Admin passes the mutation
policy and supplies schema-bounded visibility groups for an existing question.
- **propagation** `lib/dal/requirement-selection-questions.ts:2018` —
replaceRequirementSelectionQuestionVisibilityGroups transaction: Checks the
target, normalizes and validates the replacement, then stores each allowed
answer condition as a separate row; no cycle is needed for this hypothesis.
- **propagation** `lib/dal/requirement-selection-questions.ts:2080` — affected
question discovery before history propagation: The transaction invokes
listVisibilityAffectedQuestionIds before selecting specifications with
affected current answers, so the recursive query runs even if no specification
will subsequently need an update.
- **sink** `lib/dal/requirement-selection-questions.ts:1927` — recursive
visibility_descendants query on shared SQL Server: The anchor includes every
matching condition row; UNION ALL and the recursive join at :1944 preserve and
extend duplicate dependency paths. Only :1948 deduplicates the result after
traversal; the query runs on the shared application database connection.

### Verified source evidence

- `app/api/requirement-selection-questions/_schemas.ts:33` — Finite request
schema caps are 50 groups, 50 conditions per group and 200 answer IDs per
condition. Multiple answers and groups are valid inputs, not malformed
encodings.
- `lib/requirements/assignment-authorization.ts:697` — The strongest entry
authorization resolves the real owning area and requires area authorship
unless Admin; this is not anonymous or ordinary-reader access.
- `lib/dal/requirement-selection-questions.ts:1797` — Normalization uses a Set
of answer IDs for each parent within a group. It does not collapse separate
answers/groups into one stored parent-child dependency.
- `typeorm/migrations/0027_requirement_selection_question_visibility.mjs:25` —
Uniqueness is on visibility_group_id, parent_question_id and answer_id.
Foreign keys bind each reference; DAL answer-parent validation rejects
mismatches. Distinct answers or groups still permit multiple rows for one
parent-child dependency.
- `lib/dal/requirement-selection-questions.ts:1866` — Cycle checking uses
distinct parent sets and visited nodes; an acyclic graph can pass
independently of condition-row multiplicity in the later SQL traversal.
- `lib/dal/requirement-selection-questions.ts:1946` — The recursive predicate
limits depth to 100; final SELECT DISTINCT at :1948 does not express an
intermediate cardinality or visited-question limit.
- `lib/typeorm/sqlserver-config.ts:11` — Default SQL request timeout is 15000 ms
and is passed into DataSource options at :227; pool max defaults to 10. These
controls constrain duration/concurrency and must be retained in validation.
- `lib/db.ts:45` — The application caches and reuses its DataSource rather than
assigning a private database pool to each caller, establishing the shared
resource whose actual impact needs measurement.
- `node_modules/tedious/lib/connection.js:1321` — Installed tedious
requestTimeout calls request.cancel at line 1324. Its cancelTimeout at lines
1312-1315 dispatches a socket error if cancellation times out. TypeORM
EntityManager.js lines 86-98 attempts transaction rollback and releases its
query runner after an error. Source does not establish an indefinite retained
connection or failed cancellation.
- `containers/production/nginx/templates/edge-rate.conf.template:12` — The
production template defines a per-client API request rate zone;
app-node-tls.conf.template line 39 attaches it. Effective deployment admission
settings are unknown, and request frequency does not determine work within an
admitted recursive query.
- `tests/unit/requirement-selection-questions-dal.test.ts:668` — The relevant
test substitutes a precomputed descendant list when it sees the recursive
query. It verifies affected-specification scoping, not SQL intermediate row
growth or cancellation.
- `lib/http/route-security-policy.ts:1116` — The visibility PUT is registered
for session authentication and same-origin CSRF. secure-mutation-route.ts
checks authentication, parses its declared schemas, and authorizes the
assignment policy before calling the DAL handler.
- `lib/dal/requirement-selection-questions.ts:1969` — Subsequent history
propagation selects only specifications with current answers to affected
questions. The separate visibility evaluator at line 482 memoizes question
visibility. These downstream controls do not deduplicate the earlier recursive
SQL relation.

### Exact blockers

- The required OS-enforced sandbox is unavailable: the parent namespace probe
failed with No permissions to create new namespace. This verifier performed
source inspection only; no target code, SQL query, fixture or availability
experiment was executed.
- The SQL Server execution plan and bounded actual intermediate-work growth are
unobserved. Source expresses repeated-path multiplicity, but actual physical
work and the effectiveness of SQL workload controls remain decisive runtime
facts.
- Meaningful impact on another request is unestablished. The default 15000 ms
request timeout, driver cancellation, transaction rollback and shared pool are
source-visible controls; their effective timings, resource isolation and
deployed ingress settings have not been measured or owner-verified.

### Bounded local validation

Only after an approved OS-enforced offline sandbox is available, use a
disposable SQL Server fixture with dummy identities and the real migrations and
visibility route validation. Predeclare a fixed tiny corpus of at most five
questions with one or two valid answer conditions per dependency, comparing
acyclic cases with identical distinct descendants. Limit the runner to one edit
at a time, at most one benign concurrent fixture request, explicit CPU and
memory ceilings, an external wall-clock cutoff, and a cap on measured query
rows; retain the configured request timeout and cancellation controls. Inspect
actual plan row counts or bounded work counters, transaction rollback and
connection release. Do not enlarge the corpus to force a timeout or availability
degradation; if the fixed bounds cannot settle shared effects, retain the
blocker. Stop immediately once growth is established or refuted. Separately
observe cancellation only using a predeclared lower fixture timeout without
increasing graph size. No production or shared development traffic is permitted.

### Owner-observed configuration check

The owner should inspect effective DB_REQUEST_TIMEOUT_MS, DB_POOL_MAX, pool
acquisition limits, SQL resource/workload isolation, runtime instances sharing
the database, and nginx API rate/burst attachment without traffic generation or
secret disclosure. Verify recovery/cancellation telemetry if it already exists.
Source defaults and a small local growth result alone do not establish
meaningful deployed shared impact.

## 16. Ordinary specification deletion may erase preserved confirmed-agreement history

Fingerprint: `specification-delete/cancelled-confirmed-agreement-history-loss`

Independent source review supports a narrow preservation discrepancy. An
authenticated coauthor of a specification can invoke ordinary parent deletion
after its responsible person legitimately cancels the first confirmed future
agreement. Cancellation retains the confirmation, content and business history
while clearing pending state; parent deletion checks only pending/current state
and explicitly deletes agreement records. This could let a coauthor erase the
responsible person's preserved business event and any correction history.
Authentication, assignment checks, parent locking, due activation and
transactional auditing remain effective controls, but do not implement a
historical-confirmation guard. No target execution or deletion was performed.
Whether documented preservation also constrains explicit whole-specification
deletion remains decisive and unresolved.

Claimed root cause: The author-authorized parent deletion path treats a
previously confirmed, subsequently cancelled agreement as deletable because
neither is_pending nor is_current is set. Its dependent deletion does not
distinguish this retained business event from disposable unconfirmed drafts.

### Source trace

- **entrypoint** `app/api/requirements-specifications/[id]/route.ts:119` —
DELETE specification: The secure mutation wrapper validates the identifier and
authorizes canAuthorSpecification using the authenticated actor; an assigned
coauthor can reach deleteSpecificationWithAudit. This is authorized parent
access, not a cross-specification identifier bypass.
- **propagation** `lib/requirements/specification-mutations.ts:186` —
deleteSpecificationWithAudit: Locks the specification snapshot and performs
dependent deletion and the allowed-action audit in one transaction. Missing
parents return not_found; an SQL or audit failure prevents a partial committed
deletion.
- **propagation** `lib/specifications/agreement-policy.ts:48` —
assertSpecificationDeletionAllowed: Locks the parent and materializes due
agreements before rejecting any pending/current agreement. The query has no
condition protecting confirmed historical agreements.
- **sink** `lib/dal/requirements-specifications.ts:1560` —
deleteSpecificationWithExecutor: After the guard, explicitly deletes deviation
endings, all agreement items and agreements, then parent contents and the
specification. No agreement snapshot or archive-export requirement appears on
this ordinary deletion path.

### Verified source evidence

- `docs/adr/0063-fullstandiga-avtal-i-kravunderlag.md:28` — Exact correction
values are business history that the length-limited action log cannot replace.
Lines 34-44 reserve agreement decisions to the responsible person and preserve
cancelled confirmed future agreements because confirmation is a business
event. The ADR does not explicitly resolve whole-parent deletion.
- `docs/security-privacy/informationsmangder-kravhantering.md:319` — Agreement
content and history belong to the specification information asset and
retention rule; mandatory archive export includes agreements and correction
history. Cancelled confirmed future agreements retain their content and cases.
This strengthens the preservation concern but does not expressly specify the
ordinary parent-delete exception or prohibition.
- `lib/dal/requirements-specifications.ts:1058` — canAuthorSpecification permits
Admin, the matching responsible HSA identity, or a matching
specification_co_authors assignment; absent identity is denied.
- `lib/specifications/agreements.ts:709` — Agreement establishment, confirmation
and cancellation are outside the enumerated content-author operations and
therefore require authenticated isSpecificationResponsible, a narrower
predicate than parent-deletion authorship.
- `lib/specifications/agreement-cancellation.ts:117` — Cancellation requires a
confirmed pending agreement, snapshots follow-up, and ultimately clears
is_pending while recording cancellation metadata without removing confirmed_at
or the agreement. For a first future agreement there is no current
predecessor.
- `lib/specifications/agreement-activation.ts:38` — Due activation selects only
pending confirmed agreements. A cancelled agreement with is_pending cleared is
not restored to a guarded state by the parent deletion guard's activation
step.
- `typeorm/migrations/0069_specification_agreements.mjs:120` — Parent and
agreement-item foreign keys use NO ACTION while correction history cascades on
agreement deletion. Explicit child-first deletion addresses the immediate
parent constraint. Other historical references require fixture accounting;
owning/origin references at lines 92-99 use SET NULL. No blanket
historical-confirmation deletion prohibition is visible in these constraints.
- `lib/requirements/specification-mutations.ts:195` — The retained action audit
contains specification lifecycle status and target identity, not complete
agreement content or exact correction snapshots; the deletion is not silent,
but this audit cannot reconstruct the claimed protected data.
- `lib/archiving/retention.ts:539` — The separate obsolete-specification
retention operation uses similar dependent deletion with requiresExport=true
and age, lifecycle, current/pending and exception selection. This is
contextual calibration, not proof that every administrative retention
condition applies to ordinary deletion.
- `tests/sql-integration/specification-agreements.sqlserver.test.ts:2011` — The
source test specifies that cancelling a first future agreement preserves
frozen content and creates an independent editable working set. It does not
test subsequent whole-specification deletion and was not executed during this
review.

### Exact blockers

- Required OS-enforced execution isolation is unavailable: the audit capability
probe reported No permissions to create new namespace. No target process, SQL
fixture, deletion, foreign-key interaction or retained-history readback was
executed.
- The information owner must resolve whether the documented
cancelled-confirmation preservation contract applies to explicitly authorized
whole-specification deletion. If such deletion intentionally permits erasing
this history without export, the security claim is not established.
- A future isolated migrated SQL fixture must establish the minimum deletion
outcome, including actual foreign keys and retained audit, for a specification
with only its first cancelled confirmed agreement. This source review does not
claim universal or observed deletion success.

### Bounded local validation

Only after an approved isolated offline sandbox is available, use a disposable
migrated SQL fixture with dummy responsible and separate coauthor identities and
strict resource limits. Legitimately establish a first future agreement, record
a correction if testing correction-history loss, cancel it as the responsible
person, and verify retained confirmation/content. Invoke the ordinary DELETE
route once as the assigned coauthor and inspect only that specification's
agreement, correction and item rows plus the retained action audit. Include a
separate pending/current agreement control that must reject deletion. Account
for all actual foreign keys and stop after this bounded result; never use
existing services or real records.

### Owner-observed configuration check

Obtain an owner decision on explicit whole-specification deletion under ADR 0063
and the information-asset preservation rule. Reject the security claim if
erasure is explicitly permitted. If preservation is required, confirm the
deployed revision, schema constraints and runtime grants through read-only owner
inspection; do not test deletion against deployed data.
