# Azure VM Remote SSH Internals

This document is for contributors who maintain the Azure VM Remote SSH
implementation. The operator workflow, configuration examples, cost warning,
disk tree, and daily commands live in
[Azure VM Remote SSH Development](./azure-vm-remote-ssh-development.md).

Do not duplicate operator instructions here. Add content here when it explains
how the implementation works, what invariants must be preserved, or how to
change the scripts safely.

## System Shape

The environment is a disposable, single-developer Azure VM opened with VS Code
Remote SSH. The app runs directly on the VM host in `/workspace`. Containers
run only support services: SQL Server, Keycloak, Kong, the HSA directory mock,
and the HSA person lookup adapter.

The implementation has three layers:

- PowerShell 7 command surface in `scripts/azure-dev.ps1` and
  `scripts/azure-dev/*.psm1`.
- Azure resources declared in `scripts/azure-dev/templates/main.bicep`.
- Guest bootstrap and user-level Quadlet templates under
  `scripts/azure-dev/templates/`.

PowerShell owns local configuration, Azure CLI orchestration, SSH key and
OpenSSH config management, upload of guest templates, state, locks, logs, and
validation. Bicep owns the resource graph inside the selected resource group.
The guest bootstrap owns Ubuntu package setup, data-disk mounts, repository
checkout, rootless Podman configuration, Quadlet installation, and support
service startup.

## Source Layout

`scripts/azure-dev.ps1` is the only public entry point. It imports modules in
this order:

```text
AzureDev.Config.psm1
AzureDev.Logging.psm1
AzureDev.Azure.psm1
AzureDev.Ssh.psm1
AzureDev.Bootstrap.psm1
AzureDev.Validation.psm1
AzureDev.Podman.psm1
```

Module responsibilities:

<!-- markdownlint-disable MD013 -->
| Module | Responsibility |
| --- | --- |
| `AzureDev.Config.psm1` | Strict dotenv parsing, defaults, precedence, config validation, and context creation. |
| `AzureDev.Logging.psm1` | Local state, locks, JSONL logs, redaction, and native command execution helpers. |
| `AzureDev.Azure.psm1` | Azure CLI calls, authentication checks, SKU and image lookup, resource-group ownership, deployment, power operations, CIDR updates, and tag-based deletion. |
| `AzureDev.Ssh.psm1` | Public IPv4 detection, CIDR validation, SSH key generation, managed OpenSSH config blocks, host-key mismatch handling, SSH wait loop, and VS Code command formatting. |
| `AzureDev.Bootstrap.psm1` | Uploads `bootstrap-host.sh`, Quadlet templates, and the selected Zsh profile with `scp`, then invokes bootstrap over SSH with port forwarding disabled. |
| `AzureDev.Validation.psm1` | Checks the workstation terminal font, runs post-setup smoke validation over SSH, and reports remote diagnostics on failure. |
| `AzureDev.Podman.psm1` | Shared support-service unit and port metadata used by validation. |
<!-- markdownlint-enable MD013 -->

Keep parsing and planning logic separate from Azure and filesystem mutations.
This is what makes `-WhatIf`, dry inspection, and future focused tests
practical.

## Command Model

The entry point validates the command name with PowerShell's `ValidateSet` and
then builds one context object. The context contains the resolved config,
operator switches, and derived local paths:

```text
.azure/development.state.json
.azure/development.lock
.azure/logs/
scripts/azure-dev/templates/main.bicep
scripts/azure-dev/templates/bootstrap-host.sh
scripts/azure-dev/templates/zshrc.template.example
```

Only `setup` requires `.env.azure.development` to exist. `estimate-cost` allows
missing Azure scope values so it can read local defaults and print cost drivers
without Azure access. Other commands still validate required Azure scope values
before calling Azure.

The command flow is intentionally narrow:

- `estimate-cost` prints local cost drivers only.
- `setup` verifies the workstation Powerlevel10k font before any Azure
  mutation, validates prerequisites, resolves SSH CIDR, preserves an existing
  VM's immutable image reference or resolves the latest image for a new VM,
  creates or verifies the SSH key, checks existing VM SSH-key drift, converges
  the resource group and Bicep deployment, starts the VM when needed, waits for
  SSH, uploads templates, reruns bootstrap, runs smoke validation, writes state,
  and prints SSH instructions.
- `start` starts the VM, refreshes SSH config, waits for SSH, and prints
  connection instructions.
- `stop` deallocates the VM.
- `status` reads Azure state plus local state and prints a compact status.
- `update-cidr` updates only the SSH NSG rule and managed SSH config.
- `ssh-config` prints the managed OpenSSH block or applies it when requested.
- `remove` deletes only live resources selected by ownership tags, then removes
  owned local state and the managed SSH config block.

## Mutation Rules

Every mutating function must be an advanced PowerShell function and must use
`SupportsShouldProcess`. `-WhatIf` relies on `$WhatIfPreference`; do not
special-case it by writing parallel dry-run code that diverges from the real
path.

`setup -WhatIf` must remain read-only. It may inspect local tools, Azure login,
subscription visibility, SKU availability, resource-group tags, SSH CIDR, and
the Azure deployment preview. It must not create Azure resources, SSH keys,
OpenSSH config entries, local state, locks, or logs.

The deployment preview requests structured JSON once, prints its resource and
leaf-property changes, and then prints a conservative interpretation. Only
`Delete` predictions for the allowlisted NIC provider defaults, dynamic private
IP, and Public IP DDoS defaults count as known false positives. Treat mixed or
unknown modifications, creates, deletes, deploys, unsupported resources, and
potential changes as actionable. Keep the Microsoft ARM What-If limitations
link in the operator guide and preview output.

The script uses a placeholder public key only during `setup -WhatIf` when the
real key does not exist. Real setup creates or reuses the configured local
`ed25519` key pair and installs only the public key on the VM.

All native commands must go through `Invoke-AzureDevNativeCommand` unless there
is a specific reason not to. That helper writes the redacted formatted command
with `Write-Verbose` and writes the raw command output with `Write-Debug`.
Keep new secret-bearing arguments compatible with `Format-AzureDevCommand`
redaction.

## Configuration And Authentication

Configuration is a strict dotenv subset:

- `KEY=value`
- optional single or double quotes
- blank lines
- full-line `#` comments

The parser rejects `export`, shell evaluation, variable expansion, command
substitution, and unterminated quoted values. It expands `~` only for paths the
implementation explicitly resolves.

The entry point uses its optional `-RepositoryRoot` value or derives the
repository root from `scripts/azure-dev.ps1` when the parameter is omitted. It
resolves both environment files and all local state paths from that root. It
does not depend on PowerShell's current location.

Precedence is:

1. Session environment variables.
2. `.env.azure.development.local`.
3. `.env.azure.development`.
4. Effective Git configuration for the local checkout, for the two Git
   identity values only.
5. Built-in defaults, which intentionally omit a Git identity.

`Get-AzureDevConfig` resolves `user.name` and `user.email` through the native
command wrapper only when the corresponding Azure Git identity value remains
empty after the environment overlays. Setup validates both values before any
Azure mutation, including during `setup -WhatIf`.

The complete service-principal triple is:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
```

If any one value is set, all three must be set. For real Azure commands, a
complete triple is used before an existing Azure CLI user session. For
`-WhatIf`, the script must not run `az login --service-principal` because that
mutates local Azure CLI state.

Never print or log secret values. State files must contain only non-secret
cache data that can be rebuilt from Azure or config.

Real setup requires `MSSQL_SA_PASSWORD` and
`KEYCLOAK_ADMIN_PASSWORD`. PowerShell writes the two support-service env files
and, when `AZURE_DEV_UBUNTU_PRO_TOKEN` is set, an Ubuntu Pro attach-config file
to a mode `0700` temporary directory with mode `0600` files. It uploads them to
a mode `0700` remote staging directory and removes the local copies. Bootstrap
installs the support-service files as mode `0600` under
`/home/vscode/.config/krav-dev`. It passes the optional attach-config file to
`pro attach` and removes all remote staging copies. Do not pass these values in
SSH command arguments or write them to Azure state. Treat failure to remove
the local temporary directory as a setup failure, including after a successful
upload.

## Azure Provisioning

PowerShell shells out to Azure CLI for:

- cloud and account checks
- service-principal login when configured
- subscription selection
- provider and SKU/image inspection
- resource-group lookup and creation
- Bicep what-if and deployment
- output capture
- power operations
- tag-filtered resource deletion

Bicep owns these resources:

- VNet `namePrefix-vnet`
- subnet `snet-dev`
- NSG `namePrefix-nsg`
- optional public IP `namePrefix-pip` in `public-ssh` mode
- NIC `namePrefix-nic`
- SSH public-key resource `namePrefix-ssh-key`
- VM `vmName`
- managed OS disk `vmName-osdisk`
- managed data disk `vmName-data`
- optional DevTestLab schedule `shutdown-computevm-vmName`

All resources receive the common tag set:

```text
managed-by=kravhantering-azure-dev
environment-id=<configured stable id>
repository=viscalyx/Kravhantering
purpose=personal-development
```

Existing resource groups are mutable only when ownership tags are present, or
when the explicit adoption path is used. Deletion uses live Azure tags, not
local state, as the source of truth. `remove` deletes matching resources inside
the resource group and does not delete the resource group itself.

The VM admin user is always `vscode`. Azure password authentication is disabled
and the configured SSH public key is written to
`/home/vscode/.ssh/authorized_keys` through the VM OS profile. Azure does not
allow that OS-profile SSH key to be changed in place, so setup detects a VM
created with a different key and fails with a remove-and-recreate instruction.

The OS and data disks use `deleteOption: Delete` in Bicep so VM teardown deletes
them with the VM instead of leaving detached managed disks behind.

For an existing managed data disk, Bicep omits `diskSizeGB` from the VM update.
Setup compares the live disk with `AZURE_DEV_VM_DATA_DISK_GIB`. It updates the
managed disk resource before deployment when expansion is requested, and host
bootstrap rescans the device and grows its ext4 filesystem. A smaller requested
size produces a warning and preserves the live disk; shrinking requires
removing and recreating the disposable environment.

## SSH And Connectivity

`public-ssh` is the default connectivity mode. The implementation detects the
operator's current public IPv4 address and converts it to a `/32` when
`AZURE_DEV_VM_ALLOWED_SSH_CIDR=auto`. Broad ranges such as `0.0.0.0/0` and
`::/0` must remain blocked.

The managed OpenSSH block is bounded by markers and is the only part of
`~/.ssh/config` the tool may change. The block uses the configured host alias,
the `vscode` user, `IdentitiesOnly yes`, `ForwardAgent yes`, the configured
private key, and the local forwards documented in the development guide. It
also contains `SendEnv GH_TOKEN`; the token value remains in the workstation
environment and is never written to the managed block.

The setup and start connection output explains that `GH_TOKEN` must exist in
the workstation environment that launches VS Code. It may show commands that
retrieve the token from the local GitHub CLI credential store, but it must
never retrieve, interpolate, print, or persist the token value.

The setup and start connection output must present both supported extension
installation choices. It points to `.vscode/extensions.json` as the source for
`remote.SSH.defaultExtensions`, warns that the setting applies to every Remote
SSH host, and gives the workspace-only Command Palette alternative. Do not
silently change the developer's application-wide VS Code settings.

Remote command probes use:

```text
BatchMode=yes
ClearAllForwardings=yes
StrictHostKeyChecking=accept-new
```

`ClearAllForwardings=yes` is important for maintenance commands because an
existing VS Code Remote SSH session may already own the forwarded local ports.

Tailscale mode is explicit. It uses ordinary OpenSSH over the VM's Tailscale
address and does not enable Tailscale SSH.

Guest bootstrap writes
`/etc/ssh/sshd_config.d/00-kravhantering-root-login.conf` with
`PermitRootLogin no` and
`/etc/ssh/sshd_config.d/01-kravhantering-environment.conf` with
`AcceptEnv GH_TOKEN`. It validates the complete OpenSSH configuration, the
effective root-specific policy, and the narrowly scoped GitHub environment
policy before reloading `ssh.service`. Direct root SSH is unavailable;
operators connect as `vscode` and use passwordless `sudo`. Azure control-plane
operations and agent- or console-based recovery remain independent of this
OpenSSH restriction. Rerun setup after any recovery action that resets or
rewrites guest SSH configuration.

## Guest Bootstrap

`AzureDev.Bootstrap.psm1` uploads the current local bootstrap script, Quadlet
templates, Zsh profile, and Azure Codex configuration files to `/tmp` on the
VM, waits for cloud-init when available, and runs:

<!-- markdownlint-disable MD013 -->

```text
sudo env AZURE_DEV_QUADLET_SOURCE=/tmp/krav-azure-dev/quadlet AZURE_DEV_ZSHRC_SOURCE=/tmp/krav-azure-dev/zshrc AZURE_DEV_CODEX_CONFIG_SOURCE=/tmp/krav-azure-dev/codex/codex-config.toml AZURE_DEV_CODEX_CONFIG_MERGER=/tmp/krav-azure-dev/codex/merge-codex-config.py AZURE_DEV_GIT_USER_NAME='<full-name>' AZURE_DEV_GIT_USER_EMAIL='<email-address>' bash /tmp/krav-bootstrap-host.sh
```

<!-- markdownlint-enable MD013 -->

The Git identity values are shell-quoted before being added to the bootstrap
command. Bootstrap writes them to `/home/vscode/.gitconfig` with
`git config --global` while running as `vscode`; it does not alter the
workstation configuration.

The ignored `scripts/azure-dev/templates/zshrc.template` is the local override.
When it is absent, setup uploads the tracked
`scripts/azure-dev/templates/zshrc.template.example`. Bootstrap installs the
selected file as `/home/vscode/.zshrc` and installs the Oh My Zsh plugins and
theme required by the default profile.

Bootstrap installs Bubblewrap and the Ubuntu 24.04
`bwrap-userns-restrict` AppArmor profile, then proves that the `vscode` user
can create the user, PID, and network namespaces Codex requires. It does not
disable `kernel.apparmor_restrict_unprivileged_userns` globally.

Bootstrap installs Codex CLI with OpenAI's non-interactive standalone installer
under `/usr/local/lib/codex` and exposes `codex` through `/usr/local/bin`. It
installs GitHub Copilot CLI globally from the `@github/copilot` npm package.
Both installers converge to their current stable releases on every setup run.

The tracked Azure Codex template is separate from the devcontainer template.
`merge-codex-config.py` atomically updates the existing user configuration. It
preserves unrelated user keys and tables, replaces Azure-owned root settings,
updates `/workspace` trust, removes a legacy devcontainer profile if one was
previously copied onto the VM, and writes the managed Azure permission profile.
Repeated merges produce the same configuration.

Do not move bootstrap into Azure `customData`. Azure does not allow changing
`customData` on an existing VM, while this workflow must be able to rerun the
current local bootstrap against an existing development VM.

Bootstrap is idempotent and is expected to repair safe drift. It installs host
packages, optionally attaches the host to Ubuntu Pro, prepares the `vscode`
user, mounts storage, clones or updates the repository, configures rootless
Podman, writes managed local app environment, builds local HSA images, installs
Quadlet units, and starts services. An absent Ubuntu Pro attach-config file is
a no-op and does not detach an existing attachment.

Package setup intentionally installs .NET SDK 8.0 from Ubuntu 24.04 package
feeds. Do not add the Microsoft package feed unless the devcontainer path is
changed at the same time and the reason is documented.

Repository setup uses `npm install`, not `npm ci`, to match the current
devcontainer behavior. If deterministic install becomes a requirement, change
the devcontainer and Azure VM bootstrap together.

## Storage Invariants

The development guide contains the human-readable disk tree. The contributor
contract is:

- `/mnt/krav-azure-dev-data` is the Azure data disk mount.
- `/workspace` is a bind mount to the data disk and contains the repository.
- `/var/lib/krav-azure-dev` is a bind mount to the data disk and contains host
  state owned by this feature.
- `/home/vscode/.local/share/containers/storage` is a bind mount to the data
  disk and is the rootless Podman graphroot.
- `/home/vscode` itself remains on the OS disk.
- There is no OS-disk fallback for `/workspace`, host state, or Podman storage.

`bootstrap-host.sh` formats `/dev/disk/azure/scsi1/lun0` as ext4 only when the
device has no filesystem. It rewrites only the relevant `/etc/fstab` entries:
the data mount, `/workspace`, `/var/lib/krav-azure-dev`, and the rootless
Podman storage bind mount. It removes `lost+found` from the exposed bind-mount
roots and fixes ownership for `vscode`.

Rootless Podman is configured with:

```text
graphroot = "/home/vscode/.local/share/containers/storage"
rootless_storage_path = "/home/vscode/.local/share/containers/storage"
```

That path is deliberately the normal rootless location from Podman's point of
view. The data disk is introduced underneath it with a bind mount. This avoids
Netavark and rootless networking issues that can appear when graphroot is moved
to an unusual system path.

When changing storage behavior, update bootstrap and smoke validation together.
Validation must prove that the data mount source is the Azure data disk and
that `/workspace`, host state, and Podman storage are on the same device as the
data-disk mount.

## Podman Support Stack

Support services run as rootless Podman containers owned by `vscode` and
managed by user-level systemd Quadlet units under:

```text
/home/vscode/.config/containers/systemd/
```

Bootstrap enables lingering for `vscode`, starts `user@<uid>.service`, sets
the user systemd environment, reloads user units, starts base network and
volume units, reruns the certificate generator, and then starts long-running
services.

Managed container names are stable because the app and diagnostics assume
them:

```text
db
idp
kong
hsa-directory-mock
hsa-person-lookup-adapter
```

The shared Podman network is `krav-support`. Published support ports must bind
only to loopback:

```text
127.0.0.1:1433   SQL Server
127.0.0.1:8080   Keycloak
127.0.0.1:18000  Kong HSA proxy
```

Do not add Azure NSG rules for support ports. Workstation access goes through
OpenSSH or VS Code Remote SSH port forwarding.

SQL Server data and generated HSA mTLS certificates live in named Podman
volumes. Bootstrap may remove and recreate containers while preserving those
volumes. The SQL Server volume uses Podman's `U` volume option and
`HOME=/var/opt/mssql` so the image user has a writable home and system
directory. Kong uses `KONG_PREFIX=/tmp/kong` so rootless runtime state is
writable.

Kong uses the checked-out repository file
`/workspace/containers/kong/kong.yml`. Bootstrap verifies route
`hsa-directory-person-lookup-rest` and adds `protocols: [http, https]` only
when missing. This keeps older workspaces repairable without uploading a local
copy of `kong.yml` from the operator machine.

## Managed App Environment

Bootstrap preserves user content in `/workspace/.env.development.local` and
writes only a managed block for Azure VM support-service overrides. The required
HSA lookup value is:

```env
HSA_PERSON_LOOKUP_URL=http://127.0.0.1:18000/hsa/person-records/lookup
```

Do not replace the whole file. Contributors adding VM-specific variables must
extend the managed block logic and keep non-managed local developer settings
intact.

## State, Locks, And Logs

Local state is a cache written to:

```text
.azure/development.state.json
```

It records the setup version, subscription, resource group, VM name, current
public IP or Tailscale target, SSH alias and key paths, deployment outputs,
last known SSH CIDR, and last validation status. Destructive paths must verify
live Azure resources instead of trusting this file.

Mutating commands create:

```text
.azure/development.lock
```

The lock contains command name, process ID, host, user, environment ID, and
start time. `-ForceUnlock` may remove stale local locks only. It must not
bypass Azure ownership checks or destructive confirmations.

JSONL logs are written under:

```text
.azure/logs/
```

Logs must remain redacted. Do not write secrets, SSH private keys, tokens,
passwords, auth keys, or full connection strings.

## Smoke Validation

Smoke validation is a usability check, not a full repository quality gate. It
runs over SSH after bootstrap and diagnoses remote failures in place.

Validation must prove these implementation contracts:

- SSH reaches the generated host alias as `vscode`.
- the effective root-specific OpenSSH policy is `PermitRootLogin no`.
- the effective OpenSSH environment policy accepts `GH_TOKEN`.
- Bubblewrap can create the unprivileged network namespace used by Codex.
- `/home/vscode/.codex/config.toml` selects the managed
  `kravhantering-azure-dev` profile while preserving unrelated user settings.
- `/workspace` exists, is owned by `vscode`, and contains the repo.
- the data disk, `/workspace`, host state, and rootless Podman storage are
  mounted as described in the storage invariants.
- rootless Podman graphroot is
  `/home/vscode/.local/share/containers/storage`.
- the remote global Git name and email exactly match the resolved setup values.
- expected major tools are installed: Node 24, npm, .NET 8.0, Git, GitHub CLI,
  `btop`, Codex CLI, GitHub Copilot CLI, Docker CLI, Compose, Buildx, Podman,
  `podman-compose`, Python, `dotenv-linter`, Lychee, and Playwright.
- user lingering is enabled.
- managed Quadlet services are active.
- support ports are bound only to loopback.
- the Kong HSA route allows both HTTP and HTTPS.
- the HSA lookup route succeeds through Kong.
- `npm run db:setup`, `npm run db:health`, and the Playwright dry-run browser
  install check complete.

On failure, validation dumps listening sockets, user systemd environment,
failed units, service status and journals, Podman containers, Podman store,
networks, volumes, and managed container logs. Keep this diagnostic output
high-signal because it is the main feedback loop for remote bootstrap issues.

Do not make `npm run check` or `npm run test:integration` part of default VM
smoke validation. Those are optional confidence checks after the environment is
usable.

## Teardown Contract

`remove` discovers resources from live Azure and filters by ownership tags.
Deletion is intentionally resource-level rather than resource-group deletion so
a shared subscription can pre-create and retain the group.

The deletion order is computed from the resources selected for deletion. If a
resource cannot be deleted because another managed resource still references
it, fix the ordering or dependency handling instead of broadening the deletion
scope.

After Azure deletion, the tool removes the managed SSH config block and local
state. SSH keys are preserved unless the explicit cleanup switch is used. Logs
are preserved unless explicit log cleanup is requested.

Tailscale cleanup is best-effort and separate from Azure deletion. Azure
teardown should continue even when Tailscale device cleanup cannot be performed
automatically.

## Contributor Change Checklist

When changing Azure VM Remote SSH behavior:

- Update the user-facing development guide only for operator-visible workflow,
  configuration, command, cost, troubleshooting, or disk-layout changes.
- Update this internals document for module responsibilities, invariants,
  lifecycle flow, bootstrap behavior, validation coverage, or teardown safety.
- Keep `-WhatIf` read-only.
- Route new mutations through `ShouldProcess`.
- Route native commands through `Invoke-AzureDevNativeCommand` or document why
  not.
- Redact new secret-bearing values in command formatting, state, and logs.
- Update bootstrap and smoke validation together when changing host layout,
  Podman storage, support ports, or service startup order.
- Avoid adding tests that target `.ps1`, `.psm1`, or docs unless that policy is
  deliberately changed.

## Decision Inputs

The original design work is tracked in:

<!-- markdownlint-disable MD013 -->
- [Compare Ubuntu 24.04 and Rocky Linux for Azure VM base OS](https://github.com/viscalyx/Kravhantering/issues/432)
- [Choose secure connectivity model for Azure Remote SSH](https://github.com/viscalyx/Kravhantering/issues/433)
- [Choose Azure provisioning substrate and permissions model](https://github.com/viscalyx/Kravhantering/issues/434)
- [Define VM cost, size, region, and lifecycle guardrails](https://github.com/viscalyx/Kravhantering/issues/435)
- [Define host bootstrap parity with the devcontainer](https://github.com/viscalyx/Kravhantering/issues/436)
- [Design Podman topology for development support services](https://github.com/viscalyx/Kravhantering/issues/437)
- [Define operator configuration, credentials, and SSH integration contract](https://github.com/viscalyx/Kravhantering/issues/438)
- [Define idempotency, teardown, and state-safety contract](https://github.com/viscalyx/Kravhantering/issues/439)
- [Define validation and acceptance checks for the Azure development environment](https://github.com/viscalyx/Kravhantering/issues/440)
<!-- markdownlint-enable MD013 -->
