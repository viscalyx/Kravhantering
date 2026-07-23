Set-StrictMode -Version Latest

$script:AzureDevWhatIfDocumentationUrl = 'https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deploy-what-if'

function Invoke-AzCli {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [switch]$Json
  )

  $commandLine = Format-AzureDevCommand -FilePath 'az' -Arguments $Arguments
  Write-Verbose "Running $commandLine"

  $stderrPath = [System.IO.Path]::GetTempFileName()
  $callerWhatIfPreference = $WhatIfPreference
  try {
    $WhatIfPreference = $false
    $output = & az @Arguments 2> $stderrPath
    $exitCode = $LASTEXITCODE
    $stdoutText = $output | Out-String
    $stderrText = if ((Get-Item -LiteralPath $stderrPath).Length -gt 0) {
      Get-Content -LiteralPath $stderrPath -Raw
    } else {
      ''
    }

    Write-Debug (
      "Output from $commandLine`:$([Environment]::NewLine)" +
      "stdout:$([Environment]::NewLine)$stdoutText" +
      "stderr:$([Environment]::NewLine)$stderrText"
    )

    $text = $stdoutText.Trim()
    $errorText = "$stdoutText$stderrText".Trim()
    if ($exitCode -ne 0) {
      throw "$commandLine failed: $errorText"
    }
    if ($Json) {
      if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
      }
      try {
        return $text | ConvertFrom-Json
      } catch {
        throw "$commandLine did not return valid JSON: $text"
      }
    }
    return $text
  } finally {
    $WhatIfPreference = $callerWhatIfPreference
    [System.IO.File]::Delete($stderrPath)
  }
}

function Test-AzureDevLocalTool {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [switch]$Optional
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command -and -not $Optional) {
    throw "Required local tool is missing: $Name"
  }
  return $null -ne $command
}

function Test-AzureDevRuntime {
  [CmdletBinding()]
  param()

  if ($PSVersionTable.PSEdition -ne 'Core' -or $PSVersionTable.PSVersion.Major -lt 7) {
    throw 'Run scripts/azure-dev.ps1 with PowerShell 7+ under pwsh.'
  }
}

function Connect-AzureDevServicePrincipal {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  if (
    [string]::IsNullOrWhiteSpace($Config.TenantId) -or
    [string]::IsNullOrWhiteSpace($Config.ClientId) -or
    [string]::IsNullOrWhiteSpace($Config.ClientSecret)
  ) {
    return $false
  }

  if (-not $PSCmdlet.ShouldProcess('Azure CLI', 'Log in with service principal')) {
    return $false
  }

  Invoke-AzCli -Arguments @(
    'login',
    '--service-principal',
    '--tenant',
    $Config.TenantId,
    '--username',
    $Config.ClientId,
    '--password',
    $Config.ClientSecret,
    '--output',
    'none'
  ) | Out-Null
  return $true
}

function Get-AzureDevAccount {
  [CmdletBinding()]
  param()

  try {
    return Invoke-AzCli -Arguments @('account', 'show', '--output', 'json') -Json
  } catch {
    return $null
  }
}

function Get-AzureDevVisibleSubscriptions {
  [CmdletBinding()]
  param()

  return Invoke-AzCli -Arguments @(
    'account',
    'list',
    '--all',
    '--output',
    'json'
  ) -Json
}

function Set-AzureDevSubscription {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  if ($PSCmdlet.ShouldProcess($Config.SubscriptionId, 'Select Azure subscription')) {
    Invoke-AzCli -Arguments @(
      'account',
      'set',
      '--subscription',
      $Config.SubscriptionId
    ) | Out-Null
  }
}

function Test-AzureDevSubscriptionVisible {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $subscriptions = Get-AzureDevVisibleSubscriptions
  $matchingSubscription = @($subscriptions) |
    Where-Object { $_.id -eq $Config.SubscriptionId } |
    Select-Object -First 1

  if ($null -ne $matchingSubscription) {
    return $true
  }

  $cloud = try {
    Invoke-AzCli -Arguments @('cloud', 'show', '--query', 'name', '--output', 'tsv')
  } catch {
    'unknown'
  }
  $visible = @($subscriptions) |
    ForEach-Object { "  $($_.name)  $($_.id)  tenant=$($_.tenantId)  state=$($_.state)" }

  throw (
    "Azure subscription $($Config.SubscriptionId) is not visible to the current Azure CLI login in cloud $cloud. " +
    "Run: az account list --all --output table. " +
    "If the subscription belongs to another tenant, run: az login --tenant <tenant-id>. " +
    "If the Azure cloud is wrong, run: az cloud set --name AzureCloud. " +
    "Visible subscriptions:`n$($visible -join [Environment]::NewLine)"
  )
}

function Test-AzureDevPrerequisites {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  Test-AzureDevRuntime
  foreach ($tool in @('az', 'ssh', 'ssh-keygen')) {
    Test-AzureDevLocalTool -Name $tool | Out-Null
  }
  Test-AzureDevLocalTool -Name 'scp' | Out-Null
  Test-AzureDevLocalTool -Name 'git' | Out-Null
  Test-AzureDevLocalTool -Name 'code' -Optional | Out-Null

  $connected = Connect-AzureDevServicePrincipal `
    -Config $Context.Config `
    -WhatIf:$WhatIfPreference
  if (-not $connected) {
    $account = Get-AzureDevAccount
    if ($null -eq $account) {
      throw 'Azure CLI is not logged in. Run az login or set service-principal env vars.'
    }
  }

  Test-AzureDevSubscriptionVisible -Config $Context.Config | Out-Null
  Test-AzureDevSkuAvailability -Config $Context.Config | Out-Null
}

function Test-AzureDevSkuAvailability {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $sizes = @($Config.VmSize, $Config.FallbackVmSize) | Select-Object -Unique
  foreach ($size in $sizes) {
    $skus = Invoke-AzCli -Arguments @(
      'vm',
      'list-skus',
      '--subscription',
      $Config.SubscriptionId,
      '--location',
      $Config.Location,
      '--size',
      $size,
      '--resource-type',
      'virtualMachines',
      '--all',
      '--output',
      'json'
    ) -Json
    if (@($skus).Count -eq 0) {
      throw "VM SKU $size is not available in $($Config.Location)."
    }
  }
  return $true
}

function Get-AzureDevUbuntuImage {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $images = Invoke-AzCli -Arguments @(
    'vm',
    'image',
    'list',
    '--subscription',
    $Config.SubscriptionId,
    '--publisher',
    'Canonical',
    '--offer',
    'ubuntu-24_04-lts',
    '--sku',
    'server',
    '--location',
    $Config.Location,
    '--all',
    '--output',
    'json'
  ) -Json

  $latest = @($images) |
    Where-Object { $_.version -and $_.version -ne 'latest' } |
    Sort-Object -Property version |
    Select-Object -Last 1

  if ($null -eq $latest) {
    return [pscustomobject]@{
      publisher = 'Canonical'
      offer = 'ubuntu-24_04-lts'
      sku = 'server'
      version = 'latest'
      urn = 'Canonical:ubuntu-24_04-lts:server:latest'
      plan = $null
    }
  }

  $urn = "$($latest.publisher):$($latest.offer):$($latest.sku):$($latest.version)"
  $details = Invoke-AzCli -Arguments @(
    'vm',
    'image',
    'show',
    '--subscription',
    $Config.SubscriptionId,
    '--urn',
    $urn,
    '--location',
    $Config.Location,
    '--output',
    'json'
  ) -Json

  $planProperty = $details.PSObject.Properties['plan']
  $plan = if ($null -ne $planProperty) { $planProperty.Value } else { $null }

  return [pscustomobject]@{
    publisher = $latest.publisher
    offer = $latest.offer
    sku = $latest.sku
    version = $latest.version
    urn = $urn
    plan = $plan
  }
}

function Get-AzureDevVmImage {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  try {
    $image = Invoke-AzCli -Arguments @(
      'vm',
      'show',
      '--subscription',
      $Config.SubscriptionId,
      '--resource-group',
      $Config.ResourceGroup,
      '--name',
      $Config.VmName,
      '--query',
      'storageProfile.imageReference',
      '--output',
      'json'
    ) -Json
  } catch {
    if (
      $_.Exception.Message -match
      '(?i)(ResourceGroupNotFound|ResourceNotFound|could not be found|was not found)'
    ) {
      return $null
    }
    throw
  }

  if ($null -eq $image) {
    return $null
  }

  foreach ($propertyName in @('publisher', 'offer', 'sku', 'version')) {
    $property = $image.PSObject.Properties[$propertyName]
    if ($null -eq $property -or [string]::IsNullOrWhiteSpace($property.Value)) {
      return $null
    }
  }

  return [pscustomobject]@{
    publisher = $image.publisher
    offer = $image.offer
    sku = $image.sku
    version = $image.version
    urn = "$($image.publisher):$($image.offer):$($image.sku):$($image.version)"
    plan = $null
  }
}

function Get-AzureDevDeploymentImage {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $existingImage = Get-AzureDevVmImage -Config $Config
  if ($null -ne $existingImage) {
    return $existingImage
  }

  return Get-AzureDevUbuntuImage -Config $Config
}

function Get-AzureDevResourceGroup {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  try {
    return Invoke-AzCli -Arguments @(
      'group',
      'show',
      '--subscription',
      $Config.SubscriptionId,
      '--name',
      $Config.ResourceGroup,
      '--output',
      'json'
    ) -Json
  } catch {
    return $null
  }
}

function Test-AzureDevOwnershipTags {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [object]$Resource,

    [Parameter(Mandatory = $true)]
    [hashtable]$ExpectedTags
  )

  foreach ($key in @('managed-by', 'environment-id', 'repository', 'purpose')) {
    $actual = if ($Resource.tags -is [System.Collections.IDictionary]) {
      $Resource.tags[$key]
    } else {
      $property = $Resource.tags.PSObject.Properties[$key]
      if ($null -ne $property) { $property.Value } else { $null }
    }
    if ($actual -ne $ExpectedTags[$key]) {
      return $false
    }
  }
  return $true
}

function New-AzureDevResourceGroup {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  $config = $Context.Config
  $existing = Get-AzureDevResourceGroup -Config $config
  $tagArgs = @()
  foreach ($tag in $config.Tags.GetEnumerator()) {
    $tagArgs += "$($tag.Key)=$($tag.Value)"
  }

  if ($null -eq $existing) {
    if ($PSCmdlet.ShouldProcess($config.ResourceGroup, 'Create Azure resource group')) {
      $arguments = @(
        'group',
        'create',
        '--subscription',
        $config.SubscriptionId,
        '--name',
        $config.ResourceGroup,
        '--location',
        $config.Location,
        '--tags'
      ) + $tagArgs + @('--output', 'json')
      Invoke-AzCli -Arguments $arguments -Json | Out-Null
    }
    return
  }

  if (Test-AzureDevOwnershipTags -Resource $existing -ExpectedTags $config.Tags) {
    return
  }

  if (-not $Context.AdoptResourceGroup) {
    $tagText = ($tagArgs -join ' ')
    throw (
      "Resource group $($config.ResourceGroup) exists without expected tags. " +
      "An owner can run: az group update --name $($config.ResourceGroup) --tags $tagText"
    )
  }

  if ($PSCmdlet.ShouldProcess($config.ResourceGroup, 'Adopt resource group tags')) {
    $arguments = @(
      'group',
      'update',
      '--subscription',
      $config.SubscriptionId,
      '--name',
      $config.ResourceGroup,
      '--set'
    ) + @(
      "tags.managed-by=$($config.ManagedBy)",
      "tags.environment-id=$($config.EnvironmentId)",
      "tags.repository=$($config.Repository)",
      "tags.purpose=$($config.Purpose)"
    ) + @('--output', 'json')
    Invoke-AzCli -Arguments $arguments -Json | Out-Null
  }
}

function Get-AzureDevExpectedResourceNames {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  return [ordered]@{
    virtualNetwork = "$($Config.NamePrefix)-vnet"
    subnet = 'snet-dev'
    networkSecurityGroup = "$($Config.NamePrefix)-nsg"
    publicIpAddress = "$($Config.NamePrefix)-pip"
    networkInterface = "$($Config.NamePrefix)-nic"
    osDisk = "$($Config.VmName)-osdisk"
    dataDisk = "$($Config.VmName)-data"
    sshPublicKey = "$($Config.NamePrefix)-ssh-key"
    autoShutdown = "shutdown-computevm-$($Config.VmName)"
  }
}

function Get-AzureDevDataDisk {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $names = Get-AzureDevExpectedResourceNames -Config $Config
  try {
    return Invoke-AzCli -Arguments @(
      'disk',
      'show',
      '--subscription',
      $Config.SubscriptionId,
      '--resource-group',
      $Config.ResourceGroup,
      '--name',
      $names.dataDisk,
      '--output',
      'json'
    ) -Json
  } catch {
    if (
      $_.Exception.Message -match
      '(?i)(ResourceGroupNotFound|ResourceNotFound|could not be found|was not found)'
    ) {
      return $null
    }
    throw
  }
}

function Set-AzureDevDataDiskSize {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$DataDisk
  )

  $currentSizeGiB = [int]$DataDisk.diskSizeGB
  $requestedSizeGiB = [int]$Context.Config.DataDiskGiB
  if ($requestedSizeGiB -lt $currentSizeGiB) {
    Write-Warning (
      "AZURE_DEV_VM_DATA_DISK_GIB requests $requestedSizeGiB GiB, but the " +
      "existing managed disk $($DataDisk.name) is $currentSizeGiB GiB. " +
      'Azure managed disks cannot be shrunk. Setup will preserve the existing ' +
      'disk and continue. Remove and recreate the disposable environment to ' +
      'use a smaller data disk.'
    )
    return
  }
  if ($requestedSizeGiB -eq $currentSizeGiB) {
    return
  }

  $target = "$($DataDisk.name) ($currentSizeGiB GiB to $requestedSizeGiB GiB)"
  if ($PSCmdlet.ShouldProcess($target, 'Expand Azure managed data disk')) {
    Invoke-AzCli -Arguments @(
      'disk',
      'update',
      '--subscription',
      $Context.Config.SubscriptionId,
      '--resource-group',
      $Context.Config.ResourceGroup,
      '--name',
      $DataDisk.name,
      '--size-gb',
      $requestedSizeGiB.ToString(),
      '--output',
      'json'
    ) -Json | Out-Null
  }
}

function Get-AzureDevDeploymentParameters {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$AllowedSshCidr,

    [Parameter(Mandatory = $true)]
    [string]$SshPublicKey,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$Image,

    [Parameter(Mandatory = $true)]
    [bool]$DataDiskExists
  )

  $config = $Context.Config
  return @(
    "environmentId=$($config.EnvironmentId)",
    "namePrefix=$($config.NamePrefix)",
    "vmName=$($config.VmName)",
    "vmSize=$($config.VmSize)",
    "dataDiskGiB=$($config.DataDiskGiB)",
    "dataDiskExists=$($DataDiskExists.ToString().ToLowerInvariant())",
    "adminUsername=vscode",
    "sshPublicKey=$SshPublicKey",
    "connectivityMode=$($config.ConnectivityMode)",
    "allowedSshCidr=$AllowedSshCidr",
    "autoStopEnabled=$($config.AutoStopEnabled.ToString().ToLowerInvariant())",
    "autoStopTime=$($config.AutoStopTime)",
    "autoStopTimeZone=$($config.AutoStopTimeZone)",
    "imagePublisher=$($Image.publisher)",
    "imageOffer=$($Image.offer)",
    "imageSku=$($Image.sku)",
    "imageVersion=$($Image.version)"
  )
}

function Get-AzureDevJsonProperty {
  [CmdletBinding()]
  param(
    [AllowNull()]
    [object]$InputObject,

    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($null -eq $InputObject) {
    return $null
  }
  $property = $InputObject.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $null
  }
  return $property.Value
}

function Join-AzureDevWhatIfPropertyPath {
  [CmdletBinding()]
  param(
    [string]$ParentPath,

    [string]$ChildPath
  )

  if ([string]::IsNullOrWhiteSpace($ParentPath)) {
    return $ChildPath
  }
  if ($ChildPath -match '^\d+$') {
    return "$ParentPath[$ChildPath]"
  }
  return "$ParentPath.$ChildPath"
}

function Get-AzureDevWhatIfLeafChanges {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Changes,

    [string]$ParentPath = ''
  )

  foreach ($change in $Changes) {
    $path = Join-AzureDevWhatIfPropertyPath `
      -ParentPath $ParentPath `
      -ChildPath (Get-AzureDevJsonProperty -InputObject $change -Name 'path')
    $childrenValue = Get-AzureDevJsonProperty `
      -InputObject $change `
      -Name 'children'
    $children = @()
    if ($null -ne $childrenValue) {
      $children = @($childrenValue)
    }
    if ($children.Count -gt 0) {
      Get-AzureDevWhatIfLeafChanges -Changes $children -ParentPath $path
      continue
    }

    [pscustomobject]@{
      Path = $path
      PropertyChangeType = Get-AzureDevJsonProperty `
        -InputObject $change `
        -Name 'propertyChangeType'
      Before = Get-AzureDevJsonProperty -InputObject $change -Name 'before'
      After = Get-AzureDevJsonProperty -InputObject $change -Name 'after'
    }
  }
}

function Test-AzureDevKnownWhatIfNoise {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceId,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$PropertyChange
  )

  if ($PropertyChange.PropertyChangeType -ne 'Delete') {
    return $false
  }

  if ($ResourceId -match '(?i)/providers/Microsoft\.Network/networkInterfaces/') {
    return $PropertyChange.Path -in @(
      'kind',
      'properties.allowPort25Out',
      'properties.auxiliaryMode',
      'properties.auxiliarySku',
      'properties.disableTcpStateTracking'
    ) -or $PropertyChange.Path -match (
      '^properties\.ipConfigurations\[\d+\]\.properties\.privateIPAddress$'
    )
  }

  if ($ResourceId -match '(?i)/providers/Microsoft\.Network/publicIPAddresses/') {
    return $PropertyChange.Path -eq 'properties.ddosSettings'
  }

  return $false
}

function Get-AzureDevWhatIfClassification {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Result
  )

  $properties = Get-AzureDevJsonProperty -InputObject $Result -Name 'properties'
  $changesValue = Get-AzureDevJsonProperty -InputObject $properties -Name 'changes'
  $potentialChangesValue = Get-AzureDevJsonProperty `
    -InputObject $properties `
    -Name 'potentialChanges'
  $changes = @()
  if ($null -ne $changesValue) {
    $changes = @($changesValue)
  }
  $potentialChanges = @()
  if ($null -ne $potentialChangesValue) {
    $potentialChanges = @($potentialChangesValue)
  }

  $actionable = [System.Collections.Generic.List[object]]::new()
  $knownNoise = [System.Collections.Generic.List[object]]::new()
  $neutral = [System.Collections.Generic.List[object]]::new()

  foreach ($change in $changes) {
    $changeType = Get-AzureDevJsonProperty -InputObject $change -Name 'changeType'
    $resourceId = Get-AzureDevJsonProperty -InputObject $change -Name 'resourceId'
    if ($changeType -in @('NoChange', 'Ignore')) {
      $neutral.Add($change)
      continue
    }
    if ($changeType -ne 'Modify') {
      $actionable.Add($change)
      continue
    }

    $deltaValue = Get-AzureDevJsonProperty -InputObject $change -Name 'delta'
    $delta = @()
    if ($null -ne $deltaValue) {
      $delta = @($deltaValue)
    }
    $leafChanges = @()
    if (@($delta).Count -gt 0) {
      $leafChanges = @(
        Get-AzureDevWhatIfLeafChanges -Changes $delta |
          Where-Object { $_.PropertyChangeType -ne 'NoEffect' }
      )
    }
    if (@($leafChanges).Count -eq 0) {
      $neutral.Add($change)
      continue
    }

    $unknownChanges = @(
      $leafChanges |
        Where-Object {
          -not (Test-AzureDevKnownWhatIfNoise `
              -ResourceId $resourceId `
              -PropertyChange $_)
        }
    )
    if (@($unknownChanges).Count -eq 0) {
      $knownNoise.Add([pscustomobject]@{
          ResourceId = $resourceId
          Properties = $leafChanges
        })
      continue
    }

    $actionable.Add($change)
  }

  foreach ($change in $potentialChanges) {
    $actionable.Add($change)
  }

  return [pscustomobject]@{
    Actionable = @($actionable)
    KnownNoise = @($knownNoise)
    Neutral = @($neutral)
  }
}

function ConvertTo-AzureDevWhatIfValue {
  [CmdletBinding()]
  param(
    [AllowNull()]
    [object]$Value
  )

  if ($null -eq $Value) {
    return '<null>'
  }
  if ($Value -is [string] -or $Value -is [ValueType]) {
    return "$Value"
  }
  return ($Value | ConvertTo-Json -Compress -Depth 20)
}

function Write-AzureDevWhatIfChanges {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Heading,

    [Parameter(Mandatory = $true)]
    [object[]]$Changes
  )

  Write-Host $Heading
  foreach ($change in $Changes) {
    $changeType = Get-AzureDevJsonProperty -InputObject $change -Name 'changeType'
    $resourceId = Get-AzureDevJsonProperty -InputObject $change -Name 'resourceId'
    Write-Host "  $changeType $resourceId"

    $deltaValue = Get-AzureDevJsonProperty -InputObject $change -Name 'delta'
    $delta = @()
    if ($null -ne $deltaValue) {
      $delta = @($deltaValue)
    }
    if (@($delta).Count -gt 0) {
      foreach ($propertyChange in @(Get-AzureDevWhatIfLeafChanges -Changes $delta)) {
        $before = ConvertTo-AzureDevWhatIfValue -Value $propertyChange.Before
        $after = ConvertTo-AzureDevWhatIfValue -Value $propertyChange.After
        Write-Host (
          "    $($propertyChange.PropertyChangeType) " +
          "$($propertyChange.Path): $before -> $after"
        )
      }
    }
  }
}

function Write-AzureDevWhatIfResult {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Result
  )

  $properties = Get-AzureDevJsonProperty -InputObject $Result -Name 'properties'
  $changesValue = Get-AzureDevJsonProperty -InputObject $properties -Name 'changes'
  $potentialChangesValue = Get-AzureDevJsonProperty `
    -InputObject $properties `
    -Name 'potentialChanges'
  $changes = @()
  if ($null -ne $changesValue) {
    $changes = @($changesValue)
  }
  $potentialChanges = @()
  if ($null -ne $potentialChangesValue) {
    $potentialChanges = @($potentialChangesValue)
  }

  if ($changes.Count -eq 0) {
    Write-Host 'Bicep What-If resource changes: none'
  } else {
    Write-AzureDevWhatIfChanges `
      -Heading 'Bicep What-If resource changes' `
      -Changes $changes
  }
  if ($potentialChanges.Count -gt 0) {
    Write-AzureDevWhatIfChanges `
      -Heading 'Bicep What-If potential changes' `
      -Changes $potentialChanges
  }
}

function Write-AzureDevWhatIfClassification {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Result
  )

  $classification = Get-AzureDevWhatIfClassification -Result $Result
  Write-Host ''
  Write-Host 'Bicep What-If interpretation'
  Write-Host "  Actionable resource changes: $(@($classification.Actionable).Count)"
  Write-Host "  Known false-positive resource changes: $(@($classification.KnownNoise).Count)"
  Write-Host "  Neutral resources: $(@($classification.Neutral).Count)"

  foreach ($noise in $classification.KnownNoise) {
    Write-Host "  Known noise: $($noise.ResourceId)"
    foreach ($propertyChange in $noise.Properties) {
      Write-Host "    $($propertyChange.Path)"
    }
  }

  Write-Warning (
    'ARM/Bicep What-If predictions can contain false positives for default or ' +
    'provider-assigned properties. Unknown changes remain actionable. ' +
    "Microsoft documentation: $script:AzureDevWhatIfDocumentationUrl"
  )
}

function New-AzureDevDeployment {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$AllowedSshCidr,

    [Parameter(Mandatory = $true)]
    [string]$SshPublicKey,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$Image,

    [Parameter(Mandatory = $true)]
    [bool]$DataDiskExists,

    [switch]$Preview
  )

  $parameters = Get-AzureDevDeploymentParameters `
    -Context $Context `
    -AllowedSshCidr $AllowedSshCidr `
    -SshPublicKey $SshPublicKey `
    -Image $Image `
    -DataDiskExists $DataDiskExists

  $baseArgs = @(
    'deployment',
    'group',
    $(if ($Preview) { 'what-if' } else { 'create' }),
    '--resource-group',
    $Context.Config.ResourceGroup,
    '--subscription',
    $Context.Config.SubscriptionId,
    '--template-file',
    $Context.TemplatePath,
    '--parameters'
  ) + $parameters

  if ($Preview) {
    $result = Invoke-AzCli -Arguments (
      $baseArgs + @('--no-pretty-print', '--output', 'json')
    ) -Json
    Write-AzureDevWhatIfResult -Result $result
    Write-AzureDevWhatIfClassification -Result $result
    return $result
  }

  if ($PSCmdlet.ShouldProcess($Context.Config.ResourceGroup, 'Deploy Azure VM resources')) {
    return Invoke-AzCli -Arguments ($baseArgs + @('--output', 'json')) -Json
  }
  return $null
}

function Get-AzureDevPublicIpAddress {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $names = Get-AzureDevExpectedResourceNames -Config $Config
  try {
    return Invoke-AzCli -Arguments @(
      'network',
      'public-ip',
      'show',
      '--subscription',
      $Config.SubscriptionId,
      '--resource-group',
      $Config.ResourceGroup,
      '--name',
      $names.publicIpAddress,
      '--query',
      'ipAddress',
      '--output',
      'tsv'
    )
  } catch {
    return $null
  }
}

function Get-AzureDevVmPowerState {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  try {
    return Invoke-AzCli -Arguments @(
      'vm',
      'get-instance-view',
      '--subscription',
      $Config.SubscriptionId,
      '--resource-group',
      $Config.ResourceGroup,
      '--name',
      $Config.VmName,
      '--query',
      "instanceView.statuses[?starts_with(code, 'PowerState/')].displayStatus | [0]",
      '--output',
      'tsv'
    )
  } catch {
    return 'Not found'
  }
}

function Get-AzureDevVmAdminSshPublicKeys {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  try {
    $keys = Invoke-AzCli -Arguments @(
      'vm',
      'show',
      '--subscription',
      $Config.SubscriptionId,
      '--resource-group',
      $Config.ResourceGroup,
      '--name',
      $Config.VmName,
      '--query',
      'osProfile.linuxConfiguration.ssh.publicKeys[].keyData',
      '--output',
      'json'
    ) -Json
  } catch {
    return @()
  }

  return @($keys) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}

function Start-AzureDevAzureVm {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  if ($PSCmdlet.ShouldProcess($Context.Config.VmName, 'Start Azure VM')) {
    Invoke-AzCli -Arguments @(
      'vm',
      'start',
      '--subscription',
      $Context.Config.SubscriptionId,
      '--resource-group',
      $Context.Config.ResourceGroup,
      '--name',
      $Context.Config.VmName
    ) | Out-Null
  }
}

function Stop-AzureDevAzureVm {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  if ($PSCmdlet.ShouldProcess($Context.Config.VmName, 'Deallocate Azure VM')) {
    Invoke-AzCli -Arguments @(
      'vm',
      'deallocate',
      '--subscription',
      $Context.Config.SubscriptionId,
      '--resource-group',
      $Context.Config.ResourceGroup,
      '--name',
      $Context.Config.VmName
    ) | Out-Null
  }
}

function Update-AzureDevNetworkSecurityGroupCidr {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$AllowedSshCidr
  )

  $names = Get-AzureDevExpectedResourceNames -Config $Context.Config
  if ($PSCmdlet.ShouldProcess($names.networkSecurityGroup, "Set SSH CIDR to $AllowedSshCidr")) {
    Invoke-AzCli -Arguments @(
      'network',
      'nsg',
      'rule',
      'update',
      '--subscription',
      $Context.Config.SubscriptionId,
      '--resource-group',
      $Context.Config.ResourceGroup,
      '--nsg-name',
      $names.networkSecurityGroup,
      '--name',
      'AllowSshFromOperator',
      '--source-address-prefixes',
      $AllowedSshCidr,
      '--output',
      'json'
    ) -Json | Out-Null
  }
}

function Get-AzureDevManagedResources {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomObject]$Config
  )

  try {
    $resources = Invoke-AzCli -Arguments @(
      'resource',
      'list',
      '--subscription',
      $Config.SubscriptionId,
      '--resource-group',
      $Config.ResourceGroup,
      '--output',
      'json'
    ) -Json
  } catch {
    return @()
  }

  return @($resources) | Where-Object {
    $tagsProperty = $_.PSObject.Properties['tags']
    $tags = if ($null -ne $tagsProperty) { $tagsProperty.Value } else { $null }
    if ($null -eq $tags) {
      return $false
    }

    $tagValues = @{}
    foreach ($key in @('managed-by', 'environment-id', 'repository')) {
      $tagValues[$key] = if ($tags -is [System.Collections.IDictionary]) {
        $tags[$key]
      } else {
        $property = $tags.PSObject.Properties[$key]
        if ($null -ne $property) { $property.Value } else { $null }
      }
    }

    $tagValues['managed-by'] -eq $Config.ManagedBy -and
    $tagValues['environment-id'] -eq $Config.EnvironmentId -and
    $tagValues.repository -eq $Config.Repository
  }
}

function Get-AzureDevManagedResourcesForDeletion {
  [CmdletBinding()]
  param(
    [AllowNull()]
    [object[]]$Resources
  )

  $order = @{
    'Microsoft.DevTestLab/schedules' = 10
    'Microsoft.Compute/virtualMachines' = 20
    'Microsoft.Network/networkInterfaces' = 30
    'Microsoft.Network/publicIPAddresses' = 40
    'Microsoft.Network/virtualNetworks' = 50
    'Microsoft.Network/networkSecurityGroups' = 60
    'Microsoft.Compute/disks' = 70
    'Microsoft.Compute/sshPublicKeys' = 80
  }

  return @($Resources) | Sort-Object {
    if ($order.ContainsKey($_.type)) { $order[$_.type] } else { 90 }
  }, name
}

function Remove-AzureDevManagedResources {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  $resources = Get-AzureDevManagedResources -Config $Context.Config
  $sorted = Get-AzureDevManagedResourcesForDeletion -Resources $resources

  foreach ($resource in $sorted) {
    if ($PSCmdlet.ShouldProcess($resource.id, 'Delete managed Azure resource')) {
      try {
        Invoke-AzCli -Arguments @(
          'resource',
          'delete',
          '--subscription',
          $Context.Config.SubscriptionId,
          '--ids',
          $resource.id
        ) | Out-Null
      } catch {
        throw "Failed to delete $($resource.type) $($resource.name): $($_.Exception.Message)"
      }
    }
  }

  return $sorted
}

function Get-AzureDevDeploymentOutputs {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [object]$DeploymentResult
  )

  if ($null -eq $DeploymentResult -or $null -eq $DeploymentResult.properties) {
    return @{}
  }

  $outputs = @{}
  foreach ($property in $DeploymentResult.properties.outputs.PSObject.Properties) {
    $outputs[$property.Name] = $property.Value.value
  }
  return $outputs
}

Export-ModuleMember -Function `
  Connect-AzureDevServicePrincipal, `
  Get-AzureDevAccount, `
  Get-AzureDevDeploymentOutputs, `
  Get-AzureDevDeploymentParameters, `
  Get-AzureDevDataDisk, `
  Get-AzureDevExpectedResourceNames, `
  Get-AzureDevManagedResources, `
  Get-AzureDevPublicIpAddress, `
  Get-AzureDevResourceGroup, `
  Get-AzureDevDeploymentImage, `
  Get-AzureDevUbuntuImage, `
  Get-AzureDevVisibleSubscriptions, `
  Get-AzureDevVmAdminSshPublicKeys, `
  Get-AzureDevVmPowerState, `
  Invoke-AzCli, `
  New-AzureDevDeployment, `
  New-AzureDevResourceGroup, `
  Remove-AzureDevManagedResources, `
  Set-AzureDevDataDiskSize, `
  Set-AzureDevSubscription, `
  Get-AzureDevManagedResourcesForDeletion, `
  Start-AzureDevAzureVm, `
  Stop-AzureDevAzureVm, `
  Test-AzureDevLocalTool, `
  Test-AzureDevOwnershipTags, `
  Test-AzureDevPrerequisites, `
  Test-AzureDevRuntime, `
  Test-AzureDevSubscriptionVisible, `
  Test-AzureDevSkuAvailability, `
  Update-AzureDevNetworkSecurityGroupCidr
