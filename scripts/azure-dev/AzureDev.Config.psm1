using module ./AzureDev.Logging.psm1

Set-StrictMode -Version Latest

$script:AzureDevManagedBy = 'kravhantering-azure-dev'
$script:AzureDevRepository = 'viscalyx/Kravhantering'
$script:AzureDevPurpose = 'personal-development'
$script:AzureDevSetupVersion = 2

function Get-AzureDevDefaultConfig {
  [CmdletBinding()]
  param()

  return [ordered]@{
    AZURE_CLIENT_ID = ''
    AZURE_CLIENT_SECRET = ''
    AZURE_DEV_GIT_SSH_SIGNING_KEY = ''
    AZURE_DEV_GIT_USER_EMAIL = ''
    AZURE_DEV_GIT_USER_NAME = ''
    AZURE_DEV_TAILSCALE_AUTH_KEY = ''
    AZURE_DEV_TAILSCALE_TAILNET = ''
    AZURE_DEV_UBUNTU_PRO_TOKEN = ''
    AZURE_DEV_WORKSTATION_APPROVER_PUBLIC_KEY_PATH = ''
    AZURE_DEV_VM_ENVIRONMENT_ID = 'personal'
    AZURE_DEV_VM_NAME_PREFIX = 'krav-dev'
    AZURE_DEV_VM_NAME = 'krav-dev-vm'
    AZURE_DEV_VM_SIZE = 'Standard_D8s_v5'
    AZURE_DEV_VM_FALLBACK_SIZE = 'Standard_D8as_v5'
    AZURE_DEV_VM_DATA_DISK_GIB = '64'
    AZURE_DEV_VM_CONNECTIVITY_MODE = 'public-ssh'
    AZURE_DEV_VM_SSH_HOST_ALIAS = 'kravhantering-azure-dev'
    AZURE_DEV_VM_SSH_HOST_NAME = ''
    AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH = '~/.ssh/kravhantering_azure_dev_ed25519'
    AZURE_DEV_VM_AUTO_STOP_ENABLED = 'true'
    AZURE_DEV_VM_AUTO_STOP_TIME = '2200'
    AZURE_DEV_VM_AUTO_STOP_TIME_ZONE = 'UTC'
    AZURE_DEV_VM_IMAGE_OFFER = 'ubuntu-24_04-lts'
    AZURE_DEV_VM_IMAGE_PUBLISHER = 'Canonical'
    AZURE_DEV_VM_IMAGE_SKU = 'server'
    AZURE_DEV_VM_LOCATION = 'eastus2'
    AZURE_DEV_VM_RESOURCE_GROUP = ''
    AZURE_DEV_VM_SUBSCRIPTION_ID = ''
    AZURE_TENANT_ID = ''
    KEYCLOAK_ADMIN_PASSWORD = ''
    MSSQL_SA_PASSWORD = ''
  }
}

function Get-AzureDevLocalGitConfigValue {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,

    [Parameter(Mandatory = $true)]
    [ValidateSet(
      'commit.gpgsign',
      'gpg.format',
      'user.email',
      'user.name',
      'user.signingkey'
    )]
    [string]$Key
  )

  if ($null -eq (Get-Command git -ErrorAction SilentlyContinue)) {
    return ''
  }

  $result = Invoke-AzureDevNativeCommand `
    -FilePath 'git' `
    -Arguments @('-C', $RepositoryRoot, 'config', '--get', $Key)
  if ($result.ExitCode -eq 1) {
    return ''
  }
  if ($result.ExitCode -ne 0) {
    throw "Failed to read $Key from the local Git configuration.`n$($result.Text.Trim())"
  }

  return $result.Text.Trim()
}

function Test-AzureDevSshPublicKey {
  [CmdletBinding()]
  param(
    [AllowNull()]
    [string]$Value
  )

  if (
    [string]::IsNullOrWhiteSpace($Value) -or
    $Value.Contains("`r") -or
    $Value.Contains("`n")
  ) {
    return $false
  }

  $parts = @($Value.Trim() -split '[ \t]+', 3)
  if (
    $parts.Count -lt 2 -or
    $parts[0] -notmatch '^(?:ssh-|ecdsa-|sk-)[A-Za-z0-9@._+-]+$'
  ) {
    return $false
  }

  try {
    $decoded = [Convert]::FromBase64String($parts[1])
    if ($decoded.Length -lt 8) {
      return $false
    }

    $algorithmLength =
      ([uint32]$decoded[0] -shl 24) -bor
      ([uint32]$decoded[1] -shl 16) -bor
      ([uint32]$decoded[2] -shl 8) -bor
      [uint32]$decoded[3]
    if (
      $algorithmLength -eq 0 -or
      $algorithmLength -gt ($decoded.Length - 8)
    ) {
      return $false
    }

    $strictUtf8 = [Text.UTF8Encoding]::new($false, $true)
    $embeddedAlgorithm = $strictUtf8.GetString(
      $decoded,
      4,
      [int]$algorithmLength
    )
    if ($embeddedAlgorithm -cne $parts[0]) {
      return $false
    }

    $fieldOffsets = @()
    $fieldLengths = @()
    $offset = 4 + [int]$algorithmLength
    while ($offset -lt $decoded.Length) {
      if (($decoded.Length - $offset) -lt 4) {
        return $false
      }
      $fieldLength =
        ([uint32]$decoded[$offset] -shl 24) -bor
        ([uint32]$decoded[$offset + 1] -shl 16) -bor
        ([uint32]$decoded[$offset + 2] -shl 8) -bor
        [uint32]$decoded[$offset + 3]
      $offset += 4
      if (
        $fieldLength -eq 0 -or
        $fieldLength -gt ($decoded.Length - $offset)
      ) {
        return $false
      }
      $fieldOffsets += $offset
      $fieldLengths += [int]$fieldLength
      $offset += [int]$fieldLength
    }
    if ($offset -ne $decoded.Length) {
      return $false
    }

    $expectedFieldCount = $null
    $expectedCurve = $null
    $expectedPointLength = $null
    switch -CaseSensitive ($embeddedAlgorithm) {
      'ssh-ed25519' {
        return $fieldLengths.Count -eq 1 -and $fieldLengths[0] -eq 32
      }
      'sk-ssh-ed25519@openssh.com' {
        return (
          $fieldLengths.Count -eq 2 -and
          $fieldLengths[0] -eq 32 -and
          $fieldLengths[1] -gt 0
        )
      }
      'ssh-rsa' {
        $expectedFieldCount = 2
      }
      'ssh-dss' {
        $expectedFieldCount = 4
      }
      'ecdsa-sha2-nistp256' {
        $expectedCurve = 'nistp256'
        $expectedPointLength = 65
      }
      'ecdsa-sha2-nistp384' {
        $expectedCurve = 'nistp384'
        $expectedPointLength = 97
      }
      'ecdsa-sha2-nistp521' {
        $expectedCurve = 'nistp521'
        $expectedPointLength = 133
      }
      'sk-ecdsa-sha2-nistp256@openssh.com' {
        if ($fieldLengths.Count -ne 3) {
          return $false
        }
        $curve = $strictUtf8.GetString(
          $decoded,
          $fieldOffsets[0],
          $fieldLengths[0]
        )
        return (
          $curve -ceq 'nistp256' -and
          $fieldLengths[1] -eq 65 -and
          $decoded[$fieldOffsets[1]] -eq 4 -and
          $fieldLengths[2] -gt 0
        )
      }
      default {
        return $false
      }
    }

    if ($null -ne $expectedFieldCount) {
      if ($fieldLengths.Count -ne $expectedFieldCount) {
        return $false
      }
      for ($index = 0; $index -lt $fieldLengths.Count; $index += 1) {
        $firstByte = $decoded[$fieldOffsets[$index]]
        if (($firstByte -band 0x80) -ne 0) {
          return $false
        }
        if (
          $fieldLengths[$index] -gt 1 -and
          $firstByte -eq 0 -and
          ($decoded[$fieldOffsets[$index] + 1] -band 0x80) -eq 0
        ) {
          return $false
        }
      }
      return $true
    }

    if ($fieldLengths.Count -ne 2) {
      return $false
    }
    $curve = $strictUtf8.GetString(
      $decoded,
      $fieldOffsets[0],
      $fieldLengths[0]
    )
    return (
      $curve -ceq $expectedCurve -and
      $fieldLengths[1] -eq $expectedPointLength -and
      $decoded[$fieldOffsets[1]] -eq 4
    )
  } catch {
    return $false
  }
}

function Resolve-AzureDevGitSshSigningPublicKey {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,

    [AllowEmptyString()]
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ''
  }

  $candidate = $Value.Trim()
  if ($candidate.StartsWith('key::')) {
    $candidate = $candidate.Substring(5).Trim()
    if (-not (Test-AzureDevSshPublicKey -Value $candidate)) {
      throw 'The configured Git SSH signing key contains an invalid inline public key.'
    }
    return $candidate
  }
  if (Test-AzureDevSshPublicKey -Value $candidate) {
    return $candidate
  }
  if ($candidate.Contains("`r") -or $candidate.Contains("`n")) {
    throw 'The configured Git SSH signing key must not contain newline characters.'
  }

  $configuredPath = Resolve-AzureDevPath -Path $candidate
  if (-not [System.IO.Path]::IsPathRooted($configuredPath)) {
    $configuredPath = Join-Path $RepositoryRoot $configuredPath
  }
  $publicKeyPath = if ($configuredPath.EndsWith('.pub')) {
    $configuredPath
  } elseif (Test-Path -LiteralPath "$configuredPath.pub" -PathType Leaf) {
    "$configuredPath.pub"
  } else {
    throw (
      'The configured Git SSH signing key must be an inline public key, a public-key ' +
      "file, or a private-key path with a matching .pub file: $configuredPath"
    )
  }
  if (-not (Test-Path -LiteralPath $publicKeyPath -PathType Leaf)) {
    throw "Git SSH signing public-key file was not found: $publicKeyPath"
  }

  $publicKey = (Get-Content -LiteralPath $publicKeyPath -Raw).Trim()
  if (-not (Test-AzureDevSshPublicKey -Value $publicKey)) {
    throw "Git SSH signing public-key file is invalid: $publicKeyPath"
  }
  return $publicKey
}

function Import-AzureDevEnvFile {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [switch]$Optional,

    [switch]$IncludeProvenance
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

    $result[$key] = if ($IncludeProvenance) {
      [pscustomobject]@{
        Value = $rawValue
        Line = $lineNumber
      }
    } else {
      $rawValue
    }
  }

  return $result
}

function Get-AzureDevLifecycleConfig {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'stop', 'status')]
    [string]$CommandName,

    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,

    [string]$EnvironmentFile = '.env.azure.development'
  )

  $repositoryPath = [System.IO.Path]::GetFullPath($RepositoryRoot)
  $primaryPath = if ([System.IO.Path]::IsPathRooted($EnvironmentFile)) {
    [System.IO.Path]::GetFullPath($EnvironmentFile)
  } else {
    Join-Path $repositoryPath $EnvironmentFile
  }
  $localPath = Join-Path $repositoryPath '.env.azure.development.local'
  $primaryValues = Import-AzureDevEnvFile `
    -Path $primaryPath `
    -Optional `
    -IncludeProvenance
  $localValues = Import-AzureDevEnvFile `
    -Path $localPath `
    -Optional `
    -IncludeProvenance

  $restrictedPrimaryKeys = @(
    'AZURE_DEV_VM_SUBSCRIPTION_ID',
    'AZURE_TENANT_ID',
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET'
  )
  $restrictedPrimaryFields = @(
    foreach ($key in $restrictedPrimaryKeys) {
      if ($primaryValues.ContainsKey($key)) {
        "$key at $primaryPath line $($primaryValues[$key].Line)"
      }
    }
  )
  if ($restrictedPrimaryFields.Count -gt 0) {
    throw (
      'The primary dotenv file contains restricted lifecycle identity fields: ' +
      ($restrictedPrimaryFields -join '; ') +
      '. Move them to the process environment or the local Azure-development ' +
      'dotenv file.'
    )
  }

  $newReadOnlyObject = {
    param(
      [Parameter(Mandatory = $true)]
      [System.Collections.IDictionary]$Properties,

      [Parameter(Mandatory = $true)]
      [string]$TypeName
    )

    $dictionary = [System.Collections.Generic.Dictionary[string, object]]::new(
      [System.StringComparer]::Ordinal
    )
    foreach ($property in $Properties.GetEnumerator()) {
      $dictionary.Add([string]$property.Key, $property.Value)
    }
    $result = [System.Collections.ObjectModel.ReadOnlyDictionary[
      string,
      object
    ]]::new($dictionary)
    $result.PSObject.TypeNames.Insert(0, $TypeName)
    return $result
  }
  $newSource = {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Kind,

      [AllowNull()]
      [object]$Path,

      [AllowNull()]
      [System.Nullable[int]]$Line
    )

    return & $newReadOnlyObject `
      -Properties ([ordered]@{
          Kind = $Kind
          Path = $Path
          Line = $Line
        }) `
      -TypeName 'AzureDev.LifecycleConfigurationSource'
  }
  $formatSource = {
    param(
      [AllowNull()]
      [psobject]$Source
    )

    if ($null -eq $Source) {
      return 'all permitted sources'
    }
    switch ($Source.Kind) {
      'process-environment' { return 'the process environment' }
      'local-dotenv' { return "$($Source.Path) line $($Source.Line)" }
      'primary-dotenv' { return "$($Source.Path) line $($Source.Line)" }
      'lifecycle-default' { return 'the lifecycle default' }
      default { throw "Unknown lifecycle configuration source: $($Source.Kind)" }
    }
  }

  $fieldSpecifications = [ordered]@{
    AZURE_DEV_VM_SUBSCRIPTION_ID = [pscustomobject]@{
      Property = 'SubscriptionId'
      HasDefault = $false
      Default = $null
    }
    AZURE_DEV_VM_RESOURCE_GROUP = [pscustomobject]@{
      Property = 'ResourceGroup'
      HasDefault = $false
      Default = $null
    }
    AZURE_DEV_VM_NAME = [pscustomobject]@{
      Property = 'VmName'
      HasDefault = $false
      Default = $null
    }
    AZURE_TENANT_ID = [pscustomobject]@{
      Property = 'TenantId'
      HasDefault = $false
      Default = $null
    }
    AZURE_CLIENT_ID = [pscustomobject]@{
      Property = 'ClientId'
      HasDefault = $false
      Default = $null
    }
    AZURE_CLIENT_SECRET = [pscustomobject]@{
      Property = 'ClientSecret'
      HasDefault = $false
      Default = $null
    }
  }
  if ($CommandName -eq 'start') {
    $fieldSpecifications.AZURE_DEV_VM_SSH_HOST_ALIAS = [pscustomobject]@{
      Property = 'SshHostAlias'
      HasDefault = $true
      Default = 'kravhantering-azure-dev'
    }
  }

  $resolvedFields = [ordered]@{}
  $provenanceProperties = [ordered]@{}
  foreach ($field in $fieldSpecifications.GetEnumerator()) {
    $key = $field.Key
    $candidates = @()
    $processValue = Get-Item `
      -LiteralPath "Env:$key" `
      -ErrorAction SilentlyContinue
    if ($null -ne $processValue) {
      $candidates += [pscustomobject]@{
        Value = $processValue.Value
        Source = & $newSource `
          -Kind 'process-environment' `
          -Path $null `
          -Line $null
      }
    }
    if ($localValues.ContainsKey($key)) {
      $candidates += [pscustomobject]@{
        Value = $localValues[$key].Value
        Source = & $newSource `
          -Kind 'local-dotenv' `
          -Path $localPath `
          -Line $localValues[$key].Line
      }
    }
    if ($primaryValues.ContainsKey($key)) {
      $candidates += [pscustomobject]@{
        Value = $primaryValues[$key].Value
        Source = & $newSource `
          -Kind 'primary-dotenv' `
          -Path $primaryPath `
          -Line $primaryValues[$key].Line
      }
    }
    if ($field.Value.HasDefault) {
      $candidates += [pscustomobject]@{
        Value = $field.Value.Default
        Source = & $newSource `
          -Kind 'lifecycle-default' `
          -Path $null `
          -Line $null
      }
    }

    $winner = if ($candidates.Count -eq 0) {
      $null
    } else {
      $candidates[0]
    }
    $maskedNonEmptySource = $null
    if (
      $null -ne $winner -and
      [string]::IsNullOrWhiteSpace([string]$winner.Value)
    ) {
      foreach ($candidate in @($candidates | Select-Object -Skip 1)) {
        if (-not [string]::IsNullOrWhiteSpace([string]$candidate.Value)) {
          $maskedNonEmptySource = $candidate.Source
          break
        }
      }
    }
    $resolvedFields[$key] = [pscustomobject]@{
      Property = $field.Value.Property
      Value = if ($null -eq $winner) { $null } else { $winner.Value }
      Source = if ($null -eq $winner) { $null } else { $winner.Source }
      MaskedNonEmptySource = $maskedNonEmptySource
    }
    $provenanceProperties[$key] = & $newReadOnlyObject `
      -Properties ([ordered]@{
          Key = $key
          Source = $resolvedFields[$key].Source
          MaskedNonEmptySource = $maskedNonEmptySource
        }) `
      -TypeName 'AzureDev.LifecycleConfigurationProvenance'
  }

  $requiredKeys = @(
    'AZURE_DEV_VM_SUBSCRIPTION_ID',
    'AZURE_DEV_VM_RESOURCE_GROUP',
    'AZURE_DEV_VM_NAME'
  )
  if ($CommandName -eq 'start') {
    $requiredKeys += 'AZURE_DEV_VM_SSH_HOST_ALIAS'
  }
  $requiredErrors = @()
  foreach ($key in $requiredKeys) {
    $field = $resolvedFields[$key]
    if (-not [string]::IsNullOrWhiteSpace([string]$field.Value)) {
      continue
    }
    if ($null -eq $field.Source) {
      $requiredErrors += "$key is required but is absent from all permitted sources."
      continue
    }
    $message = "$key is required but the winning value from $(& $formatSource $field.Source) is empty"
    if ($null -ne $field.MaskedNonEmptySource) {
      $message += (
        '; it masks a nonempty value from ' +
        (& $formatSource $field.MaskedNonEmptySource)
      )
    }
    $requiredErrors += "$message."
  }
  if ($requiredErrors.Count -gt 0) {
    throw ($requiredErrors -join ' ')
  }

  foreach ($key in @('AZURE_DEV_VM_RESOURCE_GROUP', 'AZURE_DEV_VM_NAME')) {
    if ([string]$resolvedFields[$key].Value -match '[\p{Cc}]') {
      throw "$key contains unsupported control characters."
    }
  }

  $servicePrincipalKeys = @(
    'AZURE_TENANT_ID',
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET'
  )
  $servicePrincipalPresent = @(
    $servicePrincipalKeys | Where-Object {
      $null -ne $resolvedFields[$_].Source
    }
  ).Count -gt 0
  if ($servicePrincipalPresent) {
    $servicePrincipalErrors = @()
    foreach ($key in $servicePrincipalKeys) {
      $field = $resolvedFields[$key]
      if ($null -eq $field.Source) {
        $servicePrincipalErrors += "$key is absent."
      } elseif ([string]::IsNullOrWhiteSpace([string]$field.Value)) {
        $message = "$key is empty in $(& $formatSource $field.Source)"
        if ($null -ne $field.MaskedNonEmptySource) {
          $message += (
            '; it masks a nonempty value from ' +
            (& $formatSource $field.MaskedNonEmptySource)
          )
        }
        $servicePrincipalErrors += "$message."
      }
    }
    if ($servicePrincipalErrors.Count -gt 0) {
      throw (
        'Service-principal configuration must be complete and nonempty: ' +
        ($servicePrincipalErrors -join ' ')
      )
    }
  }

  $uuidKeys = @('AZURE_DEV_VM_SUBSCRIPTION_ID')
  if ($servicePrincipalPresent) {
    $uuidKeys += @('AZURE_TENANT_ID', 'AZURE_CLIENT_ID')
  }
  foreach ($key in $uuidKeys) {
    $parsedUuid = [guid]::Empty
    if (-not [guid]::TryParse([string]$resolvedFields[$key].Value, [ref]$parsedUuid)) {
      throw (
        "$key from $(& $formatSource $resolvedFields[$key].Source) " +
        'must be a valid UUID.'
      )
    }
    $resolvedFields[$key].Value = $parsedUuid.ToString('D').ToLowerInvariant()
  }

  if ($CommandName -eq 'start') {
    $sshAlias = [string]$resolvedFields.AZURE_DEV_VM_SSH_HOST_ALIAS.Value
    if ($sshAlias -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
      throw 'AZURE_DEV_VM_SSH_HOST_ALIAS contains unsupported characters.'
    }
  }

  $snapshotProperties = [ordered]@{
    RepoRoot = $repositoryPath
  }
  foreach ($field in $fieldSpecifications.GetEnumerator()) {
    $snapshotProperties[$field.Value.Property] = $resolvedFields[$field.Key].Value
  }
  $snapshotProperties.Provenance = & $newReadOnlyObject `
    -Properties $provenanceProperties `
    -TypeName 'AzureDev.LifecycleConfigurationProvenanceSet'

  return & $newReadOnlyObject `
    -Properties $snapshotProperties `
    -TypeName 'AzureDev.LifecycleConfigurationSnapshot'
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

    [switch]$AllowMissingAzureScope,

    [switch]$AllowDirectSsh,

    [switch]$DirectSshReadiness
  )

  $primaryPath = Join-Path $RepositoryRoot $EnvironmentFile
  $localPath = Join-Path $RepositoryRoot '.env.azure.development.local'
  $values = Get-AzureDevDefaultConfig
  $configuredKeys = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
  )

  $primaryValues = Import-AzureDevEnvFile `
    -Path $primaryPath `
    -Optional:(!$RequireEnvironmentFile)
  foreach ($key in $primaryValues.Keys) {
    $values[$key] = $primaryValues[$key]
    [void]$configuredKeys.Add($key)
  }

  $localValues = Import-AzureDevEnvFile -Path $localPath -Optional
  foreach ($key in $localValues.Keys) {
    $values[$key] = $localValues[$key]
    [void]$configuredKeys.Add($key)
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
      [void]$configuredKeys.Add($key)
    }
  }

  $directSsh = (
    $AllowDirectSsh -and
    (
      $DirectSshReadiness -or (
        $values.AZURE_DEV_VM_CONNECTIVITY_MODE -eq 'public-ssh' -and
        -not [string]::IsNullOrWhiteSpace(
          $values.AZURE_DEV_VM_SSH_HOST_NAME
        )
      )
    )
  )
  if (
    -not $directSsh -and
    [string]::IsNullOrWhiteSpace($values.AZURE_DEV_GIT_USER_NAME)
  ) {
    $values.AZURE_DEV_GIT_USER_NAME = Get-AzureDevLocalGitConfigValue `
      -RepositoryRoot $RepositoryRoot `
      -Key 'user.name'
  }
  if (
    -not $directSsh -and
    [string]::IsNullOrWhiteSpace($values.AZURE_DEV_GIT_USER_EMAIL)
  ) {
    $values.AZURE_DEV_GIT_USER_EMAIL = Get-AzureDevLocalGitConfigValue `
      -RepositoryRoot $RepositoryRoot `
      -Key 'user.email'
  }

  $gitSshSigningKey = if ($directSsh) {
    ''
  } else {
    $values.AZURE_DEV_GIT_SSH_SIGNING_KEY
  }
  if (
    -not $directSsh -and
    [string]::IsNullOrWhiteSpace($gitSshSigningKey)
  ) {
    $localGitSigningFormat = Get-AzureDevLocalGitConfigValue `
      -RepositoryRoot $RepositoryRoot `
      -Key 'gpg.format'
    $localCommitSigning = Get-AzureDevLocalGitConfigValue `
      -RepositoryRoot $RepositoryRoot `
      -Key 'commit.gpgsign'
    if (
      $localGitSigningFormat -eq 'ssh' -and
      (ConvertTo-AzureDevBoolean -Value $localCommitSigning)
    ) {
      $gitSshSigningKey = Get-AzureDevLocalGitConfigValue `
        -RepositoryRoot $RepositoryRoot `
        -Key 'user.signingkey'
    }
  }
  $gitSshSigningPublicKey = Resolve-AzureDevGitSshSigningPublicKey `
    -RepositoryRoot $RepositoryRoot `
    -Value $gitSshSigningKey

  $privateKeyPath = Resolve-AzureDevPath `
    -Path $values.AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH
  $publicKeyPath = "$privateKeyPath.pub"
  $sshKnownHostsPath = Join-Path (Join-Path $HOME '.ssh') 'known_hosts'
  $sshHostKeyArguments = [System.Object[]]@(
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    "UserKnownHostsFile=$sshKnownHostsPath",
    '-o',
    'GlobalKnownHostsFile=none',
    '-o',
    'KnownHostsCommand=none',
    '-o',
    'VerifyHostKeyDNS=no',
    '-o',
    'UpdateHostKeys=no'
  )
  $workstationApproverPublicKeyPath = if (
    [string]::IsNullOrWhiteSpace(
      $values.AZURE_DEV_WORKSTATION_APPROVER_PUBLIC_KEY_PATH
    )
  ) {
    ''
  } else {
    Resolve-AzureDevPath `
      -Path $values.AZURE_DEV_WORKSTATION_APPROVER_PUBLIC_KEY_PATH
  }
  $environmentId = $values.AZURE_DEV_VM_ENVIRONMENT_ID

  $config = [pscustomobject]@{
    RepoRoot = $RepositoryRoot
    EnvironmentFilePath = $primaryPath
    LocalEnvironmentFilePath = $localPath
    SubscriptionId = $values.AZURE_DEV_VM_SUBSCRIPTION_ID
    ResourceGroup = $values.AZURE_DEV_VM_RESOURCE_GROUP
    Location = $values.AZURE_DEV_VM_LOCATION
    ImagePublisher = $values.AZURE_DEV_VM_IMAGE_PUBLISHER
    ImageOffer = $values.AZURE_DEV_VM_IMAGE_OFFER
    ImageSku = $values.AZURE_DEV_VM_IMAGE_SKU
    EnvironmentId = $environmentId
    NamePrefix = $values.AZURE_DEV_VM_NAME_PREFIX
    VmName = $values.AZURE_DEV_VM_NAME
    VmSize = $values.AZURE_DEV_VM_SIZE
    FallbackVmSize = $values.AZURE_DEV_VM_FALLBACK_SIZE
    DataDiskGiB = [int]$values.AZURE_DEV_VM_DATA_DISK_GIB
    ConnectivityMode = $values.AZURE_DEV_VM_CONNECTIVITY_MODE
    SshHostAlias = $values.AZURE_DEV_VM_SSH_HOST_ALIAS
    SshHostName = $values.AZURE_DEV_VM_SSH_HOST_NAME
    SshPrivateKeyPath = $privateKeyPath
    SshPublicKeyPath = $publicKeyPath
    SshKnownHostsPath = $sshKnownHostsPath
    SshHostKeyArguments = $sshHostKeyArguments
    WorkstationApproverPublicKeyPath = $workstationApproverPublicKeyPath
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
    GitSshSigningPublicKey = $gitSshSigningPublicKey
    GitUserName = $values.AZURE_DEV_GIT_USER_NAME
    GitUserEmail = $values.AZURE_DEV_GIT_USER_EMAIL
    KeycloakAdminPassword = $values.KEYCLOAK_ADMIN_PASSWORD
    SqlServerSaPassword = $values.MSSQL_SA_PASSWORD
    TailscaleAuthKey = $values.AZURE_DEV_TAILSCALE_AUTH_KEY
    TailscaleTailnet = $values.AZURE_DEV_TAILSCALE_TAILNET
    UbuntuProToken = $values.AZURE_DEV_UBUNTU_PRO_TOKEN
    ConfiguredKeys = @($configuredKeys)
  }

  Test-AzureDevConfig `
    -Config $config `
    -AllowMissingAzureScope:$AllowMissingAzureScope `
    -AllowDirectSsh:$AllowDirectSsh `
    -DirectSshReadiness:$DirectSshReadiness
  return $config
}

function Test-AzureDevConfig {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config,

    [switch]$AllowMissingAzureScope,

    [switch]$AllowDirectSsh,

    [switch]$DirectSshReadiness
  )

  if ($DirectSshReadiness) {
    return
  }

  if ($Config.ConnectivityMode -notin @('public-ssh', 'tailscale')) {
    throw 'AZURE_DEV_VM_CONNECTIVITY_MODE must be public-ssh or tailscale.'
  }

  $directSsh = (
    $AllowDirectSsh -and
    $Config.ConnectivityMode -eq 'public-ssh' -and
    -not [string]::IsNullOrWhiteSpace($Config.SshHostName)
  )
  $required = if ($directSsh) {
    [ordered]@{
      AZURE_DEV_VM_CONNECTIVITY_MODE = $Config.ConnectivityMode
      AZURE_DEV_VM_SSH_HOST_ALIAS = $Config.SshHostAlias
      AZURE_DEV_VM_SSH_HOST_NAME = $Config.SshHostName
      AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH = $Config.SshPrivateKeyPath
    }
  } elseif ($AllowMissingAzureScope) {
    [ordered]@{
      AZURE_DEV_VM_LOCATION = $Config.Location
      AZURE_DEV_VM_IMAGE_PUBLISHER = $Config.ImagePublisher
      AZURE_DEV_VM_IMAGE_OFFER = $Config.ImageOffer
      AZURE_DEV_VM_IMAGE_SKU = $Config.ImageSku
    }
  } else {
    [ordered]@{
      AZURE_DEV_VM_SUBSCRIPTION_ID = $Config.SubscriptionId
      AZURE_DEV_VM_RESOURCE_GROUP = $Config.ResourceGroup
      AZURE_DEV_VM_LOCATION = $Config.Location
      AZURE_DEV_VM_IMAGE_PUBLISHER = $Config.ImagePublisher
      AZURE_DEV_VM_IMAGE_OFFER = $Config.ImageOffer
      AZURE_DEV_VM_IMAGE_SKU = $Config.ImageSku
    }
  }
  foreach ($item in $required.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace($item.Value)) {
      throw "$($item.Key) is required."
    }
  }

  if ($directSsh) {
    return
  }

  $imageCoordinates = [ordered]@{
    AZURE_DEV_VM_IMAGE_PUBLISHER = $Config.ImagePublisher
    AZURE_DEV_VM_IMAGE_OFFER = $Config.ImageOffer
    AZURE_DEV_VM_IMAGE_SKU = $Config.ImageSku
  }
  foreach ($item in $imageCoordinates.GetEnumerator()) {
    if ($item.Value -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
      throw "$($item.Key) contains unsupported characters."
    }
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
    SshHostTrustEstablished = $false
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
  Get-AzureDevLifecycleConfig, `
  Get-AzureDevLocalGitConfigValue, `
  Get-AzureDevTags, `
  Import-AzureDevEnvFile, `
  New-AzureDevContext, `
  Resolve-AzureDevGitSshSigningPublicKey, `
  Resolve-AzureDevPath, `
  Test-AzureDevSshPublicKey, `
  Test-AzureDevConfig
