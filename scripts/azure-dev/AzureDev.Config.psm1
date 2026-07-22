Set-StrictMode -Version Latest

$script:AzureDevManagedBy = 'kravhantering-azure-dev'
$script:AzureDevRepository = 'viscalyx/Kravhantering'
$script:AzureDevPurpose = 'personal-development'
$script:AzureDevSetupVersion = 1

function Get-AzureDevDefaultConfig {
  [CmdletBinding()]
  param()

  return [ordered]@{
    AZURE_CLIENT_ID = ''
    AZURE_CLIENT_SECRET = ''
    AZURE_DEV_TAILSCALE_AUTH_KEY = ''
    AZURE_DEV_TAILSCALE_TAILNET = ''
    AZURE_DEV_UBUNTU_PRO_TOKEN = ''
    AZURE_DEV_VM_ENVIRONMENT_ID = 'personal'
    AZURE_DEV_VM_NAME_PREFIX = 'krav-dev'
    AZURE_DEV_VM_NAME = 'krav-dev-vm'
    AZURE_DEV_VM_SIZE = 'Standard_D8s_v5'
    AZURE_DEV_VM_FALLBACK_SIZE = 'Standard_D8as_v5'
    AZURE_DEV_VM_DATA_DISK_GIB = '256'
    AZURE_DEV_VM_CONNECTIVITY_MODE = 'public-ssh'
    AZURE_DEV_VM_ALLOWED_SSH_CIDR = 'auto'
    AZURE_DEV_VM_SSH_HOST_ALIAS = 'kravhantering-azure-dev'
    AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH = '~/.ssh/kravhantering_azure_dev_ed25519'
    AZURE_DEV_VM_AUTO_STOP_ENABLED = 'true'
    AZURE_DEV_VM_AUTO_STOP_TIME = '2200'
    AZURE_DEV_VM_AUTO_STOP_TIME_ZONE = 'UTC'
    AZURE_DEV_VM_LOCATION = 'eastus2'
    AZURE_DEV_VM_RESOURCE_GROUP = ''
    AZURE_DEV_VM_SUBSCRIPTION_ID = ''
    AZURE_TENANT_ID = ''
    KEYCLOAK_ADMIN_PASSWORD = ''
    MSSQL_SA_PASSWORD = ''
  }
}

function Import-AzureDevEnvFile {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [switch]$Optional
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    if ($Optional) {
      return @{}
    }
    throw "Required environment file is missing: $Path"
  }

  $result = @{}
  $lineNumber = 0
  foreach ($line in Get-Content -LiteralPath $Path) {
    $lineNumber += 1
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) {
      continue
    }
    if ($trimmed.StartsWith('export ')) {
      throw "$Path line $lineNumber uses export, which is not supported."
    }
    if ($trimmed -notmatch '^([A-Z][A-Z0-9_]*)=(.*)$') {
      throw "$Path line $lineNumber is not valid KEY=value syntax."
    }

    $key = $Matches[1]
    $rawValue = $Matches[2].Trim()
    if ($rawValue.Contains('$(') -or $rawValue.Contains('`')) {
      throw "$Path line $lineNumber contains shell evaluation syntax."
    }
    if (
      ($rawValue.StartsWith('"') -and -not $rawValue.EndsWith('"')) -or
      ($rawValue.StartsWith("'") -and -not $rawValue.EndsWith("'"))
    ) {
      throw "$Path line $lineNumber has an unterminated quoted value."
    }
    if (
      ($rawValue.StartsWith('"') -and $rawValue.EndsWith('"')) -or
      ($rawValue.StartsWith("'") -and $rawValue.EndsWith("'"))
    ) {
      $rawValue = $rawValue.Substring(1, $rawValue.Length - 2)
    }
    if ($rawValue -match '\$\{?[A-Za-z_][A-Za-z0-9_]*\}?') {
      throw "$Path line $lineNumber contains variable expansion syntax."
    }

    $result[$key] = $rawValue
  }

  return $result
}

function ConvertTo-AzureDevBoolean {
  [CmdletBinding()]
  param(
    [AllowNull()]
    [string]$Value,

    [bool]$DefaultValue = $false
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $DefaultValue
  }

  switch ($Value.Trim().ToLowerInvariant()) {
    { $_ -in @('1', 'true', 'yes', 'y', 'on') } { return $true }
    { $_ -in @('0', 'false', 'no', 'n', 'off') } { return $false }
    default { throw "Invalid boolean value: $Value" }
  }
}

function Resolve-AzureDevPath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if ($Path -eq '~') {
    return $HOME
  }
  if ($Path.StartsWith("~/") -or $Path.StartsWith("~\")) {
    return (Join-Path $HOME $Path.Substring(2))
  }
  return $Path
}

function Get-AzureDevTags {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$EnvironmentId
  )

  return [ordered]@{
    'managed-by' = $script:AzureDevManagedBy
    'environment-id' = $EnvironmentId
    repository = $script:AzureDevRepository
    purpose = $script:AzureDevPurpose
  }
}

function Get-AzureDevConfig {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,

    [string]$EnvironmentFile = '.env.azure.development',

    [switch]$RequireEnvironmentFile,

    [switch]$AllowMissingAzureScope
  )

  $primaryPath = Join-Path $RepositoryRoot $EnvironmentFile
  $localPath = Join-Path $RepositoryRoot '.env.azure.development.local'
  $values = Get-AzureDevDefaultConfig

  $primaryValues = Import-AzureDevEnvFile `
    -Path $primaryPath `
    -Optional:(!$RequireEnvironmentFile)
  foreach ($key in $primaryValues.Keys) {
    $values[$key] = $primaryValues[$key]
  }

  $localValues = Import-AzureDevEnvFile -Path $localPath -Optional
  foreach ($key in $localValues.Keys) {
    $values[$key] = $localValues[$key]
  }

  $trackedKeys = @(
    @($values.Keys) +
      @(
        'AZURE_DEV_VM_SUBSCRIPTION_ID',
        'AZURE_DEV_VM_RESOURCE_GROUP',
        'AZURE_TENANT_ID',
        'AZURE_CLIENT_ID',
        'AZURE_CLIENT_SECRET',
        'AZURE_DEV_TAILSCALE_AUTH_KEY',
        'AZURE_DEV_TAILSCALE_TAILNET'
      )
  ) | Select-Object -Unique

  foreach ($key in $trackedKeys) {
    $item = Get-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
    if ($null -ne $item) {
      $values[$key] = $item.Value
    }
  }

  $privateKeyPath = Resolve-AzureDevPath `
    -Path $values.AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH
  $publicKeyPath = "$privateKeyPath.pub"
  $environmentId = $values.AZURE_DEV_VM_ENVIRONMENT_ID

  $config = [pscustomobject]@{
    RepoRoot = $RepositoryRoot
    EnvironmentFilePath = $primaryPath
    LocalEnvironmentFilePath = $localPath
    SubscriptionId = $values.AZURE_DEV_VM_SUBSCRIPTION_ID
    ResourceGroup = $values.AZURE_DEV_VM_RESOURCE_GROUP
    Location = $values.AZURE_DEV_VM_LOCATION
    EnvironmentId = $environmentId
    NamePrefix = $values.AZURE_DEV_VM_NAME_PREFIX
    VmName = $values.AZURE_DEV_VM_NAME
    VmSize = $values.AZURE_DEV_VM_SIZE
    FallbackVmSize = $values.AZURE_DEV_VM_FALLBACK_SIZE
    DataDiskGiB = [int]$values.AZURE_DEV_VM_DATA_DISK_GIB
    ConnectivityMode = $values.AZURE_DEV_VM_CONNECTIVITY_MODE
    AllowedSshCidr = $values.AZURE_DEV_VM_ALLOWED_SSH_CIDR
    SshHostAlias = $values.AZURE_DEV_VM_SSH_HOST_ALIAS
    SshPrivateKeyPath = $privateKeyPath
    SshPublicKeyPath = $publicKeyPath
    AutoStopEnabled = ConvertTo-AzureDevBoolean `
      -Value $values.AZURE_DEV_VM_AUTO_STOP_ENABLED `
      -DefaultValue $true
    AutoStopTime = $values.AZURE_DEV_VM_AUTO_STOP_TIME
    AutoStopTimeZone = $values.AZURE_DEV_VM_AUTO_STOP_TIME_ZONE
    Tags = Get-AzureDevTags -EnvironmentId $environmentId
    ManagedBy = $script:AzureDevManagedBy
    Repository = $script:AzureDevRepository
    Purpose = $script:AzureDevPurpose
    SetupVersion = $script:AzureDevSetupVersion
    TenantId = $values.AZURE_TENANT_ID
    ClientId = $values.AZURE_CLIENT_ID
    ClientSecret = $values.AZURE_CLIENT_SECRET
    KeycloakAdminPassword = $values.KEYCLOAK_ADMIN_PASSWORD
    SqlServerSaPassword = $values.MSSQL_SA_PASSWORD
    TailscaleAuthKey = $values.AZURE_DEV_TAILSCALE_AUTH_KEY
    TailscaleTailnet = $values.AZURE_DEV_TAILSCALE_TAILNET
    UbuntuProToken = $values.AZURE_DEV_UBUNTU_PRO_TOKEN
  }

  Test-AzureDevConfig `
    -Config $config `
    -AllowMissingAzureScope:$AllowMissingAzureScope
  return $config
}

function Test-AzureDevConfig {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config,

    [switch]$AllowMissingAzureScope
  )

  $required = if ($AllowMissingAzureScope) {
    [ordered]@{
      AZURE_DEV_VM_LOCATION = $Config.Location
    }
  } else {
    [ordered]@{
      AZURE_DEV_VM_SUBSCRIPTION_ID = $Config.SubscriptionId
      AZURE_DEV_VM_RESOURCE_GROUP = $Config.ResourceGroup
      AZURE_DEV_VM_LOCATION = $Config.Location
    }
  }
  foreach ($item in $required.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace($item.Value)) {
      throw "$($item.Key) is required."
    }
  }

  if ($Config.ConnectivityMode -notin @('public-ssh', 'tailscale')) {
    throw 'AZURE_DEV_VM_CONNECTIVITY_MODE must be public-ssh or tailscale.'
  }
  if ($Config.DataDiskGiB -lt 64) {
    throw 'AZURE_DEV_VM_DATA_DISK_GIB must be at least 64.'
  }
  if ($Config.VmSize -match 'D4|B[0-9]|Standard_DS?[0-9]_') {
    Write-Warning (
      'A smaller VM size may become memory-bound for the full development workload.'
    )
  }
  if ($Config.AutoStopTime -notmatch '^([01][0-9]|2[0-3])[0-5][0-9]$') {
    throw 'AZURE_DEV_VM_AUTO_STOP_TIME must use HHmm format, for example 2200.'
  }

  $servicePrincipalValues = @(
    @(
      $Config.TenantId,
      $Config.ClientId,
      $Config.ClientSecret
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )
  if (
    $servicePrincipalValues.Count -gt 0 -and
    $servicePrincipalValues.Count -lt 3
  ) {
    throw (
      'Set all service-principal values together: AZURE_TENANT_ID, ' +
      'AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET.'
    )
  }
}

function New-AzureDevContext {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config,

    [switch]$Yes,

    [switch]$AdoptResourceGroup,

    [switch]$ForceUnlock,

    [switch]$Apply,

    [switch]$CleanupLogs,

    [switch]$CleanupKeys,

    [switch]$SkipSshConfig,

    [switch]$SkipSmokeValidation
  )

  return [pscustomobject]@{
    Config = $Config
    Yes = [bool]$Yes
    AdoptResourceGroup = [bool]$AdoptResourceGroup
    ForceUnlock = [bool]$ForceUnlock
    Apply = [bool]$Apply
    CleanupLogs = [bool]$CleanupLogs
    CleanupKeys = [bool]$CleanupKeys
    SkipSshConfig = [bool]$SkipSshConfig
    SkipSmokeValidation = [bool]$SkipSmokeValidation
    StateDirectory = Join-Path $Config.RepoRoot '.azure'
    LogsDirectory = Join-Path $Config.RepoRoot '.azure/logs'
    StatePath = Join-Path $Config.RepoRoot '.azure/development.state.json'
    LockPath = Join-Path $Config.RepoRoot '.azure/development.lock'
    TemplatePath = Join-Path $Config.RepoRoot 'scripts/azure-dev/templates/main.bicep'
    BootstrapPath = Join-Path $Config.RepoRoot 'scripts/azure-dev/templates/bootstrap-host.sh'
  }
}

Export-ModuleMember -Function `
  ConvertTo-AzureDevBoolean, `
  Get-AzureDevConfig, `
  Get-AzureDevDefaultConfig, `
  Get-AzureDevTags, `
  Import-AzureDevEnvFile, `
  New-AzureDevContext, `
  Resolve-AzureDevPath, `
  Test-AzureDevConfig
