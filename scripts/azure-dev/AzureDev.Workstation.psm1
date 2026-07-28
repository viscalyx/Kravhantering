using module ./AzureDev.Logging.psm1

Set-StrictMode -Version Latest

$script:RequestBegin = '-----BEGIN KRAVHANTERING WORKSTATION REQUEST-----'
$script:RequestEnd = '-----END KRAVHANTERING WORKSTATION REQUEST-----'
$script:RequestNamespace = 'kravhantering-workstation-request'
$script:PackageSchema = 1
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
    schema = 1
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
    'Version: 1'
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

    [string]$Cidr,

    [string]$OutputPath
  )

  $workstation = ConvertTo-AzureDevAccessName `
    -Value $WorkstationName `
    -Label 'Workstation name'
  $resolvedCidr = Get-AzureDevWorkstationCidr -Cidr $Cidr
  if (
    -not $PSCmdlet.ShouldProcess(
      $workstation,
      'Generate destination key and signed workstation request'
    )
  ) {
    return
  }
  $keyPath = Join-Path `
    (Join-Path $HOME '.ssh') `
    "kravhantering_azure_dev_${workstation}_ed25519"
  $keyConfig = [pscustomobject]@{
    SshPrivateKeyPath = $keyPath
    SshPublicKeyPath = "$keyPath.pub"
  }
  New-AzureDevSshKey -Config $keyConfig
  $publicKey = Get-AzureDevSshPublicKey -Config $keyConfig
  $fingerprint = Get-AzureDevPublicKeyFingerprint -PublicKey $publicKey
  $now = (Get-Date).ToUniversalTime()
  $request = [ordered]@{
    schema = 1
    kind = 'kravhantering-azure-dev-workstation-request'
    requestId = [guid]::NewGuid().ToString('N')
    createdAt = $now.ToString('o')
    expiresAt = $now.AddHours(24).ToString('o')
    workstation = $workstation
    access = 'current'
    cidr = $resolvedCidr
    platform = if ($IsWindows) {
      'windows'
    } elseif ($IsMacOS) {
      'macos'
    } else {
      'linux'
    }
    architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
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

  Write-Host "Workstation request: $OutputPath"
  Write-Host "Workstation: $workstation"
  Write-Host "Requested CIDR: $resolvedCidr"
  Write-Host "SSH private key: $keyPath"
  Write-Host "Public-key fingerprint: $fingerprint"
  Write-Host "Verification code: $(Get-AzureDevVerificationCode $fingerprint)"
  Write-Host ''
  Write-Host $armored
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
    '\s+Version:\s*1\s+(.+?)\s+' +
    [regex]::Escape($script:RequestEnd) + '\s*$'
  )
  if ($armored -notmatch $pattern) {
    throw 'The workstation request armor is malformed.'
  }
  try {
    $encoded = $Matches[1] -replace '\s', ''
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
    $envelope.schema -ne 1 -or
    $request.schema -ne 1 -or
    $request.kind -ne 'kravhantering-azure-dev-workstation-request'
  ) {
    throw 'The workstation request schema is unsupported.'
  }
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
    Copy-AzureDevPrivateFile `
      -Source $Context.Config.EnvironmentFilePath `
      -Destination (Join-Path $payloadPath 'files/.env.azure.development')

    $included = New-Object System.Collections.Generic.List[string]
    $included.Add('files/.env.azure.development')
    $localPath = $Context.Config.LocalEnvironmentFilePath
    if (Test-Path -LiteralPath $localPath -PathType Leaf) {
      $secretNames = @(Get-AzureDevSecretNames -Path $localPath)
      $inventory = if ($secretNames.Count -eq 0) {
        '<none detected>'
      } else {
        $secretNames -join ', '
      }
      if (
        Confirm-AzureDevWorkstationAction `
          -Context $Context `
          -Prompt (
            'Include the entire .env.azure.development.local file? ' +
            "Detected secret names: $inventory"
          ) `
          -Optional
      ) {
        Copy-AzureDevPrivateFile `
          -Source $localPath `
          -Destination (
            Join-Path $payloadPath 'files/.env.azure.development.local'
          )
        $included.Add('files/.env.azure.development.local')
      }
    }
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
    $signingKeyValue = Get-AzureDevLocalGitConfigValue `
      -RepositoryRoot $Context.Config.RepoRoot `
      -Key 'user.signingkey'
    if (
      -not [string]::IsNullOrWhiteSpace($signingKeyValue) -and
      -not (Test-AzureDevSshPublicKey -Value $signingKeyValue)
    ) {
      $signingPath = Resolve-AzureDevPath -Path $signingKeyValue
      if (-not [IO.Path]::IsPathRooted($signingPath)) {
        $signingPath = Join-Path $Context.Config.RepoRoot $signingPath
      }
      if ($signingPath.EndsWith('.pub')) {
        $signingPath = $signingPath.Substring(0, $signingPath.Length - 4)
      }
      if (
        (Test-Path -LiteralPath $signingPath -PathType Leaf) -and
        (Test-Path -LiteralPath "$signingPath.pub" -PathType Leaf) -and
        (
          Confirm-AzureDevWorkstationAction `
            -Context $Context `
            -Prompt (
              'Include the exportable SSH commit-signing key pair? The ' +
              'private key will be present in the encrypted package.'
            ) `
            -Optional
        )
      ) {
        $signingDirectory = Join-Path $payloadPath 'secrets'
        if (-not (Test-Path -LiteralPath $signingDirectory)) {
          New-AzureDevPrivateDirectory -Path $signingDirectory
        }
        Copy-AzureDevPrivateFile `
          -Source $signingPath `
          -Destination (Join-Path $signingDirectory 'git-signing-key')
        Copy-AzureDevPrivateFile `
          -Source "$signingPath.pub" `
          -Destination (Join-Path $signingDirectory 'git-signing-key.pub')
        $included.Add('secrets/git-signing-key')
        $included.Add('secrets/git-signing-key.pub')
      }
    }
    $zshTemplate = Join-Path `
      $Context.Config.RepoRoot `
      'scripts/azure-dev/templates/zshrc.template'
    if (
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
    $hostName = Get-AzureDevPublicIpAddress -Config $Context.Config
    if ([string]::IsNullOrWhiteSpace($hostName)) {
      throw 'Could not resolve the VM host for SSH host-key capture.'
    }
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
      environmentId = $Context.Config.EnvironmentId
      tenantId = $tenantId
      subscriptionId = $Context.Config.SubscriptionId
      resourceGroup = $Context.Config.ResourceGroup
      vmName = $Context.Config.VmName
      sshHostAlias = $Context.Config.SshHostAlias
      publicKeyFingerprint = $Request.publicKeyFingerprint
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

  Test-AzureDevPrerequisites -Context $Context
  $request = Read-AzureDevWorkstationRequest -Path $RequestPath
  Write-Host "Workstation: $($request.workstation)"
  Write-Host "Requested CIDR: $($request.cidr)"
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
      $hostName = Get-AzureDevPublicIpAddress -Config $Context.Config
      Wait-AzureDevSsh -Context $Context -HostName $hostName | Out-Null
    }
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
  $destinationPrivateKey = Join-Path `
    (Join-Path $HOME '.ssh') `
    "kravhantering_azure_dev_$($Manifest.workstation)_ed25519"
  $hostFingerprints = Join-Path `
    $DestinationPath `
    'reference/vm-host-key-fingerprints.txt'
  $lines = @(
    '# Azure Development Workstation Setup'
    ''
    '> This directory may contain plaintext secrets. Keep it private and remove'
    '> it with `cleanup-workstation-package` after completing the checklist.'
    ''
    '## Checklist'
    ''
    "1. Copy ``$primarySource`` to ``$($Context.Config.EnvironmentFilePath)``."
  )
  if (Test-Path -LiteralPath $localSource) {
    $lines += (
      "2. Review ``$localSource``, then copy it to " +
      "``$($Context.Config.LocalEnvironmentFilePath)``."
    )
    $step = 3
  } else {
    $step = 2
  }
  $lines += @(
    (
      "$step. Review ``AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH``. It must point to " +
      "the private key generated by ``new-workstation-request``: " +
      "``$destinationPrivateKey``."
    )
    "$($step + 1). Sign in to the Azure tenant recorded in ``manifest.json``:"
    ''
    '   ```sh'
    '   az cloud set --name AzureCloud'
    "   az login --tenant `"$($Manifest.tenantId)`""
    '   ```'
    ''
    "$($step + 2). Compare the VM fingerprints in ``$hostFingerprints`` with"
    '   the approving workstation. After they match, append only the entries'
    "   from ``$knownHostsSource`` to your user ``known_hosts`` file."
    ''
    "$($step + 3). Generate the managed SSH block:"
    ''
    '   ```powershell'
    '   ./scripts/azure-dev.ps1 ssh-config -Apply'
    '   ```'
  )
  foreach ($tokenName in @('GH_TOKEN', 'COPILOT_GITHUB_TOKEN')) {
    $tokenPath = Join-Path $DestinationPath "secrets/$tokenName"
    if (Test-Path -LiteralPath $tokenPath) {
      $lines += @(
        ''
        "A packaged ``$tokenName`` value is available at ``$tokenPath``."
        "Keep an existing ``$tokenName`` environment value if one is already set."
        'Otherwise load it process-locally without placing the value in shell history.'
        $(if ($Manifest.platform -eq 'windows') {
            (
              ('PowerShell: $env:' + $tokenName + ' = ') +
              "[IO.File]::ReadAllText('$tokenPath').Trim()"
            )
          } else {
            (
              'Bash/Zsh: export ' + $tokenName +
              '="$(< ' + "'$tokenPath'" + ')"'
            )
          })
        'Remove the extracted secret file when configuration is complete.'
      )
    } else {
      $lines += @(
        ''
        "``$tokenName`` was not packaged. Configure it locally before opening"
        'VS Code or the corresponding remote capability will be unavailable.'
      )
    }
  }
  $signingKeySource = Join-Path $DestinationPath 'secrets/git-signing-key'
  if (Test-Path -LiteralPath $signingKeySource) {
    $lines += @(
      ''
      "An SSH commit-signing key pair is available at ``$signingKeySource``."
      'Copy it to a user-owned SSH-key location, apply private-key permissions,'
      'load it into the SSH agent, and remove the extracted copy.'
    )
  }
  $lines += @(
    ''
    '## Validate and open'
    ''
    '```powershell'
    './scripts/azure-dev.ps1 prepare-workstation-access'
    '```'
    ''
    'Then run the `code --remote ...` command printed by the readiness check.'
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
      if (
        $manifest.schema -ne $script:PackageSchema -or
        $manifest.kind -ne 'kravhantering-azure-dev-workstation-package'
      ) {
        throw 'The workstation package schema is unsupported.'
      }
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
  if ($manifest.kind -ne 'kravhantering-azure-dev-workstation-package') {
    throw 'Cleanup refuses a directory with an unexpected manifest.'
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

function Invoke-AzureDevPrepareWorkstationAccess {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  Test-AzureDevPrerequisites -Context $Context
  $keyReady = Test-Path -LiteralPath $Context.Config.SshPrivateKeyPath -PathType Leaf
  $ghTokenReady = -not [string]::IsNullOrWhiteSpace($env:GH_TOKEN)
  $copilotTokenReady = -not [string]::IsNullOrWhiteSpace(
    $env:COPILOT_GITHUB_TOKEN
  )
  Write-Host "SSH private key: $(if ($keyReady) { 'ready' } else { 'missing' })"
  Write-Host (
    'GH_TOKEN in current PowerShell process: ' +
    "$(if ($ghTokenReady) { 'present' } else { 'missing' })"
  )
  Write-Host (
    'COPILOT_GITHUB_TOKEN in current PowerShell process: ' +
    "$(if ($copilotTokenReady) { 'present' } else { 'missing' })"
  )
  if (-not $ghTokenReady -or -not $copilotTokenReady) {
    Write-Host (
      'Missing tokens here are okay when PowerShell will not start the VS Code ' +
      'Remote SSH session.'
    )
    Write-Host (
      'Start the printed code command from a shell, such as Zsh or Bash, where ' +
      'the required tokens are available.'
    )
  }
  Write-Host 'Apply the managed SSH block when needed:'
  Write-Host '  ./scripts/azure-dev.ps1 ssh-config -Apply'
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
