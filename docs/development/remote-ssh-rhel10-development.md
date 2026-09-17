# Remote SSH development on RHEL 10

<!-- cSpell:ignore Keychain Quadlet podman keygen passphrase localhost -->
<!-- cSpell:ignore IdentitiesOnly ServerAliveInterval AddKeysToAgent -->
<!-- cSpell:ignore UseKeychain HostName authorized_keys prodlike worktree -->
<!-- cSpell:ignore ed25519 macos your-admin-user -->
<!-- cSpell:ignore onepassword SSH_AUTH_SOCK ECONNREFUSED -->
<!-- cSpell:ignore onepassword restorecon sshconfig journalctl -->

This guide describes how to develop on the RHEL 10 server from VS Code
Remote-SSH and run the app with `npm run dev`.

It assumes a development server has already been prepared with Podman:

- the dedicated `kravhantering` user exists and runs rootless Podman
- Node.js 24 and npm are installed
- the repository is cloned under the `kravhantering` user's home directory
- SQL Server and Keycloak can run on the server through Podman or Quadlet
- SQL Server is reachable on `127.0.0.1:1433`
- Keycloak is reachable on `127.0.0.1:8080`

Use your admin account only to prepare the host and install SSH keys. Use
the `kravhantering` account for day-to-day development so file ownership,
rootless Podman state, npm installs, and VS Code Server all belong to the
same user.

## Choose an SSH key workflow on macOS

Use a dedicated SSH key for this server. The 1Password workflow is the
recommended path when 1Password is already configured as your SSH key
store. Contributors who do not use 1Password can use the file-based
OpenSSH workflow instead.

### Option A: 1Password SSH agent

Use this option when 1Password is your SSH key store.

This guide assumes the 1Password setup itself is already complete:

- 1Password's SSH agent is enabled
- `ssh-add -l` lists the SSH key from 1Password

In 1Password on macOS:

1. Open and unlock 1Password.
2. Create a new **SSH Key** item, or import an existing private key.
3. Copy the public key from the 1Password SSH Key item.

Save the copied public key to the path used by the rest of this guide:

>[!IMPORTANT]
>Make sure to have the public key in the clipboard before running the
>commands below.

```sh
mkdir -p ~/.ssh
pbpaste > ~/.ssh/kravhantering_rhel10.pub
chmod 600 ~/.ssh/kravhantering_rhel10.pub
```

Check that the already-configured 1Password agent can see the key:

```sh
ssh-add -l
```

`ssh-add -l` lists keys available from the agent. Do not use
`ssh-add ~/.ssh/kravhantering_rhel10` with the 1Password agent; the
private key should be generated in or imported into 1Password instead.

The private key stays in 1Password. The `.pub` file is used to install the
key on RHEL and select it in your SSH configuration.

### Option B: file-based OpenSSH key

Use this option when 1Password is not your SSH key store.

Create a dedicated key for this server. A passphrase is recommended.

```sh
ssh-keygen \
  -t ed25519 \
  -f ~/.ssh/kravhantering_rhel10 \
  -C "$(whoami)@macos-kravhantering"
```

This creates:

- `~/.ssh/kravhantering_rhel10` - private key, keep this secret
- `~/.ssh/kravhantering_rhel10.pub` - public key, install this on RHEL

Add the private key to the macOS SSH agent. Newer Apple OpenSSH builds
can also store the passphrase in Keychain:

```sh
ssh-add --apple-use-keychain ~/.ssh/kravhantering_rhel10
```

If that fails with `ssh-add: illegal option -- -`, add the key to the
current SSH agent without Keychain storage:

```sh
ssh-add ~/.ssh/kravhantering_rhel10
```

Do not use `ssh-add -K` if it asks for `Enter PIN for authenticator`.
On that SSH build, `-K` means "load resident keys from a FIDO/security-key
authenticator"; it is not the passphrase for this file-based SSH key.

## Install the public key for `kravhantering`

Because `kravhantering` is a no-password service user, do not rely on
interactive password login or `ssh-copy-id` as that user. Copy the public
key with your admin account, then install it into the target user's
`authorized_keys`.

From macOS, copy the public key to a temporary path on the server:

```sh
scp \
  ~/.ssh/kravhantering_rhel10.pub \
  your-admin-user@server.example.com:/tmp/kravhantering_rhel10.pub
```

Then SSH to the server as your admin user and run:

```sh
sudo install -d \
  -m 700 \
  -o kravhantering \
  -g kravhantering \
  /home/kravhantering/.ssh

sudo tee -a /home/kravhantering/.ssh/authorized_keys \
  < /tmp/kravhantering_rhel10.pub \
  > /dev/null

sudo chown kravhantering:kravhantering \
  /home/kravhantering/.ssh/authorized_keys

sudo chmod 600 /home/kravhantering/.ssh/authorized_keys

sudo restorecon -RFv /home/kravhantering/.ssh

rm /tmp/kravhantering_rhel10.pub
```

If `authorized_keys` already contained keys, the command above appends the
new public key.

## Configure SSH on macOS

Add one host entry to `~/.ssh/config`.

For the 1Password SSH agent workflow:

```sshconfig
Host krav-rhel
    HostName server.example.com
    User kravhantering
    IdentityFile ~/.ssh/kravhantering_rhel10.pub
    IdentitiesOnly yes
    ServerAliveInterval 30
```

This relies on your normal SSH agent environment. If you have configured
a stable 1Password socket path and need VS Code or other GUI tools to use
it explicitly, add `IdentityAgent <socket-path>` to this host entry. Do
not add an `IdentityAgent ~/.1password/agent.sock` line unless that path
exists on your machine.

For the file-based OpenSSH workflow:

```sshconfig
Host krav-rhel
    HostName server.example.com
    User kravhantering
    IdentityFile ~/.ssh/kravhantering_rhel10
    IdentitiesOnly yes
    AddKeysToAgent yes
    UseKeychain yes
    ServerAliveInterval 30
```

If your SSH client reports `Bad configuration option: usekeychain`,
remove the `UseKeychain yes` line.

Replace `server.example.com` with the server DNS name or IP address.

Keep the SSH config readable only by your macOS user:

```sh
chmod 700 ~/.ssh
chmod 600 ~/.ssh/config
chmod 600 ~/.ssh/kravhantering_rhel10.pub
```

For the file-based OpenSSH workflow, also run:

```sh
chmod 600 ~/.ssh/kravhantering_rhel10
```

The 1Password host entry selects the matching key from the agent using
the public `IdentityFile` and `IdentitiesOnly yes`, preventing attempts
with unrelated keys. See
[1Password's host key selection guidance](https://www.1password.dev/ssh/agent/advanced#match-key-with-host)
if your SSH client does not support public-key identity files.

Test the connection from macOS:

```sh
ssh krav-rhel
```

On the server, verify that you landed as the correct user:

```sh
whoami
pwd
node --version
npm --version
```

`whoami` should print `kravhantering`, and `node --version` should print
`v24.x`.

## Connect from VS Code

Install the VS Code **Remote - SSH** extension on macOS.

Then:

1. Open the Command Palette.
2. Run `Remote-SSH: Connect to Host...`.
3. Select `krav-rhel`.
4. Open the remote folder, normally `~/Kravhantering`.

Or open the remote folder directly from a macOS terminal:

```sh
code --reuse-window \
  --folder-uri \
  "vscode-remote://ssh-remote+krav-rhel/home/kravhantering/Kravhantering"
```

The path in the Remote-SSH URI must be absolute; use
`/home/kravhantering/Kravhantering` instead of `~/Kravhantering`.

If you are already connected to `krav-rhel` in a VS Code remote terminal,
you can switch the current window to the project folder with:

```sh
code -r ~/Kravhantering
```

Install workspace extensions on the remote side when VS Code prompts for
them. The editor UI stays on macOS, but terminals, TypeScript services,
Next.js, npm, and Git operations run on RHEL as `kravhantering`.

## Prepare the dev environment

From a VS Code remote terminal:

```sh
cd ~/Kravhantering

node --version
npm --version
podman --version
podman compose version
```

Install dependencies after the first clone, after changing branches, or
after `package-lock.json` changes:

```sh
node scripts/install-repository-npm.mjs
npm ci
```

The shared development defaults live in the committed `.env.development`
file. Keep personal secrets in `.env.development.local`.

Create `.env.development.local` if it does not already exist:

```sh
touch .env.development.local
```

Provider credentials do not belong in this file. Write them through Admin
Center so the application stores encrypted provider-secret revisions.

Configure database credentials for this server before running database
commands. The application and database scripts load the development env
files; they do not load `.env.sqlserver`, which supplies Compose settings.
The defaults use separate runtime (`DB_USER` / `DB_PASSWORD`), migration
(`DB_MIGRATION_USER` / `DB_MIGRATION_PASSWORD`), and bootstrap admin
(`DB_BOOTSTRAP_ADMIN_USER` / `DB_BOOTSTRAP_ADMIN_PASSWORD`) credentials.
Override them in `.env.development.local` when the server differs from the
committed defaults. See the
[SQL Server developer workflow](./sql-server-developer-workflow.md)
for principal setup and connection settings.

If you reuse the prod-like Keycloak instance behind the RHEL reverse
proxy, override the issuer URL so it matches the issuer returned by
Keycloak discovery:

```dotenv
AUTH_OIDC_ISSUER_URL=https://<remote-dev-host>/auth/realms/kravhantering-dev
```

Do this only when Keycloak advertises the public `/auth` URL. OIDC
discovery requires `AUTH_OIDC_ISSUER_URL` to exactly match the `issuer`
field in
`/.well-known/openid-configuration`. The committed `.env.development`
value, `http://localhost:8080/realms/kravhantering-dev`, is still the
right default for devcontainer and local host-based development.

Do not commit `.env.development.local`.

## Start SQL Server and Keycloak

If the host has Quadlet user services for SQL Server and Keycloak, reuse
those services. The names below are examples; substitute the installed
development service names:

```sh
systemctl --user status kravhantering-db.service
systemctl --user status kravhantering-idp.service
```

Start them if they are configured but stopped:

```sh
systemctl --user start kravhantering-db.service
systemctl --user start kravhantering-idp.service
```

If you did not configure Quadlet for the backing services, start them
with Podman Compose instead:

```sh
podman compose \
  --env-file .env.sqlserver \
  -f docker-compose.sqlserver.yml \
  up -d db

podman compose \
  -f docker-compose.idp.yml \
  up --wait --wait-timeout 180 idp
```

Do not run both Quadlet and Compose copies of the same service at the
same time; they will compete for ports and volumes.

Verify that SQL Server is reachable:

```sh
npm run db:wait
npm run db:health
```

Run `npm run db:setup` only for a disposable development database, or
when you intentionally want to reset the database, run migrations, seed
data, and recreate the read-only login. If this RHEL server is also used
as a stable prod-like environment, remember that `npm run dev` can write
to the same SQL Server database as the prod-like app. Use a separate
database and configure its connection settings, or a separate SQL Server
instance with its own volume and port, to keep prod-like state intact.
A separate checkout alone does not isolate database state.

The npm scripts `db:up`, `db:down`, `idp:up`, and `idp:down` call
`docker compose`. `idp:up` waits for Keycloak's OIDC discovery and JWKS
endpoints before returning. On this RHEL setup, prefer the direct
`podman compose` commands above unless `podman-docker` is installed and
intentionally provides the `docker` shim.

## Keep the prod-like checkout separate

An app started with `npm run start:prodlike` runs on port `3001`.
The dev server runs `npm run dev` on port `3000`.

Next.js keeps dev output in `.next/dev`, while the prod-like runtime uses
`.next/standalone`. A separate checkout is still useful when the prod-like
app must stay available: dependency installs, builds, and `npm run clean`
can alter files in the shared checkout. If your host has a prod-like
service using `~/Kravhantering`, stop that service before such work. For
example, if its installed name is `kravhantering-app.service`:

```sh
systemctl --user stop kravhantering-app.service
```

If you need the prod-like service to stay up while you develop, use a
separate clone or worktree for development and run VS Code against that
separate directory.

## Run the dev server

From the VS Code remote terminal:

```sh
cd ~/Kravhantering
npm run dev
```

Next.js starts on remote `localhost:3000`. VS Code usually detects the
port and offers to forward it automatically.

In the VS Code **Ports** view, make sure these remote ports are forwarded
to the same local ports on macOS:

- `3000` - Next.js dev server
- `8080` - Keycloak issuer and browser login flow when using the
  `http://localhost:8080` issuer

If `.env.development.local` overrides `AUTH_OIDC_ISSUER_URL` to the
public prod-like `/auth` URL, port `8080` does not need to be forwarded
for the login flow. If macOS already uses one of the forwarded ports,
stop the local process. Using different local ports requires matching
changes in the Keycloak client registration and `.env.development.local`.

Open the app on macOS:

```text
http://localhost:3000
```

The Keycloak seeded users are documented in
[auth-developer-workflow.md](./auth-developer-workflow.md#seeded-users).
They use the password `devpass`.

Forwarding port `1433` is optional. It is only needed if a SQL Server
tool running locally on macOS should connect to the remote database. A
VS Code database extension installed on the remote side can use
`127.0.0.1:1433` directly without a local tunnel.

## Troubleshooting

If VS Code cannot connect, test plain SSH first:

```sh
ssh krav-rhel
```

If plain SSH fails, check that the public key was appended to
`/home/kravhantering/.ssh/authorized_keys`, that the file modes are
`700` for `.ssh` and `600` for `authorized_keys`, and that `restorecon`
has been run on `/home/kravhantering/.ssh`.

If SSH asks for a password, the connection reached `sshd` but public-key
authentication did not succeed. For the passwordless `kravhantering`
user, treat that as a public-key setup problem rather than entering a
password.

From macOS, check whether the 1Password agent has keys and whether SSH
is offering them:

```sh
ssh-add -l
ssh -vvv krav-rhel
```

In the verbose output, look for lines like `Offering public key`. If no
1Password key is offered, verify that `ssh-add -l` lists the key and
that 1Password is unlocked. Also remove or fix any `IdentityAgent` line
that points at a missing socket path. If a key is offered but rejected,
compare the public key you saved locally with the line installed on the
server:

```sh
cat ~/.ssh/kravhantering_rhel10.pub
sudo grep -n . /home/kravhantering/.ssh/authorized_keys
```

Run the `sudo grep` command on the RHEL server from an admin session or
console. The key type and base64 key body must match exactly.

If SSH fails with
`kex_exchange_identification: read: Connection reset by peer`, collect
`ssh -vvv krav-rhel` output and ask the host administrator to inspect the
SSH service logs. From an admin session or console on RHEL:

```sh
sudo systemctl status sshd --no-pager
sudo journalctl -u sshd -n 100 --no-pager
```

A reset before key authentication needs investigation of the host or
network; reinstalling the public key does not diagnose it.

If the remote app logs `ECONNREFUSED 127.0.0.1:8080`, check that Keycloak
is running and reachable on the RHEL server. If the browser on macOS
cannot open the login page at `localhost:8080`, check the VS Code port
forward instead.

If login fails with `redirect_uri_mismatch`, keep local port `3000` for
the app and verify that `http://localhost:3000/api/auth/callback` is
registered on the Keycloak client. When using the
`http://localhost:8080` issuer, also keep local port `8080` forwarded.

If login fails with `discovered metadata issuer does not match the
expected issuer`, compare `AUTH_OIDC_ISSUER_URL` with the `issuer` value
returned by Keycloak discovery. Set the shell variable to the same value
as your app configuration first; `.env.development.local` is not loaded
automatically by the shell:

```sh
AUTH_OIDC_ISSUER_URL='http://localhost:8080/realms/kravhantering-dev'
curl --fail --silent --show-error \
  "$AUTH_OIDC_ISSUER_URL/.well-known/openid-configuration" \
  | grep '"issuer"'
```

They must match exactly. When reusing the prod-like Keycloak behind the
RHEL reverse proxy, put the public issuer URL in `.env.development.local`,
for example
`https://<remote-dev-host>/auth/realms/kravhantering-dev`, and restart
`npm run dev`.

If the app cannot connect to SQL Server, check:

```sh
npm run db:wait
npm run db:health
```

Then verify the configured host, port, database, and runtime/migration
credentials in `.env.development.local`. For database setup, the bootstrap
admin password must match the SQL Server administrator password. Changing
only `MSSQL_SA_PASSWORD` does not override the explicit `DB_*` credentials
in `.env.development`.

If a command says `docker: command not found`, use the `podman compose`
commands in this guide, or install `podman-docker` intentionally as part
of the RHEL host setup.
