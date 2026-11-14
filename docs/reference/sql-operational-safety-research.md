# SQL operational safety evidence

This note is for maintainers assessing SQL safety guidance and operators
reviewing SQL execution surfaces. It establishes which operational, batching,
and diagnostic claims have technical support, where they apply here, and what
still needs a decision or a focused experiment. It does not authorize a
database change or define new operating policy.

Evidence date: 2026-11-14. Repository baseline:
`8aa33026bd682711dd5d1ad78ad1422f911bc5f8`. Repository observations below are
static inspection of that revision. Microsoft documentation establishes
engine semantics; deductions are identified as inference. No SQL, PowerShell
workflow, backup, restore, concurrency experiment, or database setup is run
for this research.

## Findings at a glance

- A nullable dry-run flag must explicitly handle `NULL`. `ShouldProcess`
  supports PowerShell preview and confirmation, but does not independently
  require an explicit apply switch. These are useful controls for deliberate
  operational execution, not engine requirements for every application write.
- Batching can reduce lock duration, but independent commits deliberately
  allow partial progress. A row cap is neither a lock-count guarantee nor
  proof of safe retries. Atomic business workflows can need one transaction.
- Capturing copied keys is useful, but `OUTPUT INTO` alone proves neither
  durable copying nor safe deletion under every trigger/concurrency design.
- The listed administrative statements need an autocommit execution path.
  Running each in a separate client batch is not a universal requirement:
  SQL Server specifically recommends keeping `SINGLE_USER` and the following
  database drop in the same batch to avoid a connection race.
- Read-only diagnostics are a sound separation from remediation. Their
  completeness depends on permissions, version, sampling, and the identity
  model. A SQL database user without its expected login is distinct from a
  business record without a related application row.

The sections below supply the evidence and applicability for these judgments.

## Actual execution surfaces and version boundary

The [vendor image lock](../../containers/sqlserver/image.lock.json) selects
SQL Server `2025-CU10-ubuntu-24.04`, including digest and image ID. The
[package lock](../../package-lock.json) resolves TypeORM `1.1.2`, `mssql`
`12.7.14`, and Tedious `20.3.8`. The
[runtime configuration](../../lib/typeorm/sqlserver-config.ts) uses TypeORM
with the `mssql` driver, disables schema synchronization, configures
transaction error handling and timeouts, and defaults explicit transactions
to `READ COMMITTED`. This is evidence of checked-in versions, not evidence of
the running server version, compatibility level, database options, or a
complete minimum-version support policy for externally supplied databases.

Relevant surfaces are:

- The [database admin CLI](../../scripts/db-sqlserver-admin.mjs) executes SQL
  through pooled `mssql` requests and TypeORM. It provides provisioning,
  migrations, seeds, permission verification/reconciliation, and destructive
  reset commands. The [DBA provisioning template][repo-provision] contains
  `GO` separators and existence checks for database and principal creation.
- [Retention execution][repo-retention] refreshes its preview inside a
  `SERIALIZABLE` transaction, verifies the preview token, requires an export
  confirmation token when applicable, mutates candidates, and records the
  run within that transaction. Its archive export is application JSON,
  not an `INSERT` into an SQL archive table. Requirement lifecycle archiving,
  retention disposal, archive export, and privacy erasure have distinct
  meanings in the [application glossary](../../GLOSSARY.md).
- [Transient cleanup][repo-cleanup-runner] performs bounded scheduled work.
  The default batch is 100, maximum 500; default counted work per run is
  1000. Representative [expiry deletion][repo-cleanup-delete] uses one
  `DELETE` from an ordered `TOP` common table expression, then reads
  `@@ROWCOUNT`. The runner does not wrap the run in one outer transaction.
  The [forensic target][repo-forensic] has several independently issued
  statements and subsequent telemetry; one target invocation is not one
  atomic batch. See the [cleanup operating contract][repo-cleanup-doc].
- [Azure development PowerShell](../../scripts/azure-dev.ps1) has
  `SupportsShouldProcess`, `Apply`, and `Yes`. Apply is command-specific;
  for example the SSH configuration command accepts `Apply` or `Yes`.
  [Remote validation](../../scripts/azure-dev/AzureDev.Validation.psm1)
  invokes `npm run db:setup`, so PowerShell can indirectly initiate SQL
  work even when it contains no T-SQL. This is not proof of a preview bypass.

A targeted search of operational code and docs does not identify a reusable
Agent-job, linked-server, wait-statistics, blocking-chain, or orphan-SQL-user
diagnostic command. Such a feature is absent from the inspected surfaces;
its absence is not itself a missing safeguard on an existing command.

## Dry run and explicit application

**Supported engine fact.** SQL comparisons with `NULL` yield `UNKNOWN`, not
true; `IS NULL` tests for null. A `bit` accepts `0`, `1`, or `NULL`, and
nonzero values convert to `1`. Consequently a nullable `@DryRun bit = 1`
guard of `IF @DryRun = 1` can fall through for an explicitly supplied null.
`IF @DryRun IS NULL OR @DryRun <> 0` makes only the zero value take the
write path. Defaults cover omitted procedure arguments, not explicit nulls.
[NULL semantics][ms-null], [bit conversion][ms-bit], and
[procedure parameter defaults][ms-procedure] support these conclusions.

**Limit.** This is fail-closed behavior after SQL parameter conversion, not
validation of the caller's original representation. It does not replace
validation of identifiers, dates, batch bounds, permissions, or tenant scope.
A preview count is a statement-time observation, not a promise that the same
rows will qualify later. An exact-preview workflow needs revalidation or a
documented snapshot/concurrency contract; retention already revalidates its
token in its execution transaction [in project code][repo-retention].

**PowerShell fact.** `SupportsShouldProcess` exposes `WhatIf` and `Confirm`;
the mutation must respect `ShouldProcess`. Under `WhatIf`, that check reports
the operation and returns false. Calls to other commands must not be assumed
to inherit preview behavior automatically. Nothing in this mechanism makes
normal execution a dry run by default. An initially false `Apply` switch,
checked together with `ShouldProcess`, can add that property. With a
short-circuit `Apply -and ShouldProcess(...)` expression, the no-Apply branch
needs its own preview output because the check is skipped.
[Microsoft's ShouldProcess guidance][ms-shouldprocess].

**Applicability/inference.** SQL submitted by a native process or remote npm
command must be gated before invoking that process; PowerShell does not
rewrite its SQL. Testing omission of Apply, explicit false, WhatIf with
Apply, rejected confirmation, and nested/remote dispatch would establish the
contract. Blanket adoption on every `.ps1` would also cover infrastructure
commands with different existing authorization semantics. Choosing that
policy, and whether an equivalent `Yes` path is acceptable, needs a human
decision. Scheduled cleanup intentionally writes on execution and currently
has no interactive Apply/dry-run contract.

## Idempotency, predicates, and validation

**Conditional.** Existence guards and `CREATE OR ALTER` help reruns, but are
not general proofs of idempotency or correct state. Procedure
`CREATE OR ALTER` starts at SQL Server 2016 SP1; it changes an existing
definition and is not syntax for every object kind.
[Microsoft procedure syntax][ms-procedure]. An `OBJECT_ID` null can mean
missing metadata visibility or an error, not just object absence.
[Microsoft OBJECT_ID behavior][ms-objectid].

**Inference.** A check followed by creation can race another creator.
Existing objects also need an explicit contract: verify expected ownership,
type, definition, and membership, reconcile an approved difference, or stop.
Skipping an existing login does not establish its SID or credentials.
The [provisioning template][repo-provision] checks role type and membership;
the [admin CLI][repo-admin] separately checks a release-versioned permission
manifest and offers explicit reconciliation. This is more precise than a
universal rule never to alter an existing principal. These observations do
not prove every existing principal is checked for every possible drift.

**Predicate fact and limit.** SQL permits a whole-table `UPDATE` or `DELETE`;
`WHERE` determines the affected rows and `TOP` bounds their number. `TOP`
selection without ordering is unpredictable; an ordered subquery is needed
when the subset matters. A syntactically present predicate can still match
every row or cause an expensive scan.
[Microsoft TOP guidance][ms-top].

**Project counterexample.** The deliberate disposable/demo reset performs
whole-table deletes and one truncation, with validated table names and a
transaction when given a DataSource. A mandatory selective predicate would
misdescribe this operation rather than make its intent safer. The CLI's
`demo:clear` command requires `--confirm-clear-non-required-data`.
[Reset implementation and CLI gates][repo-admin]. Target identity,
authorization, and an intentional whole-table contract are the relevant
controls; deciding their required form is policy.

Input validation is useful, but requiring a stored-procedure nonzero return
code on every invalid input is not a portable project-wide failure contract.
These operational entry points are predominantly JS/TS calls that throw or
return CLI exit status, not direct procedure-return consumers. The caller
must actually observe the chosen error channel. No template return-code
behavior is assumed tested here.

## Batches, partial progress, and retries

**Supported, with a transaction-ownership condition.** With implicit
transactions off and no explicit transaction, a DML statement has its own
autocommit transaction. With implicit transactions on, table reads and
writes can start a transaction requiring explicit completion.
[Microsoft implicit transaction semantics][ms-implicit]. An inner commit
only reduces `@@TRANCOUNT`; it does not independently commit the work while
an outer transaction remains. Thus a procedure promising independently
committed batches must reject caller-owned/implicit transactions before
reads can open one, or use an execution boundary that owns the transaction.
[Microsoft COMMIT semantics][ms-commit]. Adding the template's raw transaction
wrapper inside existing TypeORM orchestration would not establish this.

**Supported optimization, not a universal workflow.** Smaller transactions
and efficient predicates/indexes reduce the lock footprint. Microsoft
recommends batching for lock escalation problems, whose triggers depend on
lock count and memory. A 1000-row batch is not a universal threshold and a
row limit does not bound all locks or transaction duration.
[Microsoft lock-escalation guidance][ms-escalation]. A workflow needing
all-or-nothing changes, such as current retention execution, cannot acquire
independent commits without changing its failure semantics.

**Inference.** Once a batch commits, later rollback cannot reverse it. A retry
must distinguish rolled-back work from already committed work and an unknown
commit outcome after connection failure. It should reselect remaining work
under stable predicates/keys, handle duplicates deliberately, and bound
attempts and total work. A moving cutoff or continuous new arrivals can make
an otherwise valid loop unbounded. Accumulated counts should be published
only after successful commits; a durable per-run/batch receipt is needed if
exact partial progress is a requirement. Counting an entire archive table
cannot attribute work to this run under concurrent writers.

**Project observation.** Cleanup has work limits, reinspection after attempted
work, a zero-progress exit, and failure results; earlier successful statements
remain complete when a later statement fails. It has no generic immediate
retry loop; the next scheduled run revisits remaining expired state.
[Runner][repo-cleanup-runner], [schedule and bounds][repo-cleanup-doc]. A
statement can commit before response/telemetry failure, so the reported count
is not proof of exact persisted progress in every failure case. That is an
inference, not an observed incident.

The candidate claim that rethrowing always prevents SQL output-parameter
copy-back is **unestablished by this research**. Do not use it as an engine
guarantee without checking the specific invocation, error, and driver path.
Likewise an output variable alone is not a portable durable failure receipt.

## Copy/delete patterns and concurrent changes

**Supported mechanism with important limits.** `OUTPUT` exposes affected row
images and can insert them into a key set. Returned rows can still reach the
client when a statement errors and rolls back, so output is not a commit
receipt. Images precede trigger execution; an `INSTEAD OF` trigger can produce
output as if a modification happened even when it did not. Output order is
not guaranteed. `OUTPUT INTO` targets have restrictions including enabled
triggers and foreign-key/check constraints. These facts prevent a blanket
claim that every captured key proves a durable archive copy.
[Microsoft OUTPUT documentation][ms-output].

**Inference for the proposed two-statement pattern.** In a normal-table
design, capturing inserted source keys, then deleting those exact keys in
the same transaction, prevents deletion merely because a separate broad
predicate still matches. Clearing the key set each batch prevents stale keys
from a prior batch being reused. Preserve source identifiers explicitly;
an unrelated archive identity is not a source key. Verify triggers, archive
uniqueness, all required columns, foreign keys/cascades, equal copied/deleted
sets, and rollback on either failure. If the insert commits before deletion,
or if a row changes between copy and delete without protection, keys alone
do not preserve the latest source values.

`UPDLOCK` holds update locks through transaction completion and can protect
selected source rows from competing modifications during the move. It does
not make the whole workload free from blocking/deadlocks. `READPAST` skips
row locks, not page locks; foreign-key/index access can still block. At
`READ COMMITTED` with `READ_COMMITTED_SNAPSHOT ON`, its documented usage
requires `READCOMMITTEDLOCK`. These options are conditional, not a generic
copy/delete recipe. [Microsoft table hints][ms-hints].

**Project boundary.** The inspected project does not move retention rows
into an SQL archive table. Replacing JSON archive export and atomic disposal
with this pattern would be a feature/domain change. Cleanup already deletes
bounded expired subsets rather than copying them. Some targets include
`READCOMMITTEDLOCK` while [validation-session cleanup][repo-cleanup-delete]
and [forensic cleanup][repo-forensic] do not. Database snapshot options and
inherited session isolation are not verified here; compatibility under those
options remains a concrete test question, not proof of a live defect.

## Administrative transactions and recovery

**Supported for SQL Server.** The documented SQL Server forms of
[CREATE DATABASE][ms-createdb], [ALTER DATABASE][ms-alterdb],
[DROP DATABASE][ms-dropdb], [BACKUP][ms-backup], [RESTORE][ms-restore], and
[RECONFIGURE][ms-reconfigure] cannot run in explicit or implicit user
transactions. These need an execution path outside the generic DML
transaction wrapper. A TRY/CATCH can report failure, but cannot make several
autocommit operations collectively reversible.

**Interpretation pitfall.** If “run each statement on its own” is interpreted
as separate client batches, it can introduce a race. Microsoft recommends
placing
`ALTER DATABASE ... SET SINGLE_USER` and `DROP DATABASE` in the same batch
to keep another connection from taking the single-user slot. Autocommit is
about transaction management, not a requirement for one client request per
statement. [Microsoft DROP DATABASE guidance][ms-dropdb]. Pre/post checks and
operation-specific recovery remain useful; the correct boundary depends on
the operation.

**Concrete surface for a later decision.** `resetSqlServerDatabase` connects
to master with bootstrap administration credentials, sets the configured
database to single-user with immediate rollback, drops it, then recreates it.
Its identifier is quoted. CLI `reset` has no confirmation, dry-run,
disposable-target allowlist, or backup step in the inspected path. `reset`
is a core command available in the production DB-job image; the production
exclusion covers `setup`, `seed:demo`, and `demo:clear`, not `reset`.
[Admin implementation and command selection][repo-admin]. Re-creation can
fail after drop; identifier quoting does not prevent selecting the wrong
database. Whether to restrict/remove this production surface or introduce a
specific target/confirmation contract is a human decision. No claim is made
that the command has been used against production.

**Recovery facts.** A backup on a newer SQL Server cannot be restored to an
older engine; backup privileges and service-account access to the backup
device both matter. [Microsoft full-backup prerequisites][ms-backup].
`RESTORE VERIFYONLY` checks completeness/readability, but neither restores
the database nor validates its complete data structure.
[Microsoft VERIFYONLY limits][ms-verifyonly]. Therefore a backup filename or
successful verification is weaker evidence than an isolated restore and
application checks; rollback SQL cannot recover dropped data by itself.

**Existing stronger project contract.** The
[upgrade guide][repo-upgrade] requires a tested SQL restore point before
migration, records its identifier, and preserves previous configuration and
other persistent services. [AI operations][repo-ai] treats the SQL backup and
external root keyring as one recovery set and provides an isolated restored
secret-verification workflow. These controls are not replaced by adding a
comment saying “take a backup.” The site's actual backups, recovery model,
restore results, RPO/RTO, and operation approvals are not inspected.

Asking before generating destructive commands and forbidding automatic
`KILL`, repair, principal deletion, configuration changes, or feature enablement
are authorization policies rather than SQL syntax guarantees. Their desired
scope and exceptions need agreement; this note grants none. Recovery guidance
must say when full reversal is impossible instead of promising a rollback
for every operation.

## Headers, permissions, and diagnostic boundaries

**Useful documentation, conditional content.** A runnable operational script
benefits from purpose, target product/version, required permissions, read/write
classification, execution context, and failure/recovery behavior. A comment
does not enforce them. For embedded SQL, a header on each fragment can obscure
the owning function/command contract; a scoped entry-point description can
carry equivalent information. The [provisioning template][repo-provision]
already explains required `db_owner` for its migration principal but has no
explicit version/Managed Instance compatibility statement.

Do not turn a syntax example such as SQL Server 2016 SP1 into the project's
minimum supported server version. Do not infer Managed Instance compatibility
from SQL Server syntax alone. No environment-level Managed Instance validation
is established by the inspected image contract or this research.

**Permissions must follow each object.** For example, wait statistics and
execution requests require `VIEW SERVER PERFORMANCE STATE` on SQL Server
2022 and later; older SQL Server versions use `VIEW SERVER STATE` for
cross-session visibility. Other catalogs have different visibility rules.
[Wait DMV permissions][ms-waits], [request DMV permissions][ms-requests],
[server-principal visibility][ms-serverprincipals]. The app's custom runtime
role and a read-only application-table browser are not evidence of complete
server diagnostic access. Do not grant the app broad diagnostic rights solely
to make a query return rows.

### Read-only blocking and wait diagnostics

**Supported separation.** Keep observation separate from intervention.
Queries of sessions, requests, and SQL text can establish a blocking chain;
include session/connection/transaction context so sleeping sessions with open
transactions remain visible. Joining only active requests can omit a head
blocker. A sample is transient evidence, not an incident history.
[Microsoft blocking investigation][ms-blocking]. Negative blocking-session
values can denote internal/distributed conditions rather than ordinary session
IDs, so they must not be blindly followed as sessions.
[Microsoft request fields][ms-requests].

`KILL` terminates a connection and can spend significant time rolling back
its transactions. Session IDs are reused, so an old captured ID/reason is
insufficient without rechecking current identity/context immediately before
any separately authorized intervention. Monitoring an existing rollback uses
`WITH STATUSONLY`; repeated destructive `KILL` can hit a newly assigned
session. [Microsoft KILL semantics][ms-kill].

**Wait fact and inference.** `sys.dm_os_wait_stats` records aggregate completed
waits, cumulative since startup or the last reset. Two local snapshots and
deltas isolate a time interval without clearing global counters. Check for
restart/reset and negative deltas; total wait includes signal time, and the
maximum-wait column is not an additive counter. Idle/background wait filtering
must be documented for the workload/version, not copied as a timeless benign
list. Keep raw samples available. Global waits alone do not attribute a
problem to this application. [Microsoft wait-statistics semantics][ms-waits].
Resetting counters with `DBCC SQLPERF(..., CLEAR)` changes diagnostic state
and does not belong in a read-only investigation.

Read-only means no deliberate persistent mutation/remediation; it does not
mean zero load, zero locks, or no sensitive text. Collecting two snapshots can
use local client state or explicitly scoped temporary state. If “changes
nothing” is intended to prohibit even temporary tables/session settings, that
stricter definition needs to be stated as policy.

### Orphan SQL users

**Supported narrow detector.** For SQL-authenticated instance mappings, inspect
`sys.database_principals` for `type = 'S'`, `authentication_type = 1`, and no
matching SID in `sys.server_principals`, excluding `dbo`, `guest`,
`INFORMATION_SCHEMA`, and `sys`. Authentication type 1 means instance
authentication; database-authenticated contained users, users without login,
and Windows users must not be labelled SQL-login orphans by this test.
[Microsoft principal columns][ms-dbprincipals] and
[orphan-user guidance][ms-orphans]. This concerns SQL security principals,
not business relationships or application user identities.

**Limits.** A user name matching a login name is insufficient if SIDs differ.
The narrow detector does not establish the health of Windows/group/Entra
authentication or every login configuration. Incomplete catalog visibility
can hide a matching login, producing a false orphan diagnosis; establish
permissions before trusting absence. Azure SQL Database does not persist SQL
logins in `sys.server_principals`, so this join is not portable to that
product. [Microsoft server-principal visibility][ms-serverprincipals].

`ALTER USER ... WITH LOGIN` remaps the SID to an existing login and is a
separate mutation. [Microsoft ALTER USER][ms-alteruser]. Confirming the intended
mapping before repair is sound. “Never create logins or drop users” is a
reasonable narrow repair-tool boundary, not a universal engine requirement:
Microsoft also documents recreating a missing login with the correct SID as
one recovery approach. [Microsoft orphan-user remedies][ms-orphans]. The
project's provisioning and restore procedures need their own contract.

## Open verification and decision inputs

The research establishes conditional technical claims, not a finding that
every template difference is a defect. Useful bounded follow-up inputs are:

1. Decide which operational entry points require preview/explicit application,
   especially production availability and target protection for `reset`.
2. Establish externally supported engine versions, compatibility levels,
   snapshot options, and diagnostic identities; test only the selected matrix.
3. If exact partial-progress reporting or automatic retries are required,
   test committed-but-response-lost and mid-target failure behavior. Specify
   durable receipts and retry semantics before changing atomicity.
4. If an SQL archive-move feature is actually desired, first specify source
   identity, triggers, concurrent-writer behavior, duplicates, completeness,
   and recovery; then test that concrete design in an isolated supported
   workflow. Do not adopt an unrelated Orders template as project evidence.
5. Test nullable dry-run and PowerShell remote-dispatch gates on any command
   that adopts them, plus read-only diagnostic visibility and orphan-detector
   false positives under its intended principal.

No application, project instruction, environment, or database change is part
of this artifact. Manual cases and application tests are unchanged because
this is an evidence note with no user-facing behavior change.

[repo-admin]: ../../scripts/db-sqlserver-admin.mjs
[repo-provision]: ../../containers/production/sqlserver/dba-provision.sql.template
[repo-retention]: ../../lib/archiving/retention.ts
[repo-cleanup-runner]: ../../lib/transient-cleanup/runner.ts
[repo-cleanup-delete]: ../../lib/transient-cleanup/requirement-import-validation-sessions.ts
[repo-forensic]: ../../lib/transient-cleanup/ai-forensic-evidence.ts
[repo-cleanup-doc]: ../operations/transient-state-cleanup.md
[repo-upgrade]: ../operations/rhel10-production-single-node-self-contained-upgrade.md
[repo-ai]: ../operations/ai-connections.md
[ms-null]: https://learn.microsoft.com/en-us/sql/t-sql/language-elements/null-and-unknown-transact-sql?view=sql-server-ver17
[ms-bit]: https://learn.microsoft.com/en-us/sql/t-sql/data-types/bit-transact-sql?view=sql-server-ver17
[ms-procedure]: https://learn.microsoft.com/en-us/sql/t-sql/statements/create-procedure-transact-sql?view=sql-server-ver17
[ms-shouldprocess]: https://learn.microsoft.com/en-us/powershell/scripting/learn/deep-dives/everything-about-shouldprocess?view=powershell-7.6
[ms-objectid]: https://learn.microsoft.com/en-us/sql/t-sql/functions/object-id-transact-sql?view=sql-server-ver17
[ms-top]: https://learn.microsoft.com/en-us/sql/t-sql/queries/top-transact-sql?view=sql-server-ver17
[ms-implicit]: https://learn.microsoft.com/en-us/sql/t-sql/statements/set-implicit-transactions-transact-sql?view=sql-server-ver17
[ms-commit]: https://learn.microsoft.com/en-us/sql/t-sql/language-elements/commit-transaction-transact-sql?view=sql-server-ver17
[ms-escalation]: https://learn.microsoft.com/en-us/troubleshoot/sql/database-engine/performance/resolve-blocking-problems-caused-lock-escalation
[ms-output]: https://learn.microsoft.com/en-us/sql/t-sql/queries/output-clause-transact-sql?view=sql-server-ver17
[ms-hints]: https://learn.microsoft.com/en-us/sql/t-sql/queries/hints-transact-sql-table?view=sql-server-ver17
[ms-createdb]: https://learn.microsoft.com/en-us/sql/t-sql/statements/create-database-transact-sql?view=sql-server-ver16
[ms-alterdb]: https://learn.microsoft.com/en-us/sql/t-sql/statements/alter-database-transact-sql?view=sql-server-ver17
[ms-dropdb]: https://learn.microsoft.com/en-us/sql/t-sql/statements/drop-database-transact-sql?view=sql-server-ver17
[ms-backup]: https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/create-a-full-database-backup-sql-server?view=sql-server-ver17
[ms-restore]: https://learn.microsoft.com/en-us/sql/t-sql/statements/restore-statements-transact-sql?view=azuresqldb-mi-current
[ms-reconfigure]: https://learn.microsoft.com/en-us/sql/t-sql/language-elements/reconfigure-transact-sql?view=sql-server-ver16
[ms-verifyonly]: https://learn.microsoft.com/en-us/sql/t-sql/statements/restore-statements-verifyonly-transact-sql?view=sql-server-ver17
[ms-waits]: https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-objects/sys-dm-os-wait-stats-transact-sql?view=sql-server-ver17
[ms-requests]: https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-objects/sys-dm-exec-requests-transact-sql?view=sql-server-ver17
[ms-blocking]: https://learn.microsoft.com/en-us/troubleshoot/sql/database-engine/performance/understand-resolve-blocking
[ms-kill]: https://learn.microsoft.com/en-us/sql/t-sql/language-elements/kill-transact-sql?view=sql-server-ver17
[ms-dbprincipals]: https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-database-principals-transact-sql?view=sql-server-ver17
[ms-serverprincipals]: https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-server-principals-transact-sql?view=sql-server-ver17
[ms-orphans]: https://learn.microsoft.com/en-us/sql/sql-server/failover-clusters/troubleshoot-orphaned-users-sql-server?view=sql-server-ver17
[ms-alteruser]: https://learn.microsoft.com/en-us/sql/t-sql/statements/alter-user-transact-sql?view=sql-server-ver17
