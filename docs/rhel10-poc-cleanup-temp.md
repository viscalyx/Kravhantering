# Temporary RHEL 10 PoC Cleanup

<!-- cSpell:ignore firewalld keycloak loginctl podman podman-compose -->
<!-- cSpell:ignore Quadlet sysctl nginx RHSM rootless subuid subgid -->
<!-- cSpell:ignore prodlike sqlserver journald AppStream BaseOS fullchain -->
<!-- cSpell:ignore getsebool setsebool coreutils autoremove -->

Use these steps after testing
[poc-rhel10-podman.md](./poc-rhel10-podman.md) and before testing
[rhel10-production-deploy.md](./rhel10-production-deploy.md).

The goal is a clean production-test host with Podman and `podman-compose`
installed. The `kravhantering` Linux user may remain because the production
guide uses the same dedicated rootless service user, but its PoC containers,
volumes, user services, repository checkout and environment files should be
removed.

Run the commands as an admin account with `sudo` unless a block explicitly uses
`sudo -iu kravhantering`.

## 1. Set Local Values

Adjust the user name and firewalld zone if your PoC used different values.

```bash
POC_USER=kravhantering
POC_REPO="/home/${POC_USER}/Kravhantering"
FIREWALL_ZONE=public
```

## 2. Stop PoC User Services And Containers

This stops optional systemd user services from section 11 of the PoC guide,
then stops any compose-managed SQL Server and Keycloak containers from section
10. The `podman system reset --force` line removes all rootless Podman
containers, images, networks and volumes owned by `kravhantering`, including
`sqlserver-db-data`.

```bash
sudo -iu "${POC_USER}" bash <<'EOF'
set -eu
export PATH="${HOME}/.local/bin:${PATH}"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

systemctl --user stop kravhantering-app.service 2>/dev/null || true
systemctl --user stop kravhantering-db.service 2>/dev/null || true
systemctl --user stop kravhantering-idp.service 2>/dev/null || true
systemctl --user disable kravhantering-app.service 2>/dev/null || true

if [ -d "${HOME}/Kravhantering" ]; then
  cd "${HOME}/Kravhantering"

  podman compose --env-file .env.sqlserver \
    -f docker-compose.sqlserver.yml down -v --remove-orphans \
    2>/dev/null || true

  podman compose --env-file .env.idp \
    -f docker-compose.idp.yml \
    -f docker-compose.idp.override.yml down -v --remove-orphans \
    2>/dev/null || true
fi

podman rm -f kravhantering-db kravhantering-idp 2>/dev/null || true
podman system reset --force
EOF
```

If the host also has rootful PoC containers because a command was accidentally
run with `sudo podman`, reset rootful Podman storage too. Skip this if the host
has any non-PoC rootful Podman workloads.

```bash
sudo podman system reset --force
```

## 3. Remove PoC User Files

Keep the `kravhantering` user, its home directory, SSH keys, `subuid`/`subgid`
allocation and linger setting. Remove only the PoC checkout, user-level service
definitions, local env files, npm cache and the pip-installed
`podman-compose` used by the PoC guide.

```bash
sudo -iu "${POC_USER}" bash <<'EOF'
set -eu
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

rm -f "${HOME}/.config/systemd/user/kravhantering-app.service"
rm -rf "${HOME}/.config/systemd/user/kravhantering-app.service.d"
rm -f "${HOME}/.config/containers/systemd/kravhantering-db.container"
rm -f "${HOME}/.config/containers/systemd/kravhantering-idp.container"
systemctl --user daemon-reload 2>/dev/null || true
systemctl --user reset-failed 2>/dev/null || true

python3 -m pip uninstall -y podman-compose 2>/dev/null || true
rm -f "${HOME}/.local/bin/podman-compose"
rm -rf "${HOME}/Kravhantering"
rm -rf "${HOME}/.npm" "${HOME}/.cache/npm"
EOF
```

## 4. Remove PoC nginx And TLS Files

The PoC guide used host-level nginx and certificates under `/etc/pki/tls`.
The production guide uses release-managed nginx in Podman and stores TLS
material under `/etc/kravhantering/tls`, so remove the PoC nginx
configuration and PoC certificate files.

```bash
sudo systemctl disable --now nginx 2>/dev/null || true
sudo rm -f /etc/nginx/conf.d/kravhantering.conf

sudo rm -f /etc/pki/tls/private/kravhantering.key
sudo rm -f /etc/pki/tls/private/local-root-ca.key
sudo rm -f /etc/pki/tls/certs/kravhantering.crt
sudo rm -f /etc/pki/tls/certs/kravhantering-chain.pem
sudo rm -f /etc/pki/tls/certs/kravhantering-fullchain.crt
sudo rm -f /etc/pki/tls/certs/local-root-ca.crt
sudo rm -f /etc/pki/tls/csr/kravhantering.cnf
sudo rm -f /etc/pki/tls/csr/kravhantering.csr
```

If you added a lab-only root CA to the RHEL trust store only for this PoC,
remove it and rebuild trust. Do not remove a shared corporate CA that other
services on the host rely on.

```bash
sudo rm -f /etc/pki/ca-trust/source/anchors/local-root-ca.crt
sudo update-ca-trust extract
```

## 5. Revert PoC Network And SELinux Knobs

Remove the PoC HTTPS opening from firewalld. Keep SSH rules that belong to the
server baseline.

```bash
if systemctl is-active --quiet firewalld; then
  sudo firewall-cmd --zone="${FIREWALL_ZONE}" \
    --remove-service=https --permanent 2>/dev/null || true
  sudo firewall-cmd --reload
fi
```

If the PoC added rich rules for a specific admin CIDR, list them and remove the
exact rules that were added for the PoC.

```bash
sudo firewall-cmd --zone="${FIREWALL_ZONE}" --list-rich-rules

# Example only. Replace the source address with the PoC rule you added.
SSH_RULE='rule family="ipv4" source address="10.0.0.0/24" '
SSH_RULE="${SSH_RULE}"'service name="ssh" accept'
sudo firewall-cmd --zone="${FIREWALL_ZONE}" --permanent \
  --remove-rich-rule="${SSH_RULE}"
sudo firewall-cmd --reload
```

If `httpd_can_network_connect` was enabled only so host-level nginx could proxy
to `127.0.0.1:3001` and `127.0.0.1:8080`, turn it off again.

```bash
getsebool httpd_can_network_connect
sudo setsebool -P httpd_can_network_connect off
```

If you experimented with rootless nginx on port 443, remove the PoC sysctl
file. The production guide will recreate the setting if TLS terminates on this
node.

```bash
sudo rm -f /etc/sysctl.d/90-kravhantering-rootless-ports.conf
sudo sysctl --system
```

## 6. Remove PoC Logs And Partial Production Directories

Remove the optional PoC log directory.

```bash
sudo rm -rf /var/log/kravhantering
```

If you already started experimenting with the production guide and want a
completely fresh run, remove its release and configuration directories before
starting again. Skip this if those directories already contain production-test
configuration you want to keep.

```bash
sudo rm -rf /opt/kravhantering
sudo rm -rf /etc/kravhantering
```

Do not remove RHSM registration, BaseOS/AppStream repositories, time sync,
guest-agent packages or normal OS monitoring. Those are host baseline, not
Kravhantering PoC configuration.

## 7. Trim PoC-Only Packages

Install the production baseline packages first, so `podman-compose` is
available system-wide instead of only under the old PoC user profile.

```bash
sudo dnf install -y podman podman-compose tar gzip coreutils
podman --version
PODMAN_COMPOSE_PROVIDER=podman-compose podman compose version
```

Then remove packages that were only needed for the PoC source-tree build or
host-level reverse proxy. Keep `container-selinux`, because Podman needs its
SELinux policy.

```bash
sudo dnf remove -y \
  nginx \
  nodejs24 nodejs24-npm \
  git \
  python3-pip \
  podman-docker

sudo dnf autoremove -y
```

If `dnf` says one of those packages is not installed, that is fine. If
`dnf autoremove` wants to remove `podman`, `podman-compose`,
`container-selinux`, `tar`, `gzip` or `coreutils`, answer `n` and inspect the
dependency proposal before continuing.

## 8. Verify The Host Is Ready For Production Testing

The checks below should show no PoC containers, no PoC volumes, no PoC user
units and no PoC nginx listener. The `kravhantering` user may still exist.

```bash
id kravhantering
loginctl show-user kravhantering -p Linger

sudo -iu kravhantering bash <<'EOF'
set -eu
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
podman ps -a
podman volume ls
systemctl --user list-unit-files | grep kravhantering || true
EOF

sudo test ! -e /etc/nginx/conf.d/kravhantering.conf
sudo test ! -d "${POC_REPO}"
sudo ss -ltnp | grep -E ":(1433|3001|8080|443) " || true

rpm -q podman podman-compose
PODMAN_COMPOSE_PROVIDER=podman-compose podman compose version
```

At this point, start
[rhel10-production-deploy.md](./rhel10-production-deploy.md) from the
`Clean RHEL 10 Host` section. If `kravhantering` already exists, skip the
`useradd` command and keep `loginctl enable-linger kravhantering`.
