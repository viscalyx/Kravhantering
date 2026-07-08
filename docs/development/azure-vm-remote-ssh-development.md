# Azure VM Remote SSH Development

<!-- cSpell:ignore Bicep DevTestLab Keycloak OpenSSH Podman Quadlet Tailscale -->
<!-- cSpell:ignore appId cidr deallocates dotenv dotnet eastus idempotent -->
<!-- cSpell:ignore isDefault rbac -->
<!-- cSpell:ignore AzSubscription Connect-AzAccount preflight pwsh rootless -->
<!-- cSpell:ignore Select-Object sqlcmd subscriptionId tailnet tenantId -->
<!-- cSpell:ignore vscode -->

This guide describes the optional disposable Azure VM development environment.
The VM is for one developer, runs the app directly in `/workspace`, and runs
only SQL Server, Keycloak, Kong, and HSA support services in rootless Podman.

Use the devcontainer for normal local work. Use this VM when you need a larger
remote Linux host opened from VS Code Remote SSH.

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
`.env.azure.development`, so that subscription must be visible in the active
Azure CLI login.

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

```sh
pwsh ./scripts/azure-dev.ps1 estimate-cost
```

This command reads local configuration only. It does not require Azure login,
subscription visibility, resource-group permissions, or provider registration.
It also does not fetch live Azure prices.

The environment can bill for compute, the OS disk, the 256 GiB data disk,
static public IP, network traffic, and taxes. The setup, stop, and remove
commands are covered in the setup and management sections below. The data disk
is used for the repository checkout, VM host state, and rootless Podman
storage. `/workspace`, `/var/lib/krav-azure-dev`, and
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
    |       |       `-- plugins/
    |       |-- .zshrc
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
and .NET package-manager files under standard system locations such as `/usr`,
`/lib`, and `/var`.

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

- PowerShell 7+, run as `pwsh`
- Azure CLI
- OpenSSH client, `ssh-keygen`, and `scp`
- VS Code with Remote SSH
- Optional: Tailscale CLI for Tailscale cleanup checks

Service-principal automation may use `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
and `AZURE_CLIENT_SECRET` from the shell or `.env.azure.development.local`.
When all three values are set, real Azure commands log in with the service
principal before checking any existing Azure CLI user login.

## Step 4: Configure `.env.azure.development`

Copy the example and edit the required Azure values:

```sh
cp .env.azure.development.example .env.azure.development
```

Required values:

```env
AZURE_DEV_VM_SUBSCRIPTION_ID=00000000-0000-0000-0000-000000000000
AZURE_DEV_VM_RESOURCE_GROUP=rg-krav-dev-personal
AZURE_DEV_VM_LOCATION=eastus2
AZURE_DEV_VM_ENVIRONMENT_ID=<stable-environment-id>
```

Set these common non-secret values deliberately:

```env
AZURE_DEV_VM_NAME_PREFIX=krav-dev
AZURE_DEV_VM_NAME=krav-dev-vm
AZURE_DEV_VM_SIZE=Standard_D8s_v5
AZURE_DEV_VM_FALLBACK_SIZE=Standard_D8as_v5
AZURE_DEV_VM_CONNECTIVITY_MODE=public-ssh
AZURE_DEV_VM_ALLOWED_SSH_CIDR=auto
AZURE_DEV_VM_SSH_HOST_ALIAS=kravhantering-azure-dev
AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH=~/.ssh/kravhantering_azure_dev_ed25519
AZURE_DEV_VM_AUTO_STOP_ENABLED=true
AZURE_DEV_VM_AUTO_STOP_TIME=2200
AZURE_DEV_VM_AUTO_STOP_TIME_ZONE=UTC
```

Use `AZURE_DEV_VM_ALLOWED_SSH_CIDR=auto` for the normal path. Setup detects
your current public IPv4 address and proposes it as a `/32`. Do not use
`0.0.0.0/0`; the tool refuses broad SSH ranges.

The parser intentionally supports only `KEY=value`, optional quotes, blank
lines, and full-line comments. It does not evaluate shell expressions,
`export`, variable expansion, or command substitution.

## Step 5: Configure `.env.azure.development.local`

Create this file only when you need per-workstation overrides or secrets:

```sh
touch .env.azure.development.local
```

The file is gitignored by the existing `.env.*.local` rule. Put secrets here
only when session environment variables are not practical.

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
4. built-in defaults

That means a shell `AZURE_CLIENT_SECRET` overrides the value in
`.env.azure.development.local`. If the shell does not define it, the value from
`.env.azure.development.local` is used.

## Step 6: Run Setup

Run the read-only Azure readiness preflight before setup:

```sh
pwsh ./scripts/azure-dev.ps1 setup -WhatIf
```

This checks tools, Azure login, subscription visibility, SKU availability,
resource-group ownership tags, SSH CIDR, and the deployment preview. It needs
the Azure permissions described in Step 2, but it must not create Azure
resources, SSH keys, local locks, state, or logs.

<!-- cSpell:ignore Noeffect -->
Azure what-if can report provider-owned or read-only defaults as changes, for
example NIC `kind`, dynamic private IP, public-IP DDoS settings, disk values
marked `Noeffect`, or standalone managed disks marked `Ignore`. Treat those as
noise when no create, delete, or meaningful update is listed for managed
resources.

When preflight is clean, create or repair the environment:

```sh
pwsh ./scripts/azure-dev.ps1 setup -Yes
```

`setup` prints a cost summary before it creates resources. It does not estimate
every charge. It does not run the Azure deployment preview; use
`setup -WhatIf` when you want that preview.

Use `-Yes` for non-interactive confirmation. The command creates a dedicated
SSH key if missing, provisions Azure resources, installs the managed SSH config
block when approved, waits for SSH, uploads the local bootstrap and Quadlet
templates, reruns the VM bootstrap, and runs smoke validation.
If the VM already exists but was deallocated by `stop` or auto-shutdown, `setup`
starts it before waiting for SSH.

The first setup can take a while. It installs host packages, mounts the data
disk at `/mnt/krav-azure-dev-data`, bind-mounts
`/mnt/krav-azure-dev-data/workspace` to `/workspace`, bind-mounts
`/mnt/krav-azure-dev-data/host-state` to `/var/lib/krav-azure-dev`, and
bind-mounts the data-disk-backed Podman storage directory to
`/home/vscode/.local/share/containers/storage`. It clones the repo to
`/workspace`, configures rootless Podman to use its normal home storage path,
runs `npm install`, restores .NET tools, installs Playwright browsers, verifies
the checked-out Kong config, builds HSA support images with Podman, recreates
the managed support containers from the current Quadlet templates and
checked-out Kong config while preserving named volumes, starts Quadlet services,
and runs smoke validation.

The generated VS Code command is:

```sh
code --remote ssh-remote+kravhantering-azure-dev /workspace
```

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

```sh
pwsh ./scripts/azure-dev.ps1 start
```

Stop compute charges:

```sh
pwsh ./scripts/azure-dev.ps1 stop
```

`stop` deallocates the VM and stops compute charges. Disks and public IP
resources can still bill.

Show current state:

```sh
pwsh ./scripts/azure-dev.ps1 status
```

Refresh only the SSH source CIDR after your public IP changes:

```sh
pwsh ./scripts/azure-dev.ps1 update-cidr
```

Print or apply the managed SSH block:

```sh
pwsh ./scripts/azure-dev.ps1 ssh-config
pwsh ./scripts/azure-dev.ps1 ssh-config -Apply
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
major tool versions, rootless Podman units, loopback-only support ports, HSA
lookup through Kong, `npm run db:setup`, `npm run db:health`, and Playwright
browser availability.

Optional heavier checks after the environment is accepted:

```sh
npm run check
npm run test:integration
```

## Step 11: Tear Down

Preview deletion:

```sh
pwsh ./scripts/azure-dev.ps1 remove -WhatIf
```

Delete managed Azure resources and owned local state:

```sh
pwsh ./scripts/azure-dev.ps1 remove
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

```sh
pwsh ./scripts/azure-dev.ps1 remove -WhatIf
pwsh ./scripts/azure-dev.ps1 remove
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
