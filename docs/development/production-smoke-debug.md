# Debugging the production smoke stack locally

Use this workflow when **Production Assembly Acceptance** fails after producing
its core candidate and assembly evidence artifacts. It recreates Ubuntu 24.04,
systemd, rootless Podman, and Quadlet inside one privileged Docker container,
then runs production archive installation and the thin assembly browser path.

This is developer and CI diagnostic tooling. It does not change the supported
production deployment procedure or replace either production deploy guide.
The npm script is the supported entry point: it owns artifact download, debug
host setup, smoke execution, evidence collection, and safe cleanup.

## Quick start

Prerequisites:

- a Linux x86_64 host with x86-64-v3 CPU support, Docker, cgroup v2, and at
  least 10 GiB free;
- Node.js, npm, `tar`, OpenSSL, and the repository dependencies already
  installed;
- GitHub CLI authenticated with access to the workflow run; and
- an internet connection for the pinned vendor image pulls.

The candidate Node images use UBI 10. Nested containers use the outer host's
CPU capabilities; an Ubuntu debug host does not remove the x86-64-v3
requirement. See [shared UBI runtime packaging](../../containers/node/README.md).

Run from the repository root while the branch containing the proposed fix is
checked out. The current wrapper requires the checkout at `/workspace`: it
mounts that directory inside the debug host and passes absolute host paths for
the archive, images, and evidence without translating them.

The wrapper creates missing `containers/*/.env.*.local` files and regenerates
the certificates in `tmp/container-tls/`. Use a checkout whose TLS files are
not in use by development services.

```bash
npm run container:production-smoke:debug -- run --run-id <github-run-id>
```

The PR workflow keeps OCI artifacts for two days, so start from a recent run.
For a fork, add `--repo owner/repository`.

The command downloads the exact candidate OCI archives and build metadata from
the selected run. It combines those artifacts with the currently checked-out
deployment scripts and Quadlet templates. This makes it useful for proving a
fix without rebuilding the candidate application images.

It then:

1. builds and starts a privileged Ubuntu 24.04 systemd debug host;
2. installs the repository-pinned Playwright Chromium build and its Ubuntu
   runtime libraries inside that disposable host;
3. installs the production archive with the existing `production-smoke.sh`
   entry point;
4. calls its canonical `verify` command to trust the generated CA, run the real
   thin core Playwright journey with zero retries; and
5. writes redacted evidence below
   `tmp/production-smoke-debug/<run-id>/evidence/`.

The debug host remains running after both success and failure so its state is
available for inspection.

The debug command selects `PRODUCTION_SMOKE_SCOPE=core`, matching PR assembly.
It downloads `container-candidate-app-runtime`, `container-candidate-db-job`,
and `production-assembly-evidence`. Deep cleanup, recovery, restart, concurrency,
and HSA overlay qualification belong to trusted release. See
[CI integration ownership](ci-integration-ownership.md).

## Inspect a failure

Open a shell in the retained host:

```bash
npm run container:production-smoke:debug -- shell
```

After installation creates the `kravhantering` service user, set up a helper
inside that shell so commands reach its rootless runtime and systemd bus:

```bash
smoke_service_uid=$(id -u kravhantering)
as_smoke_service() {
  sudo -H -u kravhantering env \
    XDG_RUNTIME_DIR="/run/user/$smoke_service_uid" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$smoke_service_uid/bus" \
    "$@"
}
as_smoke_service systemctl --user --failed
as_smoke_service journalctl --user -u 'kravhantering-*' --no-pager
as_smoke_service podman ps --all
```

Use the script to refresh the standard redacted evidence bundle:

```bash
npm run container:production-smoke:debug -- evidence
```

The wrapper supports one named debug host at a time and verifies its ownership
label before entering, collecting evidence, or removing it. Run `down` before
starting another reproduction, including a retry of the same run.

## Compare hosted-runner evidence

PR and trusted release smoke workflows collect `runtime-diagnostics/` on
success and failure, including failures during toolchain setup, the early
journald preflight, Quadlet installation, or service startup. Collection is
best effort and is skipped
for cancelled runs. PR runs include it in `production-assembly-evidence`;
trusted releases include it in `container-release-runtime-<run-id>` when
release artifact staging runs.

The job summary lists any recognized infrastructure signatures:

- `conmon_missing_journald` identifies a conmon build without journald support;
- `cgroup_oom` identifies a service cgroup OOM kill;
- `host_oom` identifies a kernel-level host OOM kill;
- `disk_exhausted` identifies an out-of-space failure; and
- `service_timeout` identifies a systemd service startup timeout.

An `unknown` result means that none of those signatures occurs in the captured
evidence. It does not classify the failure as an application defect.

Download the runtime artifact from one failed run and one successful run into
separate directories. For PR smoke runs:

```bash
gh run download <failed-run-id> \
  --name production-assembly-evidence \
  --dir tmp/production-smoke-comparison/failed
gh run download <failed-run-id> \
  --name container-pr-runner-metadata-<failed-run-id> \
  --dir tmp/production-smoke-comparison/failed/runner-metadata
gh run download <successful-run-id> \
  --name production-assembly-evidence \
  --dir tmp/production-smoke-comparison/successful
gh run download <successful-run-id> \
  --name container-pr-runner-metadata-<successful-run-id> \
  --dir tmp/production-smoke-comparison/successful/runner-metadata
```

Start with these comparisons:

<!-- markdownlint-disable MD013 -->
```bash
diff -u \
  tmp/production-smoke-comparison/successful/tmp/container-pr-artifacts/runtime-diagnostics/runner.json \
  tmp/production-smoke-comparison/failed/tmp/container-pr-artifacts/runtime-diagnostics/runner.json
diff -u \
  tmp/production-smoke-comparison/successful/runner-metadata/github-runner-metadata.txt \
  tmp/production-smoke-comparison/failed/runner-metadata/github-runner-metadata.txt
diff -u \
  tmp/production-smoke-comparison/successful/tmp/container-pr-artifacts/runtime-diagnostics/runtime-components.txt \
  tmp/production-smoke-comparison/failed/tmp/container-pr-artifacts/runtime-diagnostics/runtime-components.txt
diff -u \
  tmp/production-smoke-comparison/successful/tmp/container-pr-artifacts/runtime-diagnostics/service-cgroups.txt \
  tmp/production-smoke-comparison/failed/tmp/container-pr-artifacts/runtime-diagnostics/service-cgroups.txt
```
<!-- markdownlint-enable MD013 -->

Use `runner.json`, `runner-platform.txt`, and the separate
`runner-metadata/github-runner-metadata.txt` artifact to compare the image,
provisioner, and provisioned host. Trusted releases provide the analogous
`container-release-runner-metadata-<run-id>` artifact. Then compare
`runtime-components.txt` and `podman-info.json` for every expected and selected
binary path, package ownership, version, hash, and Podman's selected helpers.
Compare `meminfo.txt`, `free.txt`, `pressure-*.txt`, `kernel-oom.txt`, and
`service-cgroups.txt` for host or cgroup pressure. For disk exhaustion, compare
`filesystems.txt` and `filesystem-inodes.txt`.

## Clean up

Always remove the nested stack and debug host when finished:

```bash
npm run container:production-smoke:debug -- down
```

Cleanup preserves the downloaded artifacts and evidence under
`tmp/production-smoke-debug/<run-id>/` for later comparison. Remove that exact
run directory manually when it is no longer needed.

## What this proves

This workflow exercises the PR production archive installer, rootless service
user, Quadlet generator, core containment inspection, HTTPS route, Keycloak,
SQL Server migrations and required seed, and one author browser journey.
Candidate application images are imported unchanged. Trusted release owns the
additional recovery, lifecycle, concurrency, containment-violation, and strict
HSA overlay checks.

It is not an exact copy of the hosted runner itself. Docker supplies the outer
kernel and cgroup hierarchy, and the checked-out scripts may be newer than the
selected run. Use the workflow job as the final acceptance gate after the local
reproduction passes.
