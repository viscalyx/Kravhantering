Set-StrictMode -Version Latest

function New-AzureDevDirectory {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (Test-Path -LiteralPath $Path -PathType Container) {
    return
  }
  if ($PSCmdlet.ShouldProcess($Path, 'Create directory')) {
    Write-Verbose "Creating directory $Path"
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Get-AzureDevState {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  if (-not (Test-Path -LiteralPath $Context.StatePath -PathType Leaf)) {
    return $null
  }

  return Get-Content -LiteralPath $Context.StatePath -Raw | ConvertFrom-Json
}

function Set-AzureDevState {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$State
  )

  if ($PSCmdlet.ShouldProcess($Context.StatePath, 'Write Azure dev state')) {
    New-AzureDevDirectory -Path $Context.StateDirectory | Out-Null
    $State.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    $json = $State | ConvertTo-Json -Depth 20
    Write-Verbose "Writing Azure dev state to $($Context.StatePath)"
    Set-Content -LiteralPath $Context.StatePath -Value $json -Encoding UTF8
  }
}

function ConvertTo-AzureDevRedactedValue {
  [CmdletBinding()]
  param(
    [AllowNull()]
    [object]$Value
  )

  if ($null -eq $Value) {
    return $null
  }

  $text = [string]$Value
  if (
    $text -match '(?i)(secret|password|token|private|connection string)' -or
    $text -match '(?i)(client_secret|auth_key)' -or
    $text -match 'mssql://[^:]+:[^@]+@'
  ) {
    return '[redacted]'
  }
  return $Value
}

function Format-AzureDevCommandArgument {
  [CmdletBinding()]
  param(
    [AllowNull()]
    [string]$Argument
  )

  if ($null -eq $Argument) {
    return "''"
  }
  if ($Argument.Length -eq 0) {
    return "''"
  }
  if ($Argument -notmatch '[\s"'']') {
    return $Argument
  }

  return '"' + ($Argument -replace '"', '\"') + '"'
}

function Format-AzureDevCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [string[]]$Arguments = @()
  )

  $redactedArguments = New-Object System.Collections.Generic.List[string]
  $redactNext = $false
  foreach ($argument in $Arguments) {
    if ($redactNext) {
      $redactedArguments.Add('[redacted]')
      $redactNext = $false
      continue
    }

    $displayArgument = if (
      $argument -match '(?i)^(password|clientSecret|client_secret|secret|token|authKey|auth_key)='
    ) {
      ($argument -replace '=.*$', '=[redacted]')
    } else {
      $argument
    }

    $redactedArguments.Add($displayArgument)
    if ($argument -match '(?i)^--?(password|client-secret|secret|token|auth-key)$') {
      $redactNext = $true
    }
  }

  return (@($FilePath) + @($redactedArguments | ForEach-Object {
        Format-AzureDevCommandArgument -Argument $_
      })) -join ' '
}

function Invoke-AzureDevNativeCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [string[]]$Arguments = @()
  )

  $commandLine = Format-AzureDevCommand -FilePath $FilePath -Arguments $Arguments
  Write-Verbose "Running $commandLine"
  $result = & $FilePath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = $result | Out-String
  Write-Debug "Output from $commandLine`:$([Environment]::NewLine)$text"

  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = $result
    Text = $text
  }
}

function Write-AzureDevLog {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$CommandName,

    [Parameter(Mandatory = $true)]
    [string]$ActionCategory,

    [string]$TargetResourceId,

    [string]$TargetName,

    [string]$TargetType,

    [Parameter(Mandatory = $true)]
    [string]$Result,

    [string]$ErrorDetails
  )

  $path = Join-Path $Context.LogsDirectory (
    "$(Get-Date -Format 'yyyyMMdd').jsonl"
  )
  if (-not $PSCmdlet.ShouldProcess($path, 'Append Azure dev log entry')) {
    return
  }

  New-AzureDevDirectory -Path $Context.LogsDirectory | Out-Null
  $entry = [ordered]@{
    timestamp = (Get-Date).ToUniversalTime().ToString('o')
    command = $CommandName
    environmentId = $Context.Config.EnvironmentId
    subscriptionId = $Context.Config.SubscriptionId
    resourceGroup = $Context.Config.ResourceGroup
    actionCategory = $ActionCategory
    targetResourceId = ConvertTo-AzureDevRedactedValue $TargetResourceId
    targetName = ConvertTo-AzureDevRedactedValue $TargetName
    targetType = ConvertTo-AzureDevRedactedValue $TargetType
    result = $Result
    errorDetails = ConvertTo-AzureDevRedactedValue $ErrorDetails
  }
  Write-Verbose "Appending Azure dev log entry to $path"
  Add-Content `
    -LiteralPath $path `
    -Value (($entry | ConvertTo-Json -Compress -Depth 10)) `
    -Encoding UTF8
}

function Test-AzureDevProcessActive {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [int]$ProcessId
  )

  return $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Get-AzureDevLock {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  if (-not (Test-Path -LiteralPath $Context.LockPath -PathType Leaf)) {
    return $null
  }

  return Get-Content -LiteralPath $Context.LockPath -Raw | ConvertFrom-Json
}

function New-AzureDevLock {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$CommandName
  )

  $existing = Get-AzureDevLock -Context $Context
  if ($null -ne $existing) {
    $processId = [int]$existing.processId
    $isActive = Test-AzureDevProcessActive -ProcessId $processId
    if ($Context.ForceUnlock -and -not $isActive) {
      Remove-AzureDevLock -Context $Context -Force
    } else {
      $details = $existing | ConvertTo-Json -Compress
      throw "Azure dev command is already locked: $details"
    }
  }

  if (-not $PSCmdlet.ShouldProcess($Context.LockPath, 'Create local lock')) {
    return
  }

  New-AzureDevDirectory -Path $Context.StateDirectory | Out-Null
  $lock = [ordered]@{
    command = $CommandName
    processId = $PID
    host = [System.Net.Dns]::GetHostName()
    user = [System.Environment]::UserName
    environmentId = $Context.Config.EnvironmentId
    startedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  Write-Verbose "Creating local lock at $($Context.LockPath)"
  Set-Content `
    -LiteralPath $Context.LockPath `
    -Value ($lock | ConvertTo-Json -Depth 10) `
    -Encoding UTF8
}

function Remove-AzureDevLock {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [switch]$Force
  )

  if (-not (Test-Path -LiteralPath $Context.LockPath -PathType Leaf)) {
    return
  }
  if ($PSCmdlet.ShouldProcess($Context.LockPath, 'Remove local lock')) {
    Write-Verbose "Removing local lock at $($Context.LockPath)"
    Remove-Item -LiteralPath $Context.LockPath -Force:$Force
  }
}

function Remove-AzureDevLocalState {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  foreach ($path in @($Context.StatePath, $Context.LockPath)) {
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      if ($PSCmdlet.ShouldProcess($path, 'Remove local Azure dev artifact')) {
        Write-Verbose "Removing local Azure dev artifact at $path"
        Remove-Item -LiteralPath $path -Force
      }
    }
  }

  if (
    $Context.CleanupLogs -and
    (Test-Path -LiteralPath $Context.LogsDirectory -PathType Container)
  ) {
    if ($PSCmdlet.ShouldProcess($Context.LogsDirectory, 'Remove Azure dev logs')) {
      Write-Verbose "Removing Azure dev logs at $($Context.LogsDirectory)"
      Remove-Item -LiteralPath $Context.LogsDirectory -Recurse -Force
    }
  }
}

Export-ModuleMember -Function `
  ConvertTo-AzureDevRedactedValue, `
  Format-AzureDevCommand, `
  Format-AzureDevCommandArgument, `
  Get-AzureDevLock, `
  Get-AzureDevState, `
  Invoke-AzureDevNativeCommand, `
  New-AzureDevDirectory, `
  New-AzureDevLock, `
  Remove-AzureDevLocalState, `
  Remove-AzureDevLock, `
  Set-AzureDevState, `
  Test-AzureDevProcessActive, `
  Write-AzureDevLog
