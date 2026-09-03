Set-StrictMode -Version Latest

$script:AzureDevWhatIfPublicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINHTPpE1LHuzHN/oirKpSYd7H/LfaLu0H1gp8VOcBt1y azure-dev-whatif-placeholder'
$script:AzureDevSshMarkerName = 'kravhantering-azure-dev'
$script:AzureDevForwardedPorts = @(3000, 3001, 4443, 1433, 8080, 18000, 9323, 51204)

function Get-AzureDevCurrentIpv4 {
  [CmdletBinding()]
  param()

  try {
    Write-Verbose 'Detecting current public IPv4 address'
    $response = Invoke-RestMethod `
      -Uri 'https://api.ipify.org?format=json' `
      -TimeoutSec 15
    Write-Debug "Output from public IPv4 detection:$([Environment]::NewLine)$($response | Out-String)"
    return $response.ip
  } catch {
    throw 'Could not auto-detect the current public IPv4 address.'
  }
}

function Test-AzureDevCidr {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Cidr
  )

  if ($Cidr -in @('0.0.0.0/0', '::/0')) {
    throw 'Broad SSH source ranges are refused.'
  }
  if ($Cidr -notmatch '^(\d{1,3}\.){3}\d{1,3}/([1-9]|[12][0-9]|3[0-2])$') {
    throw "SSH CIDR must be an IPv4 CIDR, for example 203.0.113.10/32: $Cidr"
  }

  $ip = $Cidr.Split('/')[0]
  foreach ($part in $ip.Split('.')) {
    $value = [int]$part
    if ($value -lt 0 -or $value -gt 255) {
      throw "SSH CIDR contains an invalid IPv4 octet: $Cidr"
    }
  }
  return $true
}

function Get-AzureDevPlaceholderPublicKey {
  [CmdletBinding()]
  param()

  return $script:AzureDevWhatIfPublicKey
}

function New-AzureDevSshKey {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $privatePath = $Config.SshPrivateKeyPath
  $publicPath = $Config.SshPublicKeyPath
  if (Test-Path -LiteralPath $privatePath -PathType Leaf) {
    if (-not (Test-Path -LiteralPath $publicPath -PathType Leaf)) {
      if ($PSCmdlet.ShouldProcess($publicPath, 'Derive SSH public key')) {
        $result = Invoke-AzureDevNativeCommand `
          -FilePath 'ssh-keygen' `
          -Arguments @('-y', '-f', $privatePath)
        if ($result.ExitCode -ne 0) {
          throw "Could not derive public key from $privatePath`: $($result.Text.Trim())"
        }
        $publicKey = $result.Text.Trim()
        Write-Verbose "Writing SSH public key to $publicPath"
        Set-Content -LiteralPath $publicPath -Value $publicKey -Encoding ascii
      }
    }
    return
  }

  $directory = Split-Path -Parent $privatePath
  if ($PSCmdlet.ShouldProcess($privatePath, 'Create dedicated ed25519 SSH key')) {
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
      Write-Verbose "Creating SSH key directory $directory"
      New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    if (-not $IsWindows) {
      $permissionResult = Invoke-AzureDevNativeCommand `
        -FilePath 'chmod' `
        -Arguments @('700', $directory)
      if ($permissionResult.ExitCode -ne 0) {
        throw "Could not apply private permissions to SSH key directory $directory."
      }
    }
    $result = Invoke-AzureDevNativeCommand `
      -FilePath 'ssh-keygen' `
      -Arguments @(
        '-t',
        'ed25519',
        '-f',
        $privatePath,
        '-N',
        '',
        '-C',
        'kravhantering azure dev'
      )
    if ($result.ExitCode -ne 0) {
      throw "Could not generate SSH key at $privatePath`: $($result.Text.Trim())"
    }
  }
}

function Get-AzureDevSshPublicKey {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  if (-not (Test-Path -LiteralPath $Config.SshPublicKeyPath -PathType Leaf)) {
    throw "SSH public key is missing: $($Config.SshPublicKeyPath)"
  }

  return (Get-Content -LiteralPath $Config.SshPublicKeyPath -Raw).Trim()
}

function ConvertTo-AzureDevSshPath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $homePath = [System.IO.Path]::GetFullPath($HOME)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if ($fullPath.StartsWith($homePath)) {
    $relative = $fullPath.Substring($homePath.Length).TrimStart('\', '/')
    return "~/$($relative -replace '\\', '/')"
  }
  return $Path -replace '\\', '/'
}

function Get-AzureDevSshConfigBlock {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$HostName
  )

  $identityFile = ConvertTo-AzureDevSshPath -Path $Context.Config.SshPrivateKeyPath
  $knownHostsFile = ConvertTo-AzureDevSshPath `
    -Path $Context.Config.SshKnownHostsPath
  $lines = @(
    "# >>> $script:AzureDevSshMarkerName managed",
    "Host $($Context.Config.SshHostAlias)",
    "    HostName $HostName",
    '    User vscode',
    "    IdentityFile $identityFile",
    '    IdentitiesOnly yes',
    '    ForwardAgent yes',
    '    StrictHostKeyChecking yes',
    "    UserKnownHostsFile $knownHostsFile",
    '    GlobalKnownHostsFile none',
    '    KnownHostsCommand none',
    '    VerifyHostKeyDNS no',
    '    UpdateHostKeys no',
    '    SendEnv GH_TOKEN',
    '    SendEnv COPILOT_GITHUB_TOKEN'
  )
  foreach ($port in $script:AzureDevForwardedPorts) {
    $lines += "    LocalForward 127.0.0.1:$port 127.0.0.1:$port"
  }
  $lines += "# <<< $script:AzureDevSshMarkerName managed"
  return ($lines -join [Environment]::NewLine)
}

function Get-AzureDevSshConfigPath {
  [CmdletBinding()]
  param()

  return Join-Path (Join-Path $HOME '.ssh') 'config'
}

function Set-AzureDevManagedSshConfig {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$HostName
  )

  $block = Get-AzureDevSshConfigBlock -Context $Context -HostName $HostName
  if (-not ($Context.Yes -or $Context.Apply)) {
    Write-Host $block
    Write-Host 'Pass -Yes or -Apply to update ~/.ssh/config.'
    return $false
  }

  $path = Get-AzureDevSshConfigPath
  $directory = Split-Path -Parent $path
  if ($PSCmdlet.ShouldProcess($path, 'Update managed OpenSSH config block')) {
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
      Write-Verbose "Creating SSH config directory $directory"
      New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    $existing = if (Test-Path -LiteralPath $path -PathType Leaf) {
      Get-Content -LiteralPath $path -Raw
    } else {
      ''
    }

    $pattern = "(?ms)^# >>> $script:AzureDevSshMarkerName managed.*?^# <<< $script:AzureDevSshMarkerName managed\r?\n?"
    if ($existing -match $pattern) {
      $updated = [regex]::Replace($existing, $pattern, "$block`n")
    } else {
      $prefix = if ($existing.Trim().Length -gt 0) {
        $existing.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine
      } else {
        ''
      }
      $updated = $prefix + $block + [Environment]::NewLine
    }
    Write-Verbose "Writing managed OpenSSH config block to $path"
    Set-Content -LiteralPath $path -Value $updated -Encoding UTF8
  }
  return $true
}

function Remove-AzureDevManagedSshConfig {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param()

  $path = Get-AzureDevSshConfigPath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    return
  }

  $existing = Get-Content -LiteralPath $path -Raw
  $pattern = "(?ms)^# >>> $script:AzureDevSshMarkerName managed.*?^# <<< $script:AzureDevSshMarkerName managed\r?\n?"
  if ($existing -notmatch $pattern) {
    return
  }

  if ($PSCmdlet.ShouldProcess($path, 'Remove managed OpenSSH config block')) {
    $updated = [regex]::Replace($existing, $pattern, '').TrimEnd() + [Environment]::NewLine
    Write-Verbose "Removing managed OpenSSH config block from $path"
    Set-Content -LiteralPath $path -Value $updated -Encoding UTF8
  }
}

function Test-AzureDevHostKeyMismatch {
  [CmdletBinding()]
  param(
    [AllowNull()]
    [string]$Output
  )

  if ([string]::IsNullOrWhiteSpace($Output)) {
    return $false
  }

  return $Output -match 'REMOTE HOST IDENTIFICATION HAS CHANGED' -or
    $Output -match 'Host key verification failed'
}

function Assert-AzureDevSshHostTrust {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  $trustEstablished = if (
    $null -ne $Context.PSObject.Properties['SshHostTrustEstablished']
  ) {
    $Context.PSObject.Properties['SshHostTrustEstablished'].Value
  } elseif (
    $Context -is [System.Collections.IDictionary] -and
    $Context.Contains('SshHostTrustEstablished')
  ) {
    $Context['SshHostTrustEstablished']
  } else {
    $false
  }
  if ($trustEstablished -ne $true) {
    throw (
      'Authenticated SSH host trust has not been established. Run the Azure ' +
      'host-key validation flow before remote commands or credential upload.'
    )
  }
}

function Invoke-AzureDevHostKeyRunCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  return Invoke-AzCli `
    -Arguments @(
      'vm',
      'run-command',
      'invoke',
      '--subscription',
      $Context.Config.SubscriptionId,
      '--resource-group',
      $Context.Config.ResourceGroup,
      '--name',
      $Context.Config.VmName,
      '--command-id',
      'RunShellScript',
      '--scripts',
      (
        'set -eu; found=0; for key in /etc/ssh/ssh_host_*_key.pub; do ' +
        '[ -r "$key" ] || continue; cat "$key"; found=1; done; ' +
        '[ "$found" -eq 1 ]'
      ),
      '--output',
      'json'
    ) `
    -Json
}

function Get-AzureDevVmSshHostKeyEvidence {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  try {
    $response = Invoke-AzureDevHostKeyRunCommand -Context $Context
  } catch {
    throw (
      'Azure control-plane SSH host-key retrieval failed. No SSH connection ' +
      "was attempted. $($_.Exception.Message)"
    )
  }

  $responseValue = if (
    $null -ne $response -and
    $null -ne $response.PSObject.Properties['value']
  ) {
    $response.PSObject.Properties['value'].Value
  } elseif (
    $null -ne $response -and
    $response -is [System.Collections.IDictionary] -and
    $response.Contains('value')
  ) {
    $response['value']
  } else {
    $null
  }
  if ($null -eq $responseValue) {
    throw (
      'Azure control-plane SSH host-key evidence was malformed. No SSH ' +
      'connection was attempted.'
    )
  }
  $runCommandResults = @($responseValue)
  foreach ($runCommandResult in $runCommandResults) {
    if (
      $null -eq $runCommandResult -or
      $null -eq $runCommandResult.PSObject.Properties['code'] -or
      $null -eq $runCommandResult.PSObject.Properties['code'].Value -or
      $null -eq $runCommandResult.PSObject.Properties['message'] -or
      $null -eq $runCommandResult.PSObject.Properties['message'].Value
    ) {
      throw (
        'Azure control-plane SSH host-key evidence was malformed. No SSH ' +
        'connection was attempted.'
      )
    }
  }

  $stderr = [System.Collections.Generic.List[string]]::new()
  $lines = [System.Collections.Generic.List[string]]::new()
  foreach ($runCommandResult in $runCommandResults) {
    $code = [string]$runCommandResult.PSObject.Properties['code'].Value
    $message = [string]$runCommandResult.message
    if ($code -match '/StdErr/') {
      if (-not [string]::IsNullOrWhiteSpace($message)) {
        $stderr.Add($message)
      }
      continue
    }
    if ($code -match '/StdOut/') {
      foreach ($line in @($message -split '\r?\n')) {
        $trimmedLine = $line.Trim()
        if (-not [string]::IsNullOrWhiteSpace($trimmedLine)) {
          $lines.Add($trimmedLine)
        }
      }
      continue
    }
    if ($code -cne 'ProvisioningState/succeeded') {
      continue
    }

    $messageLines = @($message -split '\r?\n')
    $stdoutMarkers = @(
      for ($index = 0; $index -lt $messageLines.Count; $index++) {
        if ($messageLines[$index].Trim() -ceq '[stdout]') {
          $index
        }
      }
    )
    $stderrMarkers = @(
      for ($index = 0; $index -lt $messageLines.Count; $index++) {
        if ($messageLines[$index].Trim() -ceq '[stderr]') {
          $index
        }
      }
    )
    if (
      $stdoutMarkers.Count -ne 1 -or
      $stderrMarkers.Count -ne 1 -or
      $stderrMarkers[0] -le $stdoutMarkers[0]
    ) {
      throw (
        'Azure control-plane SSH host-key evidence was malformed. No SSH ' +
        'connection was attempted.'
      )
    }

    $stdoutStart = $stdoutMarkers[0] + 1
    $stderrStart = $stderrMarkers[0] + 1
    if ($stdoutStart -lt $stderrMarkers[0]) {
      foreach ($index in $stdoutStart..($stderrMarkers[0] - 1)) {
        $trimmedLine = $messageLines[$index].Trim()
        if (-not [string]::IsNullOrWhiteSpace($trimmedLine)) {
          $lines.Add($trimmedLine)
        }
      }
    }
    if ($stderrStart -lt $messageLines.Count) {
      foreach ($index in $stderrStart..($messageLines.Count - 1)) {
        $trimmedLine = $messageLines[$index].Trim()
        if (-not [string]::IsNullOrWhiteSpace($trimmedLine)) {
          $stderr.Add($trimmedLine)
        }
      }
    }
  }
  if ($stderr.Count -gt 0) {
    throw (
      'Azure control-plane SSH host-key retrieval returned guest errors. No ' +
      'SSH connection was attempted.'
    )
  }

  if ($lines.Count -eq 0) {
    throw (
      'Azure control-plane SSH host-key evidence was empty. No SSH connection ' +
      'was attempted.'
    )
  }

  $hostKeys = [System.Collections.Generic.List[string]]::new()
  foreach ($line in $lines) {
    if (-not (Test-AzureDevSshPublicKey -Value $line)) {
      throw (
        'Azure control-plane SSH host-key evidence was malformed. No SSH ' +
        'connection was attempted.'
      )
    }
    $parts = $line -split '[ \t]+', 3
    $hostKey = "$($parts[0]) $($parts[1])"
    if (-not $hostKeys.Contains($hostKey)) {
      $hostKeys.Add($hostKey)
    }
  }
  return @($hostKeys)
}

function Set-AzureDevKnownHostTrust {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$HostName,

    [Parameter(Mandatory = $true)]
    [string[]]$HostKeys
  )

  $knownHostsPath = $Context.Config.SshKnownHostsPath
  if (
    -not $PSCmdlet.ShouldProcess(
      $knownHostsPath,
      'Update managed SSH host trust'
    )
  ) {
    return
  }
  $directory = Split-Path -Parent $knownHostsPath
  [System.IO.Directory]::CreateDirectory($directory) | Out-Null

  $temporaryPath = Join-Path `
    $directory `
    ".$([System.IO.Path]::GetFileName($knownHostsPath)).$([guid]::NewGuid().ToString('N')).tmp"
  $backupPath = "$temporaryPath.old"
  try {
    if ([System.IO.File]::Exists($knownHostsPath)) {
      [System.IO.File]::Copy($knownHostsPath, $temporaryPath)
    } else {
      [System.IO.File]::WriteAllText($temporaryPath, '')
    }
    if ([System.IO.FileInfo]::new($temporaryPath).Length -gt 0) {
      $existingText = [System.IO.File]::ReadAllText($temporaryPath)
      if (-not $existingText.EndsWith("`n") -and -not $existingText.EndsWith("`r")) {
        [System.IO.File]::AppendAllText(
          $temporaryPath,
          [System.Environment]::NewLine
        )
      }
    }

    $hostEntries = @($Context.Config.SshHostAlias, $HostName) |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Select-Object -Unique
    foreach ($hostEntry in $hostEntries) {
      $removeResult = Invoke-AzureDevNativeCommand `
        -FilePath 'ssh-keygen' `
        -Arguments @('-R', $hostEntry, '-f', $temporaryPath)
      if ($removeResult.ExitCode -ne 0) {
        throw "Could not update managed SSH host trust for $hostEntry."
      }
      Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
    }

    $trustedLines = foreach ($hostEntry in $hostEntries) {
      foreach ($hostKey in $HostKeys) {
        "$hostEntry $hostKey"
      }
    }
    Add-Content -LiteralPath $temporaryPath -Value $trustedLines -Encoding ascii
    if (-not $IsWindows) {
      $directoryPermission = Invoke-AzureDevNativeCommand `
        -FilePath 'chmod' `
        -Arguments @('700', $directory)
      $filePermission = Invoke-AzureDevNativeCommand `
        -FilePath 'chmod' `
        -Arguments @('600', $temporaryPath)
      if (
        $directoryPermission.ExitCode -ne 0 -or
        $filePermission.ExitCode -ne 0
      ) {
        throw 'Could not secure the managed SSH host-trust files.'
      }
    }
    Move-Item -LiteralPath $temporaryPath -Destination $knownHostsPath -Force
  } finally {
    Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
  }
}

function Wait-AzureDevSsh {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [string]$HostName,

    [string]$CurrentSshCidr,

    [int]$TimeoutSeconds = 300
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastOutput = ''
  $Context.SshHostTrustEstablished = $false
  if ([string]::IsNullOrWhiteSpace($HostName)) {
    throw (
      'The resolved VM host is required before SSH host trust can be ' +
      'established through Azure.'
    )
  }
  $hostKeys = $null
  $lastEvidenceError = $null
  $firstEvidenceAttempt = $true
  while ($firstEvidenceAttempt -or (Get-Date) -lt $deadline) {
    $firstEvidenceAttempt = $false
    try {
      $hostKeys = @(Get-AzureDevVmSshHostKeyEvidence -Context $Context)
      $lastEvidenceError = $null
      break
    } catch {
      $lastEvidenceError = $_
    }
    $remainingMilliseconds = [int][System.Math]::Ceiling(
      ($deadline - (Get-Date)).TotalMilliseconds
    )
    if ($remainingMilliseconds -gt 0) {
      Start-Sleep -Milliseconds (
        [System.Math]::Min(10000, $remainingMilliseconds)
      )
    }
  }
  if ($null -ne $lastEvidenceError) {
    throw $lastEvidenceError
  }
  Set-AzureDevKnownHostTrust `
    -Context $Context `
    -HostName $HostName `
    -HostKeys $hostKeys
  do {
    $arguments = [System.Collections.Generic.List[System.String]]::new()
    $arguments.AddRange([System.String[]]@(
      '-o',
      'BatchMode=yes',
      '-o',
      'ClearAllForwardings=yes',
      '-o',
      'ConnectTimeout=10'
    ))
    $arguments.AddRange([System.String[]]$Context.Config.SshHostKeyArguments)
    $arguments.Add($Context.Config.SshHostAlias)
    $arguments.Add('true')
    $result = Invoke-AzureDevNativeCommand `
      -FilePath 'ssh' `
      -Arguments $arguments.ToArray()
    if ($result.ExitCode -eq 0) {
      $Context.SshHostTrustEstablished = $true
      return $true
    }
    $lastOutput = $result.Text
    if (Test-AzureDevHostKeyMismatch -Output $lastOutput) {
      throw (
        'SSH host-key mismatch against Azure control-plane evidence. Rerun ' +
        'setup or start to retrieve authenticated replacement evidence. No ' +
        'remote commands or credential uploads were attempted.'
      )
    }
    Start-Sleep -Seconds 10
  } while ((Get-Date) -lt $deadline)

  $diagnostics = @(
    "SSH did not become reachable for $($Context.Config.SshHostAlias)."
  )
  if (-not [string]::IsNullOrWhiteSpace($HostName)) {
    $diagnostics += "SSH host: $HostName"
  }

  if (Get-Command Get-AzureDevVmPowerState -ErrorAction SilentlyContinue) {
    $powerState = Get-AzureDevVmPowerState -Config $Context.Config
    if (-not [string]::IsNullOrWhiteSpace($powerState)) {
      $diagnostics += "VM power state: $powerState"
    }
  }

  if (Get-Command Get-AzureDevPublicIpAddress -ErrorAction SilentlyContinue) {
    $publicIp = Get-AzureDevPublicIpAddress -Config $Context.Config
    if (-not [string]::IsNullOrWhiteSpace($publicIp)) {
      $diagnostics += "Azure public IP: $publicIp"
    }
  }

  $resolvedAllowedCidrs = @()
  if (-not [string]::IsNullOrWhiteSpace($CurrentSshCidr)) {
    $resolvedAllowedCidrs = @($CurrentSshCidr)
  } elseif (Get-Command Get-AzureDevState -ErrorAction SilentlyContinue) {
    $state = Get-AzureDevState -Context $Context
    $lastKnownAllowedCidrs = if ($null -ne $state) {
      $state.PSObject.Properties['lastKnownAllowedCidrs']
    } else {
      $null
    }
    if ($null -ne $lastKnownAllowedCidrs) {
      $resolvedAllowedCidrs = @(
        $lastKnownAllowedCidrs.Value | ForEach-Object {
          $cidrProperty = $_.PSObject.Properties['cidr']
          if (
            $null -ne $cidrProperty -and
            -not [string]::IsNullOrWhiteSpace([string]$cidrProperty.Value)
          ) {
            [string]$cidrProperty.Value
          }
        }
      )
    }
  }
  if ($resolvedAllowedCidrs.Count -gt 0) {
    $diagnostics += "Allowed SSH CIDRs: $($resolvedAllowedCidrs -join ', ')"
  }

  $diagnostics += "Last SSH output: $lastOutput"
  throw ($diagnostics -join [Environment]::NewLine)
}

function Get-AzureDevCodeCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  if (Get-Command code -ErrorAction SilentlyContinue) {
    return "code --remote ssh-remote+$($Context.Config.SshHostAlias) /workspace"
  }
  return $null
}

Export-ModuleMember -Function `
  Assert-AzureDevSshHostTrust, `
  ConvertTo-AzureDevSshPath, `
  Get-AzureDevCodeCommand, `
  Get-AzureDevCurrentIpv4, `
  Get-AzureDevPlaceholderPublicKey, `
  Get-AzureDevSshConfigBlock, `
  Get-AzureDevSshConfigPath, `
  Get-AzureDevSshPublicKey, `
  New-AzureDevSshKey, `
  Remove-AzureDevManagedSshConfig, `
  Set-AzureDevManagedSshConfig, `
  Test-AzureDevHostKeyMismatch, `
  Test-AzureDevCidr, `
  Wait-AzureDevSsh
