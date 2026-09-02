Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:activeLifecycleLocks = @{}

function Get-AzureDevLifecycleLockPath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$ConfigurationSnapshot
  )

  foreach ($propertyName in @(
      'RepoRoot',
      'SubscriptionId',
      'ResourceGroup',
      'VmName'
    )) {
    $property = $ConfigurationSnapshot.PSObject.Properties[$propertyName]
    if (
      $null -eq $property -or
      [string]::IsNullOrWhiteSpace([string]$property.Value)
    ) {
      throw "Lifecycle configuration snapshot is missing $propertyName."
    }
  }

  $canonicalParts = @(
    'azure-dev-lifecycle-lock-v1',
    ([string]$ConfigurationSnapshot.SubscriptionId).ToLowerInvariant(),
    ([string]$ConfigurationSnapshot.ResourceGroup).ToLowerInvariant(),
    ([string]$ConfigurationSnapshot.VmName).ToLowerInvariant()
  )
  $identity = @(
    $canonicalParts | ForEach-Object { "$($_.Length):$_" }
  ) -join '|'
  $identityBytes = [System.Text.Encoding]::UTF8.GetBytes($identity)
  $hashBytes = [System.Security.Cryptography.SHA256]::HashData($identityBytes)
  $hash = [System.Convert]::ToHexString($hashBytes).ToLowerInvariant()
  $repositoryPath = [System.IO.Path]::GetFullPath(
    [string]$ConfigurationSnapshot.RepoRoot
  )
  $lockDirectory = Join-Path $repositoryPath '.azure/lifecycle-locks'

  return Join-Path $lockDirectory "lifecycle-$hash.lock"
}

function Open-AzureDevLifecycleLockStream {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $fileShare = [System.IO.FileShare]::Read -bor [System.IO.FileShare]::Delete
  try {
    $stream = [System.IO.File]::Open(
      $Path,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::ReadWrite,
      $fileShare
    )
    return [pscustomobject]@{
      Stream = $stream
      RecoveredStaleLock = $false
    }
  } catch [System.IO.IOException] {
    if (-not [System.IO.File]::Exists($Path)) {
      return $null
    }
  }

  return $null
}

function Test-AzureDevLifecycleLockOwnerActive {
  [CmdletBinding()]
  param(
    [AllowNull()]
    [pscustomobject]$Record
  )

  if ($null -eq $Record) {
    return $true
  }
  $hostProperty = $Record.PSObject.Properties['host']
  $processProperty = $Record.PSObject.Properties['processId']
  if (
    $null -eq $hostProperty -or
    [string]::IsNullOrWhiteSpace([string]$hostProperty.Value) -or
    [string]$hostProperty.Value -cne [System.Net.Dns]::GetHostName()
  ) {
    return $true
  }

  $ownerProcessId = 0
  if (
    $null -eq $processProperty -or
    -not [int]::TryParse(
      [string]$processProperty.Value,
      [ref]$ownerProcessId
    ) -or
    $ownerProcessId -lt 1
  ) {
    return $true
  }

  return $null -ne (
    Get-Process -Id $ownerProcessId -ErrorAction SilentlyContinue
  )
}

function Move-AzureDevStaleLifecycleLock {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [AllowNull()]
    [pscustomobject]$Record
  )

  if (Test-AzureDevLifecycleLockOwnerActive -Record $Record) {
    return $false
  }

  $quarantinePath = "$Path.stale-$([guid]::NewGuid().ToString('N'))"
  try {
    # The same-directory rename is the compare-and-claim operation. Only one
    # contender can move this exact abandoned directory entry.
    [System.IO.File]::Move($Path, $quarantinePath)
  } catch [System.IO.IOException] {
    return $false
  }

  try {
    return $true
  } finally {
    [System.IO.File]::Delete($quarantinePath)
  }
}

function Write-AzureDevLifecycleLockRecord {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.IO.FileStream]$Stream,

    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$Record
  )

  $json = $Record | ConvertTo-Json -Compress
  $encoding = [System.Text.UTF8Encoding]::new($false)
  $writer = [System.IO.StreamWriter]::new(
    $Stream,
    $encoding,
    1024,
    $true
  )
  try {
    $Stream.SetLength(0)
    $Stream.Position = 0
    $writer.Write($json)
    $writer.Flush()
    $Stream.Flush($true)
    $Stream.Position = 0
  } finally {
    $writer.Dispose()
  }
}

function Read-AzureDevLifecycleLockRecord {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  try {
    $stream = [System.IO.File]::Open(
      $Path,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      (
        [System.IO.FileShare]::ReadWrite -bor
        [System.IO.FileShare]::Delete
      )
    )
    try {
      $reader = [System.IO.StreamReader]::new($stream)
      try {
        return $reader.ReadToEnd() | ConvertFrom-Json -ErrorAction Stop
      } finally {
        $reader.Dispose()
      }
    } finally {
      $stream.Dispose()
    }
  } catch [System.IO.IOException] {
    return $null
  } catch [System.UnauthorizedAccessException] {
    return $null
  } catch [System.ArgumentException] {
    return $null
  }
}

function ConvertTo-AzureDevLifecycleOwnerText {
  [CmdletBinding()]
  param(
    [AllowNull()]
    [pscustomobject]$Record
  )

  if ($null -eq $Record) {
    return 'owner information unavailable'
  }

  $safeValue = {
    param(
      [AllowNull()]
      [object]$Value
    )

    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
      return 'unknown'
    }
    $text = [regex]::Replace($text, '[\p{C}]', '?')
    if ($text.Length -gt 128) {
      return $text.Substring(0, 128)
    }
    return $text
  }

  $recordValue = {
    param([string]$Name)
    $property = $Record.PSObject.Properties[$Name]
    if ($null -eq $property) {
      return $null
    }
    return $property.Value
  }

  return (
    'command=' + (& $safeValue (& $recordValue 'command')) +
    '; processId=' + (& $safeValue (& $recordValue 'processId')) +
    '; host=' + (& $safeValue (& $recordValue 'host')) +
    '; user=' + (& $safeValue (& $recordValue 'user')) +
    '; startedAt=' + (& $safeValue (& $recordValue 'startedAt'))
  )
}

function Enter-AzureDevLifecycleLock {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$ConfigurationSnapshot,

    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'stop')]
    [string]$CommandName,

    [ValidateRange(0, 15)]
    [int]$TimeoutSeconds = 15,

    [ValidateRange(1, 1000)]
    [int]$RetryIntervalMilliseconds = 250,

    [scriptblock]$UtcNowProvider = { [datetimeoffset]::UtcNow },

    [scriptblock]$DelayProvider = {
      param([timespan]$Duration)
      Start-Sleep -Duration $Duration
    },

    [ValidateRange(1, [int]::MaxValue)]
    [int]$OwnerProcessId = $PID,

    [string]$OwnerHost = [System.Net.Dns]::GetHostName(),

    [string]$OwnerUser = [System.Environment]::UserName,

    [string]$OwnerId = ([guid]::NewGuid().ToString('N'))
  )

  $lockPath = Get-AzureDevLifecycleLockPath `
    -ConfigurationSnapshot $ConfigurationSnapshot
  $lockDirectory = Split-Path -Parent $lockPath
  $null = [System.IO.Directory]::CreateDirectory($lockDirectory)
  $startedAt = & $UtcNowProvider
  $deadline = $startedAt.AddSeconds($TimeoutSeconds)
  $lastOwner = $null
  $recoveredStaleLock = $false

  while ($true) {
    $now = & $UtcNowProvider
    if ($now -lt $deadline -or $now -eq $startedAt) {
      $activeLease = $script:activeLifecycleLocks[$lockPath]
      if ($null -ne $activeLease -and -not $activeLease.Stream.CanRead) {
        $script:activeLifecycleLocks.Remove($lockPath)
        $activeLease = $null
      }
      $opened = if ($null -eq $activeLease) {
        Open-AzureDevLifecycleLockStream -Path $lockPath
      } else {
        $null
      }
      if ($null -ne $opened) {
        $record = [ordered]@{
          schemaVersion = 1
          ownerId = $OwnerId
          command = $CommandName
          processId = $OwnerProcessId
          host = $OwnerHost
          user = $OwnerUser
          startedAt = $now.ToUniversalTime().ToString('o')
        }
        try {
          Write-AzureDevLifecycleLockRecord `
            -Stream $opened.Stream `
            -Record $record
        } catch {
          $opened.Stream.Dispose()
          throw
        }

        $lease = [pscustomobject]@{
          PSTypeName = 'AzureDev.LifecycleLockLease'
          Path = $lockPath
          OwnerId = $OwnerId
          Stream = $opened.Stream
          RecoveredStaleLock = $recoveredStaleLock
          ConfigurationSnapshot = $ConfigurationSnapshot
          Released = $false
        }
        $script:activeLifecycleLocks[$lockPath] = $lease
        return $lease
      }
      $lastOwner = Read-AzureDevLifecycleLockRecord -Path $lockPath
      if (
        $null -eq $activeLease -and
        (Move-AzureDevStaleLifecycleLock -Path $lockPath -Record $lastOwner)
      ) {
        $recoveredStaleLock = $true
        continue
      }
    }

    $now = & $UtcNowProvider
    if ($now -ge $deadline) {
      $ownerText = ConvertTo-AzureDevLifecycleOwnerText -Record $lastOwner
      throw (
        "Azure Dev lifecycle lock timed out after waiting $TimeoutSeconds " +
        "seconds. Owner: $ownerText. Wait for the owner to finish and retry. " +
        'Abandoned lock records are recovered automatically. If contention ' +
        "persists, inspect '$lockPath' and remove it only after confirming " +
        'that no Azure Dev lifecycle command is active in this checkout. No ' +
        'Azure mutation was submitted by this invocation.'
      )
    }

    $remaining = $deadline - $now
    $retryDelay = [timespan]::FromMilliseconds($RetryIntervalMilliseconds)
    $delay = if ($remaining -lt $retryDelay) {
      $remaining
    } else {
      $retryDelay
    }
    $null = & $DelayProvider $delay
  }
}

function Exit-AzureDevLifecycleLock {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Lock
  )

  if (
    $Lock.PSObject.Properties['Released'] -and
    [bool]$Lock.Released
  ) {
    return $false
  }
  if (
    $Lock.PSObject.Properties['Stream'] -eq $null -or
    $null -eq $Lock.Stream -or
    $Lock.PSObject.Properties['OwnerId'] -eq $null
  ) {
    return $false
  }

  try {
    $record = Read-AzureDevLifecycleLockRecord -Path ([string]$Lock.Path)
    $ownerProperty = if ($null -eq $record) {
      $null
    } else {
      $record.PSObject.Properties['ownerId']
    }
    if (
      $null -eq $ownerProperty -or
      [string]::IsNullOrWhiteSpace([string]$ownerProperty.Value) -or
      [string]$ownerProperty.Value -cne [string]$Lock.OwnerId
    ) {
      return $false
    }

    [System.IO.File]::Delete([string]$Lock.Path)
    return $true
  } finally {
    $Lock.Stream.Dispose()
    $Lock.Released = $true
    $activeLease = $script:activeLifecycleLocks[[string]$Lock.Path]
    if (
      $null -ne $activeLease -and
      [string]$activeLease.OwnerId -ceq [string]$Lock.OwnerId
    ) {
      $script:activeLifecycleLocks.Remove([string]$Lock.Path)
    }
  }
}

function Invoke-AzureDevLifecycleLock {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$ConfigurationSnapshot,

    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'stop')]
    [string]$CommandName,

    [Parameter(Mandatory = $true)]
    [scriptblock]$ScriptBlock,

    [ValidateRange(0, 15)]
    [int]$TimeoutSeconds = 15,

    [scriptblock]$UtcNowProvider = { [datetimeoffset]::UtcNow },

    [scriptblock]$DelayProvider = {
      param([timespan]$Duration)
      Start-Sleep -Duration $Duration
    }
  )

  $lock = Enter-AzureDevLifecycleLock `
    -ConfigurationSnapshot $ConfigurationSnapshot `
    -CommandName $CommandName `
    -TimeoutSeconds $TimeoutSeconds `
    -UtcNowProvider $UtcNowProvider `
    -DelayProvider $DelayProvider
  try {
    return & $ScriptBlock $lock $ConfigurationSnapshot
  } finally {
    $null = Exit-AzureDevLifecycleLock -Lock $lock
  }
}

Export-ModuleMember -Function `
  Enter-AzureDevLifecycleLock, `
  Exit-AzureDevLifecycleLock, `
  Invoke-AzureDevLifecycleLock
