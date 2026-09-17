#!/bin/sh
# Shared filesystem adaptation for the selected UBI Node.js minimal runtime.
# Consumers declare their own packages, environment, entrypoint and final user.
set -eu

[ "$(id -u)" = 0 ]
[ "$(node -p 'process.versions.node.split(".")[0]')" = 24 ]
# Fail closed if a replacement base assigns the supported identity elsewhere.
if getent passwd node >/dev/null || getent passwd 1000 >/dev/null \
  || getent group node >/dev/null || getent group 1000 >/dev/null; then
  echo 'UBI compatibility: node identity is already allocated.' >&2
  exit 1
fi
printf '%s\n' 'node:x:1000:' >> /etc/group
printf '%s\n' 'node:x:1000:1000:Node.js:/home/node:/bin/bash' >> /etc/passwd
mkdir -p /home/node
chown 1000:1000 /home/node
chmod 0755 /home/node

# Include Red Hat's original PDF, verified before installation.
eula_file=$(mktemp)
trap 'rm -f "$eula_file"' 0 HUP INT TERM
curl --fail --silent --show-error --location --retry 3 \
  --proto '=https' --proto-redir '=https' --output "$eula_file" \
  'https://www.redhat.com/licenses/EULA_Red_Hat_Universal_Base_Image_English_20190422.pdf'
if ! printf '%s  %s\n' \
  'a07025b9f5b71a816febe6ac76f21c9f759c806fa0a66874af90a50c3293f1b6' \
  "$eula_file" | sha256sum --check --status; then
  echo 'UBI compatibility: original EULA checksum mismatch.' >&2
  exit 1
fi
mkdir -p /usr/share/licenses/ubi
cp "$eula_file" /usr/share/licenses/ubi/UBI-EULA.pdf
chmod 0644 /usr/share/licenses/ubi/UBI-EULA.pdf
mkdir -p /usr/share/licenses/kravhantering
cp /tmp/kravhantering-LICENSE /usr/share/licenses/kravhantering/LICENSE
chmod 0644 /usr/share/licenses/kravhantering/LICENSE

# Production cleanup jobs use this absolute executable path.
mkdir -p /usr/local/bin
ln -s /usr/bin/node /usr/local/bin/node

# Keep workload dependencies and inherited nodemon; remove the npm CLI payload.
rm -rf /usr/lib/node_modules_24/npm
rm -f /usr/bin/npm /usr/bin/npx /usr/bin/npm-24 /usr/bin/npx-24
