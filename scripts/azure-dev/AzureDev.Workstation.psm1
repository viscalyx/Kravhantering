using module ./AzureDev.Logging.psm1

Set-StrictMode -Version Latest

$script:RequestBegin = '-----BEGIN KRAVHANTERING WORKSTATION REQUEST-----'
$script:RequestEnd = '-----END KRAVHANTERING WORKSTATION REQUEST-----'
$script:RequestNamespace = 'kravhantering-workstation-request'
$script:RequestSchema = 2
$script:PackageSchema = 2
$script:MaximumPackageBytes = 50MB
$script:MaximumArmoredPackageBytes = 70MB
$script:MaximumEntryBytes = 5MB

function Confirm-AzureDevWorkstationAction {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$Prompt,

    [switch]$Optional
  )

  if ($Context.Yes) {
    return -not $Optional
  }
  $answer = Read-Host "$Prompt [y/N]"
  return $answer -match '^(?i:y|yes)$'
}

function Resolve-AzureDevWorkstationName {
  [CmdletBinding()]
  param(
    [string]$WorkstationName
  )

  $value = $WorkstationName
  $derivedFromMachineName = [string]::IsNullOrWhiteSpace($value)
  if ($derivedFromMachineName) {
    $value = [System.Environment]::MachineName
    if ([string]::IsNullOrWhiteSpace($value)) {
      throw (
        'The local machine name could not be determined. Pass -WorkstationName ' +
        'with a stable name for this workstation.'
      )
    }
  }
  try {
    return ConvertTo-AzureDevAccessName `
      -Value $value `
      -Label 'Workstation name'
  } catch {
    if ($derivedFromMachineName) {
      throw (
        "The local machine name '$value' cannot be used as a workstation name. " +
        'Pass -WorkstationName with a stable name for this workstation.'
      )
    }
    throw
  }
}

function Resolve-AzureDevIntendedUse {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [AllowEmptyString()]
    [string]$IntendedUse
  )

  $value = $IntendedUse
  if ([string]::IsNullOrWhiteSpace($value)) {
    if ($Context.Yes) {
      throw (
        '-IntendedUse is required with -Yes. Use connect-only or ' +
        'manage-environment.'
      )
    }
    $value = Read-Host 'Intended use [connect-only]'
    if ([string]::IsNullOrWhiteSpace($value)) {
      $value = 'connect-only'
    }
  }
  if ($value -notin @('connect-only', 'manage-environment')) {
    throw 'Intended use must be connect-only or manage-environment.'
  }
  return $value
}

function Assert-AzureDevDestinationPrivateKeyPath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [ValidateSet('windows', 'macos', 'linux')]
    [string]$Platform,

    [Parameter(Mandatory = $true)]
    [string]$WorkstationName
  )

  $isAbsolute = if ($Platform -eq 'windows') {
    (
      $Path -match '^[A-Za-z]:[\\/]' -or
      $Path -match '^\\\\[^\\/]+[\\/][^\\/]+'
    )
  } else {
    $Path.StartsWith('/')
  }
  $expectedFileName = "kravhantering_azure_dev_${WorkstationName}_ed25519"
  $actualFileName = @($Path -split '[\\/]')[-1]
  if (
    [string]::IsNullOrWhiteSpace($Path) -or
    $Path -ne $Path.Trim() -or
    $Path -match '[\x00-\x1f]' -or
    -not $isAbsolute -or
    $actualFileName -cne $expectedFileName
  ) {
    throw (
      'The workstation request destination private-key path is invalid. ' +
      'Regenerate the request on the destination workstation.'
    )
  }
}

function Set-AzureDevPrivatePermissions {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [switch]$Directory
  )

  if ($IsWindows) {
    # Windows retains the current user's inherited ACL. Explicit ACL hardening
    # is intentionally not implemented in this cross-platform workflow.
    return
  }
  $mode = if ($Directory) { '700' } else { '600' }
  if (-not $PSCmdlet.ShouldProcess($Path, "Apply private mode $mode")) {
    return
  }
  $result = Invoke-AzureDevNativeCommand `
    -FilePath 'chmod' `
    -Arguments @($mode, $Path)
  if ($result.ExitCode -ne 0) {
    throw "Could not apply mode $mode to $Path."
  }
}

function New-AzureDevPrivateDirectory {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not $PSCmdlet.ShouldProcess($Path, 'Create private directory')) {
    return
  }
  New-Item -ItemType Directory -Path $Path -Force | Out-Null
  Set-AzureDevPrivatePermissions -Path $Path -Directory
}

function New-AzureDevPrivateFile {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  New-Item -ItemType File -Path $Path -Force | Out-Null
  Set-AzureDevPrivatePermissions -Path $Path
}

function Set-AzureDevPrivateContent {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Value,

    [Parameter(Mandatory = $true)]
    [string]$Encoding,

    [switch]$NoNewline
  )

  New-AzureDevPrivateFile -Path $Path
  Set-Content `
    -LiteralPath $Path `
    -Value $Value `
    -Encoding $Encoding `
    -NoNewline:$NoNewline
}

function Copy-AzureDevPrivateFile {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,

    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  New-AzureDevPrivateFile -Path $Destination
  $sourceStream = [IO.File]::OpenRead($Source)
  try {
    $destinationStream = [IO.File]::Open(
      $Destination,
      [IO.FileMode]::Truncate,
      [IO.FileAccess]::Write,
      [IO.FileShare]::None
    )
    try {
      $sourceStream.CopyTo($destinationStream)
    } finally {
      $destinationStream.Dispose()
    }
  } finally {
    $sourceStream.Dispose()
  }
}

function Get-AzureDevPublicKeyFingerprint {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$PublicKey
  )

  if (-not (Test-AzureDevSshPublicKey -Value $PublicKey)) {
    throw 'Cannot fingerprint an invalid SSH public key.'
  }
  $parts = $PublicKey.Trim() -split '[ \t]+', 3
  $blob = [Convert]::FromBase64String($parts[1])
  $hasher = [Security.Cryptography.SHA256]::Create()
  try {
    $digest = $hasher.ComputeHash($blob)
  } finally {
    $hasher.Dispose()
  }
  $encoded = [Convert]::ToBase64String($digest).TrimEnd('=')
  return "SHA256:$encoded"
}

function Get-AzureDevVerificationCode {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Fingerprint
  )

  $hasher = [Security.Cryptography.SHA256]::Create()
  try {
    $digest = $hasher.ComputeHash(
      [Text.Encoding]::UTF8.GetBytes($Fingerprint)
    )
  } finally {
    $hasher.Dispose()
  }
  $hex = ([BitConverter]::ToString($digest) -replace '-', '').ToLowerInvariant()
  return "$($hex.Substring(0, 4))-$($hex.Substring(4, 4))-$($hex.Substring(8, 4))-$($hex.Substring(12, 4))"
}

function ConvertTo-AzureDevArmoredRequest {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Payload,

    [Parameter(Mandatory = $true)]
    [string]$Signature
  )

  $envelope = [ordered]@{
    schema = $script:RequestSchema
    payload = [Convert]::ToBase64String(
      [Text.Encoding]::UTF8.GetBytes($Payload)
    )
    signature = [Convert]::ToBase64String(
      [Text.Encoding]::UTF8.GetBytes($Signature)
    )
  } | ConvertTo-Json -Compress
  $encoded = [Convert]::ToBase64String(
    [Text.Encoding]::UTF8.GetBytes($envelope)
  )
  $lines = for ($offset = 0; $offset -lt $encoded.Length; $offset += 64) {
    $length = [Math]::Min(64, $encoded.Length - $offset)
    $encoded.Substring($offset, $length)
  }
  return @(
    $script:RequestBegin
    "Version: $script:RequestSchema"
    ''
    $lines
    $script:RequestEnd
  ) -join [Environment]::NewLine
}

function New-AzureDevWorkstationRequest {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$WorkstationName,

    [string]$IntendedUse,

    [string]$Cidr,

    [string]$OutputPath
  )

  $workstation = ConvertTo-AzureDevAccessName `
    -Value $WorkstationName `
    -Label 'Workstation name'
  $resolvedIntendedUse = Resolve-AzureDevIntendedUse `
    -Context $Context `
    -IntendedUse $IntendedUse
  $resolvedCidr = Get-AzureDevWorkstationCidr -Cidr $Cidr
  if (
    -not $PSCmdlet.ShouldProcess(
      $workstation,
      'Generate destination key and signed workstation request'
    )
  ) {
    return
  }
  $keyPath = Get-AzureDevDestinationPrivateKeyPath `
    -WorkstationName $workstation
  $keyConfig = [pscustomobject]@{
    SshPrivateKeyPath = $keyPath
    SshPublicKeyPath = "$keyPath.pub"
  }
  New-AzureDevSshKey -Config $keyConfig
  $publicKey = Get-AzureDevSshPublicKey -Config $keyConfig
  $fingerprint = Get-AzureDevPublicKeyFingerprint -PublicKey $publicKey
  $now = (Get-Date).ToUniversalTime()
  $request = [ordered]@{
    schema = $script:RequestSchema
    kind = 'kravhantering-azure-dev-workstation-request'
    requestId = [guid]::NewGuid().ToString('N')
    createdAt = $now.ToString('o')
    expiresAt = $now.AddHours(24).ToString('o')
    workstation = $workstation
    access = 'current'
    intendedUse = $resolvedIntendedUse
    cidr = $resolvedCidr
    platform = if ($IsWindows) {
      'windows'
    } elseif ($IsMacOS) {
      'macos'
    } else {
      'linux'
    }
    architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    destinationPrivateKeyPath = $keyPath
    publicKey = $publicKey
    publicKeyFingerprint = $fingerprint
  }
  $payload = $request | ConvertTo-Json -Compress
  $temporaryDirectory = Join-Path `
    ([IO.Path]::GetTempPath()) `
    "krav-request-$([guid]::NewGuid().ToString('N'))"
  try {
    New-AzureDevPrivateDirectory -Path $temporaryDirectory
    $payloadPath = Join-Path $temporaryDirectory 'request.json'
    Set-AzureDevPrivateContent `
      -Path $payloadPath `
      -Value $payload `
      -Encoding UTF8 `
      -NoNewline
    $signResult = Invoke-AzureDevNativeCommand `
      -FilePath 'ssh-keygen' `
      -Arguments @(
        '-Y',
        'sign',
        '-f',
        $keyPath,
        '-n',
        $script:RequestNamespace,
        $payloadPath
      )
    if ($signResult.ExitCode -ne 0) {
      throw "Could not sign the workstation request: $($signResult.Text.Trim())"
    }
    $signature = Get-Content -LiteralPath "$payloadPath.sig" -Raw
    $armored = ConvertTo-AzureDevArmoredRequest `
      -Payload $payload `
      -Signature $signature
  } finally {
    if (Test-Path -LiteralPath $temporaryDirectory) {
      Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
  }

  if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $requestDirectory = Join-Path `
      $Context.StateDirectory `
      'workstation-requests'
    New-AzureDevPrivateDirectory -Path $requestDirectory
    $OutputPath = Join-Path `
      $requestDirectory `
      "$workstation-$($request.requestId).kravreq"
  }
  if (
    (Test-Path -LiteralPath $OutputPath) -and
    -not $Context.Yes
  ) {
    throw "Request output already exists: $OutputPath"
  }
  if ($PSCmdlet.ShouldProcess($OutputPath, 'Write signed workstation request')) {
    Set-AzureDevPrivateContent `
      -Path $OutputPath `
      -Value $armored `
      -Encoding ASCII
  }

  $verificationCode = Get-AzureDevVerificationCode $fingerprint
  Write-Host ''
  Write-Host 'IMPORTANT: RETAIN THESE APPROVAL DETAILS BEFORE THE SIGNED REQUEST'
  Write-Host "Workstation request: $OutputPath"
  Write-Host "Workstation: $workstation"
  Write-Host "Intended use: $resolvedIntendedUse"
  Write-Host "Requested CIDR: $resolvedCidr"
  Write-Host "SSH private key: $keyPath"
  Write-Host "Public-key fingerprint: $fingerprint"
  Write-Host "Verification code: $verificationCode"
  Write-Host (
    'Keep this shell open or temporarily save these details until approval ' +
    'and workstation setup are complete.'
  )
  Write-Host (
    'The fingerprint and verification code detect replacement of the complete ' +
    'signed request through out-of-band comparison.'
  )
  Write-Host (
    'The workstation, CIDR, and key path confirm approval and configure the ' +
    'returned package.'
  )
  Write-Host 'Transfer only the signed request below through the package channel.'
  Write-Host ''
  Write-Host $armored
  Write-Host ''
  Write-Host (
    'Do not close this shell until the approval details are retained or ' +
    'workstation approval and setup are complete.'
  )
}

function Get-AzureDevPastedRequest {
  [CmdletBinding()]
  param()

  Write-Host "Paste the request through the $script:RequestEnd line:"
  $lines = New-Object System.Collections.Generic.List[string]
  do {
    $line = Read-Host
    $lines.Add($line)
  } while ($line.Trim() -ne $script:RequestEnd)
  return $lines -join [Environment]::NewLine
}

function Test-AzureDevWorkstationRequestSignature {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Payload,

    [Parameter(Mandatory = $true)]
    [string]$Signature,

    [Parameter(Mandatory = $true)]
    [string]$PublicKey
  )

  $temporaryDirectory = Join-Path `
    ([IO.Path]::GetTempPath()) `
    "krav-request-verify-$([guid]::NewGuid().ToString('N'))"
  try {
    New-AzureDevPrivateDirectory -Path $temporaryDirectory
    $allowedSignersPath = Join-Path $temporaryDirectory 'allowed_signers'
    $signaturePath = Join-Path $temporaryDirectory 'request.sig'
    Set-AzureDevPrivateContent `
      -Path $allowedSignersPath `
      -Value "workstation $PublicKey" `
      -Encoding ASCII
    Set-AzureDevPrivateContent `
      -Path $signaturePath `
      -Value $Signature `
      -Encoding ASCII

    # ssh-keygen verification requires the signed payload on stdin. The common
    # native wrapper has no stdin contract, so use Process with output capture.
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = 'ssh-keygen'
    foreach ($argument in @(
        '-Y',
        'verify',
        '-f',
        $allowedSignersPath,
        '-I',
        'workstation',
        '-n',
        $script:RequestNamespace,
        '-s',
        $signaturePath
      )) {
      $start.ArgumentList.Add($argument)
    }
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.UseShellExecute = $false
    $process = $null
    try {
      $process = [Diagnostics.Process]::Start($start)
      $standardOutput = $process.StandardOutput.ReadToEndAsync()
      $standardError = $process.StandardError.ReadToEndAsync()
      $process.StandardInput.Write($Payload)
      $process.StandardInput.Close()
      $process.WaitForExit()
      $standardOutput.GetAwaiter().GetResult() | Out-Null
      $standardError.GetAwaiter().GetResult() | Out-Null
      return $process.ExitCode -eq 0
    } finally {
      if ($null -ne $process) {
        $process.Dispose()
      }
    }
  } finally {
    if (Test-Path -LiteralPath $temporaryDirectory) {
      Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
  }
}

function Read-AzureDevWorkstationRequest {
  [CmdletBinding()]
  param(
    [string]$Path
  )

  $armored = if ([string]::IsNullOrWhiteSpace($Path)) {
    Get-AzureDevPastedRequest
  } else {
    Get-Content -LiteralPath $Path -Raw
  }
  $pattern = (
    '(?s)^' + [regex]::Escape($script:RequestBegin) +
    '\s+Version:\s*(?<armorVersion>\d+)\s+(?<armorPayload>.+?)\s+' +
    [regex]::Escape($script:RequestEnd) + '\s*$'
  )
  $armorMatch = [regex]::Match($armored, $pattern)
  if (-not $armorMatch.Success) {
    throw 'The workstation request armor is malformed.'
  }
  if (
    [int]$armorMatch.Groups['armorVersion'].Value -ne
    $script:RequestSchema
  ) {
    throw (
      'The workstation request schema is unsupported. Regenerate the request ' +
      'with the current new-workstation-request command.'
    )
  }
  try {
    $encoded = $armorMatch.Groups['armorPayload'].Value -replace '\s', ''
    $envelopeJson = [Text.Encoding]::UTF8.GetString(
      [Convert]::FromBase64String($encoded)
    )
    $envelope = $envelopeJson | ConvertFrom-Json
    $payload = [Text.Encoding]::UTF8.GetString(
      [Convert]::FromBase64String($envelope.payload)
    )
    $signature = [Text.Encoding]::UTF8.GetString(
      [Convert]::FromBase64String($envelope.signature)
    )
    $request = $payload | ConvertFrom-Json
  } catch {
    throw 'The workstation request payload is not valid Base64 JSON.'
  }
  if (
    $envelope.schema -ne $script:RequestSchema -or
    $request.schema -ne $script:RequestSchema -or
    $request.kind -ne 'kravhantering-azure-dev-workstation-request'
  ) {
    throw (
      'The workstation request schema is unsupported. Regenerate the request ' +
      'with the current new-workstation-request command.'
    )
  }
  if ($request.intendedUse -notin @('connect-only', 'manage-environment')) {
    throw 'The workstation request intended use is invalid.'
  }
  Assert-AzureDevDestinationPrivateKeyPath `
    -Path $request.destinationPrivateKeyPath `
    -Platform $request.platform `
    -WorkstationName $request.workstation
  if (
    [datetimeoffset]$request.expiresAt -lt
    [datetimeoffset]::UtcNow
  ) {
    throw 'The workstation request has expired.'
  }
  $normalizedName = ConvertTo-AzureDevAccessName `
    -Value $request.workstation `
    -Label 'Workstation name'
  if ($normalizedName -ne $request.workstation) {
    throw 'The workstation request name is not canonical.'
  }
  Get-AzureDevWorkstationCidr -Cidr $request.cidr | Out-Null
  $fingerprint = Get-AzureDevPublicKeyFingerprint `
    -PublicKey $request.publicKey
  if ($fingerprint -ne $request.publicKeyFingerprint) {
    throw 'The workstation request public-key fingerprint does not match.'
  }
  if (
    -not (
      Test-AzureDevWorkstationRequestSignature `
        -Payload $payload `
        -Signature $signature `
        -PublicKey $request.publicKey
    )
  ) {
    throw 'The workstation request signature is invalid.'
  }
  return $request
}

function Get-AzureDevWorkstationCidr {
  [CmdletBinding()]
  param(
    [string]$Cidr,

    [switch]$AllowNetwork
  )

  $resolved = if ([string]::IsNullOrWhiteSpace($Cidr) -or $Cidr -eq 'auto') {
    "$(Get-AzureDevCurrentIpv4)/32"
  } elseif ($Cidr -match '^(\d{1,3}\.){3}\d{1,3}$') {
    "$Cidr/32"
  } else {
    $Cidr
  }
  Test-AzureDevCidr -Cidr $resolved | Out-Null
  $parts = $resolved.Split('/')
  $octets = @($parts[0].Split('.') | ForEach-Object { [int]$_ })
  $prefix = [int]$parts[1]
  $private = (
    $octets[0] -in @(0, 10, 127) -or
    ($octets[0] -eq 169 -and $octets[1] -eq 254) -or
    ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or
    ($octets[0] -eq 192 -and $octets[1] -eq 168) -or
    $octets[0] -ge 224
  )
  if ($private) {
    throw "Public SSH does not accept private or reserved CIDRs: $resolved"
  }
  if ($prefix -lt 24) {
    throw 'Public SSH CIDRs broader than /24 are refused.'
  }
  if ($prefix -lt 32 -and -not $AllowNetwork) {
    throw 'CIDRs from /24 through /31 require -AllowNetworkCidr.'
  }
  return $resolved
}

function Get-AzureDevRemoteWorkstationKeyComment {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$WorkstationName
  )

  $environmentId = [string]$Context.Config.EnvironmentId
  if ($environmentId -notmatch '^[A-Za-z0-9._-]+$') {
    throw 'AZURE_DEV_VM_ENVIRONMENT_ID contains unsupported characters.'
  }
  $name = ConvertTo-AzureDevAccessName $WorkstationName
  return "kravhantering:$environmentId`:$name"
}

function Register-AzureDevRemoteWorkstationKey {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$WorkstationName,

    [Parameter(Mandatory = $true)]
    [string]$PublicKey
  )

  $name = ConvertTo-AzureDevAccessName $WorkstationName
  $parts = $PublicKey.Trim() -split '[ \t]+', 3
  $comment = Get-AzureDevRemoteWorkstationKeyComment `
    -Context $Context `
    -WorkstationName $name
  if (
    -not $PSCmdlet.ShouldProcess(
      $name,
      'Register workstation public key on Azure VM'
    )
  ) {
    return
  }
  $remoteCommand = @(
    'set -eu'
    'umask 077'
    'mkdir -p "$HOME/.ssh"'
    'touch "$HOME/.ssh/authorized_keys"'
    'chmod 700 "$HOME/.ssh"'
    'chmod 600 "$HOME/.ssh/authorized_keys"'
    'tmp="$(mktemp "$HOME/.ssh/authorized_keys.XXXXXX")"'
    (
      "awk -v t='$($parts[0])' -v d='$($parts[1])' " +
      "'!(NF >= 2 && `$1 == t && `$2 == d)' " +
      '"$HOME/.ssh/authorized_keys" > "$tmp"'
    )
    "printf '%s %s %s\n' '$($parts[0])' '$($parts[1])' '$comment' >> `"`$tmp`""
    'chmod 600 "$tmp"'
    'mv "$tmp" "$HOME/.ssh/authorized_keys"'
  ) -join '; '
  $result = Invoke-AzureDevNativeCommand `
    -FilePath 'ssh' `
    -Arguments @(
      '-o',
      'ClearAllForwardings=yes',
      $Context.Config.SshHostAlias,
      $remoteCommand
    )
  if ($result.ExitCode -ne 0) {
    throw "Could not register workstation key: $($result.Text.Trim())"
  }
}

function Get-AzureDevSecretNames {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $values = Import-AzureDevEnvFile -Path $Path
  return @($values.Keys | Where-Object {
      $_ -match '(?i)(SECRET|PASSWORD|TOKEN|AUTH_KEY|SUBSCRIPTION_ID)'
    } | Sort-Object)
}

function Get-AzureDevAgePath {
  [CmdletBinding()]
  param()

  $existing = Get-Command `
    -Name age `
    -CommandType Application `
    -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -eq $existing) {
    throw (
      'age 1.2.1 or later must be installed manually and available on PATH. ' +
      'See docs/development/azure-vm-remote-ssh-development.md#install-age.'
    )
  }
  $versionResult = Invoke-AzureDevNativeCommand `
    -FilePath $existing.Source `
    -Arguments @('--version')
  $versionMatch = [regex]::Match(
    $versionResult.Text,
    '(?<!\d)v?(?<version>\d+\.\d+\.\d+)(?!\d)'
  )
  if ($versionResult.ExitCode -ne 0 -or -not $versionMatch.Success) {
    throw (
      'Could not determine the version of the age binary on PATH. ' +
      "age --version returned: $($versionResult.Text.Trim())"
    )
  }
  $installedVersion = [version]$versionMatch.Groups['version'].Value
  $minimumVersion = [version]'1.2.1'
  if ($installedVersion -lt $minimumVersion) {
    throw (
      "The age binary on PATH is version $installedVersion; " +
      "version $minimumVersion or later is required."
    )
  }
  return $existing.Source
}

function ConvertTo-AzureDevEnvironmentContent {
  [CmdletBinding()]
  param(
    [AllowEmptyString()]
    [string]$Content,

    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$Assignments
  )

  [string[]]$sourceLines = @()
  if (-not [string]::IsNullOrEmpty($Content)) {
    $sourceLines = @($Content -split '\r?\n')
  }
  while (
    $sourceLines.Count -gt 0 -and
    [string]::IsNullOrEmpty($sourceLines[$sourceLines.Count - 1])
  ) {
    $sourceLines = @($sourceLines | Select-Object -First ($sourceLines.Count - 1))
  }

  $result = New-Object System.Collections.Generic.List[string]
  $written = @{}
  foreach ($line in $sourceLines) {
    $matchingKey = $null
    foreach ($key in $Assignments.Keys) {
      if ($line -match "^\s*$([regex]::Escape([string]$key))=") {
        $matchingKey = [string]$key
        break
      }
    }
    if ($null -eq $matchingKey) {
      $result.Add($line)
      continue
    }
    if (-not $written.ContainsKey($matchingKey)) {
      $result.Add("$matchingKey=$($Assignments[$matchingKey])")
      $written[$matchingKey] = $true
    }
  }
  foreach ($key in $Assignments.Keys) {
    if (-not $written.ContainsKey([string]$key)) {
      $result.Add("$key=$($Assignments[$key])")
    }
  }
  return (@($result) -join [Environment]::NewLine) +
    [Environment]::NewLine
}

function Get-AzureDevDestinationPrivateKeyPath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkstationName
  )

  return Join-Path `
    (Join-Path $HOME '.ssh') `
    "kravhantering_azure_dev_${WorkstationName}_ed25519"
}

function Get-AzureDevRemoteGitSigningPublicKey {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  $result = Invoke-AzureDevNativeCommand `
    -FilePath 'ssh' `
    -Arguments @(
      '-o',
      'BatchMode=yes',
      '-o',
      'ClearAllForwardings=yes',
      $Context.Config.SshHostAlias,
      'git config --global --get user.signingkey'
    )
  if ($result.ExitCode -ne 0) {
    throw (
      'Git commit signing was selected, but the VM has no usable global SSH ' +
      'user.signingkey. Correct the VM or rerun approval without signing.'
    )
  }
  $value = $result.Text.Trim()
  if ($value.StartsWith('key::')) {
    $value = $value.Substring(5).Trim()
  }
  if (-not (Test-AzureDevSshPublicKey -Value $value)) {
    throw (
      'Git commit signing was selected, but the VM global user.signingkey is ' +
      'not a usable SSH public key. Correct the VM or rerun approval without ' +
      'signing.'
    )
  }
  $parts = $value -split '[ \t]+', 3
  return "$($parts[0]) $($parts[1])"
}

function New-AzureDevWorkstationPackage {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$Request,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
  )

  if (-not $PSCmdlet.ShouldProcess($OutputPath, 'Create encrypted workstation package')) {
    return
  }
  $age = Get-AzureDevAgePath
  $temporaryDirectory = Join-Path `
    ([IO.Path]::GetTempPath()) `
    "krav-package-$([guid]::NewGuid().ToString('N'))"
  try {
    New-AzureDevPrivateDirectory -Path $temporaryDirectory
    $payloadPath = Join-Path $temporaryDirectory 'payload'
    New-AzureDevPrivateDirectory -Path $payloadPath
    foreach ($directory in @('files', 'reference')) {
      New-AzureDevPrivateDirectory -Path (Join-Path $payloadPath $directory)
    }

    $included = New-Object System.Collections.Generic.List[string]
    $destinationPrivateKey = $Request.destinationPrivateKeyPath
    $hostName = Get-AzureDevPublicIpAddress -Config $Context.Config
    if ([string]::IsNullOrWhiteSpace($hostName)) {
      throw 'Could not resolve the VM host for SSH host-key capture.'
    }
    $localPath = $Context.Config.LocalEnvironmentFilePath
    $packagedLocalPath = Join-Path `
      $payloadPath `
      'files/.env.azure.development.local'
    if ($Request.intendedUse -eq 'connect-only') {
      $localContent = ConvertTo-AzureDevEnvironmentContent `
        -Content '' `
        -Assignments ([ordered]@{
          AZURE_DEV_VM_CONNECTIVITY_MODE = 'public-ssh'
          AZURE_DEV_VM_SSH_HOST_ALIAS = $Context.Config.SshHostAlias
          AZURE_DEV_VM_SSH_HOST_NAME = $hostName
          AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH = $destinationPrivateKey
        })
      Set-AzureDevPrivateContent `
        -Path $packagedLocalPath `
        -Value $localContent `
        -Encoding UTF8 `
        -NoNewline
    } else {
      Copy-AzureDevPrivateFile `
        -Source $Context.Config.EnvironmentFilePath `
        -Destination (Join-Path $payloadPath 'files/.env.azure.development')
      $included.Add('files/.env.azure.development')
      $includeCompleteLocal = $false
      if (Test-Path -LiteralPath $localPath -PathType Leaf) {
        $secretNames = @(Get-AzureDevSecretNames -Path $localPath)
        $inventory = if ($secretNames.Count -eq 0) {
          '<none detected>'
        } else {
          $secretNames -join ', '
        }
        $includeCompleteLocal = Confirm-AzureDevWorkstationAction `
          -Context $Context `
          -Prompt (
            'Include the entire .env.azure.development.local file? ' +
            "Detected secret names: $inventory"
          ) `
          -Optional
      }
      $localSourceContent = if ($includeCompleteLocal) {
        Get-Content -LiteralPath $localPath -Raw
      } else {
        ''
      }
      $localContent = ConvertTo-AzureDevEnvironmentContent `
        -Content $localSourceContent `
        -Assignments ([ordered]@{
          AZURE_DEV_VM_SUBSCRIPTION_ID = $Context.Config.SubscriptionId
          AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH = $destinationPrivateKey
        })
      Set-AzureDevPrivateContent `
        -Path $packagedLocalPath `
        -Value $localContent `
        -Encoding UTF8 `
        -NoNewline
    }
    $included.Add('files/.env.azure.development.local')

    foreach ($tokenName in @('GH_TOKEN', 'COPILOT_GITHUB_TOKEN')) {
      $token = Get-Item "Env:$tokenName" -ErrorAction SilentlyContinue
      if (
        $null -ne $token -and (
          Confirm-AzureDevWorkstationAction `
            -Context $Context `
            -Prompt "Include $tokenName from the current process?" `
            -Optional
        )
      ) {
        $secretsDirectory = Join-Path $payloadPath 'secrets'
        if (-not (Test-Path -LiteralPath $secretsDirectory)) {
          New-AzureDevPrivateDirectory -Path $secretsDirectory
        }
        $tokenPath = Join-Path $payloadPath "secrets/$tokenName"
        Set-AzureDevPrivateContent `
          -Path $tokenPath `
          -Value $token.Value `
          -Encoding UTF8 `
          -NoNewline
        $included.Add("secrets/$tokenName")
      }
    }

    $signingRequired = Confirm-AzureDevWorkstationAction `
      -Context $Context `
      -Prompt 'Does this workstation need Git commit signing?' `
      -Optional
    $signingPublicKey = ''
    $signingPublicKeyFingerprint = ''
    if ($signingRequired) {
      $signingPublicKey = Get-AzureDevRemoteGitSigningPublicKey `
        -Context $Context
      $signingPublicKeyFingerprint = Get-AzureDevPublicKeyFingerprint `
        -PublicKey $signingPublicKey
      Set-AzureDevPrivateContent `
        -Path (
          Join-Path $payloadPath 'reference/git-signing-public-key.pub'
        ) `
        -Value $signingPublicKey `
        -Encoding ASCII
      $included.Add('reference/git-signing-public-key.pub')
      Set-AzureDevPrivateContent `
        -Path (
          Join-Path $payloadPath 'reference/git-signing-key-fingerprint.txt'
        ) `
        -Value $signingPublicKeyFingerprint `
        -Encoding ASCII
      $included.Add('reference/git-signing-key-fingerprint.txt')
    }

    $zshTemplate = Join-Path `
      $Context.Config.RepoRoot `
      'scripts/azure-dev/templates/zshrc.template'
    if (
      $Request.intendedUse -eq 'manage-environment' -and
      (Test-Path -LiteralPath $zshTemplate -PathType Leaf) -and
      (
        Confirm-AzureDevWorkstationAction `
          -Context $Context `
          -Prompt 'Include the custom ignored Zsh template?' `
          -Optional
      )
    ) {
      Copy-AzureDevPrivateFile `
        -Source $zshTemplate `
        -Destination (Join-Path $payloadPath 'files/zshrc.template')
      $included.Add('files/zshrc.template')
    }

    $recipientPath = Join-Path $payloadPath 'reference/destination-public-key.pub'
    Set-AzureDevPrivateContent `
      -Path $recipientPath `
      -Value $Request.publicKey `
      -Encoding ASCII
    $included.Add('reference/destination-public-key.pub')
    Set-AzureDevPrivateContent `
      -Path (Join-Path $payloadPath 'reference/destination-key-fingerprint.txt') `
      -Value $Request.publicKeyFingerprint `
      -Encoding ASCII
    $included.Add('reference/destination-key-fingerprint.txt')
    $hostKeyResult = Invoke-AzureDevNativeCommand `
      -FilePath 'ssh-keyscan' `
      -Arguments @('-T', '10', $hostName)
    if ($hostKeyResult.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($hostKeyResult.Text)) {
      throw 'Could not capture the VM SSH host keys for the response package.'
    }
    $knownHostsPath = Join-Path $payloadPath 'reference/vm-known-hosts'
    Set-AzureDevPrivateContent `
      -Path $knownHostsPath `
      -Value $hostKeyResult.Text.Trim() `
      -Encoding ASCII
    $included.Add('reference/vm-known-hosts')
    $hostFingerprintResult = Invoke-AzureDevNativeCommand `
      -FilePath 'ssh-keygen' `
      -Arguments @('-lf', $knownHostsPath, '-E', 'sha256')
    if ($hostFingerprintResult.ExitCode -ne 0) {
      throw 'Could not fingerprint the captured VM SSH host keys.'
    }
    Write-Host 'VM SSH host-key fingerprints for out-of-band comparison:'
    foreach ($hostFingerprint in @(
        $hostFingerprintResult.Text.Trim() -split '\r?\n'
      )) {
      Write-Host "  $hostFingerprint"
    }
    Set-AzureDevPrivateContent `
      -Path (Join-Path $payloadPath 'reference/vm-host-key-fingerprints.txt') `
      -Value $hostFingerprintResult.Text.Trim() `
      -Encoding ASCII
    $included.Add('reference/vm-host-key-fingerprints.txt')
    $now = (Get-Date).ToUniversalTime()
    $account = Get-AzureDevAccount
    $tenantId = if (-not [string]::IsNullOrWhiteSpace($Context.Config.TenantId)) {
      $Context.Config.TenantId
    } elseif ($null -ne $account) {
      [string]$account.tenantId
    } else {
      ''
    }
    $manifest = [ordered]@{
      schema = $script:PackageSchema
      kind = 'kravhantering-azure-dev-workstation-package'
      requestId = $Request.requestId
      workstation = $Request.workstation
      intendedUse = $Request.intendedUse
      environmentId = $Context.Config.EnvironmentId
      tenantId = $tenantId
      subscriptionId = $Context.Config.SubscriptionId
      resourceGroup = $Context.Config.ResourceGroup
      vmName = $Context.Config.VmName
      sshHostAlias = $Context.Config.SshHostAlias
      sshHostName = $hostName
      destinationPrivateKeyPath = $destinationPrivateKey
      publicKeyFingerprint = $Request.publicKeyFingerprint
      signingRequired = $signingRequired
      signingPublicKeyFingerprint = $signingPublicKeyFingerprint
      platform = $Request.platform
      architecture = $Request.architecture
      createdAt = $now.ToString('o')
      expiresAt = $now.AddHours(24).ToString('o')
      entries = @($included)
    }
    Set-AzureDevPrivateContent `
      -Path (Join-Path $payloadPath 'manifest.json') `
      -Value ($manifest | ConvertTo-Json -Depth 8) `
      -Encoding UTF8
    $zipPath = Join-Path $temporaryDirectory 'payload.zip'
    [IO.Compression.ZipFile]::CreateFromDirectory($payloadPath, $zipPath)
    if (Test-Path -LiteralPath $OutputPath) {
      throw "Package output already exists: $OutputPath"
    }
    $encryptResult = Invoke-AzureDevNativeCommand `
      -FilePath $age `
      -Arguments @('-a', '-R', $recipientPath, '-o', $OutputPath, $zipPath)
    if ($encryptResult.ExitCode -ne 0) {
      throw "Could not encrypt the workstation package: $($encryptResult.Text.Trim())"
    }
    Set-AzureDevPrivatePermissions -Path $OutputPath
  } finally {
    if (Test-Path -LiteralPath $temporaryDirectory) {
      Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
  }
}

function Approve-AzureDevWorkstation {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [string]$RequestPath,

    [string]$OutputPath
  )

  $request = Read-AzureDevWorkstationRequest -Path $RequestPath
  if ($Context.Config.ConnectivityMode -ne 'public-ssh') {
    throw (
      'Workstation transfer supports public SSH only. This environment uses ' +
      'Tailscale; no package or environment changes were made.'
    )
  }
  Test-AzureDevPrerequisites -Context $Context
  Write-Host "Workstation: $($request.workstation)"
  Write-Host "Intended use: $($request.intendedUse)"
  Write-Host "Requested CIDR: $($request.cidr)"
  Write-Host "SSH private key: $($request.destinationPrivateKeyPath)"
  Write-Host "Public-key fingerprint: $($request.publicKeyFingerprint)"
  Write-Host (
    'Verification code: ' +
    (Get-AzureDevVerificationCode $request.publicKeyFingerprint)
  )
  if (
    -not (
      Confirm-AzureDevWorkstationAction `
        -Context $Context `
        -Prompt 'Do these values match the destination workstation?'
    )
  ) {
    throw 'Workstation approval was cancelled.'
  }
  if (
    -not $PSCmdlet.ShouldProcess(
      $request.workstation,
      'Approve workstation key, CIDR, and encrypted response package'
    )
  ) {
    return
  }
  if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $packageDirectory = Join-Path `
      $Context.StateDirectory `
      'workstation-packages'
    New-AzureDevPrivateDirectory -Path $packageDirectory
    $OutputPath = Join-Path `
      $packageDirectory `
      "$($request.workstation)-workstation-package.age"
  }

  $initialPowerState = Get-AzureDevVmPowerState -Config $Context.Config
  $restoreStoppedState = $initialPowerState -notmatch '(?i)running'
  if (
    $restoreStoppedState -and
    -not (
      Confirm-AzureDevWorkstationAction `
        -Context $Context `
        -Prompt (
          "The VM is $initialPowerState. Start it temporarily for key " +
          'approval and restore its stopped state afterward?'
        )
    )
  ) {
    throw 'The VM must be running to approve a workstation key.'
  }
  $rule = $null
  $ruleExisted = $false
  $keyAdded = $false
  try {
    if ($restoreStoppedState) {
      Start-AzureDevAzureVm -Context $Context
    }
    $hostName = Get-AzureDevPublicIpAddress -Config $Context.Config
    Wait-AzureDevSsh -Context $Context -HostName $hostName | Out-Null
    # Encrypt the response before mutating access. If either access mutation
    # fails, remove the not-yet-valid response and roll back new CIDR access.
    New-AzureDevWorkstationPackage `
      -Context $Context `
      -Request $request `
      -OutputPath $OutputPath
    $candidate = New-AzureDevSshAccessRuleSpec `
      -WorkstationName $request.workstation `
      -AccessName $request.access `
      -Cidr $request.cidr
    $ruleExisted = @(
      Get-AzureDevSshAccessRules -Config $Context.Config |
        Where-Object { $_.name -eq $candidate.name }
    ).Count -gt 0
    $rule = Set-AzureDevSshAccessRule `
      -Context $Context `
      -WorkstationName $request.workstation `
      -AccessName $request.access `
      -Cidr $request.cidr
    Register-AzureDevRemoteWorkstationKey `
      -Context $Context `
      -WorkstationName $request.workstation `
      -PublicKey $request.publicKey
    $keyAdded = $true
    Set-AzureDevSshAccessSchema -Context $Context
  } catch {
    if ($keyAdded) {
      try {
        Remove-AzureDevRemoteWorkstationKey `
          -Context $Context `
          -WorkstationName $request.workstation
      } catch {
        Write-Warning (
          'Approval rollback could not remove the destination guest key. ' +
          'Run remove-workstation after reviewing the VM.'
        )
      }
    }
    if ($null -ne $rule -and -not $ruleExisted) {
      Remove-AzureDevSshAccessRule `
        -Context $Context `
        -RuleName $rule.name `
        -Confirm:$false
    }
    if (Test-Path -LiteralPath $OutputPath) {
      Remove-Item -LiteralPath $OutputPath -Force
    }
    throw
  } finally {
    if ($restoreStoppedState) {
      Stop-AzureDevAzureVm -Context $Context
    }
  }
  Write-Host "ASCII-armored encrypted response package: $OutputPath"
  Write-Host (
    'Transfer the file as an attachment or copy its complete ' +
    'BEGIN/END AGE ENCRYPTED FILE block through a text-only channel.'
  )
  Write-Host (
    'After transfer, remove the encrypted source package: ' +
    "Remove-Item -LiteralPath `"$OutputPath`" -Force"
  )
}

function Test-AzureDevPackageEntryName {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if (
    [string]::IsNullOrWhiteSpace($Name) -or
    [IO.Path]::IsPathRooted($Name) -or
    $Name.Contains('\') -or
    $Name -match '(^|/)\.\.($|/)'
  ) {
    return $false
  }
  return $Name -match '^(manifest\.json|(files|secrets|reference)/[A-Za-z0-9._-]+)$'
}

function Assert-AzureDevWorkstationPackageManifest {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Manifest
  )

  if (
    $Manifest.schema -ne $script:PackageSchema -or
    $Manifest.kind -ne 'kravhantering-azure-dev-workstation-package'
  ) {
    throw (
      'The workstation package schema is unsupported. Create and approve ' +
      'a new request, then extract the regenerated response package.'
    )
  }
  if (
    $Manifest.intendedUse -notin @(
      'connect-only',
      'manage-environment'
    ) -or
    [string]::IsNullOrWhiteSpace($Manifest.sshHostName) -or
    [string]::IsNullOrWhiteSpace($Manifest.sshHostAlias)
  ) {
    throw 'The workstation package transfer mode or SSH host is invalid.'
  }
  Assert-AzureDevDestinationPrivateKeyPath `
    -Path $Manifest.destinationPrivateKeyPath `
    -Platform $Manifest.platform `
    -WorkstationName $Manifest.workstation
}

function Get-AzureDevWorkstationPackageIdentityPaths {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  $identityPaths = New-Object System.Collections.Generic.List[string]
  $configuredPath = $Context.Config.SshPrivateKeyPath
  if (Test-Path -LiteralPath $configuredPath -PathType Leaf) {
    $identityPaths.Add($configuredPath)
  }
  $sshDirectory = Join-Path $HOME '.ssh'
  if (Test-Path -LiteralPath $sshDirectory -PathType Container) {
    foreach (
      $candidate in Get-ChildItem `
        -LiteralPath $sshDirectory `
        -Filter 'kravhantering_azure_dev_*_ed25519' `
        -File
    ) {
      if ($candidate.FullName -notin $identityPaths) {
        $identityPaths.Add($candidate.FullName)
      }
    }
  }
  if ($identityPaths.Count -eq 0) {
    throw (
      'No destination SSH private key is available to decrypt the package. ' +
      'Run new-workstation-request on this workstation first.'
    )
  }
  return @($identityPaths)
}

function ConvertTo-AzureDevPowerShellLiteral {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  return "'" + $Value.Replace("'", "''") + "'"
}

function Write-AzureDevExtractedReadme {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$DestinationPath,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$Manifest
  )

  $primarySource = Join-Path $DestinationPath 'files/.env.azure.development'
  $localSource = Join-Path $DestinationPath 'files/.env.azure.development.local'
  $knownHostsSource = Join-Path $DestinationPath 'reference/vm-known-hosts'
  $destinationPrivateKey = $Manifest.destinationPrivateKeyPath
  $knownHostsDestination = Join-Path (Join-Path $HOME '.ssh') 'known_hosts'
  $sshDirectory = Split-Path -Parent $knownHostsDestination
  $hostFingerprints = Join-Path `
    $DestinationPath `
    'reference/vm-host-key-fingerprints.txt'
  $primaryDestination = $Context.Config.EnvironmentFilePath
  $localDestination = $Context.Config.LocalEnvironmentFilePath
  $primarySourceLiteral = ConvertTo-AzureDevPowerShellLiteral $primarySource
  $primaryDestinationLiteral = ConvertTo-AzureDevPowerShellLiteral `
    $primaryDestination
  $localSourceLiteral = ConvertTo-AzureDevPowerShellLiteral $localSource
  $localDestinationLiteral = ConvertTo-AzureDevPowerShellLiteral `
    $localDestination
  $knownHostsSourceLiteral = ConvertTo-AzureDevPowerShellLiteral `
    $knownHostsSource
  $knownHostsDestinationLiteral = ConvertTo-AzureDevPowerShellLiteral `
    $knownHostsDestination
  $sshDirectoryLiteral = ConvertTo-AzureDevPowerShellLiteral $sshDirectory
  $destinationPathLiteral = ConvertTo-AzureDevPowerShellLiteral `
    $DestinationPath
  $modeTitle = if ($Manifest.intendedUse -eq 'connect-only') {
    'Connect only'
  } else {
    'Manage environment'
  }
  $modeDescription = if ($Manifest.intendedUse -eq 'connect-only') {
    (
      'Direct SSH configuration; no Azure sign-in. This workstation cannot ' +
      'start, stop, or query VM status, update CIDR access, run setup, or ' +
      'remove the environment. Use a management workstation for those tasks.'
    )
  } else {
    (
      'Azure management configuration. Effective permissions come from the ' +
      'signed-in Azure identity.'
    )
  }
  $localAssignments = if ($Manifest.intendedUse -eq 'connect-only') {
    [ordered]@{
      AZURE_DEV_VM_CONNECTIVITY_MODE = 'public-ssh'
      AZURE_DEV_VM_SSH_HOST_ALIAS = $Manifest.sshHostAlias
      AZURE_DEV_VM_SSH_HOST_NAME = $Manifest.sshHostName
      AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH = $destinationPrivateKey
    }
  } else {
    [ordered]@{
      AZURE_DEV_VM_SUBSCRIPTION_ID = $Manifest.subscriptionId
      AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH = $destinationPrivateKey
    }
  }
  $lines = @(
    '# Azure Development Workstation Setup'
    ''
    "## Mode: $modeTitle"
    ''
    $modeDescription
    ''
    (
      'The package transfers configuration; it does not grant authorization. ' +
      'Azure RBAC remains authoritative.'
    )
    ''
    '> This directory may contain plaintext secrets. Keep it private and remove'
    '> it with `cleanup-workstation-package` after completing the checklist.'
    ''
    'Extraction is non-mutating. The commands below are deliberate setup steps.'
    'Use PowerShell 7 on Windows, macOS, and Linux.'
    ''
    '## Configure repository files'
    ''
  )
  if ($Manifest.intendedUse -eq 'manage-environment') {
    if (Test-Path -LiteralPath $primaryDestination -PathType Leaf) {
      $lines += @(
        "The primary destination already exists at ``$primaryDestination``."
        'Review the exact difference, then deliberately merge or replace it:'
        ''
        '```powershell'
        "code --diff $primarySourceLiteral $primaryDestinationLiteral"
        '```'
      )
    } else {
      $lines += @(
        'Copy the primary management configuration:'
        ''
        '```powershell'
        (
          'Copy-Item -LiteralPath ' + $primarySourceLiteral +
          ' -Destination ' + $primaryDestinationLiteral
        )
        '```'
      )
    }
    $lines += ''
  }
  if (Test-Path -LiteralPath $localDestination -PathType Leaf) {
    $lines += @(
      "The local destination already exists at ``$localDestination``."
      'Do not overwrite it. Add or replace these exact assignments manually:'
      ''
      '```dotenv'
    )
    foreach ($assignment in $localAssignments.GetEnumerator()) {
      $lines += "$($assignment.Key)=$($assignment.Value)"
    }
    $lines += @(
      '```'
    )
    if ($Manifest.intendedUse -eq 'manage-environment') {
      $lines += (
        "Review ``$localSource`` and manually merge any additional selected " +
        'values that this workstation needs.'
      )
    }
  } else {
    $lines += @(
      'Copy the destination-ready local configuration:'
      ''
      '```powershell'
      (
        'Copy-Item -LiteralPath ' + $localSourceLiteral +
        ' -Destination ' + $localDestinationLiteral
      )
      '```'
    )
  }
  if ($Manifest.intendedUse -eq 'manage-environment') {
    $tenantLiteral = ConvertTo-AzureDevPowerShellLiteral $Manifest.tenantId
    $subscriptionLiteral = ConvertTo-AzureDevPowerShellLiteral `
      $Manifest.subscriptionId
    $lines += @(
      ''
      '## Sign in to Azure'
      ''
      'Sign in to the recorded tenant and select the configured subscription:'
      ''
      '```powershell'
      'az cloud set --name AzureCloud'
      "az login --tenant $tenantLiteral"
      "az account set --subscription $subscriptionLiteral"
      '```'
      ''
      (
        'Azure RBAC for this signed-in identity determines which management ' +
        'commands succeed.'
      )
    )
  }
  $lines += @(
    ''
    '## Verify and install VM host keys'
    ''
    (
      "Compare every fingerprint in ``$hostFingerprints`` with the approving " +
      'workstation through the required out-of-band channel.'
    )
    (
      'Stop if any fingerprint differs. If the VM address or host keys have ' +
      'changed, create a new signed request and response package.'
    )
    ''
    'After the comparison succeeds, run this rerunnable PowerShell block:'
    ''
    '```powershell'
    "`$sshDirectory = $sshDirectoryLiteral"
    "`$knownHostsPath = $knownHostsDestinationLiteral"
    "`$sourcePath = $knownHostsSourceLiteral"
    'if (-not (Test-Path -LiteralPath $sshDirectory -PathType Container)) {'
    '  New-Item -ItemType Directory -Path $sshDirectory -Force | Out-Null'
    '}'
    'if (-not (Test-Path -LiteralPath $knownHostsPath -PathType Leaf)) {'
    '  New-Item -ItemType File -Path $knownHostsPath -Force | Out-Null'
    '}'
    '$existing = [Collections.Generic.HashSet[string]]::new('
    '  [StringComparer]::Ordinal'
    ')'
    'foreach ($line in Get-Content -LiteralPath $knownHostsPath) {'
    '  [void]$existing.Add($line)'
    '}'
    'foreach ($line in Get-Content -LiteralPath $sourcePath) {'
    '  if (-not [string]::IsNullOrWhiteSpace($line) -and $existing.Add($line)) {'
    (
      '    Add-Content -LiteralPath $knownHostsPath -Value $line ' +
      '-Encoding utf8'
    )
    '  }'
    '}'
    'if (-not $IsWindows) {'
    '  & chmod 700 -- $sshDirectory'
    '  & chmod 600 -- $knownHostsPath'
    '}'
    '```'
    ''
    'Generate the managed SSH block:'
    ''
    '```powershell'
    './scripts/azure-dev.ps1 -Command ssh-config -Apply'
    '```'
  )
  foreach ($tokenName in @('GH_TOKEN', 'COPILOT_GITHUB_TOKEN')) {
    $tokenPath = Join-Path $DestinationPath "secrets/$tokenName"
    if (Test-Path -LiteralPath $tokenPath) {
      $lines += @(
        ''
        "## Load packaged $tokenName"
        ''
        "A packaged ``$tokenName`` value is available at ``$tokenPath``."
        "Keep an existing ``$tokenName`` environment value if one is already set."
        'Otherwise load it process-locally without placing it in shell history:'
        ''
        '```powershell'
        (
          ('$env:' + $tokenName + ' = [IO.File]::ReadAllText(') +
          (ConvertTo-AzureDevPowerShellLiteral $tokenPath) +
          ').Trim()'
        )
        '```'
        'Remove the extracted secret file when configuration is complete.'
      )
    }
  }
  if ($Manifest.signingRequired) {
    $signingPublicKeySource = Join-Path `
      $DestinationPath `
      'reference/git-signing-public-key.pub'
    $signingFingerprintSource = Join-Path `
      $DestinationPath `
      'reference/git-signing-key-fingerprint.txt'
    $lines += @(
      ''
      '## Restore Git commit signing'
      ''
      'Git commit signing is required for this workstation.'
      (
        'The package contains only the VM signing public key at ' +
        "``$signingPublicKeySource`` and its fingerprint at " +
        "``$signingFingerprintSource``."
      )
      (
        'Restore the corresponding private key through your external password-' +
        'vault or secret-recovery workflow. The private key is never packaged.'
      )
      (
        "Expected public-key fingerprint: " +
        "``$($Manifest.signingPublicKeyFingerprint)``."
      )
      'Load the restored private key into the destination SSH agent:'
      ''
      '```powershell'
      "ssh-add '<private-key-path>'"
      'ssh-add -L'
      '```'
      (
        'Replace the clearly labelled placeholder with the restored private-' +
        'key path. Readiness fails until `ssh-add -L` exposes the matching ' +
        'public key.'
      )
    )
  }
  $lines += @(
    ''
    '## Validate readiness'
    ''
    '```powershell'
    (
      './scripts/azure-dev.ps1 -Command prepare-workstation-access ' +
      "-DestinationPath $destinationPathLiteral"
    )
    '```'
    ''
    (
      'Resolve every required failure before opening the shared workspace. ' +
      'Token warnings may be satisfied by the shell that launches VS Code.'
    )
    ''
    '## Clean up plaintext files'
    ''
    'After readiness succeeds, remove this extracted package:'
    ''
    '```powershell'
    (
      './scripts/azure-dev.ps1 -Command cleanup-workstation-package ' +
      "-DestinationPath $destinationPathLiteral"
    )
    '```'
  )
  Set-AzureDevPrivateContent `
    -Path (Join-Path $DestinationPath 'README.md') `
    -Value ($lines -join [Environment]::NewLine) `
    -Encoding UTF8
}

function Expand-AzureDevWorkstationPackage {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$PackagePath,

    [Parameter(Mandatory = $true)]
    [string]$DestinationPath
  )

  $PackagePath = [IO.Path]::GetFullPath($PackagePath)
  $DestinationPath = [IO.Path]::GetFullPath($DestinationPath)
  if (
    (Get-Item -LiteralPath $PackagePath).Length -gt
    $script:MaximumArmoredPackageBytes
  ) {
    throw 'The encrypted workstation package exceeds the size limit.'
  }
  if (Test-Path -LiteralPath $DestinationPath) {
    throw "Extraction destination already exists: $DestinationPath"
  }
  if (
    -not $PSCmdlet.ShouldProcess(
      $DestinationPath,
      'Decrypt and extract validated workstation package'
    )
  ) {
    return
  }
  $age = Get-AzureDevAgePath
  $temporaryDirectory = Join-Path `
    ([IO.Path]::GetTempPath()) `
    "krav-extract-$([guid]::NewGuid().ToString('N'))"
  try {
    New-AzureDevPrivateDirectory -Path $temporaryDirectory
    $zipPath = Join-Path $temporaryDirectory 'payload.zip'
    $decryptArguments = New-Object System.Collections.Generic.List[string]
    $decryptArguments.Add('-d')
    foreach (
      $identityPath in Get-AzureDevWorkstationPackageIdentityPaths `
        -Context $Context
    ) {
      $decryptArguments.Add('-i')
      $decryptArguments.Add($identityPath)
    }
    $decryptArguments.Add('-o')
    $decryptArguments.Add($zipPath)
    $decryptArguments.Add($PackagePath)
    $decryptResult = Invoke-AzureDevNativeCommand `
      -FilePath $age `
      -Arguments @($decryptArguments)
    if ($decryptResult.ExitCode -ne 0) {
      throw "Could not decrypt the workstation package: $($decryptResult.Text.Trim())"
    }
    $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
      $seen = @{}
      $total = 0L
      foreach ($entry in $archive.Entries) {
        if (
          -not (Test-AzureDevPackageEntryName -Name $entry.FullName) -or
          $seen.ContainsKey($entry.FullName)
        ) {
          throw "The package contains an unsafe or duplicate entry: $($entry.FullName)"
        }
        if ($entry.Length -gt $script:MaximumEntryBytes) {
          throw "Package entry exceeds the size limit: $($entry.FullName)"
        }
        $seen[$entry.FullName] = $true
        $total += $entry.Length
      }
      if ($total -gt $script:MaximumPackageBytes) {
        throw 'The decrypted workstation package exceeds the size limit.'
      }
      $manifestEntry = $archive.GetEntry('manifest.json')
      if ($null -eq $manifestEntry) {
        throw 'The package manifest is missing.'
      }
      $reader = [IO.StreamReader]::new($manifestEntry.Open())
      try {
        $manifest = $reader.ReadToEnd() | ConvertFrom-Json
      } finally {
        $reader.Dispose()
      }
      Assert-AzureDevWorkstationPackageManifest -Manifest $manifest
      if (
        [datetimeoffset]$manifest.expiresAt -lt
        [datetimeoffset]::UtcNow
      ) {
        throw 'The workstation package has expired.'
      }
      $declared = @($manifest.entries) + @('manifest.json')
      foreach ($entryName in $seen.Keys) {
        if ($entryName -notin $declared) {
          throw "The package contains an undeclared entry: $entryName"
        }
      }
      foreach ($entryName in $declared) {
        if (-not $seen.ContainsKey($entryName)) {
          throw "The package manifest references a missing entry: $entryName"
        }
      }
      if (
        $manifest.intendedUse -eq 'connect-only' -and
        'files/.env.azure.development' -in @($manifest.entries)
      ) {
        throw 'A connect-only package must not contain the primary environment file.'
      }
      if (
        $manifest.intendedUse -eq 'manage-environment' -and
        'files/.env.azure.development' -notin @($manifest.entries)
      ) {
        throw 'A management package is missing the primary environment file.'
      }
      if (
        'files/.env.azure.development.local' -notin @($manifest.entries)
      ) {
        throw 'The package is missing destination-ready local configuration.'
      }
      $signingEntries = @(
        'reference/git-signing-public-key.pub',
        'reference/git-signing-key-fingerprint.txt'
      )
      if ($manifest.signingRequired) {
        foreach ($signingEntry in $signingEntries) {
          if ($signingEntry -notin @($manifest.entries)) {
            throw "The signing-required package is missing $signingEntry."
          }
        }
      }

      New-AzureDevPrivateDirectory -Path $DestinationPath
      $actualTotal = 0L
      foreach ($entry in $archive.Entries) {
        $target = Join-Path $DestinationPath $entry.FullName
        $targetDirectory = Split-Path -Parent $target
        if (-not (Test-Path -LiteralPath $targetDirectory)) {
          New-AzureDevPrivateDirectory -Path $targetDirectory
        }
        $entryInput = $entry.Open()
        New-AzureDevPrivateFile -Path $target
        $output = [IO.File]::Open(
          $target,
          [IO.FileMode]::Truncate,
          [IO.FileAccess]::Write,
          [IO.FileShare]::None
        )
        try {
          $buffer = [byte[]]::new(64KB)
          $entryBytes = 0L
          while (($read = $entryInput.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $entryBytes += $read
            $actualTotal += $read
            if ($entryBytes -gt $script:MaximumEntryBytes) {
              throw "Package entry exceeds the size limit: $($entry.FullName)"
            }
            if ($actualTotal -gt $script:MaximumPackageBytes) {
              throw 'The decrypted workstation package exceeds the size limit.'
            }
            $output.Write($buffer, 0, $read)
          }
        } finally {
          $output.Dispose()
          $entryInput.Dispose()
        }
      }
      Write-AzureDevExtractedReadme `
        -Context $Context `
        -DestinationPath $DestinationPath `
        -Manifest $manifest
    } finally {
      $archive.Dispose()
    }
  } catch {
    if (Test-Path -LiteralPath $DestinationPath) {
      Remove-Item -LiteralPath $DestinationPath -Recurse -Force
    }
    throw
  } finally {
    if (Test-Path -LiteralPath $temporaryDirectory) {
      Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
  }
  Write-Host "Extracted package: $DestinationPath"
  Write-Host "Follow: $(Join-Path $DestinationPath 'README.md')"
}

function Remove-AzureDevExtractedPackage {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$DestinationPath
  )

  $manifestPath = Join-Path $DestinationPath 'manifest.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw 'Cleanup refuses a directory without a workstation package manifest.'
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if (
    $manifest.schema -ne $script:PackageSchema -or
    $manifest.kind -ne 'kravhantering-azure-dev-workstation-package'
  ) {
    throw (
      'Cleanup refuses a directory with an unsupported workstation package ' +
      'manifest.'
    )
  }
  if (
    -not (
      Confirm-AzureDevWorkstationAction `
        -Context $Context `
        -Prompt "Remove the extracted plaintext package at ${DestinationPath}?"
    )
  ) {
    throw 'Package cleanup was cancelled.'
  }
  if ($PSCmdlet.ShouldProcess($DestinationPath, 'Remove extracted workstation package')) {
    Remove-Item -LiteralPath $DestinationPath -Recurse -Force
  }
  Write-Host 'The extracted files were removed. Secure SSD erasure is not guaranteed.'
}

function Get-AzureDevExtractedPackageManifest {
  [CmdletBinding()]
  param(
    [AllowEmptyString()]
    [string]$DestinationPath
  )

  if ([string]::IsNullOrWhiteSpace($DestinationPath)) {
    return $null
  }
  $resolvedPath = [IO.Path]::GetFullPath($DestinationPath)
  $manifestPath = Join-Path $resolvedPath 'manifest.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Extracted workstation package manifest is missing: $manifestPath"
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  Assert-AzureDevWorkstationPackageManifest -Manifest $manifest
  return $manifest
}

function Test-AzureDevConfigKeyConfigured {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config,

    [Parameter(Mandatory = $true)]
    [string]$Key
  )

  return (
    $Config.PSObject.Properties.Name -contains 'ConfiguredKeys' -and
    $Key -in @($Config.ConfiguredKeys)
  )
}

function ConvertTo-AzureDevKnownHostEntry {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Line
  )

  $trimmed = $Line.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith('#')) {
    return ''
  }
  $parts = @($trimmed -split '\s+')
  if ($parts.Count -lt 3) {
    return ''
  }
  return "$($parts[0]) $($parts[1]) $($parts[2])"
}

function Test-AzureDevKnownHostsMatch {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$ExpectedPath,

    [Parameter(Mandatory = $true)]
    [string]$InstalledPath,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedHost
  )

  if (
    [string]::IsNullOrWhiteSpace($ExpectedHost) -or
    -not (Test-Path -LiteralPath $ExpectedPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $InstalledPath -PathType Leaf)
  ) {
    return $false
  }
  $expectedEntries = New-Object System.Collections.Generic.List[string]
  foreach ($line in Get-Content -LiteralPath $ExpectedPath) {
    $entry = ConvertTo-AzureDevKnownHostEntry -Line $line
    if ([string]::IsNullOrWhiteSpace($entry)) {
      continue
    }
    $entryHost = ($entry -split '\s+', 2)[0]
    if ($ExpectedHost -notin @($entryHost -split ',')) {
      return $false
    }
    $expectedEntries.Add($entry)
  }
  if ($expectedEntries.Count -eq 0) {
    return $false
  }
  $installedEntries = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::Ordinal
  )
  foreach ($line in Get-Content -LiteralPath $InstalledPath) {
    $entry = ConvertTo-AzureDevKnownHostEntry -Line $line
    if (-not [string]::IsNullOrWhiteSpace($entry)) {
      [void]$installedEntries.Add($entry)
    }
  }
  foreach ($expectedEntry in $expectedEntries) {
    if (-not $installedEntries.Contains($expectedEntry)) {
      return $false
    }
  }
  return $true
}

function Test-AzureDevSigningAgent {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$ExpectedPublicKey
  )

  if (-not (Test-AzureDevSshPublicKey -Value $ExpectedPublicKey)) {
    return $false
  }
  $agentResult = Invoke-AzureDevNativeCommand `
    -FilePath 'ssh-add' `
    -Arguments @('-L')
  if ($agentResult.ExitCode -ne 0) {
    return $false
  }
  $expectedParts = $ExpectedPublicKey.Trim() -split '[ \t]+', 3
  $expectedIdentity = "$($expectedParts[0]) $($expectedParts[1])"
  foreach ($line in @($agentResult.Text -split '\r?\n')) {
    if (Test-AzureDevSshPublicKey -Value $line) {
      $parts = $line.Trim() -split '[ \t]+', 3
      if ("$($parts[0]) $($parts[1])" -eq $expectedIdentity) {
        return $true
      }
    }
  }
  return $false
}

function Invoke-AzureDevPrepareWorkstationAccess {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [string]$DestinationPath
  )

  $manifest = Get-AzureDevExtractedPackageManifest `
    -DestinationPath $DestinationPath
  $directConnection = (
    $null -ne $manifest -and
    $manifest.intendedUse -eq 'connect-only'
  )
  if (-not $directConnection) {
    Test-AzureDevPrerequisites -Context $Context
  }

  $requiredFailures = New-Object System.Collections.Generic.List[string]
  if ($null -ne $manifest) {
    if (
      $Context.Config.SshPrivateKeyPath -cne
      $manifest.destinationPrivateKeyPath
    ) {
      $requiredFailures.Add(
        'Installed SSH private-key path does not match the package.'
      )
    }
  }
  $connectivityReady = (
    (Test-AzureDevConfigKeyConfigured `
        -Config $Context.Config `
        -Key 'AZURE_DEV_VM_CONNECTIVITY_MODE') -and
    $Context.Config.ConnectivityMode -eq 'public-ssh'
  )
  $hostReady = (
    (Test-AzureDevConfigKeyConfigured `
        -Config $Context.Config `
        -Key 'AZURE_DEV_VM_SSH_HOST_NAME') -and
    -not [string]::IsNullOrWhiteSpace($Context.Config.SshHostName)
  )
  $aliasReady = (
    (Test-AzureDevConfigKeyConfigured `
        -Config $Context.Config `
        -Key 'AZURE_DEV_VM_SSH_HOST_ALIAS') -and
    -not [string]::IsNullOrWhiteSpace($Context.Config.SshHostAlias)
  )
  $keyConfigured = Test-AzureDevConfigKeyConfigured `
    -Config $Context.Config `
    -Key 'AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH'
  $keyReady = if ($directConnection) {
    (
      $keyConfigured -and
      (Test-Path `
          -LiteralPath $Context.Config.SshPrivateKeyPath `
          -PathType Leaf)
    )
  } else {
    Test-Path `
      -LiteralPath $Context.Config.SshPrivateKeyPath `
      -PathType Leaf
  }
  if ($directConnection) {
    Write-Host (
      'Direct SSH connectivity mode: ' +
      "$(if ($connectivityReady) { 'configured' } else { 'missing or invalid' })"
    )
    Write-Host "Direct SSH host: $(if ($hostReady) { 'configured' } else { 'missing' })"
    Write-Host "SSH host alias: $(if ($aliasReady) { 'configured' } else { 'missing' })"
    if (-not $connectivityReady) {
      $requiredFailures.Add(
        'AZURE_DEV_VM_CONNECTIVITY_MODE must be configured as public-ssh.'
      )
    }
    if (-not $hostReady) {
      $requiredFailures.Add('AZURE_DEV_VM_SSH_HOST_NAME is missing.')
    }
    if (-not $aliasReady) {
      $requiredFailures.Add('AZURE_DEV_VM_SSH_HOST_ALIAS is missing.')
    }
    if (
      $hostReady -and
      $Context.Config.SshHostName -cne $manifest.sshHostName
    ) {
      $requiredFailures.Add(
        'Installed direct SSH host does not match the package.'
      )
    }
    if (
      $aliasReady -and
      $Context.Config.SshHostAlias -cne $manifest.sshHostAlias
    ) {
      $requiredFailures.Add(
        'Installed SSH host alias does not match the package.'
      )
    }
  }
  Write-Host "SSH private key: $(if ($keyReady) { 'ready' } else { 'missing' })"
  if (-not $keyReady) {
    $requiredFailures.Add(
      "SSH private key is missing: $($Context.Config.SshPrivateKeyPath)"
    )
  }

  if ($directConnection) {
    $knownHostsPath = Join-Path (Join-Path $HOME '.ssh') 'known_hosts'
    $expectedKnownHostsPath = Join-Path `
      ([IO.Path]::GetFullPath($DestinationPath)) `
      'reference/vm-known-hosts'
    $knownHostReady = Test-AzureDevKnownHostsMatch `
      -ExpectedPath $expectedKnownHostsPath `
      -InstalledPath $knownHostsPath `
      -ExpectedHost $manifest.sshHostName
    Write-Host (
      'Verified known_hosts entry: ' +
      "$(if ($knownHostReady) { 'ready' } else { 'missing' })"
    )
    if (-not $knownHostReady) {
      $requiredFailures.Add(
        (
          'The installed known_hosts file does not contain every package-' +
          "verified key for $($manifest.sshHostName). Reinstall the verified " +
          'reference/vm-known-hosts entries or regenerate the package.'
        )
      )
    }

    $managedBlockReady = $false
    if ($hostReady -and $aliasReady -and $keyConfigured) {
      $sshConfigPath = Get-AzureDevSshConfigPath
      $expectedBlock = Get-AzureDevSshConfigBlock `
        -Context $Context `
        -HostName $Context.Config.SshHostName
      $managedBlockReady = (
        (Test-Path -LiteralPath $sshConfigPath -PathType Leaf) -and
        (Get-Content -LiteralPath $sshConfigPath -Raw).Contains($expectedBlock)
      )
    }
    Write-Host (
      'Managed SSH block: ' +
      "$(if ($managedBlockReady) { 'ready' } else { 'missing or outdated' })"
    )
    if (-not $managedBlockReady) {
      $remediation = './scripts/azure-dev.ps1 -Command ssh-config -Apply'
      Write-Host "Remediation: $remediation"
      $requiredFailures.Add("Run: $remediation")
    }
  }

  $ghTokenReady = -not [string]::IsNullOrWhiteSpace($env:GH_TOKEN)
  $copilotTokenReady = -not [string]::IsNullOrWhiteSpace(
    $env:COPILOT_GITHUB_TOKEN
  )
  Write-Host (
    'GH_TOKEN in current PowerShell process: ' +
    "$(if ($ghTokenReady) { 'present' } else { 'missing (warning)' })"
  )
  Write-Host (
    'COPILOT_GITHUB_TOKEN in current PowerShell process: ' +
    "$(if ($copilotTokenReady) { 'present' } else { 'missing (warning)' })"
  )
  if (-not $ghTokenReady -or -not $copilotTokenReady) {
    Write-Host (
      'Token warnings are acceptable when another shell with the required ' +
      'values launches the VS Code Remote SSH session.'
    )
  }

  $signingRequired = (
    $null -ne $manifest -and
    [bool]$manifest.signingRequired
  )
  if ($signingRequired) {
    $signingPublicKeyPath = Join-Path `
      ([IO.Path]::GetFullPath($DestinationPath)) `
      'reference/git-signing-public-key.pub'
    $signingPublicKey = if (
      Test-Path -LiteralPath $signingPublicKeyPath -PathType Leaf
    ) {
      (Get-Content -LiteralPath $signingPublicKeyPath -Raw).Trim()
    } else {
      ''
    }
    $signingFingerprintReady = $false
    if (Test-AzureDevSshPublicKey -Value $signingPublicKey) {
      $signingFingerprintReady = (
        (Get-AzureDevPublicKeyFingerprint -PublicKey $signingPublicKey) -eq
        $manifest.signingPublicKeyFingerprint
      )
    }
    $signingAgentReady = (
      $signingFingerprintReady -and
      (Test-AzureDevSigningAgent -ExpectedPublicKey $signingPublicKey)
    )
    Write-Host (
      'Required Git signing key in SSH agent: ' +
      "$(if ($signingAgentReady) { 'ready' } else { 'missing' })"
    )
    if (-not $signingAgentReady) {
      $requiredFailures.Add(
        'Restore the matching private signing key and load it with ssh-add.'
      )
    }
  } else {
    Write-Host 'Git commit signing: not required by this package'
  }

  if ($requiredFailures.Count -gt 0) {
    foreach ($failure in $requiredFailures) {
      Write-Host "Required remediation: $failure"
    }
    throw 'Workstation access is not ready.'
  }
  Write-Host 'Workstation access readiness: ready'
  Write-Host 'Open the shared workspace:'
  Write-Host "  code --remote ssh-remote+$($Context.Config.SshHostAlias) /workspace"
}

function Add-AzureDevWorkstationCidr {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$WorkstationName,

    [Parameter(Mandatory = $true)]
    [string]$AccessName,

    [string]$Cidr,

    [switch]$Replace,

    [switch]$AllowNetworkCidr
  )

  if ($Context.Config.ConnectivityMode -ne 'public-ssh') {
    throw 'Named CIDRs apply only to public-ssh connectivity mode.'
  }
  Test-AzureDevPrerequisites -Context $Context
  $resolved = Get-AzureDevWorkstationCidr `
    -Cidr $Cidr `
    -AllowNetwork:$AllowNetworkCidr
  $rule = Set-AzureDevSshAccessRule `
    -Context $Context `
    -WorkstationName $WorkstationName `
    -AccessName $AccessName `
    -Cidr $resolved `
    -Replace:$Replace
  Set-AzureDevSshAccessSchema -Context $Context
  Write-Host "$($rule.workstation)/$($rule.access) $($rule.cidr)"
}

function Show-AzureDevWorkstationCidrs {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  Test-AzureDevPrerequisites -Context $Context
  $rules = @(Get-AzureDevSshAccessRules -Config $Context.Config)
  if ($rules.Count -eq 0) {
    Write-Host 'No managed SSH CIDRs were found.'
    return
  }
  foreach ($rule in $rules) {
    $owner = "$($rule.workstation)/$($rule.access)"
    Write-Host "$owner $($rule.cidr) priority=$($rule.priority)"
  }
}

function Remove-AzureDevWorkstationCidr {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$WorkstationName,

    [Parameter(Mandatory = $true)]
    [string]$AccessName,

    [switch]$ForceRecovery
  )

  Test-AzureDevPrerequisites -Context $Context
  $candidateName = Get-AzureDevSshAccessRuleName `
    -WorkstationName $WorkstationName `
    -AccessName $AccessName
  $rules = @(Get-AzureDevSshAccessRules -Config $Context.Config)
  $target = @($rules | Where-Object { $_.name -eq $candidateName })
  if ($target.Count -ne 1) {
    throw "Managed SSH CIDR was not found: $WorkstationName/$AccessName"
  }
  if ($rules.Count -le 1 -and -not $ForceRecovery) {
    throw 'Refusing to remove the final managed CIDR without -ForceRecovery.'
  }
  if (
    -not (
      Confirm-AzureDevWorkstationAction `
        -Context $Context `
        -Prompt "Remove CIDR $WorkstationName/${AccessName}?"
    )
  ) {
    throw 'CIDR removal was cancelled.'
  }
  if (
    -not $PSCmdlet.ShouldProcess(
      "$WorkstationName/$AccessName",
      'Remove managed SSH CIDR'
    )
  ) {
    return
  }
  Remove-AzureDevSshAccessRule -Context $Context -RuleName $target[0].name
}

function Remove-AzureDevRemoteWorkstationKey {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$WorkstationName,

    [switch]$ForceRecovery
  )

  $name = ConvertTo-AzureDevAccessName $WorkstationName
  $comment = Get-AzureDevRemoteWorkstationKeyComment `
    -Context $Context `
    -WorkstationName $name
  $force = if ($ForceRecovery) { '1' } else { '0' }
  if (
    -not $PSCmdlet.ShouldProcess(
      $name,
      'Remove workstation public key from Azure VM'
    )
  ) {
    return
  }
  $remoteCommand = @(
    'set -eu'
    'file="$HOME/.ssh/authorized_keys"'
    'test -f "$file"'
    'key_count="$(awk ''NF >= 2 && $1 ~ /^(ssh-|ecdsa-|sk-)/ { count++ } END { print count + 0 }'' "$file")"'
    "if [ `"`$key_count`" -le 1 ] && [ '$force' != '1' ]; then exit 42; fi"
    'tmp="$(mktemp "$HOME/.ssh/authorized_keys.XXXXXX")"'
    "awk -v c='$comment' '!(NF >= 3 && `$3 == c)' `"`$file`" > `"`$tmp`""
    'chmod 600 "$tmp"'
    'mv "$tmp" "$file"'
  ) -join '; '
  $result = Invoke-AzureDevNativeCommand `
    -FilePath 'ssh' `
    -Arguments @(
      '-o',
      'ClearAllForwardings=yes',
      $Context.Config.SshHostAlias,
      $remoteCommand
    )
  if ($result.ExitCode -eq 42) {
    throw 'Refusing to remove the final usable SSH key without -ForceRecovery.'
  }
  if ($result.ExitCode -ne 0) {
    throw "Could not remove workstation key: $($result.Text.Trim())"
  }
}

function Remove-AzureDevWorkstation {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$WorkstationName,

    [switch]$ForceRecovery
  )

  Test-AzureDevPrerequisites -Context $Context
  $name = ConvertTo-AzureDevAccessName $WorkstationName
  $managedRules = @(Get-AzureDevSshAccessRules -Config $Context.Config)
  $rules = @($managedRules | Where-Object { $_.workstation -eq $name })
  if (
    $rules.Count -gt 0 -and
    $rules.Count -eq $managedRules.Count -and
    -not $ForceRecovery
  ) {
    throw (
      'Refusing to remove every remaining managed CIDR without ' +
      '-ForceRecovery.'
    )
  }
  if (
    -not (
      Confirm-AzureDevWorkstationAction `
        -Context $Context `
        -Prompt "Remove workstation $name, its key, and $($rules.Count) CIDR(s)?"
    )
  ) {
    throw 'Workstation removal was cancelled.'
  }
  if (
    -not $PSCmdlet.ShouldProcess(
      $name,
      'Remove workstation key and owned CIDRs'
    )
  ) {
    return
  }
  Remove-AzureDevRemoteWorkstationKey `
    -Context $Context `
    -WorkstationName $name `
    -ForceRecovery:$ForceRecovery
  foreach ($rule in $rules) {
    Remove-AzureDevSshAccessRule -Context $Context -RuleName $rule.name
  }
}

Export-ModuleMember -Function `
  Add-AzureDevWorkstationCidr, `
  Approve-AzureDevWorkstation, `
  Expand-AzureDevWorkstationPackage, `
  Get-AzureDevExtractedPackageManifest, `
  Get-AzureDevWorkstationCidr, `
  Invoke-AzureDevPrepareWorkstationAccess, `
  New-AzureDevWorkstationRequest, `
  Read-AzureDevWorkstationRequest, `
  Register-AzureDevRemoteWorkstationKey, `
  Remove-AzureDevExtractedPackage, `
  Remove-AzureDevWorkstation, `
  Remove-AzureDevWorkstationCidr, `
  Resolve-AzureDevWorkstationName, `
  Show-AzureDevWorkstationCidrs
