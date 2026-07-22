#requires -Version 7.0
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Position = 0)]
  [ValidateSet('estimate-cost', 'setup', 'start', 'stop', 'status', 'update-cidr', 'ssh-config', 'remove')]
  [string]$Command = 'status',

  [string]$RepositoryRoot,

  [string]$EnvironmentFile = '.env.azure.development',

  [string]$AllowedSshCidr,

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
  'AzureDev.Podman.psm1'
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
    'Canonical Ubuntu 24.04 LTS Server, resolved during setup'
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

  Write-Host "SSH target: $($Context.Config.SshHostAlias)"
  $codeCommand = Get-AzureDevCodeCommand -Context $Context
  if ($null -ne $codeCommand) {
    Write-Host $codeCommand
  }

  $extensionsPath = Join-Path $Context.Config.RepoRoot '.vscode/extensions.json'
  Write-Host ''
  Write-Host 'VS Code extensions: choose one installation option:'
  Write-Host (
    '  1. For automatic installation on every Remote SSH host, set the local ' +
    'VS Code User setting remote.SSH.defaultExtensions to the active recommendations in:'
  )
  Write-Host "     $extensionsPath"
  Write-Host '  2. For this remote workspace only, connect first and then run:'
  Write-Host '     Extensions: Install Workspace Recommended Extensions'
  Write-Host (
    'The setup does not change the application-wide setting. ' +
    '.vscode/extensions.json remains the source of truth.'
  )

  $hostName = Get-AzureDevHostName -Context $Context
  $identityFile = $Context.Config.SshPrivateKeyPath
  Write-Host 'Connect using standard SSH:'
  Write-Host "ssh -i `"$identityFile`" -o IdentitiesOnly=yes vscode@$hostName"

  if ($null -ne $codeCommand) {
    Write-Host (
      'Optional: after VS Code connects, open its integrated terminal and run ' +
      'p10k configure to customize the prompt.'
    )
  }
}

function Test-AzureDevVmSshPublicKeyDrift {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$SshPublicKey
  )

  $existingKeys = Get-AzureDevVmAdminSshPublicKeys -Config $Context.Config
  if (@($existingKeys).Count -eq 0) {
    return
  }

  if ($SshPublicKey -in @($existingKeys)) {
    return
  }

  $existingPreview = (@($existingKeys) | Select-Object -First 1).Trim()
  if ($existingPreview.Length -gt 96) {
    $existingPreview = $existingPreview.Substring(0, 96) + '...'
  }

  throw (
    "Existing VM $($Context.Config.VmName) was created with a different SSH public key, " +
    "and Azure does not allow changing osProfile.linuxConfiguration.ssh.publicKeys on an existing VM. " +
    "Existing VM key starts with: $existingPreview. " +
    "This can happen if an earlier setup -WhatIf run created resources with the placeholder key. " +
    "Run: pwsh ./scripts/azure-dev.ps1 remove -WhatIf. " +
    "Then run: pwsh ./scripts/azure-dev.ps1 remove. " +
    "After removal, rerun setup so the VM is created with the local key at $($Context.Config.SshPublicKeyPath)."
  )
}

function Set-AzureDevSetupState {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$AllowedCidr,

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
    lastKnownAllowedCidr = $AllowedCidr
    lastValidationStatus = $ValidationStatus
  }
  Set-AzureDevState -Context $Context -State $state
}

function Invoke-AzureDevSetup {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [string]$CidrOverride
  )

  Assert-AzureDevTerminalFontInstalled

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
    $allowedCidr = Get-AzureDevAllowedSshCidr `
      -Config $Context.Config `
      -OverrideCidr $CidrOverride

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

    $image = Get-AzureDevDeploymentImage -Config $Context.Config
    $dataDisk = Get-AzureDevDataDisk -Config $Context.Config
    $dataDiskExists = $null -ne $dataDisk
    Write-AzureDevCostSummary `
      -Context $Context `
      -Image $image `
      -DataDisk $dataDisk
    Test-AzureDevVmSshPublicKeyDrift `
      -Context $Context `
      -SshPublicKey $publicKey
    Test-AzureDevApproval -Context $Context -Action 'Create or update Azure VM resources.' | Out-Null

    New-AzureDevResourceGroup `
      -Context $Context `
      -WhatIf:$WhatIfPreference

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
        -AllowedSshCidr $allowedCidr `
        -SshPublicKey $publicKey `
        -Image $image `
        -DataDiskExists $dataDiskExists `
        -Preview

      Write-Host 'setup -WhatIf completed. No Azure resources, SSH files, local state, locks, or logs were created or modified.'
      return
    }

    $deployment = New-AzureDevDeployment `
      -Context $Context `
      -AllowedSshCidr $allowedCidr `
      -SshPublicKey $publicKey `
      -Image $image `
      -DataDiskExists $dataDiskExists `
      -WhatIf:$WhatIfPreference

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
        -AllowedSshCidr $allowedCidr | Out-Null
      Invoke-AzureDevBootstrap -Context $Context

      $validationStatus = 'skipped'
      if (-not $Context.SkipSmokeValidation) {
        Invoke-AzureDevSmokeValidation -Context $Context
        $validationStatus = 'passed'
      }

      Set-AzureDevSetupState `
        -Context $Context `
        -AllowedCidr $allowedCidr `
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
  $allowedCidr = if ($null -ne $state) {
    $state.lastKnownAllowedCidr
  } else {
    $Context.Config.AllowedSshCidr
  }
  $validation = Get-AzureDevValidationStatus -State $state

  Write-Host "Resource group: $($Context.Config.ResourceGroup)"
  Write-Host "VM: $($Context.Config.VmName)"
  Write-Host "Power state: $powerState"
  Write-Host "Connectivity mode: $($Context.Config.ConnectivityMode)"
  Write-Host "Public IP: $publicIp"
  Write-Host "Allowed SSH CIDR: $allowedCidr"
  Write-Host "SSH alias: $($Context.Config.SshHostAlias)"
  Write-Host "Last validation: $validation"
}

function Update-AzureDevCidr {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [string]$CidrOverride
  )

  if ($Context.Config.ConnectivityMode -ne 'public-ssh') {
    throw 'update-cidr applies only to public-ssh connectivity mode.'
  }

  if (-not $WhatIfPreference) {
    New-AzureDevLock -Context $Context -CommandName 'update-cidr'
  }
  try {
    Test-AzureDevPrerequisites `
      -Context $Context `
      -WhatIf:$WhatIfPreference
    $allowedCidr = Get-AzureDevAllowedSshCidr `
      -Config $Context.Config `
      -OverrideCidr $CidrOverride
    Update-AzureDevNetworkSecurityGroupCidr `
      -Context $Context `
      -AllowedSshCidr $allowedCidr `
      -WhatIf:$WhatIfPreference

    $hostName = Get-AzureDevHostName -Context $Context
    Set-AzureDevManagedSshConfig `
      -Context $Context `
      -HostName $hostName `
      -WhatIf:$WhatIfPreference | Out-Null

    if (-not $WhatIfPreference) {
      $state = Get-AzureDevState -Context $Context
      $stateHash = if ($null -ne $state) {
        $state | ConvertTo-Json -Depth 20 | ConvertFrom-Json -AsHashtable
      } else {
        [ordered]@{}
      }
      $stateHash.lastKnownAllowedCidr = $allowedCidr
      Set-AzureDevState -Context $Context -State $stateHash
      Write-AzureDevLog `
        -Context $Context `
        -CommandName 'update-cidr' `
        -ActionCategory 'network' `
        -TargetName $Context.Config.NamePrefix `
        -TargetType 'Microsoft.Network/networkSecurityGroups' `
        -Result 'success'
    }
  } finally {
    if (-not $WhatIfPreference) {
      Remove-AzureDevLock -Context $Context -Force
    }
  }
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
  switch ($CommandName) {
    'estimate-cost' { Write-AzureDevCostEstimate -Context $Context }
    'setup' { Invoke-AzureDevSetup -Context $Context -CidrOverride $AllowedSshCidr }
    'start' { Start-AzureDevEnvironment -Context $Context }
    'stop' { Stop-AzureDevEnvironment -Context $Context }
    'status' { Get-AzureDevStatus -Context $Context }
    'update-cidr' { Update-AzureDevCidr -Context $Context -CidrOverride $AllowedSshCidr }
    'ssh-config' { Get-AzureDevSshConfig -Context $Context }
    'remove' { Remove-AzureDevEnvironment -Context $Context }
  }
}

$requireEnv = $Command -eq 'setup'
$allowMissingAzureScope = $Command -eq 'estimate-cost'
$config = Get-AzureDevConfig `
  -RepositoryRoot $RepositoryRoot `
  -EnvironmentFile $EnvironmentFile `
  -RequireEnvironmentFile:$requireEnv `
  -AllowMissingAzureScope:$allowMissingAzureScope
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
