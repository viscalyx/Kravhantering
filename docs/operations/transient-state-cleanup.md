# Scheduled Transient-State Cleanup

Kravhantering removes expired operational state independently of MCP request
traffic. Every supported production topology installs one generic systemd timer
and one one-shot cleanup container. The timer runs every five minutes with a
small randomized delay.

The current cleanup registry includes expired MCP import-validation sessions
and expired principal creation-rate buckets. Both use the same runner and timer.

## Work Bounds and Safety

Configure these values in `/etc/kravhantering/app.env`:

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

## Activation

Use the release's Quadlet helper for `app-node-tls`, `app-node-http`, or
`single-node`. Installation renders both cleanup units. Starting or restarting
the topology target starts its timer:

```bash
sudo -iu kravhantering
cd /opt/kravhantering/current

bin/kravhantering-quadlet.sh install --topology "$TOPOLOGY"
systemctl --user daemon-reload
systemctl --user restart "$TARGET"
```

Use `kravhantering-app-node.target` as `TARGET` for either app-node topology and
`kravhantering-single-node.target` for `single-node`. The scheduled container
uses `DB_JOB_IMAGE_REF` for its released command surface, but reads
`/etc/kravhantering/app.env` and therefore connects with the least-privilege
runtime database identity.

## Verification and Monitoring

Verify installation and the next scheduled execution:

```bash
systemctl --user status kravhantering-transient-cleanup.timer --no-pager
systemctl --user list-timers kravhantering-transient-cleanup.timer --all
systemctl --user status kravhantering-transient-cleanup.service --no-pager
journalctl --user -u kravhantering-transient-cleanup.service \
  --since=-30min --no-pager
```

Each target emits one JSON journal event with `kind`, `outcome`,
`expired_row_count`, `expired_stored_bytes`, `oldest_expired_age_ms`,
`deleted_rows`, `remaining_expired_row_count` and `duration_ms`. A failure emits
the stable `failure_code` value `target_execution_failed`; a connection,
configuration or runner failure emits `runner_execution_failed`. Events never
contain session tokens, hashes, destinations, submitted payloads, validation or
execution results, identities, or raw database errors.

A nonzero expired-row count may be normal while a run is respecting its work
limit. Track `remaining_expired_row_count` as the backlog after each run. This
field should decrease over successive schedules. A backlog that does not
decrease, a growing oldest age, or a failure outcome requires investigation.

## Manual Retry

A failed target remains retryable. Correct the configuration, image, network,
TLS or database-permission problem, then invoke the same one-shot service:

```bash
systemctl --user reset-failed kravhantering-transient-cleanup.service
systemctl --user start kravhantering-transient-cleanup.service
systemctl --user status kravhantering-transient-cleanup.service --no-pager
```

Manual execution is idempotent and may overlap another host's scheduled run.
The next timer execution also retries without a repair or data-recovery step.

## Troubleshooting

Check these boundaries in order:

1. Confirm `DB_JOB_IMAGE_REF` resolves to the installed release and that the
   image is present locally on disconnected hosts.
2. Confirm `/etc/kravhantering/app.env` contains the runtime database connection
   and valid numeric cleanup bounds.
3. Confirm the app runtime identity retains `SELECT` and `DELETE` access to the
   registered transient tables by running the release's normal runtime
   permission verification.
4. For app-node topologies, verify the egress network reaches SQL Server. For
   `single-node`, verify the database network, SQL Server service and mounted CA
   certificate.
5. Inspect only the structured cleanup events. Do not copy raw transient table
   contents into operational evidence.

One target's failure does not erase or falsely fail another target's successful
outcome. The overall service exits unsuccessfully when any target fails so
systemd and monitoring can alert on the run.

## Upgrade and Rollback

During upgrade, copy the new `app.env` cleanup defaults or set reviewed site
values, install the new Quadlet units, reload systemd and restart the topology
target. Verify the timer is active and run the one-shot service once before
restoring traffic. No schema migration is introduced by the scheduler itself.

Before rolling back to a release that does not contain scheduled cleanup, use
the newer release helper to remove its units, or remove the two cleanup units
explicitly before switching `/opt/kravhantering/current`:

```bash
systemctl --user disable --now kravhantering-transient-cleanup.timer
systemctl --user stop "$TARGET"
rm -f /home/kravhantering/.config/containers/systemd/kravhantering-transient-cleanup.container
rm -f /home/kravhantering/.config/systemd/user/kravhantering-transient-cleanup.timer
systemctl --user daemon-reload
```

Then install and start the previous release using its normal rollback
procedure. Rollback stops scheduled deletion; it does not restore already
expired rows. Remaining expired rows are harmless to active-session lookup and
quota accounting and stay retained until request-triggered cleanup or a later
release restores the timer. Active unexpired sessions and rate buckets are not
removed by the cleanup upgrade or rollback. A schema rollback across the MCP
ownership/quota migration is different: it deliberately deletes all validation
sessions first so older code cannot accept a session under weaker ownership
rules.
