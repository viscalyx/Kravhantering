# SQL Server transaction and driver safety evidence

This evidence note is for developers and reviewers assessing transaction and
error-handling safeguards. It distinguishes SQL Server contracts from the
project's execution paths so future decisions can use the right boundary.
It does not prescribe new project policy or certify every SQL call site.

## Scope and reproducibility

Research date: 2026-11-14. Repository snapshot:
`8aa33026bd682711dd5d1ad78ad1422f911bc5f8`.
All repository observations below refer to that snapshot, not a running
database. [The lockfile][lock] pins TypeORM 1.1.2, node-mssql (`mssql`)
12.7.14, Tedious 20.3.8, and tarn 3.0.2. The application imports `mssql`,
whose default adapter is Tedious; optional MSNodeSQLv8 behavior is outside
this note. [The development Compose file][compose] selects
`mcr.microsoft.com/mssql/server:2025-CU10-ubuntu-24.04`; this is a configured
image tag, not proof of the actual server build or compatibility level.

The installed sources under `/workspace/node_modules` report the same
versions. For TypeORM, mssql and Tedious, the published npm tarballs were
downloaded without installing dependencies. Their SHA-512 digests match the
lockfile integrity fields. Every implementation file cited below matches
the corresponding tarball file byte for byte. The versioned tarballs are
the primary driver artifacts: [TypeORM][typeorm], [mssql][mssql] and
[Tedious][tedious]. File locations below are relative to their package
roots. Package metadata also identifies mssql source commit
`6589a7e1626c9b09bc849cd8d92ff57c91f87646` and Tedious source commit
`b10a08865d7ce6f863eb209756914acfc91a1a8d`; TypeORM metadata supplies no
Git commit, so the verified tarball is its version anchor.

Evidence labels:

- **Documented:** a primary SQL Server or driver documentation contract.
- **Source observation:** repository configuration or verified dependency
  implementation; no live execution is implied.
- **Inference:** a consequence of those contracts and source paths.
- **Untested:** behavior that still needs an experiment on the actual stack.

No database commands, migrations, failure injection, configuration changes,
container setup, or application tests are part of this investigation.

## Existing execution boundaries

**Source observation:** [The application configuration][config] explicitly
sets `options.abortTransactionOnError: true`, `enableArithAbort: true`,
top-level transaction isolation `READ COMMITTED`, and a configurable pool
with default maximum 10. [The database module][db] caches initialized
DataSources by URL and mode; `SqlServerDatabase` is a type alias for
TypeORM `DataSource`, not an additional transaction implementation.

**Source observation:** [The administrative module][admin] has separate
builders. `createMssqlConfig()` creates a direct pool with maximum 1;
`buildMigrationDataSourceOptions()` creates a TypeORM DataSource.
Both set arithmetic-abort and TLS options but omit
`abortTransactionOnError` and `enableImplicitTransactions`.
`runSqlServerMigrations()` calls `dataSource.runMigrations()` without
transaction overrides. These paths do not inherit application options.

**Source observation:** TypeORM's `driver/sqlserver/SqlServerDriver.js`,
`createPool()`, forwards `options.options` to mssql; mssql's
`lib/tedious/connection-pool.js`, `_config()`, forwards them to Tedious.
Tedious's `lib/connection.js` defaults `abortTransactionOnError` to false
and `enableImplicitTransactions` to false; `getInitialSql()` emits the
corresponding `SET` statements during connection initialization.
Consequently, application connections initialize with `XACT_ABORT ON`,
while these admin/migration connections initialize with `XACT_ABORT OFF`.
All initialize with `IMPLICIT_TRANSACTIONS OFF` unless a different path or
subsequent SQL changes it. This is a source conclusion, not a session probe.
[TypeORM source][typeorm], [mssql source][mssql], [Tedious source][tedious].

## NOCOUNT concerns results, not atomicity

**Documented:** `SET NOCOUNT ON` suppresses affected-row messages, including
per-statement procedure messages, while SQL Server still updates
`@@ROWCOUNT`. It can reduce procedure/loop network traffic. It does not
start transactions or supply rollback behavior. [SQL Server NOCOUNT][nocount].

**Source observation:** mssql's `lib/tedious/request.js` collects non-null
DONE row counts into `rowsAffected`; its public documentation also requires
NOCOUNT OFF for affected-row events. TypeORM's
`SqlServerQueryRunner.query()` takes `affected` from `raw.rowsAffected[0]`.
It ordinarily returns only `raw.recordset`, with special handling for a
query whose first token is `DELETE`. [mssql source][mssql],
[TypeORM source][typeorm], [mssql result documentation][mssql-docs].

**Inference:** prefixing every generated write with NOCOUNT ON can remove
counts a caller expects, and leading SQL text can change TypeORM's raw
result shape. A blanket prefix is not an equivalent safety improvement.
For a particular raw batch, an explicit scalar result such as
`SELECT @@ROWCOUNT AS affected` is a distinct contract that survives
NOCOUNT, provided it is captured immediately after the intended statement
and appears in the recordset the caller actually consumes. Exact
QueryBuilder/update/delete behavior after any proposed global change
requires focused tests. Existing uses in [run coordination][coordination]
are evidence of local result contracts, not a global NOCOUNT setting.

## XACT_ABORT, TRY/CATCH and error signaling

**Documented:** `XACT_ABORT ON` makes runtime statement errors terminate and
roll back the transaction; compile errors are unaffected. With OFF, some
errors roll back only their statement, while others still abort the
transaction. `THROW` honors XACT_ABORT; `RAISERROR` does not. SQL Server
recommends THROW for new applications. XACT_ABORT alone does not combine
separate autocommit statements into one atomic unit. [SQL Server
XACT_ABORT][xactabort].

**Documented:** within TRY/CATCH an error can leave a transaction
uncommittable. `XACT_STATE()` distinguishes no transaction (`0`), a
committable transaction (`1`) and an uncommittable one (`-1`). The last
state permits neither commit nor rollback to a savepoint; full rollback
is required. `@@TRANCOUNT` measures nesting, not committability.
[SQL Server transaction state][xactstate].

**Documented:** TRY/CATCH handles many execution errors above severity 10,
but not client attentions, broken connections, or same-scope compilation
and name-resolution errors. A caught error is not automatically returned
to the application. A parameterless `THROW;` inside CATCH rethrows the
original exception; creating a new error is a different operation.
[SQL Server TRY/CATCH][trycatch], [SQL Server THROW][throw].

**Inference:** rollback-if-open followed by THROW is a sound shape for
transaction-compatible SQL whose transaction belongs to that batch.
It is incomplete as a universal procedure template: a full rollback can
also roll back the caller's work, and CATCH cannot cover every interruption.
A validation branch using severity-16 RAISERROR plus RETURN signals an
error, but its behavior differs from THROW when an outer
transaction exists. Merely documenting a nonzero invalid-input return code
does not establish whether an ambient transaction should survive.
[XACT_ABORT][xactabort], [TRY/CATCH][trycatch], [ROLLBACK][rollback].

**Source observation:** non-streaming mssql requests collect SQL errors,
return the last error with `precedingErrors`, and preserve SQL number,
line, state, severity class and procedure fields in `RequestError`.
TypeORM wraps rejected requests in `QueryFailedError`, retains
`driverError`, and copies its other properties. Server error metadata
therefore has a path to the TypeScript caller; repository logging and
API translation determine what ultimately remains visible.
`lib/tedious/request.js` and `lib/error/request-error.js` in
[mssql][mssql]; `driver/sqlserver/SqlServerQueryRunner.js` and
`error/QueryFailedError.js` in [TypeORM][typeorm].

## Procedure return codes and partial results

**Documented:** procedure return codes require explicit capture by the
caller. Microsoft advises signaling failure with an error rather than
relying only on a return code. A documented nonzero code for invalid
procedure input can supplement such a contract; it does not replace error
propagation. [SQL Server procedure outputs][procedure-results].

**Source observation:** mssql `Request.execute()` resolves an object with
`recordsets`, `output`, `rowsAffected` and `returnValue`. Its Promise path
rejects an error before constructing that success result; it does not
reject merely because `returnValue` is nonzero. TypeORM's SQL Server
`query()` uses mssql `Request.query()`, not `execute()`, and exposes the
first recordset rather than a procedure return-status object. A raw EXEC
must explicitly capture/select status if its caller needs it.
`lib/base/request.js`, `execute()`, and `lib/tedious/request.js`,
`_execute()`, in [mssql][mssql]; `SqlServerQueryRunner.query()` in
[TypeORM][typeorm].

**Documented and observed:** success meanings are procedure-specific.
`sys.sp_getapplock` returns `0` for immediate success and `1` for success
after waiting, with negative values for failure. The repository's
[import-validation transaction][validation] captures the status and
checks for negative values. This bounds any generalized nonzero=failure
rule; it does not contradict a convention limited to invalid input in
new application procedures. [SQL Server application locks][applock].

**Untested:** a categorical claim that THROW always prevents SQL Server
from copying an output parameter back is not established here. T-SQL
caller TRY/CATCH, error severity, RPC versus raw EXEC, driver events and
Promise rejection are different boundaries. What is established is that
the normal rejected mssql Promise does not return its success result and
TypeORM raw query does not expose the full output object. An output
parameter or streamed row is therefore not, by itself, verified evidence
of committed partial progress after failure. Server copy-out details need
a focused experiment before being stated categorically.
[mssql request implementation][mssql], [TypeORM query implementation][typeorm].

## Ambient, nested and implicit transactions

**Documented:** SQL Server does not provide independently committable
nested transactions. Inner BEGIN increments `@@TRANCOUNT`; inner COMMIT
only decrements it. An unnamed ROLLBACK rolls back all levels. A savepoint
can limit rollback in a committable transaction, but not in an
uncommittable or distributed transaction. [SQL Server BEGIN][begin],
[SQL Server ROLLBACK][rollback], [SQL Server transaction state][xactstate].

**Documented:** with `IMPLICIT_TRANSACTIONS ON`, eligible statements,
including a table-reading SELECT, open a transaction when `@@TRANCOUNT`
is zero. An explicit BEGIN from that state creates two levels, so one
COMMIT leaves a transaction open. ANSI_DEFAULTS can enable implicit mode.
Checking entry state before a table read is consequently meaningful for
a procedure that intends to own its transaction. [SQL Server implicit
transactions][implicit].

**Inference:** a procedure that joins ambient work must define ownership
of commit, full rollback and savepoint rollback. Checking entry count and
only beginning/committing at zero prevents an accidental outer commit;
it does not make full rollback local. A procedure promising independently
committed batches cannot deliver that promise inside an outer transaction
or with implicit mode retaining an outer level. Rejecting those entry
states is technically justified for that promise. Whether to allow such
procedures in the application remains a project decision.
[BEGIN][begin], [ROLLBACK][rollback], [implicit transactions][implicit].

**Source observation:** `EntityManager.transaction()` uses its existing
QueryRunner when present, otherwise creates one; it starts, invokes the
callback with the runner's manager, commits on resolution, and attempts
rollback on rejection while preserving the original error. The SQL Server
runner starts a mssql transaction at depth zero, then uses
`SAVE TRANSACTION typeorm_<depth>` for nested starts. Inner commit reduces its depth;
inner rollback targets the savepoint. A new DataSource transaction invoked
from inside a callback does not automatically reuse that callback's
manager or runner. [TypeORM][typeorm], `entity-manager/EntityManager.js`
and `driver/sqlserver/SqlServerQueryRunner.js`.

**Inference:** nested manager transactions are savepoint scopes, not
independent durable batches. If XACT_ABORT dooms or the server rolls back
the outer transaction, a nested savepoint is not a recovery guarantee.
mssql's transaction adapter listens for server rollback, marks the
transaction aborted and releases its acquired connection. TypeORM does
not synchronize its depth directly from that listener; its outer callback
failure path preserves the original error even if rollback also fails.
Catching an inner error and continuing needs a real-stack experiment.
[mssql][mssql], `lib/tedious/transaction.js`; [TypeORM][typeorm], the
manager and runner files above; [SQL Server transaction state][xactstate].

## Connection affinity and pooled state

**Source observation:** SQL Server QueryRunner `connect()` in TypeORM
1.1.2 resolves without acquiring a physical connection. Outside a
transaction, each `query()` creates a mssql Request from the pool. During
a transaction it creates Requests from the same mssql Transaction, which
holds an acquired connection until completion. A QueryRunner object alone
is therefore not evidence of dedicated physical connection affinity in
this driver version. [TypeORM][typeorm], `SqlServerQueryRunner.js`;
[mssql][mssql], `lib/tedious/transaction.js`.

**Source observation:** mssql pool `release()` simply returns the
connection to tarn. Validation checks connection health or executes
`SELECT 1`; neither calls Tedious `reset()`. Tedious offers `reset()`
separately. No general reset-on-borrow/release mechanism appears in these
verified paths. [mssql][mssql], `lib/base/connection-pool.js` and
`lib/tedious/connection-pool.js`; [Tedious][tedious], `lib/connection.js`.

**Documented and observed:** ordinary mssql `query()` calls Tedious
`execSql()`, which invokes `sp_executesql`; `batch()` uses
`execSqlBatch()`. SQL Server restores SET options after dynamic SQL or
stored procedure scope returns. Thus a `SET XACT_ABORT ON` issued through
one ordinary TypeORM query cannot be assumed to configure later queries,
even on the same physical session. Conversely, absence of a pool reset
does not prove ordinary query-scoped SET statements leak to later
borrowers. [SQL Server SET scope][set-scope], [Tedious][tedious],
`lib/connection.js`, `execSql()`; [mssql][mssql],
`lib/tedious/request.js`, `_query()`.

**Inference:** session-level changes through batch APIs, raw SQL-owned
transactions, session locks or other persistent state need explicit
ownership and cleanup. A maximum-one pool increases reuse likelihood but
does not create a cleanup guarantee. Raw BEGIN/COMMIT split across
nontransactional TypeORM queries have no guaranteed common session;
manually ending TypeORM's transaction can also desynchronize its manager
state. These concerns support the existing manager-bound transaction
boundary, not a new raw wrapper around every statement.
[TypeORM runner][typeorm], [mssql pooling and requests][mssql].

## Migrations and limits of a blanket wrapper

**Source observation:** `DataSource.runMigrations()` defaults transaction
mode to `all` when neither its argument nor DataSource options override
it. `MigrationExecutor.executePendingMigrations()` starts one transaction
for pending `up()` calls and their history inserts, commits after the
sequence and attempts rollback on failure. Per-migration overrides are
rejected in `all` mode; `each` and `none` have different defaults.
The [admin migration call][admin] supplies no override and the migration
files declare no `transaction` overrides. [TypeORM][typeorm],
`data-source/DataSource.js` and `migration/MigrationExecutor.js`.

**Inference:** XACT_ABORT OFF on the admin path does not establish that
migrations are non-atomic: rejected query Promises already drive rollback
of TypeORM's transaction. It also does not prove equivalent behavior for
a caught/suppressed SQL error or a batch that continues after a statement
error. Error-class and multi-statement behavior require experiments.
Adding BEGIN/COMMIT to every migration can alter nesting/ownership rather
than improve its existing transaction boundary.
[TypeORM migration executor][typeorm], [XACT_ABORT][xactabort].

**Documented:** some administrative commands cannot execute inside a user
transaction: SQL Server CREATE DATABASE requires autocommit mode and
BACKUP is disallowed in explicit and implicit transactions. Command and
platform specifics must be checked separately; a write classification
alone cannot establish transaction compatibility.
[SQL Server CREATE DATABASE][create-db], [SQL Server BACKUP][backup].

**Inference:** a transaction wrapper cannot cover prior committed batches,
external side effects, errors hidden from the caller, wrong-session work,
or interruption/commit-outcome ambiguity. Independent batching trades
whole-job rollback for partial progress. An explicit transaction around
one autocommit statement is not automatically additional atomicity;
multi-step logical mutations still need a shared owned transaction.
These are boundaries for later safeguard decisions, not findings that
every unwrapped statement is defective. [BEGIN][begin],
[ROLLBACK][rollback], [TRY/CATCH][trycatch], [TypeORM][typeorm].

## Remaining verification questions

These are unresolved observations to test if a later decision depends on
them, not confirmed defects:

1. For each execution surface, record actual server version, compatibility
   level, `@@OPTIONS`, `@@TRANCOUNT` and `XACT_STATE()` on the same session
   as the work, including reconnection and pool reuse.
2. Compare constraint errors, THROW, severity-16 RAISERROR and caught errors
   in single and multi-statement queries, app transactions and migrations.
   Observe persisted rows and transaction state, not only Promise rejection.
3. Exercise inner savepoint failure with XACT_ABORT ON, an outer catch that
   continues, and automatic server rollback; check final rows, original
   error metadata and whether a later pool borrower can write normally.
4. Contrast query and batch SET scope and pool reuse with at least two
   connections; verify affinity before selecting any session-state control.
5. Verify NOCOUNT result shapes for affected-row consumers and distinguish
   the first recordset from all returned recordsets.
6. Test output/return-status visibility on failure through a T-SQL caller,
   mssql callback/Promise and TypeORM raw EXEC before claiming server
   copy-out semantics or relying on output for partial-progress accounting.
7. Test timeout/cancel/disconnect around writes and commit, including safe
   retry identification, before treating client failure as proof of rollback.

Use the repository's supported integration-test workflow and isolated
fixtures for any experiments; none of these tests is executed here.

[lock]: https://github.com/viscalyx/Kravhantering/blob/8aa33026bd682711dd5d1ad78ad1422f911bc5f8/package-lock.json
[compose]: https://github.com/viscalyx/Kravhantering/blob/8aa33026bd682711dd5d1ad78ad1422f911bc5f8/docker-compose.sqlserver.yml
[config]: https://github.com/viscalyx/Kravhantering/blob/8aa33026bd682711dd5d1ad78ad1422f911bc5f8/lib/typeorm/sqlserver-config.ts
[db]: https://github.com/viscalyx/Kravhantering/blob/8aa33026bd682711dd5d1ad78ad1422f911bc5f8/lib/db.ts
[admin]: https://github.com/viscalyx/Kravhantering/blob/8aa33026bd682711dd5d1ad78ad1422f911bc5f8/scripts/db-sqlserver-admin.mjs
[coordination]: https://github.com/viscalyx/Kravhantering/blob/8aa33026bd682711dd5d1ad78ad1422f911bc5f8/lib/ai/run-coordination-store.ts
[validation]: https://github.com/viscalyx/Kravhantering/blob/8aa33026bd682711dd5d1ad78ad1422f911bc5f8/lib/dal/requirement-import-validation-sessions.ts
[typeorm]: https://registry.npmjs.org/typeorm/-/typeorm-1.1.2.tgz
[mssql]: https://registry.npmjs.org/mssql/-/mssql-12.7.14.tgz
[tedious]: https://registry.npmjs.org/tedious/-/tedious-20.3.8.tgz
[mssql-docs]: https://tediousjs.github.io/node-mssql/
[nocount]: https://learn.microsoft.com/en-us/sql/t-sql/statements/set-nocount-transact-sql?view=sql-server-ver17
[xactabort]: https://learn.microsoft.com/en-us/sql/t-sql/statements/set-xact-abort-transact-sql?view=sql-server-ver16
[xactstate]: https://learn.microsoft.com/en-us/sql/t-sql/functions/xact-state-transact-sql?view=sql-server-ver17
[trycatch]: https://learn.microsoft.com/en-us/sql/t-sql/language-elements/try-catch-transact-sql?view=sql-server-ver16
[throw]: https://learn.microsoft.com/en-us/sql/t-sql/language-elements/throw-transact-sql?view=sql-server-ver17
[procedure-results]: https://learn.microsoft.com/en-us/sql/relational-databases/stored-procedures/return-data-from-a-stored-procedure?view=sql-server-ver17
[applock]: https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-getapplock-transact-sql?view=sql-server-ver17
[begin]: https://learn.microsoft.com/en-us/sql/t-sql/language-elements/begin-transaction-transact-sql?view=sql-server-ver17
[rollback]: https://learn.microsoft.com/en-us/sql/t-sql/language-elements/rollback-transaction-transact-sql?view=sql-server-ver17
[implicit]: https://learn.microsoft.com/en-us/sql/t-sql/statements/set-implicit-transactions-transact-sql?view=sql-server-ver17
[set-scope]: https://learn.microsoft.com/en-us/sql/t-sql/statements/set-statements-transact-sql?view=sql-server-ver17
[create-db]: https://learn.microsoft.com/en-us/sql/t-sql/statements/create-database-transact-sql?view=sql-server-ver17
[backup]: https://learn.microsoft.com/en-us/sql/t-sql/statements/backup-transact-sql?view=sql-server-ver17
