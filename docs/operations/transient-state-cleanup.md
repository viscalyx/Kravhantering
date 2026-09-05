# Release-Independent Transient-State Cleanup

Kravhantering removes expired operational state independently of MCP request
traffic. Every supported production topology installs one generic systemd timer
and one one-shot cleanup container. The timer runs every five minutes with a
small randomized delay.

The current cleanup registry includes expired AI run coordination rows,
time-limited AI forensic evidence, expired MCP import-validation sessions, and
expired principal creation-rate buckets, and expired HSA verification quota
rows. All use the same runner and timer.
AI coordination rows expire at their original total deadline, or when a
running lease is abandoned, and contain no model content. The forensic target
records a metadata-only expiry event when a cleanup run detects a row that has
already expired according to SQL Server time, then purges evidence 72 hours
after manual stop or expiry.

## Work Bounds and Safety

Configure these values in `/etc/kravhantering/cleanup.env`:

- `TRANSIENT_CLEANUP_BATCH_SIZE` limits one SQL deletion and accepts `1` through
  `500`; the default is `100`.
- `TRANSIENT_CLEANUP_WORK_LIMIT` limits deleted rows across all registered
  targets in one run and accepts `1` through `100000`; the default is `1000`.
- `TRANSIENT_CLEANUP_BACKLOG_TARGET` stops a target when its expired-row count
  reaches the configured value and accepts `0` through `1000000`; the default
  is `0`.

SQL Server UTC determines expiry. Each batch uses update locks, row locks and
skip-locked selection so overlapping executions and multiple app nodes may run
safely. A row is deleted at most once, another worker's progress is a successful
no-op, and rows whose expiry is later than the database clock are not selected.

HSA verification quota rows expire at the end of their minute-aligned
60-second window. They have no hard global row cap. For capacity planning, one
authenticated actor can create at most one actor row, 50 actor-target rows, and
50 target rows per minute: at most 101 new rows before overlap with other
actors reduces the target-row count. Size the cleanup work limit above the
expected authenticated actor volume multiplied by this worst-case bound, and
monitor backlog rather than treating the bound as expected traffic.

## Release Contract and Prerequisites

The host owns cleanup independently of the active application release. Its
selected database-job image, image lock, compatibility contract and manager
remain in the service account's private data directory. Application topology
installation, removal, upgrade and rollback do not replace these files.

Use an authenticated release archive that contains
`cleanup-compatibility.json`. This contract binds the exact cleanup image ID
and manifest digest to successful cleanup evidence for the target schema and
the selected rollback source schema. Normal release preparation automatically
selects the preceding published release, including previews, using publication
time. Drafts and the target release are excluded. A rerun of an already published
target selects its predecessor rather than a later release. There is no source
list or file per release to maintain in Git, and no PR or merge requires an
update to the default.

Release preparation downloads the selected archive and its attestation through
public endpoints. It verifies the attestation against independently obtained
trust roots and the expected repository, workflow, commit and release identity.
Source preparation works without a GitHub token or cached login, including on
fork PRs. The trusted release workflow retains its normal publication and signing
permissions.

The source database is built by that release's own image, verified against its
image lock. The target image then runs cleanup against it. Source migrations and
permission definitions are not reconstructed from the current checkout.
Successful validation generates `cleanup-source.json` and
`cleanup-compatibility.json` in the deployment bundle. Retain the authenticated
source archive with these generated recovery records.

### Explicit Source Override

An operator who needs a different source can request it through the
`cleanup_source_release` input on the trusted Container Release workflow:

```bash
gh workflow run container-release.yml --ref main \
  -f cleanup_source_release=vSOURCE_VERSION
```

Leave the input empty for the automatic previous-release default. For local
release preparation, set `CLEANUP_SOURCE_RELEASE=vSOURCE_VERSION` when running
the production smoke workflow. The override selects a candidate; it does not
approve rollback. The selected published release must pass artifact, schema,
cleanup and scheduled-rollback verification before packaging. A missing source
or failed check stops release preparation; it does not fall back to another
release or silently omit source verification.

Use only the resulting authenticated release and its generated compatibility
contract. Changing a release pointer or editing a lock on an installed host
does not make that release eligible. The retained manager's `verify-transition`
command still requires the exact source archive and image-lock identity recorded
by successful verification.

Release validation runs `bin/kravhantering-cleanup-evidence.sh` against disposable
copies of the target schema and selected source schema. The command uses
the verified cleanup image, runtime database identity, bounded cleanup runner
and SQL Server UTC. Expired synthetic fixtures exercise every applicable deletion
and forensic-update path; unexpired fixtures must remain. Its output contains
aggregate target outcomes, the schema head and a digest of the cleanup table
definitions (columns, constraints, indexes, foreign keys and triggers). Every
scheduled run compares live definitions with this verified digest before mutation.
Release packaging rejects missing schema evidence, failed targets,
missing target results and image identity mismatches. The generated source lock
and verification matrix travel inside the authenticated release archive.

The same prerequisites apply to `app-node-tls`, `app-node-http` and
`single-node`:

- Run the retained manager as the rootless `kravhantering` service account with
  lingering enabled and the normal cgroup and journal limits in force.
- Prepare `/etc/kravhantering/cleanup.env` from the released template. Set only
  the runtime database connection and cleanup bounds. Use the application
  runtime database identity; do not use the migration identity or copy OIDC,
  MCP or other application secrets into this file.
- Keep SQL encryption enabled and certificate verification enabled. Both
  app-node topologies use the existing app egress network and the trusted SQL
  endpoint. Single-node uses the existing database and egress networks, the
  internal SQL hostname and the mounted `/etc/kravhantering/tls/ca.crt`.
- The database identity needs the current runtime manifest's `SELECT`, `DELETE`
  and forensic-update permissions. It also needs database `VIEW DEFINITION`
  to verify the released schema definitions and prove absent targets. Without
  that visibility, cleanup fails safely instead of treating an invisible
  object as absent. Arrange this reviewed metadata grant during source-schema
  permission preparation; do not elevate the cleanup connection to a database
  owner.
- Prepare `/etc/kravhantering/cleanup-release.env` from its released template.
  Select `TRANSIENT_CLEANUP_IMAGE_REF` independently of the application's
  `DB_JOB_IMAGE_REF`. It must resolve to the cleanup release's locked database
  job image. Site mirror tags are allowed only when they resolve to that exact
  identity.
- Keep both configuration files root-owned, service-group-readable and mode
  `0640`. Retain the cleanup image locally, including during application image
  pruning and disconnected recovery.

An administrator must apply the metadata grant in the application database after
migration or restore and before `resume`. Runtime permission reconciliation may
remove role grants during migrations; reapply this prerequisite explicitly:

```sql
GRANT VIEW DEFINITION TO [kravhantering_runtime];
```

The release smoke test also activates each authenticated source application's
units and exact image against its isolated source database. With ingress stopped,
it expires a fixture after `resume` and waits for the ordinary five-minute timer
to delete it. No manual cleanup invocation or application request can satisfy
that assertion.

## Installation and Explicit Image Update

Set `CLEANUP_RELEASE` to the extracted, authenticated cleanup release directory
and `TOPOLOGY` to the installed topology. Complete the normal topology host
verification and install its networks before cleanup activation.

```bash
sudo -iu kravhantering
CLEANUP_RELEASE=/opt/kravhantering/releases/RELEASE_DIRECTORY
TOPOLOGY=app-node-tls

"$CLEANUP_RELEASE/bin/kravhantering-cleanup.sh" install \
  --bundle "$CLEANUP_RELEASE" --topology "$TOPOLOGY"
MANAGER="$HOME/.local/share/kravhantering/cleanup/current/manager.sh"
"$MANAGER" resume
"$MANAGER" status
```

`install` preserves an existing installation. For a reviewed image update, set
the independent image selection to the new locked image, then run `update`
from that release with the same bundle and topology arguments. Verification
runs before installed units change. The rendered container pins the image ID
and uses `Pull=never`; subsequent movement of a tag cannot change scheduled
code. Prior generations remain available until full uninstall.

Installation and update leave activation to `resume`. It verifies the retained
image selection, starts the one-shot service, checks its successful result and
only then enables the five-minute timer. A failure blocks operational handoff.

When moving from application-owned cleanup, stop and disable the old timer and
wait for its one-shot service before migration. Use the current application
helper to install its topology; it removes stale application-owned unit files.
The independent host units have distinct names, so an older application helper
cannot delete or replace them.

## Verification and Monitoring

```bash
"$MANAGER" status
journalctl --user -u kravhantering-host-cleanup.service \
  --since=-30min --no-pager
```

Each target emits `kind`, `outcome`, `expired_row_count`,
`expired_stored_bytes`, `oldest_expired_age_ms`, `deleted_rows`,
`remaining_expired_row_count` and `duration_ms`. An absent target reports
`not_applicable` with zero deletions and null backlog values. All of its tables
must be absent; partial schemas, views in place of tables, hidden metadata,
missing columns, permission errors and connection errors remain failures.
The observed applicability must also match the released schema evidence.

A target failure emits `target_execution_failed`. A connection, configuration,
contract or runner failure emits `runner_execution_failed`. Events do not
contain stored tokens, hashes, destinations, payloads, validation or execution
results, forensic evidence, identities or raw database errors. The schema
verification command adds only a schema head and aggregate outcomes.

A successful bounded run can leave a backlog. Check that the remaining count
and oldest age decrease over successive schedules and that the next timer
execution is scheduled. Investigate a growing backlog or any failure. No MCP
or other request traffic is needed for scheduled progress.

## Upgrade, Rollback and Recovery Set

Before downtime, verify that the selected cleanup release covers both the
source schema and the target schema. Preserve its installed generation,
configuration, image, authenticated archive, source-release locks and complete
compatibility evidence alongside the application recovery set. Do not prune
these assets when changing the active application release.

After installing the compatible cleanup release, verify the exact authenticated
source artifacts before downtime:

```bash
"$MANAGER" verify-transition \
  --source-bundle "$SOURCE_RELEASE" --source-archive "$SOURCE_ARCHIVE"
```

`SOURCE_RELEASE` is the extracted, authenticated source release directory.
`SOURCE_ARCHIVE` is its retained authenticated archive. This check rejects an
undeclared source or a mismatched archive or image lock.

After traffic is quiesced, stop scheduled and in-flight cleanup before any
migration, restore or other persistent-state mutation:

```bash
"$MANAGER" pause
```

Pause also stops any application-owned cleanup from an eligible older release.
It disables the host timer and stops the current run, so a host restart
does not silently release quiescence. Apply the normal application transition
or restore procedure. Application removal and activation leave the cleanup
selection intact. If an explicit compatible cleanup update is required, keep
traffic blocked while performing it.

Before normal traffic and operational handoff, run:

```bash
"$MANAGER" resume
"$MANAGER" status
```

Require a successful one-shot result and an active next schedule on the
restored or migrated database. An unsupported schema or a target whose
applicability differs from the evidence fails before that target can mutate
state. Do not release quiescence after a failure.

After an eligible rollback to an application without its own cleanup command,
the retained host service continues on its normal schedule. Do not remove its
timer, select the older application's database-job image or arrange recurring
manual purges. Deleted expired rows are not restored by changing the cleanup
image. Normal schema rollback and application retention rules still apply.

## Failure Recovery

Correct the image, configuration, metadata visibility, runtime permissions,
network or TLS fault using the retained cleanup release. Inspect aggregate
outcomes; do not inspect or copy transient table contents. A failed update
before unit installation preserves the active units. If installation fails
partway through, keep traffic quiesced and repeat the explicit update from the
retained compatible release and image lock, then run `resume`.

For an isolated failed scheduled run:

```bash
"$MANAGER" retry
```

Retry uses the same verified service and work limits. Completed batches remain
committed, and subsequent runs continue from the remaining backlog. Overlapping
hosts and manual retry remain idempotent and concurrency-safe. Do not repair
this condition with unbounded SQL deletion.

## Disconnected Hosts

On a connected preparation host, pull the exact cleanup release image and use
its retained image helper with `--topology cleanup`, its image lock and
`cleanup-release.env` to export an image bundle. Transfer that bundle with the
authenticated cleanup release and source recovery artifacts. On the production
host use the same helper selection to `load`, then `verify` before installation
or update. Export and load use the independent cleanup reference; they do not
select the active application's database-job image. Keep the verified local
image available after application rollback.

## Full Uninstall

Full host removal explicitly removes cleanup before database or network
removal. Application release rollback must never use this command.

```bash
"$MANAGER" uninstall
```

This disables the timer, stops the one-shot service, removes the host units and
retained manager generations, and reloads systemd. Shared images and application
data remain under the normal host uninstall procedure. Remove the two protected
cleanup configuration files and retained transport artifacts under site policy.
