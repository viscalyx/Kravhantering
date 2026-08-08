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
  VM's immutable image reference or resolves the latest active Gen2 image from
  the configured Marketplace publisher, offer, and SKU for a new VM, resolves
  the live VM security state, creates or verifies the SSH key, preserves the
  immutable Azure VM infrastructure key, reconciles Trusted Launch when safe,
  converges the resource
  group and Bicep deployment, starts the VM when needed, waits for SSH, uploads
  templates, reruns bootstrap, runs smoke validation, writes state, and prints
  SSH instructions.
- When an existing VM's publisher, offer, or SKU differs from configuration,
  setup warns about immutable image drift, preserves the existing image and
  disks, and continues converging mutable resources. Eligible Gen1 VMs can be
  converted to Gen2 Trusted Launch, but the original Gen1 image reference
  remains.
- New VMs require a Trusted Launch-capable active Gen2 image and VM size. Bicep
  explicitly enables Trusted Launch, Secure Boot, and vTPM. Existing Standard
  Gen2 and eligible Canonical Marketplace Gen1 VMs are deallocated and upgraded
  after platform and read-only guest checks pass. When checks fail or Azure
  rejects an unchanged VM, setup warns, omits the Bicep security profile, and
  continues mutable repair. A successful Gen1 conversion is irreversible and
  Azure reimage must not be used because the retained source reference is Gen1.
- `setup` and `status` query the existing exact image version's Marketplace
  deprecation state. Scheduled, non-active, missing, or unavailable metadata
  produces a non-blocking warning; active metadata remains quiet.
- `start` starts the VM, refreshes SSH config, waits for SSH, and prints
  connection instructions.
- `stop` deallocates the VM.
- `status` reads Azure state plus local state and prints a compact status.
  The Azure portion includes image, Hyper-V generation, security type, Secure
  Boot, and vTPM.
- `add-cidr`, `set-cidr`, `list-cidrs`, and `remove-cidr` manage named,
  Azure-visible SSH sources without replacing another workstation's rules.
- `new-workstation-request` creates a destination-local key and a signed,
  ASCII-armored request for connect-only or management use without requiring
  Azure scope.
- `approve-workstation` verifies the request, adds its public key and CIDR, and
  creates a response package encrypted to the destination SSH public key.
- `extract-workstation-package` validates and extracts a package into one
  explicitly selected directory without applying workstation changes.
- `prepare-workstation-access` uses local-only direct-host checks for
  connect-only configuration and Azure prerequisites for management
  configuration.
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
4. Effective Git configuration for the local checkout, for Git identity and
   SSH signing.
5. Built-in defaults, which intentionally omit a Git identity.

`Get-AzureDevConfig` resolves `user.name` and `user.email` through the native
command wrapper only when the corresponding Azure Git identity value remains
empty after the environment overlays. Setup validates both values before any
Azure mutation, including during `setup -WhatIf`.

When `gpg.format=ssh` and `commit.gpgSign=true`, configuration also resolves
`user.signingKey`. It accepts an inline public key, a public-key file, or a
private-key path only when a matching `.pub` file exists. The
`AZURE_DEV_GIT_SSH_SIGNING_KEY` environment value overrides this lookup. The
resolved configuration contains public key material only.

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

The VM `securityProfile` is also conditional. Setup passes
`trustedLaunchEnabled=true` for new or compliant VMs and after a verified
upgrade. It passes `false` only for an existing VM whose Trusted Launch
eligibility could not be established, preventing an ordinary idempotent Bicep
repair from forcing an invalid or unsafe conversion. The desired profile is
`TrustedLaunch` with both `secureBootEnabled` and `vTpmEnabled` set to `true`.

## SSH And Connectivity

`public-ssh` is the default connectivity mode. The initial workstation detects
its current public IPv4 address and converts it to a named `/32` rule. The
optional setup `-Cidr` parameter overrides detection. Each managed NSG rule has
one CIDR, a reserved priority from `2000` through `2063`, and a description
containing the schema version, workstation, and access-source names. Azure is
the shared source of truth. Setup reads the live managed rules and passes the
complete array to Bicep so local ignored files cannot erase another
workstation's access.

Explicit `/24` through `/31` networks require an approval switch. Private and
reserved IPv4 ranges, ranges broader than `/24`, `0.0.0.0/0`, and `::/0`
remain blocked. Duplicate CIDRs are allowed because multiple workstations can
share one NAT address.

The managed OpenSSH block is bounded by markers and is the only part of
`~/.ssh/config` the tool may change. The block uses the configured host alias,
the `vscode` user, `IdentitiesOnly yes`, `ForwardAgent yes`, the configured
private key, and the local forwards documented in the development guide. It
also contains `SendEnv` entries for `GH_TOKEN` and
`COPILOT_GITHUB_TOKEN`; both token values remain in the workstation
environment and are never written to the managed block.

The readiness command checks token presence only in its current PowerShell
process. It does not inspect Zsh, Bash, or other shell startup files. Missing
tokens are acceptable when another shell that contains them starts the VS Code
Remote SSH session.

The setup and start connection output explains that `GH_TOKEN` and
`COPILOT_GITHUB_TOKEN` must exist in the workstation environment that launches
VS Code. It must never read the values, include them in terminal or log output,
or store them.

Forwarded values are readable by processes in the destination `vscode` user's
Remote SSH process tree. The workflow must require trusted VMs and workspaces
and short-lived, least-privilege tokens.

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

## Workstation Transfer Security

`AzureDev.Workstation.psm1` owns workstation names, CIDR policy, destination
key requests, guest-key registration, encrypted response packages, defensive
extraction, and readiness reporting.

Workstation-scoped commands derive their default name from
`System.Environment.MachineName`, normalize it for the Azure rule name, and
accept `-WorkstationName` as an optional override. The workstation name is not
stored in an environment file.

Request and package schemas roll forward together. Schema 3 rejects every
older request or package with regeneration instructions; there is no
compatibility parser or legacy default. The request is canonical JSON wrapped
in an ASCII-armored Base64 envelope. It contains no secret or private key and
binds `intendedUse` to `connect-only` or `manage-environment`. It also binds the
absolute destination-generated private-key path and the configured approver
public-key fingerprint. Approval copies the destination path into the manifest
and packaged local configuration without resolving the approver's home
directory.
`ssh-keygen -Y sign` signs the payload with namespace
`kravhantering-workstation-request`; approval verifies that signature against
the embedded public key. This proves possession and detects corruption. It
does not authenticate a fully replaced request, so the human fingerprint and
verification-code comparison remains mandatory.

Immediately before the armor, request output tells the user to retain the
workstation, CIDR, destination private-key path, public-key fingerprint, and
verification code. The fingerprint and code support out-of-band request
replacement detection. The remaining values confirm approval and configure
the returned package. No receipt or summary artifact is created.

Approval displays and honors the signed intended use. It rejects Tailscale
before package or environment mutation because transfer supports public SSH
only. Before prerequisites, VM state changes, package creation, or access
mutation, it requires the public half of the managed VM SSH identity to match
the approver fingerprint bound into the request. A requested mode change or
approver-key rotation requires a new signed request.

The response package is a ZIP payload encrypted with `age` to the destination
workstation's SSH public key. Approval signs the exact encrypted bytes with
`ssh-keygen -Y sign` under namespace `kravhantering-workstation-package`, then
emits the payload and detached SSH signature in one ASCII-armored `.kravpkg`
envelope. The approval key is the managed `AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH`
identity; Git commit-signing identities are unrelated.

The destination provisions the expected approval public-key file through a
trusted channel and records its ignored local path in
`AZURE_DEV_WORKSTATION_APPROVER_PUBLIC_KEY_PATH`. This configured key is the
sole trust anchor. Extraction parses the schema-3 envelope, verifies its
fingerprint and signature over the exact encrypted bytes, and only then invokes
`age` or opens archive content. Envelope key material cannot replace the
configured key. Missing configuration, legacy native `.age` input, malformed
armor or signatures, signature or payload changes, and key mismatch fail
before decryption and destination creation. Temporary encrypted and decrypted
files are removed on every failure. Rotation invalidates pending requests and
responses; provisioning the new public key and regenerating both artifacts is
the recovery path.

A compatible `age` 1.2.1 or later must be installed manually and available on
`PATH`. The module validates the installed version but never downloads,
installs, or manages the tool. Decryption auto-detects the armored input.

The manifest binds the package to the request ID, workstation, intended use,
environment, fixed public host, destination private-key path, destination
public-key fingerprint, verified approver fingerprint, and 24-hour expiry. The
manifest approver fingerprint must equal the identity that verified the outer
envelope. Entry names are an allowlist.
Extraction rejects rooted paths, backslashes, `..`, duplicates, undeclared
entries, missing declared entries, oversized entries, unsupported schemas, and
expired packages. It extracts only into a new user-selected directory. On
Unix-like systems the workflow applies user-only permissions. On Windows it
removes inherited access rules, grants only the current user full control, and
validates the protected ACL before writing package contents. Extraction stops
and removes the destination if that protection cannot be confirmed.

A connect-only payload omits `.env.azure.development`. Its minimal local file
contains only `AZURE_DEV_VM_CONNECTIVITY_MODE`,
`AZURE_DEV_VM_SSH_HOST_ALIAS`, `AZURE_DEV_VM_SSH_HOST_NAME`, and
`AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH`. The fixed host bypasses Azure only for
`ssh-config` and `prepare-workstation-access`. All lifecycle, status, CIDR,
setup, and removal commands retain their Azure scope and sign-in requirements.

A manage-environment payload retains the complete primary file. Packaging
offers the complete local file as an explicit opt-in but never edits the
source. The packaged copy deterministically replaces duplicate subscription
and private-key assignments with the manifest subscription and destination
private-key path. When the complete local file is declined or absent, packaging
generates a minimal file containing those two required values.

`GH_TOKEN` and `COPILOT_GITHUB_TOKEN` are independent approver opt-ins in both
modes and are excluded by default. The custom ignored Zsh template is offered
only for manage-environment.

Private Git signing keys never enter workstation packages. If the approver
selects signing, approval queries the running VM's actual global
`user.signingkey`, normalizes an inline `key::` public key, and rejects absent
or malformed values. Only the public key and SHA-256 fingerprint enter
`reference/`; the manifest records that signing is required. The destination
must restore the corresponding private key externally and expose the matching
public key through `ssh-add -L`. This preserves the single VM signing identity
and forwarded-agent design.

The extractor never applies destination configuration. It creates a
destination-specific `README.md` with exact absolute source and destination
paths and PowerShell 7 commands. Existing primary files use `code --diff`;
existing local files receive exact manual assignments and are never
overwritten. Management instructions include tenant login and subscription
selection. Secret values remain in separate files and never enter the README,
logs, or terminal output. On Windows they inherit the validated user-only ACL
from the extraction directory.

Host-key comparison remains mandatory. The generated installation block
creates `.ssh` and `known_hosts`, appends only missing source lines, preserves
unrelated entries, is safe to rerun, and applies private permissions where
supported. Readiness normalizes nonblank entries and requires every packaged
entry for the fixed host to occur with the same host, key type, and key
material in the user's installed file. A hostname-only match cannot pass. A
managed block with a fixed direct host uses `StrictHostKeyChecking yes`. Direct
connection never queries Azure, emits a placeholder, or falls back to
`accept-new`. Address or host-key changes require a new signed request and
package.

The entry script reads the extracted manifest before configuration validation.
A connect-only manifest selects focused partial readiness validation, so
missing local direct-host fields remain reportable and never trigger Azure
prerequisites. Direct readiness reports the configured host and alias, private
key, verified `known_hosts` entries, exact managed block, token warnings, and
selected signing key. It does not call Azure prerequisites, start or contact
the VM, launch VS Code, or inspect other shells. Missing required SSH,
configuration, host-key, or signing state causes an unsuccessful exit.
Management readiness retains Azure prerequisite checks.

Approval creates the encrypted response before changing access. A failure
removes the invalid response and a newly created CIDR rule. A stopped VM starts
only after approval and returns to its original power state in `finally`.
Package content controls transferred configuration only; Azure RBAC remains
the authorization boundary.

Guest bootstrap writes
`/etc/ssh/sshd_config.d/00-kravhantering-root-login.conf` with
`PermitRootLogin no` and
`/etc/ssh/sshd_config.d/01-kravhantering-environment.conf` with
`AcceptEnv GH_TOKEN COPILOT_GITHUB_TOKEN`. It validates the complete OpenSSH
configuration, the effective root-specific policy, and the narrowly scoped
GitHub environment policy before reloading `ssh.service`. Direct root SSH is
unavailable; operators connect as `vscode` and use passwordless `sudo`. Azure
control-plane operations and agent- or console-based recovery remain
independent of this OpenSSH restriction. Rerun setup after any recovery action
that resets or rewrites guest SSH configuration.

## Guest Bootstrap

`AzureDev.Bootstrap.psm1` uploads the current local bootstrap script, Quadlet
templates, Zsh profile, and development-tooling files to `/tmp` on the VM,
waits for cloud-init when available, and runs:

<!-- markdownlint-disable MD013 -->

```text
sudo env AZURE_DEV_QUADLET_SOURCE=/tmp/krav-azure-dev/quadlet AZURE_DEV_ZSHRC_SOURCE=/tmp/krav-azure-dev/zshrc AZURE_DEV_CODEX_CONFIG_SOURCE=/tmp/krav-azure-dev/tooling/codex-config.toml AZURE_DEV_CODEX_CONFIG_MERGER=/tmp/krav-azure-dev/tooling/merge-codex-config.py AZURE_DEV_CODEX_INSTALLER=/tmp/krav-azure-dev/tooling/install-codex.sh AZURE_DEV_DOTENV_LINTER_INSTALLER=/tmp/krav-azure-dev/tooling/install-dotenv-linter.sh AZURE_DEV_ROLLING_GIT_INSTALLER=/tmp/krav-azure-dev/tooling/install-rolling-git-source.sh AZURE_DEV_APT_KEY_VERIFIER=/tmp/krav-azure-dev/tooling/verify-apt-key.sh AZURE_DEV_GIT_USER_NAME='<full-name>' AZURE_DEV_GIT_USER_EMAIL='<email-address>' AZURE_DEV_GIT_SSH_SIGNING_PUBLIC_KEY='<public-key>' bash /tmp/krav-bootstrap-host.sh
```

<!-- markdownlint-enable MD013 -->

The Git identity and public signing-key values are shell-quoted before being
added to the bootstrap command. Bootstrap writes them to
`/home/vscode/.gitconfig` with `git config --global` while running as `vscode`;
it does not alter the workstation configuration. It stores the signing key as
an inline `key::` public key, enables SSH commit signing, and unsets
`gpg.ssh.program` so a workstation-specific executable path cannot break the
Linux guest.

The ignored `scripts/azure-dev/templates/zshrc.template` is the local override.
When it is absent, setup uploads the tracked
`scripts/azure-dev/templates/zshrc.template.example`. Bootstrap installs the
selected file as `/home/vscode/.zshrc`. Oh My Zsh, `zsh-autosuggestions`,
`zsh-syntax-highlighting`, and Powerlevel10k are four separate rolling Git
channels. Every new installation resolves each current main branch to an exact
Git object, verifies the checkout, and records the resolved object in bootstrap
output. These upstream branches do not provide a consistently signed rolling
head, so ADR 0045 explicitly accepts the publisher-authenticity exception for
each channel. The object is not pinned in the repository; a later new
installation resolves the then-current branch again. The rolling-source tests
exercise the shared fail-closed resolution and checkout control.

Bootstrap installs Bubblewrap and the Ubuntu 24.04
`bwrap-userns-restrict` AppArmor profile, then proves that the `vscode` user
can create the user, PID, and network namespaces Codex requires. It does not
disable `kernel.apparmor_restrict_unprivileged_userns` globally.

Bootstrap installs Codex CLI with OpenAI's non-interactive standalone installer
under `/usr/local/lib/codex` and exposes `codex` through `/usr/local/bin`. It
resolves the current release metadata and verifies the upstream SHA-256 digest
for `install.sh` before execution. Missing or mismatched integrity evidence
stops bootstrap. The devcontainer build uses the same verified installer
helper. The shared dotenv-linter helper applies the same fail-closed release-
asset digest contract. Bootstrap configures NodeSource and Tailscale directly
as signed APT repositories instead of executing their setup scripts. It
verifies the NodeSource, Docker, GitHub CLI, and Tailscale trust roots against
reviewed primary fingerprints before APT uses them. Bootstrap installs GitHub
Copilot CLI globally from the `@github/copilot` npm package. This rolling
channel relies on the npm registry's SRI metadata and npm's package-integrity
verification, as approved by ADR 0045. Both installers converge to their
current stable releases on every setup run.

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

Repository setup installs the exact npm version declared by root
`package.json`, then uses `npm install`, not `npm ci`, to match the current
devcontainer behavior. If deterministic dependency installation becomes a
requirement, change the devcontainer and Azure VM bootstrap together.

## Storage Invariants

The development guide contains the human-readable disk tree. The contributor
contract is:

- `/mnt/krav-azure-dev-data` is the Azure data disk mount.
- `/workspace` is a bind mount to the data disk and contains the repository.
- `/var/lib/krav-azure-dev` is a bind mount to the data disk and contains host
  state owned by this feature.
- `/home/vscode/.local/share/containers/storage` is a bind mount to the data
  disk and is the rootless Podman graphroot.
- `/var/lib/docker` and `/var/lib/containerd` are bind mounts to the data disk.
- `/home/vscode/.vscode-server`, `/home/vscode/.codex`, and
  `/home/vscode/.cache` keep their expected paths through data-disk bind mounts.
- `/var/tmp/krav-vscode` is the data-backed `TMPDIR`, `TMP`, and `TEMP` for the
  `vscode` shell, bootstrap commands, and user systemd environment.
- Root and `vscode` npm processes use separate caches on the data disk.
- `/home/vscode` itself remains on the OS disk.
- Managed development storage has no silent OS-disk fallback.

`bootstrap-host.sh` formats `/dev/disk/azure/scsi1/lun0` as ext4 only when the
device has no filesystem. It rewrites only the managed data mount and bind-mount
entries. Before adding a new bind mount, bootstrap stops the affected container
services and moves existing target contents only when the data-disk source is
empty. Conflicting non-empty source and target directories fail setup. It
removes `lost+found` from the exposed roots and restores directory ownership.

Rootless Podman is configured with:

```text
graphroot = "/home/vscode/.local/share/containers/storage"
rootless_storage_path = "/home/vscode/.local/share/containers/storage"
```

That path is deliberately the normal rootless location from Podman's point of
view. The data disk is introduced underneath it with a bind mount. This avoids
Netavark and rootless networking issues that can appear when graphroot is moved
to an unusual system path.

The two local HSA image builds share a guarded recovery path for persisted
Podman image-layer corruption. A failed build is retried only when its output
contains Podman's `layer not known` or local-image corruption diagnostics.
Bootstrap prunes external layer remnants and unused containers, images,
networks, and build cache before rebuilding both HSA images with `--no-cache`.
The recovery never passes `--volumes`; named support-service data remains
intact.

The shared HSA Dockerfiles retain the same Node base tag and digest in Azure
development and release builds. This keeps the support stack aligned with the
released HSA artifacts.

When changing storage behavior, update bootstrap and smoke validation together.
Validation must prove that the data mount source is the Azure data disk and
that every managed bind mount and npm cache is on the same device as the
data-disk mount. It also verifies the managed npm cache and storage-report
commands through the `vscode` environment.

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
last known named SSH CIDRs, and last validation status. Destructive paths must
verify live Azure resources instead of trusting this file.

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
- the effective OpenSSH environment policy accepts `GH_TOKEN` and
  `COPILOT_GITHUB_TOKEN`.
- Bubblewrap can create the unprivileged network namespace used by Codex.
- `/home/vscode/.codex/config.toml` selects the managed
  `kravhantering-azure-dev` profile while preserving unrelated user settings.
- `/workspace` exists, is owned by `vscode`, and contains the repo.
- the data disk, `/workspace`, host state, and rootless Podman storage are
  mounted as described in the storage invariants.
- rootless Podman graphroot is
  `/home/vscode/.local/share/containers/storage`.
- the remote global Git name and email exactly match the resolved setup values.
- when SSH signing is configured, the forwarded agent contains the selected
  key and Git can create a temporary signed commit.
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
