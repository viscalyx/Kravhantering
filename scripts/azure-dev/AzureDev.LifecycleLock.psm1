Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:activeLifecycleLocks = @{}

function Get-AzureDevLifecycleLockIdentity {
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
    'azure-dev-lifecycle-lock-v2',
    ([string]$ConfigurationSnapshot.SubscriptionId).ToLowerInvariant(),
    ([string]$ConfigurationSnapshot.ResourceGroup).ToLowerInvariant(),
    ([string]$ConfigurationSnapshot.VmName).ToLowerInvariant()
  )
  $targetText = @(
    $canonicalParts | ForEach-Object { "$($_.Length):$_" }
  ) -join '|'
  $targetBytes = [System.Text.Encoding]::UTF8.GetBytes($targetText)
  $targetHashBytes = [System.Security.Cryptography.SHA256]::HashData(
    $targetBytes
  )
  $targetHash = [System.Convert]::ToHexString(
    $targetHashBytes
  ).ToLowerInvariant()
  $repositoryPath = [System.IO.Path]::GetFullPath(
    [string]$ConfigurationSnapshot.RepoRoot
  )
  $lockDirectory = Join-Path $repositoryPath '.azure/lifecycle-locks'
  $path = Join-Path $lockDirectory "lifecycle-$targetHash.lock"
  $mutexPath = [System.IO.Path]::GetFullPath($path)
  if ([System.OperatingSystem]::IsWindows()) {
    $mutexPath = $mutexPath.ToLowerInvariant()
  }
  $mutexBytes = [System.Text.Encoding]::UTF8.GetBytes($mutexPath)
  $mutexHashBytes = [System.Security.Cryptography.SHA256]::HashData($mutexBytes)
  $mutexHash = [System.Convert]::ToHexString(
    $mutexHashBytes
  ).ToLowerInvariant()

  return [pscustomobject]@{
    Path = $path
    MutexName = $mutexHash
  }
}

function Get-AzureDevLifecycleMonotonicTimestamp {
  [CmdletBinding()]
  param()

  return [System.Diagnostics.Stopwatch]::GetTimestamp()
}

function New-AzureDevLifecycleMutex {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  return [System.Threading.Mutex]::new($false, $Name)
}

function Enter-AzureDevLifecycleMutex {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.Object]$Mutex
  )

  try {
    return $Mutex.WaitOne(0)
  } catch [System.Threading.AbandonedMutexException] {
    return $true
  }
}

function Close-AzureDevLifecycleMutex {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [System.Object]$Mutex,

    [switch]$Owned
  )

  try {
    if ($Owned) {
      $Mutex.ReleaseMutex()
    }
  } finally {
    $Mutex.Dispose()
  }
}

function Wait-AzureDevLifecycleLockRetry {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [timespan]$Duration
  )

  Start-Sleep -Duration $Duration
}

function Write-AzureDevLifecycleLockRecord {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$Record
  )

  $temporaryPath = "$Path.$($Record.ownerId).tmp"
  try {
    $encoding = [System.Text.UTF8Encoding]::new($false)
    $json = $Record | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($temporaryPath, $json, $encoding)
    [System.IO.File]::Move($temporaryPath, $Path, $true)
  } finally {
    [System.IO.File]::Delete($temporaryPath)
  }
}

function Read-AzureDevLifecycleLockRecord {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  try {
    $text = [System.IO.File]::ReadAllText($Path)
    return $text | ConvertFrom-Json -ErrorAction Stop
  } catch [System.IO.IOException] {
    return $null
  } catch [System.UnauthorizedAccessException] {
    return $null
  } catch [System.ArgumentException] {
    return $null
  }
}

function Remove-AzureDevLifecycleLockRecord {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$OwnerId
  )

  $record = Read-AzureDevLifecycleLockRecord -Path $Path
  $ownerProperty = if ($null -eq $record) {
    $null
  } else {
    $record.PSObject.Properties['ownerId']
  }
  if (
    $null -eq $ownerProperty -or
    [string]::IsNullOrWhiteSpace([string]$ownerProperty.Value) -or
    [string]$ownerProperty.Value -cne $OwnerId
  ) {
    return $false
  }

  [System.IO.File]::Delete($Path)
  return $true
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
    $text = [System.Text.RegularExpressions.Regex]::Replace(
      $text,
      '[\p{C}]',
      '?'
    )
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
    [int]$TimeoutSeconds = 15
  )

  $identity = Get-AzureDevLifecycleLockIdentity `
    -ConfigurationSnapshot $ConfigurationSnapshot
  $lockDirectory = Split-Path -Parent $identity.Path
  $null = [System.IO.Directory]::CreateDirectory($lockDirectory)
  $startedAt = Get-AzureDevLifecycleMonotonicTimestamp
  $timeoutTicks = [long](
    $TimeoutSeconds * [System.Diagnostics.Stopwatch]::Frequency
  )
  $lastOwner = $null

  while ($true) {
    $mutex = $null
    $mutexOwned = $false
    $activeLease = $script:activeLifecycleLocks[$identity.MutexName]
    if ($null -eq $activeLease) {
      $mutex = New-AzureDevLifecycleMutex -Name $identity.MutexName
      $mutexOwned = Enter-AzureDevLifecycleMutex -Mutex $mutex
    }

    if ($mutexOwned) {
      $ownerId = ''
      try {
        $ownerId = [guid]::NewGuid().ToString('N')
        $record = [ordered]@{
          schemaVersion = 1
          ownerId = $ownerId
          command = $CommandName
          processId = $PID
          host = [System.Net.Dns]::GetHostName()
          user = [System.Environment]::UserName
          startedAt = [datetimeoffset]::UtcNow.ToString('o')
        }
        Write-AzureDevLifecycleLockRecord `
          -Path $identity.Path `
          -Record $record
        $lease = [pscustomobject]@{
          PSTypeName = 'AzureDev.LifecycleLockLease'
          Path = $identity.Path
          MutexName = $identity.MutexName
          OwnerId = $ownerId
          Mutex = $mutex
          Released = $false
        }
        $script:activeLifecycleLocks[$identity.MutexName] = $lease
        return $lease
      } catch {
        try {
          $registeredLease =
            $script:activeLifecycleLocks[$identity.MutexName]
          if (
            $null -ne $registeredLease -and
            [string]$registeredLease.OwnerId -ceq $ownerId
          ) {
            $script:activeLifecycleLocks.Remove($identity.MutexName)
          }
          if (-not [string]::IsNullOrWhiteSpace($ownerId)) {
            try {
              $null = Remove-AzureDevLifecycleLockRecord `
                -Path $identity.Path `
                -OwnerId $ownerId
            } catch {
              # Diagnostic cleanup must not prevent mutex release.
            }
          }
        } finally {
          Close-AzureDevLifecycleMutex -Mutex $mutex -Owned
        }
        throw
      }
    }

    if ($null -ne $mutex) {
      Close-AzureDevLifecycleMutex -Mutex $mutex
    }
    $lastOwner = Read-AzureDevLifecycleLockRecord -Path $identity.Path
    $now = Get-AzureDevLifecycleMonotonicTimestamp
    $elapsedTicks = $now - $startedAt
    if ($elapsedTicks -ge $timeoutTicks) {
      $ownerText = ConvertTo-AzureDevLifecycleOwnerText -Record $lastOwner
      throw (
        "Azure Dev lifecycle lock timed out after waiting $TimeoutSeconds " +
        "seconds. Owner: $ownerText. Wait for the owner to finish and retry. " +
        'Abandoned locks are recovered automatically by the operating system. ' +
        'If a live owner is stuck, interrupt that invocation and retry. ' +
        "Inspect '$($identity.Path)' only after confirming that no Azure Dev " +
        'lifecycle command is active in this checkout; the file is diagnostic ' +
        'only, and deleting it cannot release the mutex. No Azure mutation was ' +
        'submitted by this invocation.'
      )
    }

    $remainingTicks = $timeoutTicks - $elapsedTicks
    $retryTicks = [long](
      0.25 * [System.Diagnostics.Stopwatch]::Frequency
    )
    $delayTicks = [math]::Min($remainingTicks, $retryTicks)
    $delay = [timespan]::FromSeconds(
      $delayTicks / [double][System.Diagnostics.Stopwatch]::Frequency
    )
    Wait-AzureDevLifecycleLockRetry -Duration $delay
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
    $Lock.PSObject.Properties['Mutex'] -eq $null -or
    $null -eq $Lock.Mutex -or
    $Lock.PSObject.Properties['MutexName'] -eq $null -or
    $Lock.PSObject.Properties['OwnerId'] -eq $null
  ) {
    return $false
  }

  $activeLease = $script:activeLifecycleLocks[[string]$Lock.MutexName]
  if (
    $null -eq $activeLease -or
    -not [object]::ReferenceEquals($activeLease.Mutex, $Lock.Mutex) -or
    [string]$activeLease.OwnerId -cne [string]$Lock.OwnerId
  ) {
    return $false
  }

  $removedOwnerRecord = $false
  try {
    $removedOwnerRecord = Remove-AzureDevLifecycleLockRecord `
      -Path ([string]$Lock.Path) `
      -OwnerId ([string]$Lock.OwnerId)
  } finally {
    try {
      Close-AzureDevLifecycleMutex -Mutex $Lock.Mutex -Owned
    } finally {
      $Lock.Released = $true
      $script:activeLifecycleLocks.Remove([string]$Lock.MutexName)
    }
  }

  return $removedOwnerRecord
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
    [int]$TimeoutSeconds = 15
  )

  $lock = Enter-AzureDevLifecycleLock `
    -ConfigurationSnapshot $ConfigurationSnapshot `
    -CommandName $CommandName `
    -TimeoutSeconds $TimeoutSeconds
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
