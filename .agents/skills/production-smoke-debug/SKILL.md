---
name: production-smoke-debug
description: Reproduce and inspect a Container PR Smoke run in the supported local Ubuntu systemd host.
disable-model-invocation: true
---

# Production Smoke Debug

Reproduce the production-shaped rootless Podman and Quadlet smoke stack inside
the repository's disposable, privileged Docker host.

Read
[`docs/development/production-smoke-debug.md`](../../../docs/development/production-smoke-debug.md)
completely before running commands. Treat that guide and
`scripts/containers/production-smoke-debug.mjs` as the canonical interface; do
not reconstruct the Docker or production-smoke commands manually.

## Workflow

1. Confirm the repository branch and working-tree state. Record `docker ps` so
   pre-existing containers are visible.
2. Obtain the numeric GitHub Actions run ID from the user or the failing job
   URL.
3. Run:

   ```bash
   npm run container:production-smoke:debug -- run --run-id <run-id>
   ```

4. If it fails, leave the debug host intact while investigating. Collect the
   standard evidence and enter the host only through:

   ```bash
   npm run container:production-smoke:debug -- evidence
   npm run container:production-smoke:debug -- shell
   ```

5. Diagnose from service status, the redacted journal, Podman inspection, and
   the failed command. Do not weaken production containment or replace exact
   candidate artifacts to make the reproduction pass.
6. After a fix, run `down`, then repeat `run` from a clean host. Completion
   requires the release-smoke Playwright suite, boundary probes, and evidence
   collection to pass.
7. When debugging is finished, run:

   ```bash
   npm run container:production-smoke:debug -- down
   docker ps
   ```

   Confirm that the named debug host is gone. Preserve run evidence unless the
   user explicitly asks to delete it.

## Safety

- The debug host is privileged. Run it only on a disposable local development
  machine, never on a production node.
- Use the wrapper's ownership checks and exact container name for cleanup. Do
  not use broad container, volume, network, or filesystem deletion commands.
- The selected workflow's OCI artifacts are the candidate application images;
  the checked-out branch supplies the deployment scripts under investigation.
- Do not add this workflow to the production deployment guides. It is local
  developer and CI diagnostic tooling.
