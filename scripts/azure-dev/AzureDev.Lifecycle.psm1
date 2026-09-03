Set-StrictMode -Version Latest

function New-AzureDevLifecycleResult {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'stop')]
    [string]$Command,

    [Parameter(Mandatory = $true)]
    [ValidateSet(
      'running',
      'already-running',
      'requested',
      'already-requested',
      'already-deallocated'
    )]
    [string]$Result,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$VmName,

    [Parameter(Mandatory = $true)]
    [ValidateSet(
      'starting',
      'running',
      'stopping',
      'stopped-allocated',
      'deallocating',
      'deallocated',
      'creating',
      'unavailable',
      'not-found',
      'unrecognized'
    )]
    [string]$ObservedState,

    [Parameter(Mandatory = $true)]
    [ValidateSet(
      'none',
      'joined-start',
      'start-requested',
      'deallocation-requested'
    )]
    [string]$Action
  )

  $Command = $Command.ToLowerInvariant()
  $Result = $Result.ToLowerInvariant()
  $ObservedState = $ObservedState.ToLowerInvariant()
  $Action = $Action.ToLowerInvariant()
  $permittedOutcomes = @{
    start = @(
      'running|running|joined-start',
      'running|running|start-requested',
      'already-running|running|none'
    )
    stop = @(
      'requested|starting|deallocation-requested',
      'requested|running|deallocation-requested',
      'requested|stopping|deallocation-requested',
      'requested|stopped-allocated|deallocation-requested',
      'requested|creating|deallocation-requested',
      'requested|unavailable|deallocation-requested',
      'already-requested|deallocating|none',
      'already-deallocated|deallocated|none'
    )
  }
  $outcome = "$Result|$ObservedState|$Action"
  if ($outcome -notin $permittedOutcomes[$Command]) {
    throw "Lifecycle result '$outcome' is not valid for command '$Command'."
  }

  $terminalResult = [pscustomobject][ordered]@{
    Command = $Command
    Result = $Result
    VmName = $VmName
    ObservedState = $ObservedState
    Action = $Action
  }
  $terminalResult.PSObject.TypeNames.Insert(0, 'AzureDev.LifecycleResult')
  return $terminalResult
}

function Write-AzureDevLifecycleProgress {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet(
      'authentication',
      'contention',
      'observed-state',
      'submission',
      'wait-start',
      'state-change',
      'heartbeat'
    )]
    [string]$Event,

    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'stop')]
    [string]$Command,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$VmName,

    [Parameter(Mandatory = $true)]
    [ValidateSet(
      'authentication',
      'lock',
      'state-read',
      'start-submission',
      'deallocation-submission',
      'stable-stop-wait',
      'running-wait'
    )]
    [string]$Phase,

    [AllowNull()]
    [ValidateSet(
      'starting',
      'running',
      'stopping',
      'stopped-allocated',
      'deallocating',
      'deallocated',
      'creating',
      'unavailable',
      'not-found',
      'unrecognized'
    )]
    [string]$ObservedState,

    [AllowNull()]
    [ValidateSet(
      'none',
      'joined-start',
      'start-requested',
      'deallocation-requested'
    )]
    [string]$Action,

    [ValidateRange(0, [long]::MaxValue)]
    [long]$ElapsedMilliseconds = 0
  )

  $Event = $Event.ToLowerInvariant()
  $Command = $Command.ToLowerInvariant()
  $Phase = $Phase.ToLowerInvariant()
  if (-not [string]::IsNullOrEmpty($ObservedState)) {
    $ObservedState = $ObservedState.ToLowerInvariant()
  }
  if (-not [string]::IsNullOrEmpty($Action)) {
    $Action = $Action.ToLowerInvariant()
  }
  $progressEvent = [pscustomobject][ordered]@{
    Event = $Event
    Command = $Command
    VmName = $VmName
    Phase = $Phase
    ObservedState = $ObservedState
    Action = $Action
    ElapsedMilliseconds = $ElapsedMilliseconds
  }
  $progressEvent.PSObject.TypeNames.Insert(
    0,
    'AzureDev.LifecycleProgressEvent'
  )
  Write-Information `
    -MessageData $progressEvent `
    -Tags @('AzureDevLifecycleProgress', $Event) `
    -InformationAction Continue
}

function New-AzureDevLifecycleTiming {
  [CmdletBinding()]
  param(
    [scriptblock]$GetMonotonicMilliseconds = {
      return [long][Math]::Floor(
        1000.0 *
        [System.Diagnostics.Stopwatch]::GetTimestamp() /
        [System.Diagnostics.Stopwatch]::Frequency
      )
    },

    [scriptblock]$DelayMilliseconds = {
      param([long]$Milliseconds)
      Start-Sleep -Milliseconds $Milliseconds
    }
  )

  $timing = [pscustomobject][ordered]@{
    PollIntervalMilliseconds = [long]5000
    HeartbeatIntervalMilliseconds = [long]30000
    LockDeadlineMilliseconds = [long]15000
    AzureCallDeadlineMilliseconds = [long]120000
    StableStopDeadlineMilliseconds = [long]600000
    RunningDeadlineMilliseconds = [long]600000
    GetMonotonicMilliseconds = $GetMonotonicMilliseconds
    DelayMilliseconds = $DelayMilliseconds
  }
  $timing.PSObject.TypeNames.Insert(0, 'AzureDev.LifecycleTiming')
  return $timing
}

function New-AzureDevLifecycleWait {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Timing,

    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'stop')]
    [string]$Command,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$VmName,

    [Parameter(Mandatory = $true)]
    [ValidateSet('stable-stop-wait', 'running-wait')]
    [string]$Phase,

    [Parameter(Mandatory = $true)]
    [ValidateRange(1, [long]::MaxValue)]
    [long]$DeadlineMilliseconds,

    [Parameter(Mandatory = $true)]
    [ValidateSet(
      'starting',
      'running',
      'stopping',
      'stopped-allocated',
      'deallocating',
      'deallocated',
      'creating',
      'unavailable',
      'not-found',
      'unrecognized'
    )]
    [string]$ObservedState
  )

  if ($Timing.PSObject.TypeNames[0] -ne 'AzureDev.LifecycleTiming') {
    throw 'Timing must be an Azure development-environment lifecycle timing contract.'
  }
  $Command = $Command.ToLowerInvariant()
  $Phase = $Phase.ToLowerInvariant()
  $ObservedState = $ObservedState.ToLowerInvariant()
  $getMonotonicMilliseconds = $Timing.GetMonotonicMilliseconds
  $startedAt = [long](& $getMonotonicMilliseconds)
  $wait = [pscustomobject][ordered]@{
    Command = $Command
    VmName = $VmName
    Phase = $Phase
    ObservedState = $ObservedState
    Timing = $Timing
    StartedAt = $startedAt
    DeadlineAt = $startedAt + $DeadlineMilliseconds
    NextHeartbeatAt = $startedAt + $Timing.HeartbeatIntervalMilliseconds
  }
  $wait.PSObject.TypeNames.Insert(0, 'AzureDev.LifecycleWait')
  return $wait
}

function Invoke-AzureDevLifecycleWaitPoll {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Wait
  )

  if ($Wait.PSObject.TypeNames[0] -ne 'AzureDev.LifecycleWait') {
    throw 'Wait must be an Azure development-environment lifecycle wait contract.'
  }
  $getMonotonicMilliseconds = $Wait.Timing.GetMonotonicMilliseconds
  $now = [long](& $getMonotonicMilliseconds)
  if ($now -lt $Wait.DeadlineAt) {
    $remainingMilliseconds = $Wait.DeadlineAt - $now
    $currentDelayMilliseconds = [Math]::Min(
      $Wait.Timing.PollIntervalMilliseconds,
      $remainingMilliseconds
    )
    $delayMilliseconds = $Wait.Timing.DelayMilliseconds
    $null = & $delayMilliseconds $currentDelayMilliseconds
    $now = [long](& $getMonotonicMilliseconds)
  }
  $elapsedMilliseconds = [Math]::Max([long]0, $now - $Wait.StartedAt)
  if ($now -ge $Wait.NextHeartbeatAt) {
    Write-AzureDevLifecycleProgress `
      -Event heartbeat `
      -Command $Wait.Command `
      -VmName $Wait.VmName `
      -Phase $Wait.Phase `
      -ObservedState $Wait.ObservedState `
      -ElapsedMilliseconds $elapsedMilliseconds
    while ($Wait.NextHeartbeatAt -le $now) {
      $Wait.NextHeartbeatAt += $Wait.Timing.HeartbeatIntervalMilliseconds
    }
  }

  $poll = [pscustomobject][ordered]@{
    ElapsedMilliseconds = $elapsedMilliseconds
    DeadlineExpired = $now -ge $Wait.DeadlineAt
  }
  $poll.PSObject.TypeNames.Insert(0, 'AzureDev.LifecycleWaitPoll')
  return $poll
}

function New-AzureDevLifecycleErrorRecord {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet(
      'configuration',
      'authentication',
      'lock',
      'state-read',
      'not-found',
      'start-submission',
      'deallocation-submission',
      'stable-stop-wait',
      'running-wait',
      'outside-interference'
    )]
    [string]$Phase,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Message,

    [AllowNull()]
    [ValidateSet('start', 'stop')]
    [string]$Command,

    [AllowNull()]
    [string]$VmName,

    [AllowNull()]
    [ValidateSet(
      'starting',
      'running',
      'stopping',
      'stopped-allocated',
      'deallocating',
      'deallocated',
      'creating',
      'unavailable',
      'not-found',
      'unrecognized'
    )]
    [string]$ObservedState,

    [AllowNull()]
    [ValidateSet(
      'none',
      'joined-start',
      'start-requested',
      'deallocation-requested'
    )]
    [string]$Action,

    [bool]$MutationAccepted = $false
  )

  $Phase = $Phase.ToLowerInvariant()
  if ([string]::IsNullOrEmpty($Command)) {
    $effectiveCommand = $null
  } else {
    $effectiveCommand = $Command.ToLowerInvariant()
  }
  if ([string]::IsNullOrEmpty($VmName)) {
    $effectiveVmName = $null
  } else {
    $effectiveVmName = $VmName
  }
  if ([string]::IsNullOrEmpty($ObservedState)) {
    $effectiveObservedState = $null
  } else {
    $effectiveObservedState = $ObservedState.ToLowerInvariant()
  }
  if ([string]::IsNullOrEmpty($Action)) {
    $effectiveAction = $null
  } else {
    $effectiveAction = $Action.ToLowerInvariant()
  }
  $failure = [pscustomobject][ordered]@{
    Phase = $Phase
    Command = $effectiveCommand
    VmName = $effectiveVmName
    ObservedState = $effectiveObservedState
    Action = $effectiveAction
    MutationAccepted = $MutationAccepted
  }
  $failure.PSObject.TypeNames.Insert(0, 'AzureDev.LifecycleFailure')
  $exception = [System.InvalidOperationException]::new($Message)
  return [System.Management.Automation.ErrorRecord]::new(
    $exception,
    "AzureDevLifecycleFailure.$Phase",
    [System.Management.Automation.ErrorCategory]::OperationStopped,
    $failure
  )
}

function New-AzureDevLifecycleLogRecord {
  [CmdletBinding(DefaultParameterSetName = 'Success')]
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$Configuration,

    [Parameter(Mandatory = $true, ParameterSetName = 'Success')]
    [pscustomobject]$LifecycleResult,

    [Parameter(Mandatory = $true, ParameterSetName = 'Failure')]
    [System.Management.Automation.ErrorRecord]$Failure,

    [Parameter(Mandatory = $true, ParameterSetName = 'Success')]
    [bool]$MutationAccepted,

    [System.DateTimeOffset]$Timestamp = [System.DateTimeOffset]::UtcNow,

    [Parameter(Mandatory = $true)]
    [ValidateRange(0, [long]::MaxValue)]
    [long]$ElapsedMilliseconds
  )

  if (
    $Configuration.PSObject.TypeNames[0] -ne
    'AzureDev.LifecycleConfigurationSnapshot'
  ) {
    throw 'Configuration must be a validated lifecycle configuration snapshot.'
  }
  if ($PSCmdlet.ParameterSetName -eq 'Success') {
    if ($LifecycleResult.PSObject.TypeNames[0] -ne 'AzureDev.LifecycleResult') {
      throw 'LifecycleResult must be an Azure development-environment lifecycle result.'
    }
    if ($LifecycleResult.VmName -cne $Configuration.VmName) {
      throw 'Lifecycle result and configuration snapshot target different VMs.'
    }
    $effectiveCommand = $LifecycleResult.Command.ToLowerInvariant()
    $terminalResult = $LifecycleResult.Result.ToLowerInvariant()
    $failurePhase = $null
    $effectiveObservedState = $LifecycleResult.ObservedState.ToLowerInvariant()
    $effectiveAction = $LifecycleResult.Action.ToLowerInvariant()
    $expectedMutationAccepted = $effectiveAction -in @(
      'start-requested',
      'deallocation-requested'
    )
    if ($MutationAccepted -ne $expectedMutationAccepted) {
      throw 'Mutation acceptance does not match the lifecycle result action.'
    }
  } else {
    if (
      $null -eq $Failure.TargetObject -or
      $Failure.TargetObject.PSObject.TypeNames[0] -ne
      'AzureDev.LifecycleFailure'
    ) {
      throw 'Failure must be an Azure development-environment lifecycle failure.'
    }
    $failureProperties = @(
      'Phase',
      'Command',
      'VmName',
      'ObservedState',
      'Action',
      'MutationAccepted'
    )
    $missingFailureProperties = @(
      $failureProperties | Where-Object {
        $_ -notin $Failure.TargetObject.PSObject.Properties.Name
      }
    )
    if ($missingFailureProperties.Count -gt 0) {
      throw 'Lifecycle failure contract is missing terminal diagnostic facts.'
    }
    if (
      [string]::IsNullOrWhiteSpace($Failure.TargetObject.Command) -or
      [string]::IsNullOrWhiteSpace($Failure.TargetObject.VmName)
    ) {
      throw 'Lifecycle failure must identify its command and VM for logging.'
    }
    if ($Failure.TargetObject.VmName -cne $Configuration.VmName) {
      throw 'Lifecycle failure and configuration snapshot target different VMs.'
    }
    $effectiveCommand = $Failure.TargetObject.Command.ToLowerInvariant()
    $terminalResult = $null
    $failurePhase = $Failure.TargetObject.Phase.ToLowerInvariant()
    $effectiveObservedState = $Failure.TargetObject.ObservedState
    $effectiveAction = $Failure.TargetObject.Action
    if ([string]::IsNullOrEmpty($effectiveObservedState)) {
      $effectiveObservedState = $null
    } else {
      $effectiveObservedState = $effectiveObservedState.ToLowerInvariant()
    }
    if ([string]::IsNullOrEmpty($effectiveAction)) {
      $effectiveAction = $null
    } else {
      $effectiveAction = $effectiveAction.ToLowerInvariant()
    }
    $MutationAccepted = $Failure.TargetObject.MutationAccepted
  }

  $record = [pscustomobject][ordered]@{
    schemaVersion = 1
    recordType = 'azure-development-environment-lifecycle'
    timestamp = $Timestamp.ToUniversalTime().ToString('o')
    command = $effectiveCommand
    subscriptionId = $Configuration.SubscriptionId
    resourceGroup = $Configuration.ResourceGroup
    vmName = $Configuration.VmName
    terminalResult = $terminalResult
    failurePhase = $failurePhase
    observedState = $effectiveObservedState
    action = $effectiveAction
    mutationAccepted = $MutationAccepted
    elapsedMilliseconds = $ElapsedMilliseconds
  }
  $record.PSObject.TypeNames.Insert(0, 'AzureDev.LifecycleLogRecord')
  return $record
}

function ConvertTo-AzureDevLifecycleLogJson {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Record
  )

  if ($Record.PSObject.TypeNames[0] -ne 'AzureDev.LifecycleLogRecord') {
    throw 'Record must be an Azure development-environment lifecycle log record.'
  }
  $allowlistedRecord = [ordered]@{
    schemaVersion = $Record.schemaVersion
    recordType = $Record.recordType
    timestamp = $Record.timestamp
    command = $Record.command
    subscriptionId = $Record.subscriptionId
    resourceGroup = $Record.resourceGroup
    vmName = $Record.vmName
    terminalResult = $Record.terminalResult
    failurePhase = $Record.failurePhase
    observedState = $Record.observedState
    action = $Record.action
    mutationAccepted = $Record.mutationAccepted
    elapsedMilliseconds = $Record.elapsedMilliseconds
  }
  return $allowlistedRecord | ConvertTo-Json -Compress -Depth 2
}

function Write-AzureDevLifecycleLogRecord {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$RepositoryRoot,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$Record
  )

  if ($Record.PSObject.TypeNames[0] -ne 'AzureDev.LifecycleLogRecord') {
    throw 'Record must be an Azure development-environment lifecycle log record.'
  }
  $timestamp = [System.DateTimeOffset]::ParseExact(
    $Record.timestamp,
    'o',
    [System.Globalization.CultureInfo]::InvariantCulture
  )
  $logsDirectory = Join-Path $RepositoryRoot '.azure/logs'
  $path = Join-Path $logsDirectory (
    $timestamp.ToUniversalTime().ToString('yyyyMMdd') + '.jsonl'
  )
  if (-not $PSCmdlet.ShouldProcess($path, 'Append lifecycle log record')) {
    return
  }

  try {
    if (-not (Test-Path -LiteralPath $logsDirectory -PathType Container)) {
      New-Item `
        -ItemType Directory `
        -Path $logsDirectory `
        -Force `
        -ErrorAction Stop | Out-Null
    }
    $json = ConvertTo-AzureDevLifecycleLogJson -Record $Record
    Add-Content `
      -LiteralPath $path `
      -Value $json `
      -Encoding UTF8 `
      -ErrorAction Stop
  } catch {
    Write-Warning `
      -Message (
        'The Azure development-environment lifecycle log record could not be ' +
        'written. The primary lifecycle outcome is unchanged.'
      ) `
      -WarningAction Continue
  }
}

function Complete-AzureDevLifecycleAttempt {
  [CmdletBinding(
    DefaultParameterSetName = 'Success',
    SupportsShouldProcess = $true
  )]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$RepositoryRoot,

    [Parameter(Mandatory = $true)]
    [pscustomobject]$Record,

    [Parameter(Mandatory = $true, ParameterSetName = 'Success')]
    [pscustomobject]$LifecycleResult,

    [Parameter(Mandatory = $true, ParameterSetName = 'Failure')]
    [System.Management.Automation.ErrorRecord]$Failure
  )

  if ($Record.PSObject.TypeNames[0] -ne 'AzureDev.LifecycleLogRecord') {
    throw 'Record must be an Azure development-environment lifecycle log record.'
  }
  if ($PSCmdlet.ParameterSetName -eq 'Success') {
    if ($LifecycleResult.PSObject.TypeNames[0] -ne 'AzureDev.LifecycleResult') {
      throw 'LifecycleResult must be an Azure development-environment lifecycle result.'
    }
    $expectedMutationAccepted = $LifecycleResult.Action -in @(
      'start-requested',
      'deallocation-requested'
    )
    if (
      $null -ne $Record.failurePhase -or
      $Record.terminalResult -cne $LifecycleResult.Result -or
      $Record.command -cne $LifecycleResult.Command -or
      $Record.vmName -cne $LifecycleResult.VmName -or
      $Record.observedState -cne $LifecycleResult.ObservedState -or
      $Record.action -cne $LifecycleResult.Action -or
      $Record.mutationAccepted -ne $expectedMutationAccepted
    ) {
      throw 'The success record does not match the lifecycle result.'
    }
  } else {
    $requiredFailureProperties = @(
      'Phase',
      'Command',
      'VmName',
      'ObservedState',
      'Action',
      'MutationAccepted'
    )
    $failureContractMalformed = (
      $null -eq $Failure.TargetObject -or
      $Failure.TargetObject.PSObject.TypeNames[0] -ne
      'AzureDev.LifecycleFailure'
    )
    if (-not $failureContractMalformed) {
      $failureContractMalformed = @(
        $requiredFailureProperties | Where-Object {
          $_ -notin $Failure.TargetObject.PSObject.Properties.Name
        }
      ).Count -gt 0
    }
    if (
      $failureContractMalformed -or
      $null -ne $Record.terminalResult -or
      $Record.failurePhase -cne $Failure.TargetObject.Phase -or
      $Record.command -cne $Failure.TargetObject.Command -or
      $Record.vmName -cne $Failure.TargetObject.VmName -or
      $Record.observedState -cne $Failure.TargetObject.ObservedState -or
      $Record.action -cne $Failure.TargetObject.Action -or
      $Record.mutationAccepted -ne $Failure.TargetObject.MutationAccepted
    ) {
      throw 'The failure record does not match the lifecycle failure.'
    }
  }

  if (
    -not $PSCmdlet.ShouldProcess(
      "$($Record.command)/$($Record.vmName)",
      'Write terminal lifecycle log record'
    )
  ) {
    return
  }

  try {
    Write-AzureDevLifecycleLogRecord `
      -RepositoryRoot $RepositoryRoot `
      -Record $Record `
      -Confirm:$false `
      -WarningAction Continue
  } catch {
    Write-Warning `
      -Message (
        'The Azure development-environment lifecycle log record could not be ' +
        'written. The primary lifecycle outcome is unchanged.'
      ) `
      -WarningAction Continue
  }
  if ($PSCmdlet.ParameterSetName -eq 'Failure') {
    $PSCmdlet.ThrowTerminatingError($Failure)
  }
  return $LifecycleResult
}

function Get-AzureDevLifecycleState {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$Configuration
  )

  $query = (
    "instanceView.statuses[?starts_with(code, 'PowerState/')]" +
    '.code | [0]'
  )
  try {
    $rawState = Invoke-AzCli `
      -Arguments @(
        'vm',
        'get-instance-view',
        '--subscription',
        $Configuration.SubscriptionId,
        '--resource-group',
        $Configuration.ResourceGroup,
        '--name',
        $Configuration.VmName,
        '--query',
        $query,
        '--output',
        'tsv',
        '--only-show-errors'
      ) `
      -TimeoutSeconds 120 `
      -SuppressOutputDetails
  } catch {
    if (
      $_.Exception.Data.Contains('AzureDevCliExitCode') -and
      $_.Exception.Data['AzureDevCliExitCode'] -eq 3
    ) {
      return 'not-found'
    }
    return 'unavailable'
  }

  if ([string]::IsNullOrWhiteSpace([string]$rawState)) {
    return 'unavailable'
  }
  switch ([string]$rawState) {
    'PowerState/starting' { return 'starting' }
    'PowerState/running' { return 'running' }
    'PowerState/stopping' { return 'stopping' }
    'PowerState/stopped' { return 'stopped-allocated' }
    'PowerState/deallocating' { return 'deallocating' }
    'PowerState/deallocated' { return 'deallocated' }
    'PowerState/creating' { return 'creating' }
    default { return 'unrecognized' }
  }
}

function Invoke-AzureDevLifecycleCommand {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'stop', 'status')]
    [string]$CommandName,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$RepositoryRoot,

    [string]$EnvironmentFile = '.env.azure.development'
  )

  $configuration = Get-AzureDevLifecycleConfig `
    -CommandName $CommandName `
    -RepositoryRoot $RepositoryRoot `
    -EnvironmentFile $EnvironmentFile

  if ($CommandName -eq 'status') {
    Connect-AzureDevLifecycleSession -Config $configuration
    $state = Get-AzureDevLifecycleState -Configuration $configuration
    Write-Host "Power state: $state"
    return
  }

  if (-not $WhatIfPreference) {
    throw [System.NotSupportedException]::new(
      "Real '$CommandName' lifecycle orchestration is not available yet."
    )
  }

  Connect-AzureDevLifecycleSession `
    -Config $configuration `
    -WhatIf
  $null = Invoke-AzureDevLifecycleLock `
    -ConfigurationSnapshot $configuration `
    -CommandName $CommandName `
    -ScriptBlock {
      throw 'Preview must not invoke guarded lifecycle work.'
    } `
    -WhatIf

  $target = (
    "$($configuration.SubscriptionId)/" +
    "$($configuration.ResourceGroup)/$($configuration.VmName)"
  )
  $action = if ($CommandName -eq 'start') {
    (
      'Conditionally do nothing from running, join starting, start from ' +
      'stopped-allocated or deallocated, wait through stopping or ' +
      'deallocating then reconsider, and fail without mutation from ' +
      'not-found, unavailable, creating, or unrecognized'
    )
  } else {
    (
      'Conditionally do nothing from deallocated or deallocating, ' +
      'deallocate from another supported power state, creating, or ' +
      'unavailable state, and fail without mutation from not-found or ' +
      'unrecognized'
    )
  }
  $null = $PSCmdlet.ShouldProcess($target, $action)

  $logsDirectory = Join-Path $configuration.RepoRoot '.azure/logs'
  $null = $PSCmdlet.ShouldProcess(
    $logsDirectory,
    'Append one terminal lifecycle record after a completed real attempt'
  )
}

Export-ModuleMember -Function Invoke-AzureDevLifecycleCommand
