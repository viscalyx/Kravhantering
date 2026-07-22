# Azure VM Remote SSH Development

This guide describes the optional disposable Azure VM development environment.
The VM is for one developer, runs the app directly in `/workspace`, and runs
only SQL Server, Keycloak, Kong, and HSA support services in rootless Podman.

Use the devcontainer for normal local work. Use this VM when you need a larger
remote Linux host opened from VS Code Remote SSH.

Run every `azure-dev.ps1` command in this guide directly from a PowerShell 7
session. Open a PowerShell 7 terminal, change to the repository root, and keep
that session open for the workflow. Do not prefix the script commands with
`pwsh`.

## Get the tenant ID and subscription ID

The simplest lookup path is Azure Portal Cloud Shell:

1. Open the Azure Portal.
2. Open **Cloud Shell** from the `>_` toolbar icon.
3. Choose **Bash**.
4. List the subscriptions visible to your portal session:

```sh
az account list \
  --query "[].{subscription:name,subscriptionId:id,tenantId:tenantId}" \
  -o table
```

Use the `tenantId` value from the row that contains the development
subscription. For one known subscription, query only that subscription:

>[!NOTE]
>
> Can also use PowerShell in Cloud Shell to list subscriptions and their tenants:
>
>```powershell
>Connect-AzAccount
>Get-AzSubscription | Select-Object Name, Id, TenantId
>```

- From Azure PowerShell, list subscriptions and their tenants:

```powershell
Connect-AzAccount
Get-AzSubscription | Select-Object Name, Id, TenantId
```

## Login to the Tenant

Log Azure CLI into the tenant. The setup script uses the subscription ID from
the merged Azure development configuration, so that subscription must be
visible in the active Azure CLI login.

Make sure Azure CLI is using the public Azure cloud, then sign in directly to
the tenant:

```sh
az cloud set --name AzureCloud
az login --tenant "<tenant-id>"
```

Verify that the development subscription is visible after login:

```sh
az account list --all \
  --query "[].{name:name,id:id,tenant:tenantId,state:state}" \
  -o table
```

## Step 1: Understand Cost

Review the configured cost drivers after choosing or editing
`.env.azure.development`:

```powershell
./scripts/azure-dev.ps1 estimate-cost
```

This command reads local configuration only. It does not require Azure login,
subscription visibility, resource-group permissions, or provider registration.
It also does not fetch live Azure prices.

The environment can bill for compute, the OS disk, the configured data disk,
static public IP, network traffic, and taxes. The setup, stop, and remove
commands are covered in the setup and management sections below. The data disk
is used for the repository checkout, VM host state, and rootless Podman storage.
`/workspace`, `/var/lib/krav-azure-dev`, and
`/home/vscode/.local/share/containers/storage` are bind mounts into the data
disk. The bootstrap fails if the data disk is missing.

Disk layout after setup:

```text
OS disk
`-- /
    |-- etc/
    |   |-- apt/
    |   |   |-- keyrings/
    |   |   `-- sources.list.d/
    |   |-- fstab
    |   |-- krav-dev/                         -> optional Tailscale env read
    |   |-- ssh/sshd_config.d/
    |   |   |-- 00-kravhantering-root-login.conf
    |   |   `-- 01-kravhantering-environment.conf
    |   `-- sudoers.d/
    |       `-- 90-krav-vscode
    |
    |-- home/
    |   `-- vscode/
    |       |-- .cache/
    |       |   `-- ms-playwright/
    |       |-- .codex/
    |       |   |-- config.toml
    |       |   |-- sqlite/
    |       |   `-- tmp/
    |       |-- .config/
    |       |   |-- containers/
    |       |   |   |-- containers.conf
    |       |   |   |-- storage.conf  -> rootless storage points to data disk
    |       |   |   `-- systemd/      -> Quadlet unit files
    |       |   `-- krav-dev/         -> support service env files
    |       |-- .dotnet/
    |       |-- .local/
    |       |   `-- share/
    |       |       `-- containers/
    |       |           `-- storage/  -> bind mount to data disk Podman storage
    |       |-- .npm/
    |       |-- .nuget/
    |       |-- .oh-my-zsh/
    |       |   `-- custom/
    |       |       |-- plugins/
    |       |       `-- themes/
    |       |           `-- powerlevel10k/
    |       |-- .zshrc                 -> selected repository template
    |       `-- ...
    |
    |-- mnt/
    |   `-- krav-azure-dev-data/      -> data disk mount point
    |
    |-- opt/
    |   `-- google/
    |       `-- chrome/
    |           `-- chrome            -> symlink to Playwright/system Chrome
    |
    |-- run/
    |   `-- user/
    |       `-- <vscode-uid>/         -> user systemd runtime
    |
    |-- tmp/
    |   `-- krav-bootstrap-repo.*
    |
    |-- usr/
    |   |-- local/
    |   |   `-- bin/                  -> dotenv-linter
    |   `-- share/
    |       `-- keyrings/
    |
    |-- workspace/                    -> bind mount to data disk workspace/
    |
    `-- var/
        `-- lib/
            |-- krav-azure-dev/       -> bind mount to data disk host-state/
            `-- systemd/
                `-- linger/
                    `-- vscode

Data disk
`-- /mnt/krav-azure-dev-data/
    |-- workspace/                    -> repository checkout
    |   |-- .env.development.local    -> managed Azure VM block
    |   |-- containers/
    |   |   `-- kong/
    |   |       `-- kong.yml
    |   |-- node_modules/
    |   `-- ...
    |
    |-- home/
    |   `-- vscode/
    |       `-- .local/
    |           `-- share/
    |               `-- containers/
    |                   `-- storage/  -> rootless Podman graphroot/images and volumes
    |
    `-- host-state/                   -> managed host state
```

Package installation also writes normal Ubuntu, Node.js, Docker, GitHub CLI,
Codex CLI, GitHub Copilot CLI, and .NET package-manager files under standard
system locations such as `/usr`, `/lib`, and `/var`.

`/home/vscode` intentionally remains on the OS disk. Moving the full home
directory to the data disk is possible, for example by bind-mounting a data
disk directory to `/home/vscode`, but it couples SSH login, user systemd, shell
startup, VS Code Remote SSH, and user secrets to the data disk being present and
healthy. Keeping only `/workspace`, `/var/lib/krav-azure-dev`, and the
rootless Podman storage directory on the data disk gives the large and
rebuildable data a bigger disk while keeping the VM login path simpler to
recover.

## Step 2: Prepare Azure

Get or choose these values first:

- subscription ID
- tenant ID for login
- Azure region, for example `eastus2`.
- resource group name, for example `rg-krav-dev-personal`
- stable environment ID, for example your username or initials

The Azure region should be a region with the desired VM SKU and a low-latency
path to your location. The setup script does not validate latency.

Make sure to use the same region for the resource group as for the resource
group configured in `.env.azure.development`. The resource group must be
in the same subscription as the VM. The resource group should preferably
be dedicated to this personal development environment.

The resource group name and environment ID should also be specified in the
`.env.azure.development` file.

The personal shortcut is subscription-scope `Contributor`. With that role,
`setup` can create and tag the resource group.

The shared-subscription option is a pre-created resource group plus one of
these resource-group scoped roles:

- a project-specific custom role with only the actions listed below
- the built-in `Contributor` role when a custom role is not available

### Create resource group

In a shared subscription, prefer an admin-created resource group and a custom
role scoped to that resource group. Ask the admin to create and tag the group:

```sh
az group create \
  --subscription "<subscription-id>" \
  --name "<resource-group-name>" \
  --location "eastus2" \
  --tags \
    "managed-by=kravhantering-azure-dev" \
    "environment-id=<stable-environment-id>" \
    "repository=viscalyx/Kravhantering" \
    "purpose=personal-development"
```

The setup flow requires all four tags before it mutates an existing resource
group. If the group exists without them, setup fails closed and prints the
`az group update` command an owner can run.

### Register providers

The least-practical custom role needs resource-group deployment, compute,
network, disk, public IP, SSH public-key, and optional DevTestLab schedule
actions. The setup command does not create role assignments and does not use VM
extensions, VM runCommand, Azure SSH key-pair generation, or `DataActions`.

If your tenant requires explicit provider registration, an owner can check or
register these providers:

```sh
az provider show --subscription "<subscription-id>" \
  --namespace "Microsoft.Compute" \
  --query registrationState \
  -o tsv

az provider register --subscription "<subscription-id>" \
  --namespace "Microsoft.Compute"

az provider register --subscription "<subscription-id>" \
  --namespace "Microsoft.Network"

az provider register --subscription "<subscription-id>" \
  --namespace "Microsoft.DevTestLab"
```

## Step 3: Install Workstation Prerequisites

Install these tools on the workstation:

- PowerShell 7+ terminal
- Azure CLI
- OpenSSH client, `ssh-keygen`, and `scp`
- VS Code with Remote SSH
- GitHub CLI when GitHub access is required from the remote environment
- MesloLGS Nerd Font Mono installed on the workstation
- Optional: Tailscale CLI for Tailscale cleanup checks

Powerlevel10k is rendered on the workstation even when the shell runs on the
Azure VM. Configure VS Code with:

```json
{
  "terminal.integrated.fontFamily": "MesloLGS Nerd Font Mono"
}
```

On macOS, install the font with:

```sh
brew install --cask font-meslo-lg-nerd-font
```

On Windows or Linux, install the MesloLGS Nerd Font Mono faces from the
[Nerd Fonts downloads](https://www.nerdfonts.com/font-downloads). On Linux,
run `fc-cache -f` after installation. `setup` checks for the font before
creating or changing Azure resources and stops with installation guidance when
it is missing.

Service-principal automation may use `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
and `AZURE_CLIENT_SECRET` from the shell or `.env.azure.development.local`.
When all three values are set, real Azure commands log in with the service
principal before checking any existing Azure CLI user login.

### Prepare GitHub authentication

The Azure VM setup does not copy or persist a GitHub token. Keep the token in
the workstation's secure credential store and expose it as `GH_TOKEN` only in
the environment that launches the Remote SSH connection. For example, when the
GitHub CLI is already authenticated with the intended account:

```powershell
$env:GH_TOKEN = gh auth token
```

For Bash or Zsh:

```sh
export GH_TOKEN="$(gh auth token)"
```

Do not echo the variable or put its value in the repository, an Azure
development environment file, the SSH config, or a shell profile. Use a
repository-limited, expiring token with only the permissions the development
workflow needs.

Fine-grained personal access tokens receive organization authorization during
creation. A classic personal access token requires a separate SAML SSO
authorization: authenticate with the organization identity provider once, open
GitHub **Settings > Developer settings > Personal access tokens**, choose
**Configure SSO** for the token, and then choose **Authorize** for the
organization. See
[GitHub's SAML SSO token authorization guide](https://docs.github.com/authentication/authenticating-with-saml-single-sign-on/authorizing-a-personal-access-token-for-use-with-saml-single-sign-on).

Setup adds `SendEnv GH_TOKEN` to the managed workstation SSH host block and
configures the VM with `AcceptEnv GH_TOKEN`. OpenSSH transfers the value through
the encrypted SSH session, and the VS Code Server and its child processes
inherit it. The setup scripts never inspect, print, or persist the token value.

After changing or rotating the token, close the Remote SSH connection and open
a new one so the VS Code Server receives the current value. Verify forwarding
without displaying the token:

```sh
test -n "${GH_TOKEN:-}" && gh auth status
```

## Step 4: Configure `.env.azure.development`

Copy the example and edit the required non-secret Azure values:

```sh
cp .env.azure.development.example .env.azure.development
```

Required non-secret values:

```env
AZURE_DEV_VM_RESOURCE_GROUP=rg-krav-dev-personal
AZURE_DEV_VM_LOCATION=eastus2
```

The other non-secret Azure VM values use code defaults and can be left
unchanged:

```env
AZURE_DEV_VM_ALLOWED_SSH_CIDR=auto
AZURE_DEV_VM_AUTO_STOP_ENABLED=true
AZURE_DEV_VM_AUTO_STOP_TIME=2200
AZURE_DEV_VM_AUTO_STOP_TIME_ZONE=UTC
AZURE_DEV_VM_CONNECTIVITY_MODE=public-ssh
AZURE_DEV_VM_DATA_DISK_GIB=256
AZURE_DEV_VM_ENVIRONMENT_ID=personal
AZURE_DEV_VM_FALLBACK_SIZE=Standard_D8as_v5
AZURE_DEV_VM_NAME=krav-dev-vm
AZURE_DEV_VM_NAME_PREFIX=krav-dev
AZURE_DEV_VM_SIZE=Standard_D8s_v5
AZURE_DEV_VM_SSH_HOST_ALIAS=kravhantering-azure-dev
```

`AZURE_DEV_VM_DATA_DISK_GIB` sets the size for a new managed data disk. If an
existing disk is smaller, setup expands the managed disk and its ext4
filesystem. If an existing disk is larger, setup warns, preserves that size,
and continues because Azure managed disks cannot be shrunk. Run `remove` and
recreate the disposable environment to use a smaller disk.

Use `AZURE_DEV_VM_ALLOWED_SSH_CIDR=auto` for the normal path. Setup detects
your current public IPv4 address and proposes it as a `/32`. Do not use
`0.0.0.0/0`; the tool refuses broad SSH ranges.

The parser intentionally supports only `KEY=value`, optional quotes, blank
lines, and full-line comments. It does not evaluate shell expressions,
`export`, variable expansion, or command substitution.

Setup configures global `user.name` and `user.email` values for the remote
`vscode` user before the first VS Code connection. By default, it copies the
effective values from the workstation's Git configuration for this checkout.
Set either value explicitly when the remote identity should differ:

```env
AZURE_DEV_GIT_USER_NAME=<full-name>
AZURE_DEV_GIT_USER_EMAIL=<email-address>
```

Each value resolves independently, so an explicit email can be combined with a
name copied from local Git configuration. Setup stops before changing Azure
resources when it cannot resolve both values.

## Step 5: Configure `.env.azure.development.local`

Create this file only when you need per-workstation overrides or secrets:

```sh
touch .env.azure.development.local
```

The file is gitignored by the existing `.env.*.local` rule. Put secrets here
only when session environment variables are not practical.

Treat the subscription ID as secret configuration and give it a real value:

```env
AZURE_DEV_VM_SUBSCRIPTION_ID=<subscription-id>
```

The SSH private-key path is also treated as secret configuration. Its code
default is `~/.ssh/kravhantering_azure_dev_ed25519`. Set an override here only
when needed:

```env
AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH=<private-key-path>
```

Set unique passwords for the VM-local SQL Server and Keycloak services before
the first real setup:

```env
MSSQL_SA_PASSWORD=<strong-unique-sql-server-password>
KEYCLOAK_ADMIN_PASSWORD=<strong-unique-keycloak-password>
```

A real `setup` fails before creating or updating Azure resources when either
password is missing. The setup tool uploads only these support-service values
through temporary mode `0600` files; it does not include them in command-line
arguments, logs, or Azure state. `setup -WhatIf` does not require them because
it does not bootstrap the VM. Setup fails if it cannot remove the local
temporary files after transferring them.

Optional Ubuntu Pro attachment:

```env
AZURE_DEV_UBUNTU_PRO_TOKEN=<ubuntu-pro-token>
```

Get the token from the
[Ubuntu Pro dashboard](https://ubuntu.com/pro/dashboard). When the value is
set, setup transfers it in a temporary mode `0600` attach-config file and runs
`pro attach` on the VM. Ubuntu Pro enables the services selected by the
subscription's defaults. When the value is unset, setup does not attach or
detach Ubuntu Pro; a new VM remains unattached. Removing the value on a later
setup does not detach a VM that is already attached.

Choose the values before SQL Server and Keycloak initialize their persistent
data. Changing these variables later does not rotate credentials inside an
existing SQL Server database or Keycloak realm; recreate the disposable
environment or perform the corresponding service credential rotation first.

Optional service-principal login:

Use this when setup should run as the service principal instead of your current
Azure CLI user. Set all three values together:

```env
AZURE_TENANT_ID=<tenantId>
AZURE_CLIENT_ID=<clientId>
AZURE_CLIENT_SECRET=<clientSecret>
```

For real commands, including `setup`, a complete service-principal
configuration is used before any existing `az login` session. If any of the
three values are set, all three must be set. For `-WhatIf`, the script does not
perform `az login --service-principal` because that would mutate the local
Azure CLI session.

### Determine permissions for service principal

Use one of these values for `<role-name-or-id>`:

- the project-specific custom role name or role ID from the Azure admin
- `Contributor` for the built-in role at the resource-group scope

The custom role is preferred in a shared subscription. `Contributor` is simpler
for a personal subscription or a dedicated development resource group, but it
can manage more resource types inside that group than this tool needs.

### Option 1. Create service principal and role assignment

If you are allowed to create app registrations and assign Azure RBAC at the
resource-group scope, create the credentials and role assignment in one command:

```sh
az ad sp create-for-rbac \
  --name "krav-dev-<stable-environment-id>" \
  --role "<role-name-or-id>" \
  --scopes \
    "/subscriptions/<subscription-id>/resourceGroups/<resource-group-name>" \
  --query "{tenantId:tenant,clientId:appId,clientSecret:password}" \
  -o json
```

Copy the output values into `.env.azure.development.local`:

```env
AZURE_TENANT_ID=<tenantId>
AZURE_CLIENT_ID=<clientId>
AZURE_CLIENT_SECRET=<clientSecret>
```

`clientId` is the service principal application ID, returned as `appId` by
Azure CLI. `clientSecret` is the generated password. Save it immediately; Azure
does not let you read the same secret value later.

### Option 2. Admin-created service principal

If the tenant admin creates the identity before assigning access, ask them to
run:

```sh
az ad sp create-for-rbac \
  --name "krav-dev-<stable-environment-id>" \
  --query "{tenantId:tenant,clientId:appId,clientSecret:password}" \
  -o json
```

Then assign the role at the resource-group scope:

```sh
az role assignment create \
  --assignee "<client-id>" \
  --role "<role-name-or-id>" \
  --scope \
    "/subscriptions/<subscription-id>/resourceGroups/<resource-group-name>"
```

Copy the output values into `.env.azure.development.local`:

```env
AZURE_TENANT_ID=<tenantId>
AZURE_CLIENT_ID=<clientId>
AZURE_CLIENT_SECRET=<clientSecret>
```

`clientId` is the service principal application ID, returned as `appId` by
Azure CLI. `clientSecret` is the generated password. Save it immediately; Azure
does not let you read the same secret value later.

### Reset service principal secret

If the secret is lost or expired, reset it and update
`.env.azure.development.local` with the new `clientSecret`:

```sh
az ad sp credential reset \
  --id "<client-id>" \
  --append \
  --query "{clientSecret:password}" \
  -o json
```

### (Optional) Use ephemeral Tailscale auth key

Optional Tailscale mode:

```env
AZURE_DEV_VM_CONNECTIVITY_MODE=tailscale
AZURE_DEV_TAILSCALE_AUTH_KEY=<ephemeral-auth-key>
AZURE_DEV_TAILSCALE_TAILNET=<tailnet-name>
```

Precedence is:

1. session environment variables
2. `.env.azure.development.local`
3. `.env.azure.development`
4. the effective local Git configuration, for Git identity values only
5. built-in defaults, which do not provide a Git identity

That means a shell `AZURE_CLIENT_SECRET` overrides the value in
`.env.azure.development.local`. If the shell does not define it, the value from
`.env.azure.development.local` is used.

### (Optional) Customize the Zsh profile

Setup installs Oh My Zsh, Powerlevel10k, `git`, `zsh-autosuggestions`, and
`zsh-syntax-highlighting` for the remote `vscode` user. The tracked
`scripts/azure-dev/templates/zshrc.template.example` contains the default
profile and the local rainbow prompt defaults. Running `p10k configure` on the
VM creates `/home/vscode/.p10k.zsh`, which takes precedence on later shells.
The required MesloLGS Nerd Font Mono remains a workstation prerequisite; the
Azure VM cannot install a font used by the local VS Code terminal renderer.

To customize the profile before setup, copy the example to the ignored local
override and edit it:

```sh
cp scripts/azure-dev/templates/zshrc.template.example \
  scripts/azure-dev/templates/zshrc.template
```

`setup` installs `zshrc.template` when it exists. Otherwise, it installs
`zshrc.template.example`. Each setup run reapplies the selected profile to
`/home/vscode/.zshrc`. Keep credentials out of both files; load secrets through
the environment or an external secret manager instead.

## Step 6: Run Setup

In the PowerShell session at the repository root, run the read-only Azure
readiness preflight before setup. The script resolves both Azure development
environment files relative to the repository root:

```powershell
./scripts/azure-dev.ps1 setup -WhatIf
```

By default, the script calculates the repository root from its own location.
Use `-RepositoryRoot` to override it when the environment files, local state,
and templates belong to another repository root:

```powershell
./scripts/azure-dev.ps1 setup -WhatIf -RepositoryRoot /path/to/Kravhantering
```

This checks tools, Azure login, subscription visibility, SKU availability,
resource-group ownership tags, SSH CIDR, and the deployment preview. It needs
the Azure permissions described in Step 2, but it must not create Azure
resources, SSH keys, local locks, state, or logs.

Azure what-if can report provider-owned or read-only defaults as changes, for
example NIC `kind`, dynamic private IP, public-IP DDoS settings, disk values
marked `NoEffect`, or standalone managed disks marked `Ignore`. Treat those as
noise when no create, delete, or meaningful update is listed for managed
resources.

After the raw Bicep result, setup prints a conservative interpretation. It
classifies only the known NIC and Public IP provider-default property deletions
as false positives. Every unfamiliar create, delete, or modification remains
actionable. Microsoft documents that ARM What-If can incorrectly report
automatically assigned or default properties as deleted. See the
[ARM template deployment What-If documentation](https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deploy-what-if).

For an existing VM, setup reuses its exact Marketplace image reference because
Azure does not allow `imageReference` to change in place. Setup resolves the
latest validated Ubuntu image only when it creates a new VM.

When preflight is clean, run setup to create or repair the environment:

```powershell
./scripts/azure-dev.ps1 setup -Yes
```

`setup` prints a cost summary before it creates resources. It does not estimate
every charge. It does not run the Azure deployment preview; use
`setup -WhatIf` when you want that preview.

Use `-Yes` for non-interactive confirmation. The command creates a dedicated
SSH key if missing, provisions Azure resources, installs the managed SSH config
block with SSH agent forwarding enabled when approved, waits for SSH, uploads
the local bootstrap and Quadlet templates, the selected Zsh profile, and the
Azure Codex configuration, configures the remote Git identity, reruns the VM
bootstrap, and runs smoke validation.
If the VM already exists but was deallocated by `stop` or auto-shutdown, `setup`
starts it before waiting for SSH.

The first setup can take a while. It installs host packages, mounts the data
disk at `/mnt/krav-azure-dev-data`, bind-mounts
`/mnt/krav-azure-dev-data/workspace` to `/workspace`, bind-mounts
`/mnt/krav-azure-dev-data/host-state` to `/var/lib/krav-azure-dev`, and
bind-mounts the data-disk-backed Podman storage directory to
`/home/vscode/.local/share/containers/storage`. It clones the repo to
`/workspace`, configures rootless Podman to use its normal home storage path,
runs `npm install`, restores .NET tools, installs Codex CLI, GitHub Copilot CLI,
the pinned Lychee link checker, and Playwright browsers, verifies the checked-out
Kong config, builds HSA support images with Podman, recreates the managed support
containers from the current Quadlet templates and checked-out Kong config while
preserving named volumes, starts Quadlet services, and runs smoke validation.

### Codex and GitHub Copilot CLIs in Remote SSH

Setup installs the current stable Codex CLI and GitHub Copilot CLI releases
system-wide and verifies that the `codex` and `copilot` commands start. Rerun
`setup` to install updates on an existing VM.

Codex authentication is separate from GitHub authentication. Run `codex login`
and complete its browser flow before first use. GitHub Copilot CLI can use the
`GH_TOKEN` forwarded from the workstation. The token's user must have an active
Copilot plan, and the organization policy must allow Copilot CLI.

Azure setup installs the distribution `bubblewrap` package and the Ubuntu
24.04 AppArmor profile required for unprivileged user namespaces. Bootstrap
tests Bubblewrap as `vscode` with an isolated network namespace, and smoke
validation repeats that test. Setup fails early if the Codex sandbox cannot
initialize loopback networking.

Setup also uploads `scripts/azure-dev/templates/codex-config.toml` and merges
its Azure-specific settings into `/home/vscode/.codex/config.toml`. The merge
preserves existing personal settings such as the selected model and MCP
servers. It manages the default permission profile, `/workspace` trust, and
the `kravhantering-azure-dev` profile on every setup run, even when the user
configuration already exists.

The profile grants workspace access and network access to the loopback
addresses used by host-side development and the Podman support services. The
devcontainer profile in `.devcontainer/codex-config.toml` is separate and is
not installed on the Azure VM.

After setup repairs Codex configuration on an already connected VM, reload the
VS Code Remote SSH window and start a new Codex session so the extension reads
the updated profile.

For administration tasks, use the generated regular SSH command:

```sh
ssh -i "<private-key-path>" -o IdentitiesOnly=yes \
  -o SendEnv=GH_TOKEN vscode@<public-ip-or-tailscale-name>
```

Setup fills in the configured private-key path and the resolved remote host.
The matching public key is installed on the VM and is not passed to the SSH
client. `IdentitiesOnly=yes` ensures that SSH offers only that private key.
The managed host block sets `ForwardAgent yes`, allowing remote Git processes
to request signatures from the workstation's SSH agent without copying private
keys to the VM.
Bootstrap explicitly disables direct SSH login as `root`. Connect as `vscode`
and use `sudo` for administrative commands. This restriction applies only to
OpenSSH; Azure control-plane operations, Run Command, VM Access, and Serial
Console remain available for management and recovery. After using an Azure
recovery action that resets or rewrites SSH configuration, rerun `setup` to
restore and validate the managed policy.

The generated managed SSH host block also contains `SendEnv GH_TOKEN`, and the
VM accepts that named GitHub environment variable in addition to its standard
OpenSSH environment policy. Before running either generated connection
command, set `GH_TOKEN` in the workstation environment as described in
[Prepare GitHub authentication](#prepare-github-authentication). Setup prints
the same reminder after a successful setup or start operation.

To start a development environment, use the generated VS Code command:

```sh
code --remote ssh-remote+kravhantering-azure-dev /workspace
```

Before opening the workspace, choose how VS Code should install the extensions
listed in `.vscode/extensions.json`:

- For automatic installation on every Remote SSH host, set the local VS Code
  User setting `remote.SSH.defaultExtensions` to the active recommendations in
  `.vscode/extensions.json`. This is an application-wide setting and affects
  other SSH hosts.
- To install the extensions only for this remote workspace, connect first and
  run **Extensions: Install Workspace Recommended Extensions** from the Command
  Palette.

Setup prints both options but does not change the application-wide VS Code
setting. The repository file remains the source of truth. The automatic option
installs the extensions while VS Code establishes the first Remote SSH session,
because the matching VS Code Server does not exist before that connection. See
the VS Code documentation for
[always-installed Remote SSH extensions](https://code.visualstudio.com/docs/remote/ssh#_always-installed-extensions).

After VS Code connects, optionally open its integrated terminal and run
`p10k configure` to customize the prompt. The repository defaults are already
active, so this step is not required.

## Step 7: Open and Run the App

Open the VM through VS Code Remote SSH:

```sh
code --remote ssh-remote+kravhantering-azure-dev /workspace
```

On the VM:

```sh
cd /workspace
npm run dev
```

The app runs directly on the VM host. Containers run only the support services.

## Step 8: Manage the Environment

Start the VM:

```powershell
./scripts/azure-dev.ps1 start
```

Stop compute charges:

```powershell
./scripts/azure-dev.ps1 stop
```

`stop` deallocates the VM and stops compute charges. Disks and public IP
resources can still bill.

Show current state:

```powershell
./scripts/azure-dev.ps1 status
```

Refresh only the SSH source CIDR after your public IP changes:

```powershell
./scripts/azure-dev.ps1 update-cidr
```

Print or apply the managed SSH block:

```powershell
./scripts/azure-dev.ps1 ssh-config
./scripts/azure-dev.ps1 ssh-config -Apply
```

Forwarded ports are `3000`, `3001`, `4443`, `1433`, `8080`, `18000`, `9323`,
and `51204`.

## Step 9: Manage Support Services

On the VM, inspect the support stack as `vscode`:

```sh
systemctl --user status krav-db.service
systemctl --user status krav-idp.service
systemctl --user status krav-kong.service
systemctl --user status krav-hsa-person-lookup-adapter.service
systemctl --user status krav-hsa-directory-mock.service
```

Restart a service:

```sh
systemctl --user restart krav-kong.service
```

Inspect logs:

```sh
journalctl --user -u krav-db.service -n 100
journalctl --user -u krav-kong.service -n 100
```

The VM bootstrap writes a managed block to `/workspace/.env.development.local`
so HSA lookup uses Kong on `127.0.0.1:18000`.

## Tailscale

Set `AZURE_DEV_VM_CONNECTIVITY_MODE=tailscale` only when the Tailscale account,
auth-key policy, and device cleanup process are ready. This mode uses ordinary
OpenSSH to the VM Tailscale address. It does not use Tailscale SSH.

The bootstrap installs Tailscale. If `/etc/krav-dev/tailscale.env` exists on
the VM with `AZURE_DEV_TAILSCALE_AUTH_KEY`, bootstrap joins the tailnet with
`--ssh=false`. Treat auth keys as secrets and prefer ephemeral, pre-approved
keys. If teardown cannot remove the Tailscale device automatically, delete the
VM device from the Tailscale admin console.

## Step 10: Validate

Default smoke validation checks SSH, the data-disk bind mounts, `/workspace`,
major tool versions including Codex CLI, GitHub Copilot CLI, and Lychee, the
configured global Git identity, rootless Podman units, loopback-only support
ports, HSA lookup through Kong, `npm run db:setup`, `npm run db:health`, and
Playwright browser availability.

Optional heavier checks after the environment is accepted:

```sh
npm run check
npm run test:integration
```

## Step 11: Tear Down

Preview deletion:

```powershell
./scripts/azure-dev.ps1 remove -WhatIf
```

Delete managed Azure resources and owned local state:

```powershell
./scripts/azure-dev.ps1 remove
```

`remove` deletes the managed resources and is the full managed-resource cost
stop.

SSH private and public key files are preserved by default. Use `-CleanupKeys`
only when you intentionally want to remove the generated key pair.

## Troubleshooting

If Azure recreates the VM and SSH reports a host-key mismatch, run the exact
command printed by the tool:

```sh
ssh-keygen -R kravhantering-azure-dev
```

If setup reports that the existing VM was created with a different SSH public
key, the VM must be recreated. Azure does not allow changing
`osProfile.linuxConfiguration.ssh.publicKeys` on an existing VM. This can
happen if an earlier dry run created resources with the placeholder key.

Preview and then remove the managed environment:

```powershell
./scripts/azure-dev.ps1 remove -WhatIf
./scripts/azure-dev.ps1 remove
```

Then rerun setup so the VM is created with the local SSH key.

If SKU validation fails, set `AZURE_DEV_VM_SIZE` or
`AZURE_DEV_VM_FALLBACK_SIZE` to a size available in the selected region. Use a
4 vCPU and 16 GiB size only with the expectation that the workload may become
memory-bound.

If SQL Server rootless volume validation fails, inspect:

```sh
journalctl --user -u krav-db.service
podman volume inspect krav-sqlserver
```

The Ubuntu 24.04 bootstrap installs `dotnet-sdk-8.0` from the Ubuntu package
feeds. It does not add the Microsoft package feed or install
`packages-microsoft-prod.deb`.
