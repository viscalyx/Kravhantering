Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:activeLifecycleLocks = @{}

function Get-AzureDevLifecycleLockIdentity {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$ConfigurationSnapshot
  )

  foreach ($propertyName in @(
      'RepoRoot',
      'SubscriptionId',
      'ResourceGroup',
      'VmName'
    )) {
    $propertyValue = if (
      $ConfigurationSnapshot -is [System.Collections.Generic.IReadOnlyDictionary[
        string,
        object
      ]] -and
      $ConfigurationSnapshot.ContainsKey($propertyName)
    ) {
      $ConfigurationSnapshot[$propertyName]
    } else {
      $property = $ConfigurationSnapshot.PSObject.Properties[$propertyName]
      if ($null -eq $property) { $null } else { $property.Value }
    }
    if ([string]::IsNullOrWhiteSpace([string]$propertyValue)) {
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
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [scriptblock]$Factory = {
      param([string]$MutexName)
      [System.Threading.Mutex]::new($false, $MutexName)
    }
  )

  if (-not $PSCmdlet.ShouldProcess($Name, 'Create lifecycle mutex')) {
    return $null
  }

  $mutexName = if ([System.OperatingSystem]::IsWindows()) {
    "Global\$Name"
  } else {
    $Name
  }

  return & $Factory $mutexName
}

function Enter-AzureDevLifecycleMutex {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [System.Object]$Mutex,

    [scriptblock]$WaitAdapter = {
      param([System.Object]$MutexValue)
      $MutexValue.WaitOne(0)
    }
  )

  if (-not $PSCmdlet.ShouldProcess('lifecycle mutex', 'Acquire mutex')) {
    return $false
  }

  try {
    return & $WaitAdapter $Mutex
  } catch [System.Threading.AbandonedMutexException] {
    return $true
  }
}

function Close-AzureDevLifecycleMutex {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [System.Object]$Mutex,

    [switch]$Owned,

    [scriptblock]$ReleaseAdapter = {
      param([System.Object]$MutexValue)
      $MutexValue.ReleaseMutex()
    },

    [scriptblock]$DisposeAdapter = {
      param([System.Object]$MutexValue)
      $MutexValue.Dispose()
    }
  )

  if (-not $PSCmdlet.ShouldProcess('lifecycle mutex', 'Close mutex')) {
    return $false
  }

  try {
    if ($Owned) {
      & $ReleaseAdapter $Mutex
    }
  } finally {
    & $DisposeAdapter $Mutex
  }

  return $true
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
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$Record
  )

  if (-not $PSCmdlet.ShouldProcess($Path, 'Write lifecycle lock record')) {
    return
  }

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
  [CmdletBinding(SupportsShouldProcess = $true)]
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

  if (-not $PSCmdlet.ShouldProcess($Path, 'Remove lifecycle lock record')) {
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
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$ConfigurationSnapshot,

    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'stop')]
    [string]$CommandName,

    [ValidateRange(0, [int]::MaxValue)]
    [int]$TimeoutSeconds = 15,

    [scriptblock]$OnContention
  )

  $identity = Get-AzureDevLifecycleLockIdentity `
    -ConfigurationSnapshot $ConfigurationSnapshot
  if (-not $PSCmdlet.ShouldProcess(
      $identity.Path,
      "Acquire $CommandName lifecycle lock"
    )) {
    return $null
  }
  $lockDirectory = Split-Path -Parent $identity.Path
  $null = [System.IO.Directory]::CreateDirectory($lockDirectory)
  $startedAt = Get-AzureDevLifecycleMonotonicTimestamp
  $timeoutTicks = [long](
    $TimeoutSeconds * [System.Diagnostics.Stopwatch]::Frequency
  )
  $lastOwner = $null
  $contentionReported = $false

  while ($true) {
    $mutex = $null
    $mutexOwned = $false
    $activeLease = $script:activeLifecycleLocks[$identity.MutexName]
    if ($null -eq $activeLease) {
      $mutex = New-AzureDevLifecycleMutex `
        -Name $identity.MutexName `
        -WhatIf:$false `
        -Confirm:$false
      $mutexOwned = Enter-AzureDevLifecycleMutex `
        -Mutex $mutex `
        -WhatIf:$false `
        -Confirm:$false
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
          -Record $record `
          -WhatIf:$false `
          -Confirm:$false
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
                -OwnerId $ownerId `
                -WhatIf:$false `
                -Confirm:$false
            } catch {
              if (Test-AzureDevInterruption -ErrorObject $_) {
                throw
              }
              # Non-interrupting diagnostic cleanup must not prevent release.
            }
          }
        } finally {
          $null = Close-AzureDevLifecycleMutex `
            -Mutex $mutex `
            -Owned `
            -WhatIf:$false `
            -Confirm:$false
        }
        throw
      }
    }

    if ($null -ne $mutex) {
      $null = Close-AzureDevLifecycleMutex `
        -Mutex $mutex `
        -WhatIf:$false `
        -Confirm:$false
    }
    if (-not $contentionReported -and $null -ne $OnContention) {
      $null = & $OnContention
      $contentionReported = $true
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
  [CmdletBinding(SupportsShouldProcess = $true)]
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

  if (-not $PSCmdlet.ShouldProcess(
      [string]$Lock.Path,
      'Release lifecycle lock'
    )) {
    return $false
  }

  $removedOwnerRecord = $false
  try {
    $removedOwnerRecord = Remove-AzureDevLifecycleLockRecord `
      -Path ([string]$Lock.Path) `
      -OwnerId ([string]$Lock.OwnerId) `
      -WhatIf:$false `
      -Confirm:$false
  } finally {
    try {
      $null = Close-AzureDevLifecycleMutex `
        -Mutex $Lock.Mutex `
        -Owned `
        -WhatIf:$false `
        -Confirm:$false
    } finally {
      $Lock.Released = $true
      $script:activeLifecycleLocks.Remove([string]$Lock.MutexName)
    }
  }

  return $removedOwnerRecord
}

function Invoke-AzureDevLifecycleLock {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$ConfigurationSnapshot,

    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'stop')]
    [string]$CommandName,

    [Parameter(Mandatory = $true)]
    [scriptblock]$ScriptBlock,

    [ValidateRange(0, [int]::MaxValue)]
    [int]$TimeoutSeconds = 15,

    [scriptblock]$OnContention
  )

  $identity = Get-AzureDevLifecycleLockIdentity `
    -ConfigurationSnapshot $ConfigurationSnapshot
  if (-not $PSCmdlet.ShouldProcess(
      $identity.Path,
      "Invoke guarded $CommandName lifecycle work"
    )) {
    return $null
  }

  $lock = Enter-AzureDevLifecycleLock `
    -ConfigurationSnapshot $ConfigurationSnapshot `
    -CommandName $CommandName `
    -TimeoutSeconds $TimeoutSeconds `
    -OnContention $OnContention `
    -WhatIf:$false `
    -Confirm:$false
  try {
    return & $ScriptBlock $lock $ConfigurationSnapshot
  } finally {
    $null = Exit-AzureDevLifecycleLock `
      -Lock $lock `
      -WhatIf:$false `
      -Confirm:$false
  }
}

Export-ModuleMember -Function `
  Enter-AzureDevLifecycleLock, `
  Exit-AzureDevLifecycleLock, `
  Invoke-AzureDevLifecycleLock
