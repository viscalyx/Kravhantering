#requires -Version 7.0
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Position = 0)]
  [ValidateSet(
    'add-cidr',
    'approve-workstation',
    'cleanup-workstation-package',
    'estimate-cost',
    'extract-workstation-package',
    'list-cidrs',
    'list-workstations',
    'new-workstation-request',
    'prepare-workstation-access',
    'remove',
    'remove-cidr',
    'remove-workstation',
    'set-cidr',
    'setup',
    'ssh-config',
    'start',
    'status',
    'stop'
  )]
  [string]$Command = 'status',

  [string]$RepositoryRoot,

  [string]$EnvironmentFile = '.env.azure.development',

  [string]$WorkstationName,

  [ValidateSet('connect-only', 'manage-environment')]
  [string]$IntendedUse,

  [string]$AccessName = 'current',

  [string]$Cidr,

  [string]$RequestPath,

  [string]$OutputPath,

  [string]$PackagePath,

  [string]$DestinationPath,

  [switch]$AllowNetworkCidr,

  [switch]$ForceRecovery,

  [switch]$Yes,

  [switch]$AdoptResourceGroup,

  [switch]$ForceUnlock,

  [switch]$Apply,

  [switch]$CleanupLogs,

  [switch]$CleanupKeys,

  [switch]$SkipSshConfig,

  [switch]$SkipSmokeValidation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
  $RepositoryRoot = Split-Path -Parent $scriptRoot
}
$moduleRoot = Join-Path $scriptRoot 'azure-dev'
foreach ($module in @(
  'AzureDev.Config.psm1',
  'AzureDev.Logging.psm1',
  'AzureDev.Azure.psm1',
  'AzureDev.Ssh.psm1',
  'AzureDev.Bootstrap.psm1',
  'AzureDev.Validation.psm1',
  'AzureDev.Podman.psm1',
  'AzureDev.Workstation.psm1'
)) {
  Import-Module (Join-Path $moduleRoot $module) -Force -Verbose:$false
}

function Test-AzureDevApproval {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$Action
  )

  if ($Context.Yes -or $WhatIfPreference) {
    return $true
  }

  $answer = Read-Host "$Action Type YES to continue"
  if ($answer -ne 'YES') {
    throw 'Operation cancelled.'
  }
  return $true
}

function Write-AzureDevCostSummary {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [AllowNull()]
    [pscustomobject]$Image,

    [AllowNull()]
    [pscustomobject]$DataDisk
  )

  $subscription = if ([string]::IsNullOrWhiteSpace($Context.Config.SubscriptionId)) {
    '<not configured>'
  } else {
    $Context.Config.SubscriptionId
  }
  $resourceGroup = if ([string]::IsNullOrWhiteSpace($Context.Config.ResourceGroup)) {
    '<not configured>'
  } else {
    $Context.Config.ResourceGroup
  }
  $imageUrn = if ($null -ne $Image -and -not [string]::IsNullOrWhiteSpace($Image.urn)) {
    $Image.urn
  } else {
    (
      "$($Context.Config.ImagePublisher):$($Context.Config.ImageOffer):" +
      "$($Context.Config.ImageSku):latest, resolved during setup"
    )
  }
  $dataDiskSize = if (
    $null -ne $DataDisk -and
    [int]$DataDisk.diskSizeGB -gt $Context.Config.DataDiskGiB
  ) {
    "$([int]$DataDisk.diskSizeGB) GiB Premium SSD " +
      "(configured $($Context.Config.DataDiskGiB) GiB; existing disk preserved)"
  } elseif (
    $null -ne $DataDisk -and
    [int]$DataDisk.diskSizeGB -lt $Context.Config.DataDiskGiB
  ) {
    "$($Context.Config.DataDiskGiB) GiB Premium SSD " +
      "(currently $([int]$DataDisk.diskSizeGB) GiB; expansion planned)"
  } else {
    "$($Context.Config.DataDiskGiB) GiB Premium SSD"
  }

  Write-Host 'Azure VM development environment cost summary'
  Write-Host "  Subscription: $subscription"
  Write-Host "  Resource group: $resourceGroup"
  Write-Host "  Location: $($Context.Config.Location)"
  Write-Host "  VM size: $($Context.Config.VmSize)"
  Write-Host "  OS disk: managed Premium SSD"
  Write-Host "  Data disk: $dataDiskSize"
  Write-Host "  Static public IP: $($Context.Config.ConnectivityMode -eq 'public-ssh')"
  Write-Host "  Auto-shutdown: $($Context.Config.AutoStopEnabled) at $($Context.Config.AutoStopTime) $($Context.Config.AutoStopTimeZone)"
  Write-Host "  Image: $imageUrn"
  Write-Host '  Not estimated here: bandwidth, snapshots, logs, taxes, and current regional pricing.'
  Write-Host '  Deallocation stops compute charges, but disks and public IPs can still bill.'
  Write-Host '  Running remove is the full managed-resource cost stop.'
}

function Write-AzureDevCostEstimate {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  Write-AzureDevCostSummary -Context $Context -Image $null -DataDisk $null
  Write-Host ''
  Write-Host 'This command reads local configuration only. It does not call Azure CLI,'
  Write-Host 'validate subscription access, check SKU availability, or create resources.'
  Write-Host 'Use the Azure Pricing Calculator for current region-specific prices.'
}

function Get-AzureDevHostName {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  if (
    $Context.Config.ConnectivityMode -eq 'public-ssh' -and
    -not [string]::IsNullOrWhiteSpace($Context.Config.SshHostName)
  ) {
    return $Context.Config.SshHostName
  }

  $state = Get-AzureDevState -Context $Context
  if (
    $Context.Config.ConnectivityMode -eq 'tailscale' -and
    $null -ne $state -and
    -not [string]::IsNullOrWhiteSpace($state.tailscaleTarget)
  ) {
    return $state.tailscaleTarget
  }

  if (
    $null -ne $state -and
    -not [string]::IsNullOrWhiteSpace($state.publicIp)
  ) {
    return $state.publicIp
  }

  $publicIp = Get-AzureDevPublicIpAddress -Config $Context.Config
  if (-not [string]::IsNullOrWhiteSpace($publicIp)) {
    return $publicIp
  }

  return '<public-ip-or-tailscale-name>'
}

function Write-AzureDevSshInstructions {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  $hostName = Get-AzureDevHostName -Context $Context
  $identityFile = $Context.Config.SshPrivateKeyPath
  Write-Host 'For administration tasks, connect using standard SSH:'
  Write-Host (
    "ssh -i `"$identityFile`" -o IdentitiesOnly=yes " +
    '-o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=none ' +
    "-o UserKnownHostsFile=`"$($Context.Config.SshKnownHostsPath)`" " +
    '-o KnownHostsCommand=none -o VerifyHostKeyDNS=no -o UpdateHostKeys=no ' +
    "-o SendEnv=GH_TOKEN -o SendEnv=COPILOT_GITHUB_TOKEN vscode@$hostName"
  )

  Write-Host ''
  Write-Host 'GitHub authentication for the remote development environment:'
  Write-Host (
    '  The managed SSH configuration forwards GH_TOKEN for Codex and ' +
    'COPILOT_GITHUB_TOKEN for GitHub Copilot CLI.'
  )
  Write-Host (
    '  Set both variables from the workstation secure credential store in the ' +
    'environment that launches VS Code.'
  )
  Write-Host '  For SAML SSO authorization instructions, see:'
  Write-Host '    docs/development/azure-vm-remote-ssh-development.md#prepare-github-authentication'
  Write-Host (
    '  Then start a new Remote SSH connection. Do not display the value of ' +
    'either token in terminal output or logs.'
  )

  $codeCommand = Get-AzureDevCodeCommand -Context $Context
  Write-Host ''
  Write-Host 'Use this to start a development environment:'
  if ($null -ne $codeCommand) {
    Write-Host $codeCommand
  }

  Write-Host ''
  Write-Host 'VS Code extensions: choose one installation option:'
  Write-Host (
    '  1. For automatic installation on every Remote SSH host, set the local ' +
    'VS Code User setting remote.SSH.defaultExtensions to the active recommendations ' +
    'in repository file:'
  )
  Write-Host '     .vscode/extensions.json'
  Write-Host '  2. For this remote workspace only, connect first and then run:'
  Write-Host '     Extensions: Install Workspace Recommended Extensions'

  if ($null -ne $codeCommand) {
    Write-Host ''
    Write-Host (
      'Optional: after VS Code connects, open its integrated terminal and run ' +
      'p10k configure to customize the prompt.'
    )
  }
}

function Get-AzureDevDeploymentSshPublicKey {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$LocalSshPublicKey
  )

  $existingKeys = Get-AzureDevVmAdminSshPublicKeys -Config $Context.Config
  if (@($existingKeys).Count -eq 0) {
    return $LocalSshPublicKey
  }

  # Azure keeps the original osProfile key immutable. Additional workstation
  # keys live in the guest authorized_keys file, so setup preserves the live
  # infrastructure key instead of requiring every workstation to possess it.
  return [string](@($existingKeys) | Select-Object -First 1)
}

function Get-AzureDevSetupSshAccessRules {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$InitialCidr,

    [Parameter(Mandatory = $true)]
    [string]$WorkstationName
  )

  if ($Context.Config.ConnectivityMode -ne 'public-ssh') {
    return @()
  }
  $liveRules = @(Get-AzureDevSshAccessRules -Config $Context.Config)
  if ($liveRules.Count -gt 0) {
    return $liveRules
  }

  return @(
    New-AzureDevSshAccessRuleSpec `
      -WorkstationName $WorkstationName `
      -AccessName 'current' `
      -Cidr $InitialCidr
  )
}

function Wait-AzureDevTrustedLaunchGuestReadiness {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$Plan,

    [int]$TimeoutSeconds = 300,

    [switch]$NonBlocking
  )

  $commands = @(
    'set -eu',
    (
      'if find "/lib/modules/$(uname -r)/updates/dkms" -type f ' +
      '-print -quit 2>/dev/null | grep -q .; then echo ' +
      '"DKMS kernel modules require manual Secure Boot validation"; exit 44; fi'
    )
  )
  if ($Plan.Action -eq 'UpgradeGen1') {
    $commands += @(
      'sudo -n true',
      'boot_source="$(df --output=source /boot | tail -n 1 | xargs)"',
      'boot_parent="$(lsblk -no PKNAME "$boot_source" | head -n 1 | xargs)"',
      (
        'if [ -z "$boot_parent" ]; then echo "Could not identify the boot ' +
        'disk"; exit 41; fi'
      ),
      'boot_device="/dev/$boot_parent"',
      'partition_table="$(sudo blkid "$boot_device" -o value -s PTTYPE)"',
      (
        'if [ "$partition_table" != "gpt" ]; then echo "Boot disk is not ' +
        'GPT"; exit 42; fi'
      ),
      (
        'if ! sudo fdisk -l "$boot_device" | grep -qi "EFI System"; then ' +
        'echo "EFI system partition is missing"; exit 43; fi'
      ),
      (
        'if ! grep -qsE "^[^#]+[[:space:]]+/boot/efi[[:space:]]+" ' +
        '/etc/fstab; then echo "/boot/efi is missing from /etc/fstab"; ' +
        'exit 45; fi'
      )
    )
  }
  $commands += 'echo AZURE_DEV_TRUSTED_LAUNCH_READY'

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastReason = ''
  do {
    $arguments = [System.Object[]]@(
      '-o',
      'BatchMode=yes',
      '-o',
      'ClearAllForwardings=yes',
      '-o',
      'ConnectTimeout=15'
    )
    $arguments += $Context.Config.SshHostKeyArguments
    $arguments += [System.Object[]]@(
      $Context.Config.SshHostAlias,
      ($commands -join '; ')
    )
    $result = Invoke-AzureDevNativeCommand `
      -FilePath 'ssh' `
      -Arguments $arguments
    if (
      $result.ExitCode -eq 0 -and
      $result.Text -match 'AZURE_DEV_TRUSTED_LAUNCH_READY'
    ) {
      return [pscustomobject]@{
        Ready = $true
        Reason = $null
      }
    }
    $lastReason = $result.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($lastReason)) {
      $lastReason = "SSH readiness check exited with code $($result.ExitCode)."
    }
    Start-Sleep -Seconds 10
  } while ((Get-Date) -lt $deadline)

  if ($NonBlocking) {
    return [pscustomobject]@{
      Ready = $false
      Reason = $lastReason
    }
  }
  $generationRecovery = if ($Plan.Action -eq 'UpgradeGen1') {
    (
      'A Gen1-to-Gen2 conversion cannot be rolled back in place. Restore the ' +
      'pre-upgrade VM or disks from backup if the VM cannot be recovered.'
    )
  } else {
    (
      'If unsigned boot components are responsible, disable Secure Boot in ' +
      'Azure, repair or replace those components, and validate before retrying.'
    )
  }
  throw (
    'Azure enabled Trusted Launch, but the VM did not return a successful SSH ' +
    "readiness check within $TimeoutSeconds seconds. Last result: " +
    "$lastReason $generationRecovery"
  )
}

function Set-AzureDevSetupState {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$SshAccessRules,

    [AllowNull()]
    [object]$DeploymentResult,

    [Parameter(Mandatory = $true)]
    [string]$ValidationStatus
  )

  $outputs = Get-AzureDevDeploymentOutputs -DeploymentResult $DeploymentResult
  $publicIp = Get-AzureDevPublicIpAddress -Config $Context.Config
  $state = [ordered]@{
    setupVersion = $Context.Config.SetupVersion
    subscriptionId = $Context.Config.SubscriptionId
    resourceGroup = $Context.Config.ResourceGroup
    vmName = $Context.Config.VmName
    publicIp = $publicIp
    tailscaleTarget = $null
    sshHostAlias = $Context.Config.SshHostAlias
    sshPrivateKeyPath = $Context.Config.SshPrivateKeyPath
    sshPublicKeyPath = $Context.Config.SshPublicKeyPath
    deploymentOutputs = $outputs
    lastKnownAllowedCidrs = @($SshAccessRules | ForEach-Object {
        [ordered]@{
          workstation = $_.workstation
          access = $_.access
          cidr = $_.cidr
        }
      })
    lastValidationStatus = $ValidationStatus
  }
  Set-AzureDevState -Context $Context -State $state
}

function Invoke-AzureDevSetup {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [string]$CidrOverride,

    [Parameter(Mandatory = $true)]
    [string]$WorkstationName,

    [switch]$AllowNetworkCidr
  )

  Assert-AzureDevTerminalFontInstalled
  Test-AzureDevGitIdentity -Config $Context.Config

  if (-not $WhatIfPreference) {
    Test-AzureDevBootstrapSecrets -Config $Context.Config
  }

  if (-not $WhatIfPreference) {
    New-AzureDevLock -Context $Context -CommandName 'setup'
  }

  try {
    Test-AzureDevPrerequisites `
      -Context $Context `
      -WhatIf:$WhatIfPreference
    $allowedCidr = $null
    $sshAccessRules = if (
      $Context.Config.ConnectivityMode -eq 'public-ssh'
    ) {
      $allowedCidr = Get-AzureDevWorkstationCidr `
        -Cidr $CidrOverride `
        -AllowNetwork:$AllowNetworkCidr
      @(
        Get-AzureDevSetupSshAccessRules `
          -Context $Context `
          -InitialCidr $allowedCidr `
          -WorkstationName $WorkstationName
      )
    } else {
      @()
    }

    if ($WhatIfPreference) {
      $publicKey = if (Test-Path -LiteralPath $Context.Config.SshPublicKeyPath) {
        Get-AzureDevSshPublicKey -Config $Context.Config
      } else {
        Get-AzureDevPlaceholderPublicKey
      }
    } else {
      New-AzureDevSshKey -Config $Context.Config
      $publicKey = Get-AzureDevSshPublicKey -Config $Context.Config
    }
    $deploymentPublicKey = Get-AzureDevDeploymentSshPublicKey `
      -Context $Context `
      -LocalSshPublicKey $publicKey

    $image = Get-AzureDevDeploymentImage -Config $Context.Config
    $trustedLaunchPlan = Get-AzureDevTrustedLaunchPlan `
      -Config $Context.Config
    if ($WhatIfPreference -and $trustedLaunchPlan.RequiresGuestValidation) {
      Write-Host (
        'Trusted Launch preview: live guest validation is skipped during ' +
        '-WhatIf. The preview preserves the Azure metadata-based plan and ' +
        'assumes the guest readiness checks will pass during setup.'
      )
    }
    if ($trustedLaunchPlan.Action -eq 'Unsupported') {
      Write-Warning (
        "Existing VM $($Context.Config.VmName) cannot be changed automatically " +
        "to Trusted Launch with Secure Boot and vTPM: " +
        "$($trustedLaunchPlan.Reason) Setup will omit the security profile, " +
        'preserve the current VM and disks, and continue repairing mutable ' +
        'configuration.'
      )
    } elseif (
      $trustedLaunchPlan.Action -in @(
        'EnableFeatures',
        'UpgradeGen2',
        'UpgradeGen1'
      )
    ) {
      $conversionText = if ($trustedLaunchPlan.Action -eq 'UpgradeGen1') {
        ' This irreversibly converts the VM from Gen1 to Gen2; Azure retains ' +
          'the original Gen1 Marketplace image reference.'
      } else {
        ''
      }
      Write-Warning (
        "Existing VM $($Context.Config.VmName) will be deallocated to enable " +
        "Trusted Launch, Secure Boot, and vTPM.$conversionText Take a backup " +
        'or restore point first if its OS disk contains anything that cannot ' +
        'be recreated.'
      )
    }
    $dataDisk = Get-AzureDevDataDisk -Config $Context.Config
    $dataDiskExists = $null -ne $dataDisk
    Write-AzureDevCostSummary `
      -Context $Context `
      -Image $image `
      -DataDisk $dataDisk
    $approvalAction = if ($trustedLaunchPlan.Action -eq 'UpgradeGen1') {
      (
        "Irreversibly convert $($Context.Config.VmName) from Gen1 to Gen2 " +
        'Trusted Launch, then create or update Azure VM resources.'
      )
    } elseif (
      $trustedLaunchPlan.Action -in @('EnableFeatures', 'UpgradeGen2')
    ) {
      (
        "Deallocate $($Context.Config.VmName), enable Trusted Launch, Secure " +
        'Boot, and vTPM, then create or update Azure VM resources.'
      )
    } else {
      'Create or update Azure VM resources.'
    }
    Test-AzureDevApproval `
      -Context $Context `
      -Action $approvalAction | Out-Null

    New-AzureDevResourceGroup `
      -Context $Context `
      -WhatIf:$WhatIfPreference

    if (
      $trustedLaunchPlan.Action -in @(
        'EnableFeatures',
        'UpgradeGen2',
        'UpgradeGen1'
      )
    ) {
      if ($WhatIfPreference) {
        Write-Host (
          "Trusted Launch preview: would deallocate " +
          "$($Context.Config.VmName) and enable TrustedLaunch, Secure Boot, " +
          'and vTPM before deployment.'
        )
      } else {
        $guestReadiness = if ($Context.SkipSshConfig) {
          [pscustomobject]@{
            Ready = $false
            Reason = (
              'Trusted Launch validation requires the managed SSH alias. ' +
              'Rerun setup without -SkipSshConfig to enable conversion.'
            )
          }
        } else {
          Start-AzureDevAzureVm -Context $Context
          $trustedLaunchHostName = Get-AzureDevHostName -Context $Context
          $sshConfigApplied = Set-AzureDevManagedSshConfig `
            -Context $Context `
            -HostName $trustedLaunchHostName
          if (-not $sshConfigApplied) {
            throw (
              'Setup cannot validate Trusted Launch until the managed SSH ' +
              'config is applied. Rerun setup with -Apply or -Yes.'
            )
          }
          Wait-AzureDevSsh `
            -Context $Context `
            -HostName $trustedLaunchHostName | Out-Null
          Wait-AzureDevTrustedLaunchGuestReadiness `
            -Context $Context `
            -Plan $trustedLaunchPlan `
            -NonBlocking
        }
        if (-not $guestReadiness.Ready) {
          $trustedLaunchPlan.Action = 'Unsupported'
          $trustedLaunchPlan.TemplateEnabled = $false
          $trustedLaunchPlan.RequiresGuestValidation = $false
          $trustedLaunchPlan.Reason = (
            'Guest readiness validation did not pass: ' +
            $guestReadiness.Reason
          )
          Write-Warning (
            "Existing VM $($Context.Config.VmName) cannot be changed " +
            'automatically to Trusted Launch with Secure Boot and vTPM: ' +
            "$($trustedLaunchPlan.Reason) Setup will omit the security " +
            'profile, preserve the current VM and disks, and continue ' +
            'repairing mutable configuration.'
          )
        } else {
          $trustedLaunchResult = Set-AzureDevTrustedLaunch `
            -Context $Context `
            -Plan $trustedLaunchPlan
          $trustedLaunchPlan.State = $trustedLaunchResult.State
          $trustedLaunchPlan.TemplateEnabled = $trustedLaunchResult.Succeeded
          if ($trustedLaunchResult.Succeeded) {
            Start-AzureDevAzureVm -Context $Context
            Wait-AzureDevSsh `
              -Context $Context `
              -HostName $trustedLaunchHostName | Out-Null
            Wait-AzureDevTrustedLaunchGuestReadiness `
              -Context $Context `
              -Plan $trustedLaunchPlan | Out-Null
          }
        }
        if (
          $trustedLaunchPlan.TemplateEnabled -and
          $trustedLaunchPlan.Action -eq 'UpgradeGen1'
        ) {
          Write-Warning (
            "VM $($Context.Config.VmName) was converted to Gen2 Trusted " +
            'Launch, but Azure still reports its original Gen1 Marketplace ' +
            'image reference. Do not use Azure reimage for this VM. Recreate ' +
            'from the configured Gen2 image to replace that source reference.'
          )
        }
      }
    }

    if ($dataDiskExists) {
      Set-AzureDevDataDiskSize `
        -Context $Context `
        -DataDisk $dataDisk `
        -WhatIf:$WhatIfPreference
    }

    if ($WhatIfPreference -and $null -eq (Get-AzureDevResourceGroup -Config $Context.Config)) {
      Write-Warning (
        'Skipping deployment preview because the resource group does not exist. ' +
        'Run setup without -WhatIf to create it, or ask an Azure admin to create it.'
      )
      return
    }

    if ($WhatIfPreference) {
      New-AzureDevDeployment `
        -Context $Context `
        -SshAccessRules $sshAccessRules `
        -SshPublicKey $deploymentPublicKey `
        -Image $image `
        -DataDiskExists $dataDiskExists `
        -TrustedLaunchEnabled $trustedLaunchPlan.TemplateEnabled `
        -Preview

      Write-Host 'setup -WhatIf completed. No Azure resources, SSH files, local state, locks, or logs were created or modified.'
      return
    }

    $deployment = New-AzureDevDeployment `
      -Context $Context `
      -SshAccessRules $sshAccessRules `
      -SshPublicKey $deploymentPublicKey `
      -Image $image `
      -DataDiskExists $dataDiskExists `
      -TrustedLaunchEnabled $trustedLaunchPlan.TemplateEnabled `
      -WhatIf:$WhatIfPreference
    if ($Context.Config.ConnectivityMode -eq 'public-ssh') {
      Set-AzureDevSshAccessSchema -Context $Context
    }

    $hostName = Get-AzureDevHostName -Context $Context
    if (-not $Context.SkipSshConfig) {
      $sshConfigApplied = Set-AzureDevManagedSshConfig `
        -Context $Context `
        -HostName $hostName
      if (-not $sshConfigApplied) {
        throw 'Setup cannot continue until the managed SSH config is applied. Rerun setup with -Apply or -Yes.'
      }
    } else {
      Write-Host (Get-AzureDevSshConfigBlock -Context $Context -HostName $hostName)
    }

    if (-not $WhatIfPreference) {
      Start-AzureDevAzureVm `
        -Context $Context
      Wait-AzureDevSsh `
        -Context $Context `
        -HostName $hostName `
        -CurrentSshCidr $allowedCidr | Out-Null
      Invoke-AzureDevBootstrap -Context $Context

      $validationStatus = 'skipped'
      if (-not $Context.SkipSmokeValidation) {
        Invoke-AzureDevSmokeValidation -Context $Context
        $validationStatus = 'passed'
      }

      Set-AzureDevSetupState `
        -Context $Context `
        -SshAccessRules $sshAccessRules `
        -DeploymentResult $deployment `
        -ValidationStatus $validationStatus
      Write-AzureDevLog `
        -Context $Context `
        -CommandName 'setup' `
        -ActionCategory 'setup' `
        -TargetName $Context.Config.VmName `
        -TargetType 'Microsoft.Compute/virtualMachines' `
        -Result 'success'
      Write-AzureDevSshInstructions -Context $Context
    }
  } finally {
    if (-not $WhatIfPreference) {
      Remove-AzureDevLock -Context $Context -Force
    }
  }
}

function Start-AzureDevEnvironment {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  if (-not $WhatIfPreference) {
    New-AzureDevLock -Context $Context -CommandName 'start'
  }
  try {
    Test-AzureDevPrerequisites `
      -Context $Context `
      -WhatIf:$WhatIfPreference
    Start-AzureDevAzureVm `
      -Context $Context `
      -WhatIf:$WhatIfPreference
    if (-not $WhatIfPreference) {
      $hostName = Get-AzureDevHostName -Context $Context
      Set-AzureDevManagedSshConfig `
        -Context $Context `
        -HostName $hostName | Out-Null
      Wait-AzureDevSsh `
        -Context $Context `
        -HostName $hostName | Out-Null
      Write-AzureDevSshInstructions -Context $Context
      Write-AzureDevLog `
        -Context $Context `
        -CommandName 'start' `
        -ActionCategory 'vm-lifecycle' `
        -TargetName $Context.Config.VmName `
        -TargetType 'Microsoft.Compute/virtualMachines' `
        -Result 'success'
    }
  } finally {
    if (-not $WhatIfPreference) {
      Remove-AzureDevLock -Context $Context -Force
    }
  }
}

function Stop-AzureDevEnvironment {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  if (-not $WhatIfPreference) {
    New-AzureDevLock -Context $Context -CommandName 'stop'
  }
  try {
    Test-AzureDevPrerequisites `
      -Context $Context `
      -WhatIf:$WhatIfPreference
    Stop-AzureDevAzureVm `
      -Context $Context `
      -WhatIf:$WhatIfPreference
    if (-not $WhatIfPreference) {
      Write-AzureDevLog `
        -Context $Context `
        -CommandName 'stop' `
        -ActionCategory 'vm-lifecycle' `
        -TargetName $Context.Config.VmName `
        -TargetType 'Microsoft.Compute/virtualMachines' `
        -Result 'success'
    }
  } finally {
    if (-not $WhatIfPreference) {
      Remove-AzureDevLock -Context $Context -Force
    }
  }
}

function Get-AzureDevStatus {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  Test-AzureDevPrerequisites `
    -Context $Context `
    -WhatIf:$WhatIfPreference
  $state = Get-AzureDevState -Context $Context
  $publicIp = Get-AzureDevPublicIpAddress -Config $Context.Config
  $powerState = Get-AzureDevVmPowerState -Config $Context.Config
  $securityState = Get-AzureDevVmSecurityState -Config $Context.Config
  $hasMarketplaceImage = (
    $null -ne $securityState -and
    $securityState.Exists -and
    -not [string]::IsNullOrWhiteSpace("$($securityState.ImagePublisher)") -and
    -not [string]::IsNullOrWhiteSpace("$($securityState.ImageOffer)") -and
    -not [string]::IsNullOrWhiteSpace("$($securityState.ImageSku)") -and
    -not [string]::IsNullOrWhiteSpace("$($securityState.ImageVersion)")
  )
  $image = if ($hasMarketplaceImage) {
    [pscustomobject]@{
      publisher = $securityState.ImagePublisher
      offer = $securityState.ImageOffer
      sku = $securityState.ImageSku
      version = $securityState.ImageVersion
      urn = (
        "$($securityState.ImagePublisher):$($securityState.ImageOffer):" +
        "$($securityState.ImageSku):$($securityState.ImageVersion)"
      )
      plan = $null
    }
  } else {
    Get-AzureDevVmImage -Config $Context.Config
  }
  if ($null -ne $image) {
    Write-AzureDevImageDeprecationWarning `
      -Config $Context.Config `
      -Image $image
  }
  $sshAccessRules = @(
    Get-AzureDevSshAccessRules -Config $Context.Config
  )
  $validation = Get-AzureDevValidationStatus -State $state
  $generationText = if ($null -ne $securityState -and $securityState.Exists) {
    $securityState.HyperVGeneration
  } else {
    '<not found>'
  }
  $securityTypeText = if ($null -ne $securityState -and $securityState.Exists) {
    $securityState.SecurityType
  } else {
    '<not found>'
  }
  $secureBootText = if (
    $null -ne $securityState -and
    $securityState.Exists -and
    $null -ne $securityState.SecureBootEnabled
  ) {
    $securityState.SecureBootEnabled
  } else {
    '<not found>'
  }
  $vTpmText = if (
    $null -ne $securityState -and
    $securityState.Exists -and
    $null -ne $securityState.VTpmEnabled
  ) {
    $securityState.VTpmEnabled
  } else {
    '<not found>'
  }

  Write-Host "Resource group: $($Context.Config.ResourceGroup)"
  Write-Host "VM: $($Context.Config.VmName)"
  Write-Host "Image: $(if ($null -eq $image) { '<not found>' } else { $image.urn })"
  Write-Host "Hyper-V generation: $generationText"
  Write-Host "Security type: $securityTypeText"
  Write-Host "Secure Boot: $secureBootText"
  Write-Host "vTPM: $vTpmText"
  Write-Host "Power state: $powerState"
  Write-Host "Connectivity mode: $($Context.Config.ConnectivityMode)"
  Write-Host "Public IP: $publicIp"
  Write-Host 'Allowed SSH CIDRs:'
  if ($sshAccessRules.Count -eq 0) {
    Write-Host '  <none>'
  } else {
    foreach ($rule in $sshAccessRules) {
      $owner = "$($rule.workstation)/$($rule.access)"
      Write-Host "  $owner $($rule.cidr) (priority $($rule.priority))"
    }
  }
  Write-Host "SSH alias: $($Context.Config.SshHostAlias)"
  Write-Host "Last validation: $validation"
}

function Get-AzureDevSshConfig {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  $hostName = Get-AzureDevHostName -Context $Context
  if ($Context.Apply -or $Context.Yes) {
    Set-AzureDevManagedSshConfig `
      -Context $Context `
      -HostName $hostName `
      -WhatIf:$WhatIfPreference | Out-Null
  } else {
    Write-Host (Get-AzureDevSshConfigBlock -Context $Context -HostName $hostName)
  }
}

function Remove-AzureDevEnvironment {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  if (-not $WhatIfPreference) {
    New-AzureDevLock -Context $Context -CommandName 'remove'
  }
  try {
    Test-AzureDevPrerequisites `
      -Context $Context `
      -WhatIf:$WhatIfPreference
    $resources = Get-AzureDevManagedResourcesForDeletion `
      -Resources (Get-AzureDevManagedResources -Config $Context.Config)
    Write-Host 'Managed Azure resources selected for deletion:'
    foreach ($resource in @($resources)) {
      Write-Host "  $($resource.type) $($resource.name)"
    }
    Test-AzureDevApproval -Context $Context -Action 'Delete the managed Azure resources above.' | Out-Null

    $deleted = Remove-AzureDevManagedResources `
      -Context $Context `
      -WhatIf:$WhatIfPreference
    if ($Context.Config.ConnectivityMode -eq 'tailscale') {
      Write-Host 'Tailscale mode detected. Remove the VM device from the tailnet if teardown cannot do it automatically.'
    }

    Remove-AzureDevManagedSshConfig -WhatIf:$WhatIfPreference
    Remove-AzureDevLocalState `
      -Context $Context `
      -WhatIf:$WhatIfPreference

    if ($Context.CleanupKeys) {
      foreach ($path in @($Context.Config.SshPrivateKeyPath, $Context.Config.SshPublicKeyPath)) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
          if ($PSCmdlet.ShouldProcess($path, 'Remove generated SSH key')) {
            Write-Verbose "Removing generated SSH key at $path"
            Remove-Item -LiteralPath $path -Force
          }
        }
      }
    } else {
      Write-Host "SSH key files were preserved: $($Context.Config.SshPrivateKeyPath), $($Context.Config.SshPublicKeyPath)"
    }

    if (-not $WhatIfPreference) {
      Write-AzureDevLog `
        -Context $Context `
        -CommandName 'remove' `
        -ActionCategory 'teardown' `
        -TargetName $Context.Config.ResourceGroup `
        -TargetType 'resource-group-resources' `
        -Result "deleted $(@($deleted).Count) resources"
    }
  } finally {
    if (-not $WhatIfPreference) {
      Remove-AzureDevLock -Context $Context -Force
    }
  }
}

function Invoke-AzureDevCommand {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandName,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  Write-Verbose "Running Azure dev command '$CommandName'"
  $effectiveWorkstationName = $null
  if (
    $CommandName -in @(
      'add-cidr',
      'new-workstation-request',
      'remove-cidr',
      'remove-workstation',
      'set-cidr',
      'setup'
    )
  ) {
    $effectiveWorkstationName = Resolve-AzureDevWorkstationName `
      -WorkstationName $WorkstationName
  }
  switch ($CommandName) {
    'add-cidr' {
      Add-AzureDevWorkstationCidr `
        -Context $Context `
        -WorkstationName $effectiveWorkstationName `
        -AccessName $AccessName `
        -Cidr $Cidr `
        -AllowNetworkCidr:$AllowNetworkCidr
    }
    'approve-workstation' {
      Approve-AzureDevWorkstation `
        -Context $Context `
        -RequestPath $RequestPath `
        -OutputPath $OutputPath
    }
    'cleanup-workstation-package' {
      Remove-AzureDevExtractedPackage `
        -Context $Context `
        -DestinationPath $DestinationPath
    }
    'estimate-cost' { Write-AzureDevCostEstimate -Context $Context }
    'extract-workstation-package' {
      Expand-AzureDevWorkstationPackage `
        -Context $Context `
        -PackagePath $PackagePath `
        -DestinationPath $DestinationPath
    }
    'list-cidrs' { Show-AzureDevWorkstationCidrs -Context $Context }
    'list-workstations' { Show-AzureDevWorkstationCidrs -Context $Context }
    'new-workstation-request' {
      New-AzureDevWorkstationRequest `
        -Context $Context `
        -WorkstationName $effectiveWorkstationName `
        -IntendedUse $IntendedUse `
        -Cidr $Cidr `
        -OutputPath $OutputPath
    }
    'prepare-workstation-access' {
      Invoke-AzureDevPrepareWorkstationAccess `
        -Context $Context `
        -DestinationPath $DestinationPath
    }
    'remove-cidr' {
      Remove-AzureDevWorkstationCidr `
        -Context $Context `
        -WorkstationName $effectiveWorkstationName `
        -AccessName $AccessName `
        -ForceRecovery:$ForceRecovery
    }
    'remove-workstation' {
      Remove-AzureDevWorkstation `
        -Context $Context `
        -WorkstationName $effectiveWorkstationName `
        -ForceRecovery:$ForceRecovery
    }
    'set-cidr' {
      Add-AzureDevWorkstationCidr `
        -Context $Context `
        -WorkstationName $effectiveWorkstationName `
        -AccessName $AccessName `
        -Cidr $Cidr `
        -Replace `
        -AllowNetworkCidr:$AllowNetworkCidr
    }
    'setup' {
      Invoke-AzureDevSetup `
        -Context $Context `
        -CidrOverride $Cidr `
        -WorkstationName $effectiveWorkstationName `
        -AllowNetworkCidr:$AllowNetworkCidr
    }
    'start' { Start-AzureDevEnvironment -Context $Context }
    'stop' { Stop-AzureDevEnvironment -Context $Context }
    'status' { Get-AzureDevStatus -Context $Context }
    'ssh-config' { Get-AzureDevSshConfig -Context $Context }
    'remove' { Remove-AzureDevEnvironment -Context $Context }
  }
}

$requireEnv = $Command -in @('approve-workstation', 'setup')
$allowMissingAzureScope = $Command -in @(
  'cleanup-workstation-package',
  'estimate-cost',
  'extract-workstation-package',
  'new-workstation-request'
)
$allowDirectSsh = $Command -in @(
  'prepare-workstation-access',
  'ssh-config'
)
$directSshReadiness = $false
if (
  $Command -eq 'prepare-workstation-access' -and
  -not [string]::IsNullOrWhiteSpace($DestinationPath)
) {
  $readinessManifest = Get-AzureDevExtractedPackageManifest `
    -DestinationPath $DestinationPath
  $directSshReadiness = $readinessManifest.intendedUse -eq 'connect-only'
}
$config = Get-AzureDevConfig `
  -RepositoryRoot $RepositoryRoot `
  -EnvironmentFile $EnvironmentFile `
  -RequireEnvironmentFile:$requireEnv `
  -AllowMissingAzureScope:$allowMissingAzureScope `
  -AllowDirectSsh:$allowDirectSsh `
  -DirectSshReadiness:$directSshReadiness
$context = New-AzureDevContext `
  -Config $config `
  -Yes:$Yes `
  -AdoptResourceGroup:$AdoptResourceGroup `
  -ForceUnlock:$ForceUnlock `
  -Apply:$Apply `
  -CleanupLogs:$CleanupLogs `
  -CleanupKeys:$CleanupKeys `
  -SkipSshConfig:$SkipSshConfig `
  -SkipSmokeValidation:$SkipSmokeValidation

Invoke-AzureDevCommand -CommandName $Command -Context $context
