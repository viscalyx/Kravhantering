# Production Configuration Directory

Status: Accepted on 2026-05-26. Follow-up is tracked in
[issue #251](https://github.com/viscalyx/Kravhantering/issues/251).

Production deployment configuration is host-wide configuration owned by
operations/root, not rootless Podman user configuration. We keep
`/etc/kravhantering` as the canonical path for copied environment files, TLS
files and site-specific Keycloak realm configuration, while immutable release
artifacts stay under `/opt/kravhantering/releases/<version>` with
`/opt/kravhantering/current` pointing at the active release.

This path is intentionally not `$HOME/.config/...`: the service user's XDG
configuration directory belongs to rootless Podman user configuration such as
`storage.conf`, while these files define the host-wide Kravhantering
deployment and include secrets, certificates and site-specific runtime values.
The stricter Filesystem Hierarchy Standard alternative for add-on software
installed under `/opt` is `/etc/opt/kravhantering`. We are not moving there now
because `/etc/kravhantering` is clearer for operators and already wired through
production guides, Compose files, systemd units, helper scripts, tests,
upgrades and uninstall flows.

We may revisit `/etc/opt/kravhantering` for host-specific configuration, and
`/var/opt/kravhantering` for future variable package data, if packaging,
compliance or operations needs justify the migration.

## Considered Options

- `/etc/kravhantering`: accepted as the current default for host-wide
  deployment configuration.
- `/etc/opt/kravhantering`: more formal FHS alignment for an application whose
  release artifacts live under `/opt/kravhantering`, but deferred because the
  migration cost is real and the operator benefit is not yet clear.
- `/home/kravhantering/.config/...`: rejected as the primary home for these
  files because they are not ordinary rootless-user configuration.
- `/var/opt/kravhantering`: reserved for future variable package data if we add
  host-managed mutable state outside Podman volumes.
