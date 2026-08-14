# Debugging the production smoke stack locally

Use this workflow when the **Container PR Smoke** job fails after producing
its OCI and runtime artifacts. It recreates the Ubuntu 24.04, systemd, rootless
Podman, and Quadlet environment inside one privileged Docker container, then
runs the real production archive installation and release-smoke suite.

This is developer and CI diagnostic tooling. It does not change the supported
production deployment procedure or replace either production deploy guide.
The npm script is the supported entry point: it owns artifact download, debug
host setup, smoke execution, evidence collection, and safe cleanup.

## Quick start

Prerequisites:

- a Linux x86_64 host with Docker, cgroup v2, and at least 10 GiB free;
- Node.js and the repository dependencies already installed;
- GitHub CLI authenticated with access to the workflow run; and
- an internet connection for the pinned vendor image pulls.

Run from the repository root while the branch containing the proposed fix is
checked out:

```bash
npm run container:production-smoke:debug -- run --run-id 31331091579
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
   Playwright release-smoke tests, and probe containment boundaries; and
5. writes redacted evidence below
   `tmp/production-smoke-debug/<run-id>/evidence/`.

The debug host remains running after both success and failure so its state is
available for inspection.

## Inspect a failure

Open a shell in the retained host:

```bash
npm run container:production-smoke:debug -- shell
```

Useful commands inside it include:

```bash
sudo -u kravhantering systemctl --user --failed
sudo -u kravhantering journalctl --user -u 'kravhantering-*' --no-pager
sudo -u kravhantering podman ps --all
```

Use the script to refresh the standard redacted evidence bundle:

```bash
npm run container:production-smoke:debug -- evidence
```

The wrapper supports one named debug host at a time and verifies its ownership
label before entering, collecting evidence, or removing it.

## Compare hosted-runner evidence

Every PR and trusted release smoke run uploads `runtime-diagnostics/` in its
runtime artifact, including runs that stop during toolchain setup, the early
journald preflight, Quadlet installation, or service startup.

The bootstrap supports both hosted-runner toolchains. For package-based
runners, it resets the disposable rootless state and reinstalls Ubuntu's
Podman, conmon, crun, and Quadlet packages. For runners with Podman 5.x under
`/usr/local`, it keeps the static Podman, crun, and Quadlet components and
replaces the bundled conmon with Ubuntu's journald-capable conmon package. It
verifies command resolution, helper selection, package ownership, and
generator resolution before the workflow runs a live rootless journald
preflight. This keeps regional runner-image differences from silently changing
the production-smoke runtime contract.

The production Quadlet installer likewise discovers generators from both the
static `/usr/local` runner layout and Ubuntu's package-owned `/usr` layout.
Regional runner updates can leave multiple layouts active concurrently, so a
new generator location supplements the existing candidates until the older
runner profile is explicitly retired.

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
  --name container-pr-runtime-<failed-run-id> \
  --dir tmp/production-smoke-comparison/failed
gh run download <failed-run-id> \
  --name container-pr-runner-metadata-<failed-run-id> \
  --dir tmp/production-smoke-comparison/failed/runner-metadata
gh run download <successful-run-id> \
  --name container-pr-runtime-<successful-run-id> \
  --dir tmp/production-smoke-comparison/successful
gh run download <successful-run-id> \
  --name container-pr-runner-metadata-<successful-run-id> \
  --dir tmp/production-smoke-comparison/successful/runner-metadata
```

Start with these comparisons:

<!-- markdownlint-disable MD013 -->
```bash
diff -u \
  tmp/production-smoke-comparison/successful/runtime-diagnostics/runner.json \
  tmp/production-smoke-comparison/failed/runtime-diagnostics/runner.json
diff -u \
  tmp/production-smoke-comparison/successful/runner-metadata/github-runner-metadata.txt \
  tmp/production-smoke-comparison/failed/runner-metadata/github-runner-metadata.txt
diff -u \
  tmp/production-smoke-comparison/successful/runtime-diagnostics/runtime-components.txt \
  tmp/production-smoke-comparison/failed/runtime-diagnostics/runtime-components.txt
diff -u \
  tmp/production-smoke-comparison/successful/runtime-diagnostics/service-cgroups.txt \
  tmp/production-smoke-comparison/failed/runtime-diagnostics/service-cgroups.txt
```
<!-- markdownlint-enable MD013 -->

Use `runner.json`, `runner-platform.txt`, and the separate
`runner-metadata/github-runner-metadata.txt` artifact to compare the image,
provisioner, and provisioned host. The metadata follow-up job runs after the
smoke job completes, so GitHub makes the target job log available before the
allowlisted runner header is extracted. Trusted releases provide the analogous
`container-release-runner-metadata-<run-id>` artifact. Then compare
`runtime-components.txt` and `podman-info.json` for every expected and selected
binary path, package ownership, version, hash, and Podman's selected helpers.
Compare `meminfo.txt`, `free.txt`, `pressure-*.txt`, `kernel-oom.txt`, and
`service-cgroups.txt` for host or cgroup pressure. The process report contains
only PID, parent PID, user, executable name, and RSS; it deliberately omits
command arguments. The collector never dumps the environment or container
environment variables.

The collector extracts only allowlisted runner and provisioner header fields
from the completed target job log. A missing target log or missing header fails
the follow-up job instead of silently publishing incomplete metadata.

## Clean up

Always remove the nested stack and debug host when finished:

```bash
npm run container:production-smoke:debug -- down
```

Cleanup preserves the downloaded artifacts and evidence under
`tmp/production-smoke-debug/<run-id>/` for later comparison. Remove that exact
run directory manually when it is no longer needed.

`down` removes the nested stack's containers, named volumes, and four Podman
networks before removing the disposable Docker host. The host uses Docker's
existing default bridge, so the debug workflow does not create a separate
Docker network.

## What this proves

This workflow exercises the same production archive installer, rootless
service user, Quadlet generator, systemd lifecycle, network boundaries,
resource limits, HTTPS route, Keycloak realm, SQL Server setup, HSA test
overlay, Playwright suite, and disposable boundary probes as CI.

It is not an exact copy of the hosted runner itself. Docker supplies the outer
kernel and cgroup hierarchy, and the checked-out scripts may be newer than the
selected run. Use the workflow job as the final acceptance gate after the local
reproduction passes.
