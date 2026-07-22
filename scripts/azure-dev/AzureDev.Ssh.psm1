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

function Get-AzureDevAllowedSshCidr {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config,

    [string]$OverrideCidr
  )

  $cidr = if (-not [string]::IsNullOrWhiteSpace($OverrideCidr)) {
    $OverrideCidr
  } else {
    $Config.AllowedSshCidr
  }

  if ($Config.ConnectivityMode -eq 'tailscale') {
    # Tailscale mode emits no Azure SSH NSG rule; this nonmatching sentinel only
    # satisfies the required deployment parameter and local state shape.
    return '10.0.0.0/32'
  }
  if ($cidr -eq 'auto') {
    $cidr = "$(Get-AzureDevCurrentIpv4)/32"
  }
  if ($cidr -match '^(\d{1,3}\.){3}\d{1,3}$') {
    $cidr = "$cidr/32"
  }

  Test-AzureDevCidr -Cidr $cidr | Out-Null
  return $cidr
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
  $lines = @(
    "# >>> $script:AzureDevSshMarkerName managed",
    "Host $($Context.Config.SshHostAlias)",
    "    HostName $HostName",
    '    User vscode',
    "    IdentityFile $identityFile",
    '    IdentitiesOnly yes',
    '    StrictHostKeyChecking accept-new',
    '    SendEnv GH_TOKEN'
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

function Reset-AzureDevKnownHost {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [string]$HostName
  )

  if ([string]::IsNullOrWhiteSpace($HostName)) {
    return
  }

  if ($PSCmdlet.ShouldProcess($HostName, 'Remove stale OpenSSH known_hosts entry')) {
    $result = Invoke-AzureDevNativeCommand `
      -FilePath 'ssh-keygen' `
      -Arguments @('-R', $HostName)
    if ($result.ExitCode -ne 0) {
      Write-Warning "Could not remove known_hosts entry for $HostName`: $($result.Text.Trim())"
    }
  }
}

function Wait-AzureDevSsh {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [string]$HostName,

    [string]$AllowedSshCidr,

    [int]$TimeoutSeconds = 300
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastOutput = ''
  $knownHostReset = $false
  do {
    $result = Invoke-AzureDevNativeCommand `
      -FilePath 'ssh' `
      -Arguments @(
        '-o',
        'BatchMode=yes',
        '-o',
        'ClearAllForwardings=yes',
        '-o',
        'ConnectTimeout=10',
        '-o',
        'StrictHostKeyChecking=accept-new',
        $Context.Config.SshHostAlias,
        'true'
      )
    if ($result.ExitCode -eq 0) {
      return $true
    }
    $lastOutput = $result.Text
    if (-not $knownHostReset -and (Test-AzureDevHostKeyMismatch -Output $lastOutput)) {
      $hostEntries = @($Context.Config.SshHostAlias, $HostName) |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -Unique
      foreach ($hostEntry in $hostEntries) {
        Reset-AzureDevKnownHost -HostName $hostEntry
      }
      $knownHostReset = $true
      continue
    }
    Start-Sleep -Seconds 10
  } while ((Get-Date) -lt $deadline)

  if (Test-AzureDevHostKeyMismatch -Output $lastOutput) {
    $commands = @("ssh-keygen -R $($Context.Config.SshHostAlias)")
    if (-not [string]::IsNullOrWhiteSpace($HostName)) {
      $commands += "ssh-keygen -R $HostName"
    }
    throw "SSH host-key mismatch. Run: $($commands -join '; ')"
  }

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

  $resolvedAllowedCidr = $AllowedSshCidr
  if ([string]::IsNullOrWhiteSpace($resolvedAllowedCidr)) {
    if (Get-Command Get-AzureDevState -ErrorAction SilentlyContinue) {
      $state = Get-AzureDevState -Context $Context
      $lastKnownAllowedCidr = if ($null -ne $state) {
        $state.PSObject.Properties['lastKnownAllowedCidr']
      } else {
        $null
      }
      if (
        $null -ne $lastKnownAllowedCidr -and
        -not [string]::IsNullOrWhiteSpace([string]$lastKnownAllowedCidr.Value)
      ) {
        $resolvedAllowedCidr = [string]$lastKnownAllowedCidr.Value
      }
    }
  }
  if ([string]::IsNullOrWhiteSpace($resolvedAllowedCidr)) {
    $resolvedAllowedCidr = $Context.Config.AllowedSshCidr
  }
  if (-not [string]::IsNullOrWhiteSpace($resolvedAllowedCidr)) {
    $diagnostics += "Allowed SSH CIDR: $resolvedAllowedCidr"
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
  ConvertTo-AzureDevSshPath, `
  Get-AzureDevAllowedSshCidr, `
  Get-AzureDevCodeCommand, `
  Get-AzureDevCurrentIpv4, `
  Get-AzureDevPlaceholderPublicKey, `
  Get-AzureDevSshConfigBlock, `
  Get-AzureDevSshConfigPath, `
  Get-AzureDevSshPublicKey, `
  New-AzureDevSshKey, `
  Remove-AzureDevManagedSshConfig, `
  Reset-AzureDevKnownHost, `
  Set-AzureDevManagedSshConfig, `
  Test-AzureDevHostKeyMismatch, `
  Test-AzureDevCidr, `
  Wait-AzureDevSsh
