Set-StrictMode -Version Latest

$script:AzureDevWhatIfDocumentationUrl = 'https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deploy-what-if'
$script:AzureDevTrustedLaunchSkuSupportCache = @{}

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

function Get-AzureDevOpenSshVersion {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('windows', 'macos', 'linux')]
    [string]$Platform
  )

  $sshCommand = Get-Command ssh -CommandType Application -ErrorAction Stop
  if ($Platform -eq 'windows') {
    if ($sshCommand.Version -eq [System.Version]::new(0, 0, 0, 0)) {
      throw 'Could not determine the Windows OpenSSH client version.'
    }
    return $sshCommand.Version
  }

  $sshVersionResult = Invoke-AzureDevNativeCommand `
    -FilePath $sshCommand.Source `
    -Arguments @('-V')
  $sshVersionMatch = [regex]::Match(
    $sshVersionResult.Text,
    'OpenSSH_(?<major>[0-9]+)\.(?<minor>[0-9]+)'
  )
  if ($sshVersionResult.ExitCode -ne 0 -or -not $sshVersionMatch.Success) {
    throw "Could not determine the $Platform OpenSSH client version."
  }
  return [System.Version]::new(
    [int]$sshVersionMatch.Groups['major'].Value,
    [int]$sshVersionMatch.Groups['minor'].Value
  )
}

function Get-AzureDevMinimumOpenSshVersion {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('windows', 'macos', 'linux')]
    [string]$Platform
  )

  if ($Platform -eq 'windows') {
    # Microsoft did not publish an OpenSSH for Windows 8.5 release.
    return [System.Version]::new(8, 6)
  }
  return [System.Version]::new(8, 5)
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

  $sshPlatform = if ($IsWindows) {
    'windows'
  } elseif ($IsMacOS) {
    'macos'
  } elseif ($IsLinux) {
    'linux'
  } else {
    throw 'Azure development scripts do not support this workstation platform.'
  }
  $sshPlatformLabels = @{
    windows = 'Windows'
    macos = 'macOS'
    linux = 'Linux'
  }
  $sshVersion = Get-AzureDevOpenSshVersion -Platform $sshPlatform
  $minimumSshVersion = Get-AzureDevMinimumOpenSshVersion -Platform $sshPlatform
  if ($sshVersion -lt $minimumSshVersion) {
    throw (
      "OpenSSH $minimumSshVersion or later is required on " +
      "$($sshPlatformLabels[$sshPlatform]). Detected OpenSSH $sshVersion. " +
      'Upgrade the OpenSSH client and rerun.'
    )
  }

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

function Get-AzureDevSkuCapabilityValue {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Sku,

    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $capabilities = Get-AzureDevJsonProperty `
    -InputObject $Sku `
    -Name 'capabilities'
  $capability = @($capabilities) |
    Where-Object {
      (Get-AzureDevJsonProperty -InputObject $_ -Name 'name') -ieq $Name
    } |
    Select-Object -First 1
  return Get-AzureDevJsonProperty -InputObject $capability -Name 'value'
}

function Get-AzureDevTrustedLaunchSkuSupport {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config,

    [Parameter(Mandatory = $true)]
    [string]$Size
  )

  $cacheKey = (
    "$($Config.SubscriptionId)|$($Config.Location)|$Size"
  ).ToLowerInvariant()
  if ($script:AzureDevTrustedLaunchSkuSupportCache.ContainsKey($cacheKey)) {
    return $script:AzureDevTrustedLaunchSkuSupportCache[$cacheKey]
  }

  $skus = Invoke-AzCli -Arguments @(
    'vm',
    'list-skus',
    '--subscription',
    $Config.SubscriptionId,
    '--location',
    $Config.Location,
    '--size',
    $Size,
    '--resource-type',
    'virtualMachines',
    '--all',
    '--output',
    'json'
  ) -Json
  $sku = @($skus) |
    Where-Object {
      (Get-AzureDevJsonProperty -InputObject $_ -Name 'name') -ieq $Size
    } |
    Select-Object -First 1
  if ($null -eq $sku) {
    $result = [pscustomobject]@{
      Supported = $false
      Reason = "VM SKU $Size is not available in $($Config.Location)."
    }
    $script:AzureDevTrustedLaunchSkuSupportCache[$cacheKey] = $result
    return $result
  }

  $restrictions = Get-AzureDevJsonProperty `
    -InputObject $sku `
    -Name 'restrictions'
  $blockingRestrictions = @($restrictions) |
    Where-Object {
      $reasonCode = Get-AzureDevJsonProperty `
        -InputObject $_ `
        -Name 'reasonCode'
      $restrictionType = Get-AzureDevJsonProperty `
        -InputObject $_ `
        -Name 'type'
      $reasonCode -in @('NotAvailableForSubscription', 'QuotaId') -or
        $restrictionType -in @('Location', 'Zone')
    }
  if (@($blockingRestrictions).Count -gt 0) {
    $restrictionSummary = @($blockingRestrictions) |
      ForEach-Object {
        $reasonCode = Get-AzureDevJsonProperty `
          -InputObject $_ `
          -Name 'reasonCode'
        $restrictionType = Get-AzureDevJsonProperty `
          -InputObject $_ `
          -Name 'type'
        "$restrictionType/$reasonCode".Trim('/')
      } |
      Select-Object -Unique
    $result = [pscustomobject]@{
      Supported = $false
      Reason = (
        "VM SKU $Size is restricted for this subscription or location: " +
        "$($restrictionSummary -join ', ')."
      )
    }
    $script:AzureDevTrustedLaunchSkuSupportCache[$cacheKey] = $result
    return $result
  }

  $generations = Get-AzureDevSkuCapabilityValue `
    -Sku $sku `
    -Name 'HyperVGenerations'
  $generationValues = @("$generations".Split(',')) |
    ForEach-Object { $_.Trim() }
  if ('V2' -notin $generationValues) {
    $result = [pscustomobject]@{
      Supported = $false
      Reason = "VM SKU $Size does not report Hyper-V generation V2 support."
    }
    $script:AzureDevTrustedLaunchSkuSupportCache[$cacheKey] = $result
    return $result
  }

  $trustedLaunchDisabled = Get-AzureDevSkuCapabilityValue `
    -Sku $sku `
    -Name 'TrustedLaunchDisabled'
  if ("$trustedLaunchDisabled" -ieq 'True') {
    $result = [pscustomobject]@{
      Supported = $false
      Reason = "VM SKU $Size reports TrustedLaunchDisabled=True."
    }
    $script:AzureDevTrustedLaunchSkuSupportCache[$cacheKey] = $result
    return $result
  }

  $result = [pscustomobject]@{
    Supported = $true
    Reason = $null
  }
  $script:AzureDevTrustedLaunchSkuSupportCache[$cacheKey] = $result
  return $result
}

function Test-AzureDevSkuAvailability {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $sizes = @($Config.VmSize, $Config.FallbackVmSize) | Select-Object -Unique
  foreach ($size in $sizes) {
    $support = Get-AzureDevTrustedLaunchSkuSupport `
      -Config $Config `
      -Size $size
    if (-not $support.Supported) {
      throw (
        "$($support.Reason) Azure Dev requires a VM size that supports " +
        'Trusted Launch.'
      )
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

  $publisher = $Config.ImagePublisher
  $offer = $Config.ImageOffer
  $sku = $Config.ImageSku
  $latestUrn = "${publisher}:${offer}:${sku}:latest"
  $details = Invoke-AzCli -Arguments @(
    'vm',
    'image',
    'show',
    '--subscription',
    $Config.SubscriptionId,
    '--urn',
    $latestUrn,
    '--location',
    $Config.Location,
    '--output',
    'json'
  ) -Json

  $version = Get-AzureDevJsonProperty -InputObject $details -Name 'name'
  if ([string]::IsNullOrWhiteSpace($version) -or $version -eq 'latest') {
    throw "Azure did not resolve $latestUrn to an exact image version in $($Config.Location)."
  }

  $deprecationStatus = Get-AzureDevJsonProperty `
    -InputObject $details `
    -Name 'imageDeprecationStatus'
  $imageState = Get-AzureDevJsonProperty `
    -InputObject $deprecationStatus `
    -Name 'imageState'
  if ($imageState -ne 'Active') {
    $reportedState = if ([string]::IsNullOrWhiteSpace($imageState)) {
      '<missing>'
    } else {
      $imageState
    }
    throw (
      "Azure resolved $latestUrn to version $version with image state " +
      "$reportedState; setup requires an Active image."
    )
  }

  $hyperVGeneration = Get-AzureDevJsonProperty `
    -InputObject $details `
    -Name 'hyperVGeneration'
  if ($hyperVGeneration -ne 'V2') {
    $reportedGeneration = if (
      [string]::IsNullOrWhiteSpace($hyperVGeneration)
    ) {
      '<missing>'
    } else {
      $hyperVGeneration
    }
    throw (
      "Azure resolved $latestUrn to version $version with Hyper-V generation " +
      "$reportedGeneration; setup requires a Gen2 image."
    )
  }

  $features = Get-AzureDevJsonProperty -InputObject $details -Name 'features'
  $securityTypeFeature = @($features) |
    Where-Object {
      (Get-AzureDevJsonProperty -InputObject $_ -Name 'name') -ieq
        'SecurityType'
    } |
    Select-Object -First 1
  $supportedSecurityTypes = Get-AzureDevJsonProperty `
    -InputObject $securityTypeFeature `
    -Name 'value'
  if ("$supportedSecurityTypes" -notmatch '(?i)TrustedLaunch') {
    $reportedSecurityTypes = if (
      [string]::IsNullOrWhiteSpace("$supportedSecurityTypes")
    ) {
      '<missing>'
    } else {
      "$supportedSecurityTypes"
    }
    throw (
      "Azure resolved $latestUrn to version $version with SecurityType " +
      "feature $reportedSecurityTypes; setup requires a Trusted Launch-capable " +
      'image.'
    )
  }

  $plan = Get-AzureDevJsonProperty -InputObject $details -Name 'plan'
  $urn = "${publisher}:${offer}:${sku}:${version}"

  return [pscustomobject]@{
    publisher = $publisher
    offer = $offer
    sku = $sku
    version = $version
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

function Get-AzureDevVmSecurityState {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  try {
    $vm = Invoke-AzCli -Arguments @(
      'vm',
      'show',
      '--subscription',
      $Config.SubscriptionId,
      '--resource-group',
      $Config.ResourceGroup,
      '--name',
      $Config.VmName,
      '--output',
      'json'
    ) -Json
  } catch {
    if (
      $_.Exception.Message -match
      '(?i)(ResourceGroupNotFound|ResourceNotFound|could not be found|was not found)'
    ) {
      return [pscustomobject]@{
        Exists = $false
        SecurityType = $null
        SecureBootEnabled = $false
        VTpmEnabled = $false
        HyperVGeneration = $null
        VmSize = $null
        OsType = $null
        ImagePublisher = $null
        ImageOffer = $null
        ImageSku = $null
        ImageVersion = $null
        HibernationEnabled = $false
        IsCompliant = $false
      }
    }
    throw
  }

  $securityProfile = Get-AzureDevJsonProperty `
    -InputObject $vm `
    -Name 'securityProfile'
  $securityType = Get-AzureDevJsonProperty `
    -InputObject $securityProfile `
    -Name 'securityType'
  if ([string]::IsNullOrWhiteSpace("$securityType")) {
    $securityType = 'Standard'
  }
  $uefiSettings = Get-AzureDevJsonProperty `
    -InputObject $securityProfile `
    -Name 'uefiSettings'
  $secureBootEnabled = (
    (Get-AzureDevJsonProperty `
      -InputObject $uefiSettings `
      -Name 'secureBootEnabled') -eq $true
  )
  $vTpmEnabled = (
    (Get-AzureDevJsonProperty `
      -InputObject $uefiSettings `
      -Name 'vTpmEnabled') -eq $true
  )

  $hardwareProfile = Get-AzureDevJsonProperty `
    -InputObject $vm `
    -Name 'hardwareProfile'
  $vmSize = Get-AzureDevJsonProperty `
    -InputObject $hardwareProfile `
    -Name 'vmSize'
  $storageProfile = Get-AzureDevJsonProperty `
    -InputObject $vm `
    -Name 'storageProfile'
  $osDisk = Get-AzureDevJsonProperty `
    -InputObject $storageProfile `
    -Name 'osDisk'
  $osType = Get-AzureDevJsonProperty -InputObject $osDisk -Name 'osType'
  $managedDisk = Get-AzureDevJsonProperty `
    -InputObject $osDisk `
    -Name 'managedDisk'
  $osDiskId = Get-AzureDevJsonProperty -InputObject $managedDisk -Name 'id'
  $hyperVGeneration = '<unknown>'
  if (-not [string]::IsNullOrWhiteSpace("$osDiskId")) {
    try {
      $disk = Invoke-AzCli -Arguments @(
        'disk',
        'show',
        '--subscription',
        $Config.SubscriptionId,
        '--ids',
        $osDiskId,
        '--output',
        'json'
      ) -Json
      $hyperVGeneration = Get-AzureDevJsonProperty `
        -InputObject $disk `
        -Name 'hyperVGeneration'
    } catch {
      Write-Verbose (
        "Could not read Hyper-V generation for OS disk $osDiskId`: " +
        "$($_.Exception.Message)"
      )
    }
  }
  if ([string]::IsNullOrWhiteSpace("$hyperVGeneration")) {
    $hyperVGeneration = '<unknown>'
  }

  $imageReference = Get-AzureDevJsonProperty `
    -InputObject $storageProfile `
    -Name 'imageReference'
  $additionalCapabilities = Get-AzureDevJsonProperty `
    -InputObject $vm `
    -Name 'additionalCapabilities'
  $hibernationEnabled = (
    (Get-AzureDevJsonProperty `
      -InputObject $additionalCapabilities `
      -Name 'hibernationEnabled') -eq $true
  )

  return [pscustomobject]@{
    Exists = $true
    SecurityType = "$securityType"
    SecureBootEnabled = $secureBootEnabled
    VTpmEnabled = $vTpmEnabled
    HyperVGeneration = "$hyperVGeneration"
    VmSize = "$vmSize"
    OsType = "$osType"
    ImagePublisher = Get-AzureDevJsonProperty `
      -InputObject $imageReference `
      -Name 'publisher'
    ImageOffer = Get-AzureDevJsonProperty `
      -InputObject $imageReference `
      -Name 'offer'
    ImageSku = Get-AzureDevJsonProperty `
      -InputObject $imageReference `
      -Name 'sku'
    ImageVersion = Get-AzureDevJsonProperty `
      -InputObject $imageReference `
      -Name 'version'
    HibernationEnabled = $hibernationEnabled
    IsCompliant = (
      "$securityType" -ieq 'TrustedLaunch' -and
      $secureBootEnabled -and
      $vTpmEnabled -and
      "$hyperVGeneration" -eq 'V2'
    )
  }
}

function New-AzureDevTrustedLaunchPlan {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$State,

    [Parameter(Mandatory = $true)]
    [string]$Action,

    [Parameter(Mandatory = $true)]
    [bool]$TemplateEnabled,

    [Parameter(Mandatory = $true)]
    [bool]$RequiresGuestValidation,

    [AllowNull()]
    [string]$Reason
  )

  return [pscustomobject]@{
    State = $State
    Action = $Action
    TemplateEnabled = $TemplateEnabled
    RequiresGuestValidation = $RequiresGuestValidation
    Reason = $Reason
  }
}

function Get-AzureDevTrustedLaunchPlan {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $state = Get-AzureDevVmSecurityState -Config $Config
  if (-not $state.Exists) {
    return New-AzureDevTrustedLaunchPlan `
      -State $state `
      -Action 'Create' `
      -TemplateEnabled $true `
      -RequiresGuestValidation $false `
      -Reason $null
  }
  if ($state.IsCompliant) {
    return New-AzureDevTrustedLaunchPlan `
      -State $state `
      -Action 'None' `
      -TemplateEnabled $true `
      -RequiresGuestValidation $false `
      -Reason $null
  }
  if ($state.HibernationEnabled) {
    return New-AzureDevTrustedLaunchPlan `
      -State $state `
      -Action 'Unsupported' `
      -TemplateEnabled $false `
      -RequiresGuestValidation $false `
      -Reason 'Linux VM hibernation is not supported with Trusted Launch.'
  }

  try {
    $sizeSupport = Get-AzureDevTrustedLaunchSkuSupport `
      -Config $Config `
      -Size $state.VmSize
  } catch {
    return New-AzureDevTrustedLaunchPlan `
      -State $state `
      -Action 'Unsupported' `
      -TemplateEnabled $false `
      -RequiresGuestValidation $false `
      -Reason (
        "Azure could not verify Trusted Launch support for current VM size " +
        "$($state.VmSize): $($_.Exception.Message)"
      )
  }
  if (-not $sizeSupport.Supported) {
    return New-AzureDevTrustedLaunchPlan `
      -State $state `
      -Action 'Unsupported' `
      -TemplateEnabled $false `
      -RequiresGuestValidation $false `
      -Reason $sizeSupport.Reason
  }
  if ($state.OsType -ine 'Linux') {
    return New-AzureDevTrustedLaunchPlan `
      -State $state `
      -Action 'Unsupported' `
      -TemplateEnabled $false `
      -RequiresGuestValidation $false `
      -Reason "Existing OS type $($state.OsType) is not supported by this Linux setup."
  }
  if ($state.SecurityType -notin @('Standard', 'TrustedLaunch')) {
    return New-AzureDevTrustedLaunchPlan `
      -State $state `
      -Action 'Unsupported' `
      -TemplateEnabled $false `
      -RequiresGuestValidation $false `
      -Reason "Existing security type $($state.SecurityType) cannot be changed to TrustedLaunch by setup."
  }
  if ($state.ImagePublisher -ine 'Canonical') {
    $publisher = if ([string]::IsNullOrWhiteSpace("$($state.ImagePublisher)")) {
      '<custom or missing>'
    } else {
      $state.ImagePublisher
    }
    return New-AzureDevTrustedLaunchPlan `
      -State $state `
      -Action 'Unsupported' `
      -TemplateEnabled $false `
      -RequiresGuestValidation $false `
      -Reason (
        "Existing image publisher $publisher is not a supported Canonical " +
        'Marketplace source for automatic conversion.'
      )
  }

  if ($state.SecurityType -ieq 'TrustedLaunch') {
    if ($state.HyperVGeneration -ne 'V2') {
      return New-AzureDevTrustedLaunchPlan `
        -State $state `
        -Action 'Unsupported' `
        -TemplateEnabled $false `
        -RequiresGuestValidation $false `
        -Reason (
          "Existing VM reports TrustedLaunch with Hyper-V generation " +
          "$($state.HyperVGeneration); setup will not modify an inconsistent " +
          'security state.'
        )
    }
    return New-AzureDevTrustedLaunchPlan `
      -State $state `
      -Action 'EnableFeatures' `
      -TemplateEnabled $true `
      -RequiresGuestValidation $true `
      -Reason $null
  }

  if ($state.HyperVGeneration -eq 'V2') {
    return New-AzureDevTrustedLaunchPlan `
      -State $state `
      -Action 'UpgradeGen2' `
      -TemplateEnabled $true `
      -RequiresGuestValidation $true `
      -Reason $null
  }
  if ($state.HyperVGeneration -eq 'V1') {
    return New-AzureDevTrustedLaunchPlan `
      -State $state `
      -Action 'UpgradeGen1' `
      -TemplateEnabled $true `
      -RequiresGuestValidation $true `
      -Reason $null
  }

  return New-AzureDevTrustedLaunchPlan `
    -State $state `
    -Action 'Unsupported' `
    -TemplateEnabled $false `
    -RequiresGuestValidation $false `
    -Reason (
      "Existing OS disk reports unknown Hyper-V generation " +
      "$($state.HyperVGeneration)."
    )
}

function Set-AzureDevTrustedLaunch {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$Plan
  )

  if ($Plan.Action -notin @('EnableFeatures', 'UpgradeGen2', 'UpgradeGen1')) {
    return [pscustomobject]@{
      Succeeded = $Plan.State.IsCompliant
      State = $Plan.State
    }
  }
  if (-not $PSCmdlet.ShouldProcess(
      $Context.Config.VmName,
      'Deallocate VM and enable Trusted Launch, Secure Boot, and vTPM'
    )) {
    return [pscustomobject]@{
      Succeeded = $false
      State = $Plan.State
    }
  }

  Stop-AzureDevAzureVm -Context $Context
  try {
    Invoke-AzCli -Arguments @(
      'vm',
      'update',
      '--subscription',
      $Context.Config.SubscriptionId,
      '--resource-group',
      $Context.Config.ResourceGroup,
      '--name',
      $Context.Config.VmName,
      '--security-type',
      'TrustedLaunch',
      '--enable-secure-boot',
      'true',
      '--enable-vtpm',
      'true',
      '--output',
      'json'
    ) -Json | Out-Null
  } catch {
    $updateError = $_
    $refreshedState = Get-AzureDevVmSecurityState -Config $Context.Config
    if ($refreshedState.IsCompliant) {
      return [pscustomobject]@{
        Succeeded = $true
        State = $refreshedState
      }
    }
    if ($refreshedState.SecurityType -ine $Plan.State.SecurityType) {
      throw (
        'Azure reported a Trusted Launch update failure after changing the VM ' +
        "security state to $($refreshedState.SecurityType). Setup stopped to " +
        'avoid applying further changes. The VM remains deallocated; inspect ' +
        'it in Azure and restart it manually before retrying.'
      )
    }
    try {
      Start-AzureDevAzureVm -Context $Context
    } catch {
      Write-Warning (
        "Azure also could not restart existing VM " +
        "$($Context.Config.VmName) after the rejected Trusted Launch update: " +
        "$($_.Exception.Message)"
      )
    }
    Write-Warning (
      "Azure could not enable Trusted Launch on existing VM " +
      "$($Context.Config.VmName): $($updateError.Exception.Message) " +
      'Setup will preserve the existing security profile and continue repairing ' +
      'mutable configuration.'
    )
    return [pscustomobject]@{
      Succeeded = $false
      State = $refreshedState
    }
  }

  $updatedState = Get-AzureDevVmSecurityState -Config $Context.Config
  if (-not $updatedState.IsCompliant) {
    throw (
      'Azure accepted the Trusted Launch update, but verification did not ' +
      'report TrustedLaunch with Hyper-V generation V2, Secure Boot enabled, ' +
      'and vTPM enabled. Setup stopped before applying further changes. The VM ' +
      'remains deallocated and must be restarted manually after inspection.'
    )
  }

  return [pscustomobject]@{
    Succeeded = $true
    State = $updatedState
  }
}

function Write-AzureDevImageDeprecationWarning {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$Image
  )

  try {
    $details = Invoke-AzCli -Arguments @(
      'vm',
      'image',
      'show',
      '--subscription',
      $Config.SubscriptionId,
      '--urn',
      $Image.urn,
      '--location',
      $Config.Location,
      '--output',
      'json'
    ) -Json
  } catch {
    Write-Warning (
      "Could not verify Marketplace deprecation status for existing image " +
      "$($Image.urn). The Azure image lookup failed, but this command will " +
      'continue using the existing VM and OS disk. Check Azure Advisor or the ' +
      'image version manually before relying on Marketplace reimage support.'
    )
    return
  }

  $deprecationStatus = Get-AzureDevJsonProperty `
    -InputObject $details `
    -Name 'imageDeprecationStatus'
  $imageState = Get-AzureDevJsonProperty `
    -InputObject $deprecationStatus `
    -Name 'imageState'
  if ($imageState -eq 'Active') {
    return
  }

  if ($imageState -eq 'ScheduledForDeprecation') {
    $scheduledTime = Get-AzureDevJsonProperty `
      -InputObject $deprecationStatus `
      -Name 'scheduledDeprecationTime'
    $scheduledText = if ([string]::IsNullOrWhiteSpace($scheduledTime)) {
      '<unknown date>'
    } elseif ($scheduledTime -is [DateTimeOffset]) {
      $scheduledTime.ToUniversalTime().ToString(
        "yyyy-MM-dd HH:mm:ss 'UTC'",
        [Globalization.CultureInfo]::InvariantCulture
      )
    } elseif ($scheduledTime -is [DateTime]) {
      $scheduledTime.ToUniversalTime().ToString(
        "yyyy-MM-dd HH:mm:ss 'UTC'",
        [Globalization.CultureInfo]::InvariantCulture
      )
    } else {
      $scheduledTime
    }
    Write-Warning (
      "Existing VM image $($Image.urn) is scheduled for Marketplace " +
      "deprecation at $scheduledText. The VM can continue using its OS disk, " +
      'and this command will continue. To retain an active Marketplace source ' +
      'for future creation or reimage, back up required data and recreate the ' +
      'disposable environment from the configured latest image.'
    )
    return
  }

  $reportedState = if ([string]::IsNullOrWhiteSpace($imageState)) {
    '<missing>'
  } else {
    $imageState
  }
  Write-Warning (
    "Existing VM image $($Image.urn) reports Marketplace image state " +
    "$reportedState. The VM can continue using its OS disk, and this command " +
    'will continue, but Marketplace creation or reimage support might be ' +
    'unavailable. Check Azure Advisor and recreate from an active image when ' +
    'appropriate.'
  )
}

function Get-AzureDevDeploymentImage {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $existingImage = Get-AzureDevVmImage -Config $Config
  if ($null -ne $existingImage) {
    Write-AzureDevImageDeprecationWarning `
      -Config $Config `
      -Image $existingImage
    $configuredImageFamily = (
      "$($Config.ImagePublisher):$($Config.ImageOffer):" +
      "$($Config.ImageSku):latest"
    )
    $imageFamilyChanged = (
      $existingImage.publisher -ine $Config.ImagePublisher -or
      $existingImage.offer -ine $Config.ImageOffer -or
      $existingImage.sku -ine $Config.ImageSku
    )
    if ($imageFamilyChanged) {
      Write-Warning (
        "Existing VM $($Config.VmName) uses immutable Marketplace image " +
        "$($existingImage.urn), while configuration targets " +
        "$configuredImageFamily. Azure cannot change the image publisher, " +
        'offer, SKU, or version in place. Eligible Gen1 VMs can be converted to ' +
        'Gen2 Trusted Launch, but Azure retains their original Gen1 image ' +
        'reference. Setup will preserve the existing image and attached disks ' +
        'and continue repairing mutable configuration. To apply the configured ' +
        'image, back up any required data, remove the disposable environment, ' +
        'and run setup again; the managed OS and data disks are deleted during ' +
        'removal.'
      )
    }
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
    [AllowEmptyCollection()]
    [object[]]$SshAccessRules,

    [Parameter(Mandatory = $true)]
    [string]$SshPublicKey,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$Image,

    [Parameter(Mandatory = $true)]
    [bool]$DataDiskExists,

    [Parameter(Mandatory = $true)]
    [bool]$TrustedLaunchEnabled
  )

  $config = $Context.Config
  $sshAccessRulesJson = ConvertTo-Json `
    -InputObject @($SshAccessRules) `
    -Compress `
    -Depth 5
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
    "sshAccessRules=$sshAccessRulesJson",
    "autoStopEnabled=$($config.AutoStopEnabled.ToString().ToLowerInvariant())",
    "autoStopTime=$($config.AutoStopTime)",
    "autoStopTimeZone=$($config.AutoStopTimeZone)",
    "imagePublisher=$($Image.publisher)",
    "imageOffer=$($Image.offer)",
    "imageSku=$($Image.sku)",
    "imageVersion=$($Image.version)",
    "trustedLaunchEnabled=$($TrustedLaunchEnabled.ToString().ToLowerInvariant())"
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
    [AllowEmptyCollection()]
    [object[]]$SshAccessRules,

    [Parameter(Mandatory = $true)]
    [string]$SshPublicKey,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$Image,

    [Parameter(Mandatory = $true)]
    [bool]$DataDiskExists,

    [Parameter(Mandatory = $true)]
    [bool]$TrustedLaunchEnabled,

    [switch]$Preview
  )

  $parameters = Get-AzureDevDeploymentParameters `
    -Context $Context `
    -SshAccessRules $SshAccessRules `
    -SshPublicKey $SshPublicKey `
    -Image $Image `
    -DataDiskExists $DataDiskExists `
    -TrustedLaunchEnabled $TrustedLaunchEnabled

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

$script:AzureDevManagedSshRulePrefix = 'AllowSshKrav-'
$script:AzureDevSshRulePriorityStart = 2000
$script:AzureDevSshRuleLimit = 64

function ConvertTo-AzureDevAccessName {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value,

    [string]$Label = 'name'
  )

  $normalized = $Value.Trim().ToLowerInvariant() -replace '[^a-z0-9-]', '-'
  $normalized = $normalized -replace '-+', '-'
  $normalized = $normalized.Trim('-')
  if (
    [string]::IsNullOrWhiteSpace($normalized) -or
    $normalized.Length -gt 24
  ) {
    throw "$Label must normalize to 1-24 lowercase letters, numbers, or hyphens."
  }
  return $normalized
}

function New-AzureDevSshAccessRuleSpec {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkstationName,

    [Parameter(Mandatory = $true)]
    [string]$AccessName,

    [Parameter(Mandatory = $true)]
    [string]$Cidr,

    [int]$Priority = $script:AzureDevSshRulePriorityStart
  )

  $name = Get-AzureDevSshAccessRuleName `
    -WorkstationName $WorkstationName `
    -AccessName $AccessName
  $workstation = ConvertTo-AzureDevAccessName `
    -Value $WorkstationName `
    -Label 'Workstation name'
  $access = ConvertTo-AzureDevAccessName `
    -Value $AccessName `
    -Label 'Access name'
  return [pscustomobject]@{
    name = $name
    description = (
      'kravhantering-azure-dev;schema=2;' +
      "workstation=$workstation;access=$access"
    )
    priority = $Priority
    cidr = $Cidr
    workstation = $workstation
    access = $access
  }
}

function Get-AzureDevSshAccessRuleName {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkstationName,

    [Parameter(Mandatory = $true)]
    [string]$AccessName
  )

  $workstation = ConvertTo-AzureDevAccessName `
    -Value $WorkstationName `
    -Label 'Workstation name'
  $access = ConvertTo-AzureDevAccessName `
    -Value $AccessName `
    -Label 'Access name'
  return "$script:AzureDevManagedSshRulePrefix$workstation-$access"
}

function Get-AzureDevSshAccessRules {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $names = Get-AzureDevExpectedResourceNames -Config $Config
  try {
    $rules = Invoke-AzCli -Arguments @(
      'network',
      'nsg',
      'rule',
      'list',
      '--subscription',
      $Config.SubscriptionId,
      '--resource-group',
      $Config.ResourceGroup,
      '--nsg-name',
      $names.networkSecurityGroup,
      '--output',
      'json'
    ) -Json
  } catch {
    if (
      $_.Exception.Message -match
      '(?i)(ResourceGroupNotFound|ResourceNotFound|could not be found|was not found)'
    ) {
      return @()
    }
    throw
  }

  $result = New-Object System.Collections.Generic.List[object]
  foreach ($rule in @($rules)) {
    $isManaged = $rule.name.StartsWith(
      $script:AzureDevManagedSshRulePrefix,
      [System.StringComparison]::Ordinal
    )
    if (-not $isManaged) {
      continue
    }

    $cidrProperty = $rule.PSObject.Properties['sourceAddressPrefix']
    $cidr = if ($null -ne $cidrProperty) {
      [string]$cidrProperty.Value
    } else {
      ''
    }
    if ([string]::IsNullOrWhiteSpace($cidr)) {
      $prefixesProperty = $rule.PSObject.Properties['sourceAddressPrefixes']
      $prefixes = if ($null -ne $prefixesProperty) {
        @($prefixesProperty.Value)
      } else {
        @()
      }
      if ($prefixes.Count -eq 1) {
        $cidr = [string]$prefixes[0]
      }
    }
    if ([string]::IsNullOrWhiteSpace($cidr)) {
      throw "Managed SSH rule $($rule.name) must contain exactly one source CIDR."
    }

    $description = [string]$rule.description
    if (
      $description -notmatch (
        '^kravhantering-azure-dev;schema=2;' +
        'workstation=([a-z0-9-]+);access=([a-z0-9-]+)$'
      )
    ) {
      throw "Managed SSH rule $($rule.name) has an invalid description."
    }
    $result.Add([pscustomobject]@{
        name = [string]$rule.name
        description = $description
        priority = [int]$rule.priority
        cidr = $cidr
        workstation = $Matches[1]
        access = $Matches[2]
      })
  }
  return @($result | Sort-Object priority, name)
}

function Get-AzureDevNextSshRulePriority {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Rules
  )

  $used = @{}
  foreach ($rule in @($Rules)) {
    $used[[int]$rule.priority] = $true
  }
  for (
    $priority = $script:AzureDevSshRulePriorityStart;
    $priority -lt (
      $script:AzureDevSshRulePriorityStart + $script:AzureDevSshRuleLimit
    );
    $priority += 1
  ) {
    if (-not $used.ContainsKey($priority)) {
      return $priority
    }
  }
  throw "The environment already uses all $script:AzureDevSshRuleLimit managed SSH rule priorities."
}

function Set-AzureDevSshAccessRule {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$WorkstationName,

    [Parameter(Mandatory = $true)]
    [string]$AccessName,

    [Parameter(Mandatory = $true)]
    [string]$Cidr,

    [switch]$Replace
  )

  $rules = @(
    Get-AzureDevSshAccessRules -Config $Context.Config
  )
  $candidate = New-AzureDevSshAccessRuleSpec `
    -WorkstationName $WorkstationName `
    -AccessName $AccessName `
    -Cidr $Cidr
  $existing = @($rules | Where-Object { $_.name -eq $candidate.name })
  if ($existing.Count -gt 0) {
    if ($existing[0].cidr -eq $Cidr) {
      return $existing[0]
    }
    if (-not $Replace) {
      throw (
        "SSH access $WorkstationName/$AccessName already exists with CIDR " +
        "$($existing[0].cidr). Use set-cidr to replace it explicitly."
      )
    }
    $candidate.priority = [int]$existing[0].priority
  } else {
    if ($rules.Count -ge $script:AzureDevSshRuleLimit) {
      throw "An environment supports at most $script:AzureDevSshRuleLimit managed CIDRs."
    }
    $candidate.priority = Get-AzureDevNextSshRulePriority -Rules $rules
  }

  $names = Get-AzureDevExpectedResourceNames -Config $Context.Config
  if (
    $PSCmdlet.ShouldProcess(
      "$WorkstationName/$AccessName ($Cidr)",
      'Create or update managed SSH CIDR rule'
    )
  ) {
    Invoke-AzCli -Arguments @(
      'network',
      'nsg',
      'rule',
      'create',
      '--subscription',
      $Context.Config.SubscriptionId,
      '--resource-group',
      $Context.Config.ResourceGroup,
      '--nsg-name',
      $names.networkSecurityGroup,
      '--name',
      $candidate.name,
      '--description',
      $candidate.description,
      '--priority',
      $candidate.priority.ToString(),
      '--direction',
      'Inbound',
      '--access',
      'Allow',
      '--protocol',
      'Tcp',
      '--source-address-prefixes',
      $candidate.cidr,
      '--source-port-ranges=*',
      '--destination-address-prefixes=*',
      '--destination-port-ranges',
      '22',
      '--output',
      'json'
    ) -Json | Out-Null
  }
  return $candidate
}

function Remove-AzureDevSshAccessRule {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$RuleName
  )

  $names = Get-AzureDevExpectedResourceNames -Config $Context.Config
  if ($PSCmdlet.ShouldProcess($RuleName, 'Remove managed SSH CIDR rule')) {
    Invoke-AzCli -Arguments @(
      'network',
      'nsg',
      'rule',
      'delete',
      '--subscription',
      $Context.Config.SubscriptionId,
      '--resource-group',
      $Context.Config.ResourceGroup,
      '--nsg-name',
      $names.networkSecurityGroup,
      '--name',
      $RuleName
    ) | Out-Null
  }
}

function Set-AzureDevSshAccessSchema {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  $names = Get-AzureDevExpectedResourceNames -Config $Context.Config
  if (
    $PSCmdlet.ShouldProcess(
      $names.networkSecurityGroup,
      'Mark SSH access schema version 2'
    )
  ) {
    Invoke-AzCli -Arguments @(
      'network',
      'nsg',
      'update',
      '--subscription',
      $Context.Config.SubscriptionId,
      '--resource-group',
      $Context.Config.ResourceGroup,
      '--name',
      $names.networkSecurityGroup,
      '--force-string',
      'true',
      '--set',
      'tags.ssh-access-schema=2',
      '--output',
      'json'
    ) -Json | Out-Null
  }
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
  ConvertTo-AzureDevAccessName, `
  Get-AzureDevAccount, `
  Get-AzureDevDeploymentOutputs, `
  Get-AzureDevDeploymentParameters, `
  Get-AzureDevDataDisk, `
  Get-AzureDevExpectedResourceNames, `
  Get-AzureDevSshAccessRuleName, `
  Get-AzureDevNextSshRulePriority, `
  Get-AzureDevManagedResources, `
  Get-AzureDevPublicIpAddress, `
  Get-AzureDevResourceGroup, `
  Get-AzureDevDeploymentImage, `
  Get-AzureDevTrustedLaunchPlan, `
  Get-AzureDevTrustedLaunchSkuSupport, `
  Get-AzureDevUbuntuImage, `
  Get-AzureDevVisibleSubscriptions, `
  Get-AzureDevVmAdminSshPublicKeys, `
  Get-AzureDevSshAccessRules, `
  Get-AzureDevVmSecurityState, `
  Write-AzureDevImageDeprecationWarning, `
  Get-AzureDevVmPowerState, `
  Invoke-AzCli, `
  New-AzureDevDeployment, `
  New-AzureDevSshAccessRuleSpec, `
  New-AzureDevResourceGroup, `
  Remove-AzureDevManagedResources, `
  Remove-AzureDevSshAccessRule, `
  Set-AzureDevDataDiskSize, `
  Set-AzureDevSubscription, `
  Set-AzureDevTrustedLaunch, `
  Set-AzureDevSshAccessSchema, `
  Set-AzureDevSshAccessRule, `
  Get-AzureDevManagedResourcesForDeletion, `
  Start-AzureDevAzureVm, `
  Stop-AzureDevAzureVm, `
  Test-AzureDevLocalTool, `
  Test-AzureDevOwnershipTags, `
  Test-AzureDevPrerequisites, `
  Test-AzureDevRuntime, `
  Test-AzureDevSubscriptionVisible, `
  Test-AzureDevSkuAvailability
