Set-StrictMode -Version Latest

function ConvertTo-AzureDevLifecycleTimeoutSeconds {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, [long]::MaxValue)]
    [long]$Milliseconds,

    [Parameter(Mandatory = $true)]
    [ValidateRange(1, [int]::MaxValue)]
    [int]$MaximumSeconds
  )

  $seconds = [long][Math]::Ceiling([decimal]$Milliseconds / 1000)
  if ($seconds -gt $MaximumSeconds) {
    throw (
      "Lifecycle timeout $Milliseconds milliseconds exceeds the supported " +
      "maximum of $MaximumSeconds seconds."
    )
  }
  return [int]$seconds
}

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
    if (Test-AzureDevInterruption -ErrorObject $_) {
      throw
    }
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
    if (Test-AzureDevInterruption -ErrorObject $_) {
      throw
    }
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
    [psobject]$Configuration,

    [ValidateRange(1, 2147483)]
    [int]$TimeoutSeconds = 120
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
      -TimeoutSeconds $TimeoutSeconds `
      -SuppressOutputDetails
  } catch {
    if (Test-AzureDevInterruption -ErrorObject $_) {
      throw
    }
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

function Get-AzureDevStopStateCatalog {
  [CmdletBinding()]
  param()

  return @(
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
  )
}

function Get-AzureDevStopPlan {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({
        if ($_ -notin (Get-AzureDevStopStateCatalog)) {
          throw "Observed stop state '$_' is not supported."
        }
        return $true
      })]
    [string]$ObservedState
  )

  $ObservedState = $ObservedState.ToLowerInvariant()
  $planFacts = switch ($ObservedState) {
    'deallocated' {
      @{
        Result = 'already-deallocated'
        Action = 'none'
        SubmitDeallocation = $false
        FailurePhase = $null
      }
    }
    'deallocating' {
      @{
        Result = 'already-requested'
        Action = 'none'
        SubmitDeallocation = $false
        FailurePhase = $null
      }
    }
    'not-found' {
      @{
        Result = $null
        Action = 'none'
        SubmitDeallocation = $false
        FailurePhase = 'not-found'
      }
    }
    'unrecognized' {
      @{
        Result = $null
        Action = 'none'
        SubmitDeallocation = $false
        FailurePhase = 'state-read'
      }
    }
    default {
      @{
        Result = 'requested'
        Action = 'deallocation-requested'
        SubmitDeallocation = $true
        FailurePhase = $null
      }
    }
  }

  $plan = [pscustomobject][ordered]@{
    Result = $planFacts.Result
    Action = $planFacts.Action
    SubmitDeallocation = $planFacts.SubmitDeallocation
    FailurePhase = $planFacts.FailurePhase
  }
  $plan.PSObject.TypeNames.Insert(0, 'AzureDev.StopPlan')
  return $plan
}

function Get-AzureDevStopPreviewAction {
  [CmdletBinding()]
  param()

  $rules = foreach ($state in (Get-AzureDevStopStateCatalog)) {
    $plan = Get-AzureDevStopPlan -ObservedState $state
    if ($null -ne $plan.FailurePhase) {
      "$state => fail:$($plan.FailurePhase)"
    } elseif ($plan.SubmitDeallocation) {
      "$state => $($plan.Result):$($plan.Action)"
    } else {
      "$state => $($plan.Result):none"
    }
  }
  return 'Apply the normalized stop plan: ' + ($rules -join '; ')
}

function Invoke-AzureDevStopLifecycle {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$Configuration,

    [ValidateRange(1, 2147483)]
    [int]$AzureCallTimeoutSeconds = 120
  )

  Write-AzureDevLifecycleProgress `
    -Event authentication `
    -Command stop `
    -VmName $Configuration.VmName `
    -Phase authentication
  try {
    $authenticated = Connect-AzureDevLifecycleSession `
      -Config $Configuration `
      -TimeoutSeconds $AzureCallTimeoutSeconds
  } catch {
    if (Test-AzureDevInterruption -ErrorObject $_) {
      throw
    }
    $failure = New-AzureDevLifecycleErrorRecord `
      -Phase authentication `
      -Message (
        'Azure lifecycle authentication failed for the explicitly targeted ' +
        "VM '$($Configuration.VmName)': $($_.Exception.Message)"
      ) `
      -Command stop `
      -VmName $Configuration.VmName
    $PSCmdlet.ThrowTerminatingError($failure)
  }
  if (-not $authenticated) {
    return
  }

  try {
    $observedState = Get-AzureDevLifecycleState `
      -Configuration $Configuration `
      -TimeoutSeconds $AzureCallTimeoutSeconds
  } catch {
    if (Test-AzureDevInterruption -ErrorObject $_) {
      throw
    }
    $failure = New-AzureDevLifecycleErrorRecord `
      -Phase state-read `
      -Message (
        'Azure VM state observation failed before a stop decision could be ' +
        "made for '$($Configuration.VmName)'."
      ) `
      -Command stop `
      -VmName $Configuration.VmName
    $PSCmdlet.ThrowTerminatingError($failure)
  }
  Write-AzureDevLifecycleProgress `
    -Event observed-state `
    -Command stop `
    -VmName $Configuration.VmName `
    -Phase state-read `
    -ObservedState $observedState

  $plan = Get-AzureDevStopPlan -ObservedState $observedState
  if ($null -ne $plan.FailurePhase) {
    $message = if ($plan.FailurePhase -eq 'not-found') {
      (
        "Azure VM '$($Configuration.VmName)' was definitely not found; " +
        'no deallocation was submitted.'
      )
    } else {
      (
        "Azure returned an unrecognized power state for VM " +
        "'$($Configuration.VmName)'; no deallocation was submitted."
      )
    }
    $failure = New-AzureDevLifecycleErrorRecord `
      -Phase $plan.FailurePhase `
      -Message $message `
      -Command stop `
      -VmName $Configuration.VmName `
      -ObservedState $observedState `
      -Action none
    $PSCmdlet.ThrowTerminatingError($failure)
  }

  if ($plan.SubmitDeallocation) {
    $target = (
      "$($Configuration.SubscriptionId)/" +
      "$($Configuration.ResourceGroup)/$($Configuration.VmName)"
    )
    if (-not $PSCmdlet.ShouldProcess(
        $target,
        'Submit asynchronous Azure VM deallocation'
      )) {
      return
    }

    Write-AzureDevLifecycleProgress `
      -Event submission `
      -Command stop `
      -VmName $Configuration.VmName `
      -Phase deallocation-submission `
      -ObservedState $observedState `
      -Action deallocation-requested
    try {
      $null = Invoke-AzCli `
        -Arguments @(
          'vm',
          'deallocate',
          '--subscription',
          $Configuration.SubscriptionId,
          '--resource-group',
          $Configuration.ResourceGroup,
          '--name',
          $Configuration.VmName,
          '--no-wait',
          '--output',
          'none',
          '--only-show-errors'
        ) `
        -TimeoutSeconds $AzureCallTimeoutSeconds `
        -SuppressOutputDetails
    } catch {
      if (Test-AzureDevInterruption -ErrorObject $_) {
        throw
      }
      $failure = New-AzureDevLifecycleErrorRecord `
        -Phase deallocation-submission `
        -Message (
          'Azure did not accept the asynchronous deallocation request for ' +
          "VM '$($Configuration.VmName)'."
        ) `
        -Command stop `
        -VmName $Configuration.VmName `
        -ObservedState $observedState `
        -Action deallocation-requested
      $PSCmdlet.ThrowTerminatingError($failure)
    }
  }

  return New-AzureDevLifecycleResult `
    -Command stop `
    -Result $plan.Result `
    -VmName $Configuration.VmName `
    -ObservedState $observedState `
    -Action $plan.Action
}

function Invoke-AzureDevStopCommand {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$Configuration,

    [pscustomobject]$Timing = (New-AzureDevLifecycleTiming)
  )

  $target = (
    "$($Configuration.SubscriptionId)/" +
    "$($Configuration.ResourceGroup)/$($Configuration.VmName)"
  )
  if (-not $PSCmdlet.ShouldProcess(
      $target,
      'Execute the normalized stop plan and record its terminal outcome'
    )) {
    return
  }

  if ($Timing.PSObject.TypeNames[0] -ne 'AzureDev.LifecycleTiming') {
    throw 'Timing must be an Azure development-environment lifecycle timing contract.'
  }

  $getMonotonicMilliseconds = $Timing.GetMonotonicMilliseconds
  $startedAt = [long](& $getMonotonicMilliseconds)
  $lockTimeoutSeconds = ConvertTo-AzureDevLifecycleTimeoutSeconds `
    -Milliseconds $Timing.LockDeadlineMilliseconds `
    -MaximumSeconds ([int]::MaxValue)
  $azureCallTimeoutSeconds = ConvertTo-AzureDevLifecycleTimeoutSeconds `
    -Milliseconds $Timing.AzureCallDeadlineMilliseconds `
    -MaximumSeconds 2147483
  $contentionProgress = {
    Write-AzureDevLifecycleProgress `
      -Event contention `
      -Command stop `
      -VmName $Configuration.VmName `
      -Phase lock
  }
  try {
    $lifecycleResult = Invoke-AzureDevLifecycleLock `
      -ConfigurationSnapshot $Configuration `
      -CommandName stop `
      -TimeoutSeconds $lockTimeoutSeconds `
      -OnContention $contentionProgress `
      -ScriptBlock {
        param(
          [AllowNull()]
          [psobject]$Lock,

          [Parameter(Mandatory = $true)]
          [psobject]$LockedConfiguration
        )

        $null = $Lock
        return Invoke-AzureDevStopLifecycle `
          -Configuration $LockedConfiguration `
          -AzureCallTimeoutSeconds $azureCallTimeoutSeconds `
          -Confirm:$false
      } `
      -Confirm:$false
  } catch {
    if (Test-AzureDevInterruption -ErrorObject $_) {
      throw
    }
    $caught = $_
    $failure = if (
      $null -ne $caught.TargetObject -and
      $caught.TargetObject.PSObject.TypeNames[0] -eq
        'AzureDev.LifecycleFailure'
    ) {
      $caught
    } else {
      New-AzureDevLifecycleErrorRecord `
        -Phase lock `
        -Message (
          'Azure lifecycle lock acquisition or guarded execution failed for ' +
          "VM '$($Configuration.VmName)': $($caught.Exception.Message)"
        ) `
        -Command stop `
        -VmName $Configuration.VmName
    }
    $finishedAt = [long](& $getMonotonicMilliseconds)
    $record = New-AzureDevLifecycleLogRecord `
      -Configuration $Configuration `
      -Failure $failure `
      -ElapsedMilliseconds ([Math]::Max([long]0, $finishedAt - $startedAt))
    Complete-AzureDevLifecycleAttempt `
      -RepositoryRoot $Configuration.RepoRoot `
      -Record $record `
      -Failure $failure `
      -Confirm:$false
    return
  }

  if ($null -eq $lifecycleResult) {
    return
  }

  $finishedAt = [long](& $getMonotonicMilliseconds)
  $record = New-AzureDevLifecycleLogRecord `
    -Configuration $Configuration `
    -LifecycleResult $lifecycleResult `
    -MutationAccepted ($lifecycleResult.Action -eq 'deallocation-requested') `
    -ElapsedMilliseconds ([Math]::Max([long]0, $finishedAt - $startedAt))
  return Complete-AzureDevLifecycleAttempt `
    -RepositoryRoot $Configuration.RepoRoot `
    -Record $record `
    -LifecycleResult $lifecycleResult `
    -Confirm:$false
}

function New-AzureDevStartPlan {
  [CmdletBinding()]
  param(
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

  $ObservedState = $ObservedState.ToLowerInvariant()
  $planValues = switch ($ObservedState) {
    'running' {
      @{
        Decision = 'complete'
        Result = 'already-running'
        Action = 'none'
        SubmitMutation = $false
        WaitForRunning = $false
        FailurePhase = $null
        FailureMessage = $null
      }
      break
    }
    'starting' {
      @{
        Decision = 'wait-running'
        Result = 'running'
        Action = 'joined-start'
        SubmitMutation = $false
        WaitForRunning = $true
        FailurePhase = $null
        FailureMessage = $null
      }
      break
    }
    { $_ -in @('stopped-allocated', 'deallocated') } {
      @{
        Decision = 'start'
        Result = 'running'
        Action = 'start-requested'
        SubmitMutation = $true
        WaitForRunning = $true
        FailurePhase = $null
        FailureMessage = $null
      }
      break
    }
    { $_ -in @('stopping', 'deallocating') } {
      @{
        Decision = 'wait-stable-stop'
        Result = $null
        Action = 'none'
        SubmitMutation = $false
        WaitForRunning = $false
        FailurePhase = $null
        FailureMessage = $null
      }
      break
    }
    'not-found' {
      @{
        Decision = 'fail'
        Result = $null
        Action = 'none'
        SubmitMutation = $false
        WaitForRunning = $false
        FailurePhase = 'not-found'
        FailureMessage = (
          "Azure VM state is not-found for the configured target. " +
          'No start mutation was submitted.'
        )
      }
      break
    }
    default {
      @{
        Decision = 'fail'
        Result = $null
        Action = 'none'
        SubmitMutation = $false
        WaitForRunning = $false
        FailurePhase = 'state-read'
        FailureMessage = (
          "Azure VM state '$ObservedState' cannot safely be started. " +
          'No start mutation was submitted.'
        )
      }
    }
  }

  $plan = [pscustomobject][ordered]@{
    ObservedState = $ObservedState
    Decision = $planValues.Decision
    Result = $planValues.Result
    Action = $planValues.Action
    SubmitMutation = $planValues.SubmitMutation
    WaitForRunning = $planValues.WaitForRunning
    FailurePhase = $planValues.FailurePhase
    FailureMessage = $planValues.FailureMessage
  }
  $plan.PSObject.TypeNames.Insert(0, 'AzureDev.StartPlan')
  return $plan
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

    [string]$EnvironmentFile = '.env.azure.development',

    [pscustomobject]$Timing = (New-AzureDevLifecycleTiming)
  )

  try {
    $configuration = Get-AzureDevLifecycleConfig `
      -CommandName $CommandName `
      -RepositoryRoot $RepositoryRoot `
      -EnvironmentFile $EnvironmentFile
  } catch {
    if (Test-AzureDevInterruption -ErrorObject $_) {
      throw
    }
    $configurationFailureParameters = @{
      Phase = 'configuration'
      Message = (
        "Azure lifecycle configuration could not be loaded for command " +
        "'$CommandName': $($_.Exception.Message)"
      )
    }
    if ($CommandName -in @('start', 'stop')) {
      $configurationFailureParameters.Command = $CommandName
    }
    $configurationFailure = New-AzureDevLifecycleErrorRecord `
      @configurationFailureParameters
    $PSCmdlet.ThrowTerminatingError($configurationFailure)
  }

  if ($Timing.PSObject.TypeNames[0] -ne 'AzureDev.LifecycleTiming') {
    throw 'Timing must be an Azure development-environment lifecycle timing contract.'
  }
  $lockTimeoutSeconds = ConvertTo-AzureDevLifecycleTimeoutSeconds `
    -Milliseconds $Timing.LockDeadlineMilliseconds `
    -MaximumSeconds ([int]::MaxValue)
  $azureCallTimeoutSeconds = ConvertTo-AzureDevLifecycleTimeoutSeconds `
    -Milliseconds $Timing.AzureCallDeadlineMilliseconds `
    -MaximumSeconds 2147483

  if ($CommandName -eq 'status') {
    $authenticated = Connect-AzureDevLifecycleSession `
      -Config $configuration `
      -TimeoutSeconds $azureCallTimeoutSeconds
    if (-not $authenticated) {
      return
    }
    $state = Get-AzureDevLifecycleState `
      -Configuration $configuration `
      -TimeoutSeconds $azureCallTimeoutSeconds
    Write-Host "Power state: $state"
    return
  }

  if ($WhatIfPreference) {
    $null = Connect-AzureDevLifecycleSession `
      -Config $configuration `
      -TimeoutSeconds $azureCallTimeoutSeconds `
      -WhatIf
    $null = Invoke-AzureDevLifecycleLock `
      -ConfigurationSnapshot $configuration `
      -CommandName $CommandName `
      -TimeoutSeconds $lockTimeoutSeconds `
      -ScriptBlock {
        throw 'Preview must not invoke guarded lifecycle work.'
      } `
      -WhatIf

    $target = (
      "$($configuration.SubscriptionId)/" +
      "$($configuration.ResourceGroup)/$($configuration.VmName)"
    )
    $action = if ($CommandName -eq 'start') {
      $previewStates = @(
        'running',
        'starting',
        'stopping',
        'stopped-allocated',
        'deallocating',
        'deallocated',
        'creating',
        'unavailable',
        'not-found',
        'unrecognized'
      )
      $previewRules = @(
        $previewStates | ForEach-Object {
          $previewPlan = New-AzureDevStartPlan -ObservedState $_
          "$_=$($previewPlan.Decision)"
        }
      )
      'Apply the start planner rules: ' + ($previewRules -join ', ')
    } else {
      Get-AzureDevStopPreviewAction
    }
    $null = $PSCmdlet.ShouldProcess($target, $action)

    $logsDirectory = Join-Path $configuration.RepoRoot '.azure/logs'
    $null = $PSCmdlet.ShouldProcess(
      $logsDirectory,
      'Append one terminal lifecycle record after a completed real attempt'
    )
    return
  }

  if ($CommandName -eq 'stop') {
    $stopParameters = @{
      Configuration = $configuration
      Timing = $Timing
    }
    if ($PSBoundParameters.ContainsKey('Confirm')) {
      $stopParameters.Confirm = $PSBoundParameters['Confirm']
    }
    return Invoke-AzureDevStopCommand @stopParameters
  }

  $lifecycleShouldProcess = $PSCmdlet
  $getMonotonicMilliseconds = $Timing.GetMonotonicMilliseconds
  $attemptStartedAt = [long](& $getMonotonicMilliseconds)
  $completeStartFailure = {
    param(
      [System.Management.Automation.ErrorRecord]$Failure,
      [long]$ElapsedMilliseconds
    )

    $failureRecord = New-AzureDevLifecycleLogRecord `
      -Configuration $configuration `
      -Failure $Failure `
      -ElapsedMilliseconds $ElapsedMilliseconds
    Complete-AzureDevLifecycleAttempt `
      -RepositoryRoot $configuration.RepoRoot `
      -Record $failureRecord `
      -Failure $Failure `
      -Confirm:$false
  }
  $completeStableStopTimeout = {
    param(
      [string]$ObservedState,
      [long]$ElapsedMilliseconds
    )

    $timeoutFailure = New-AzureDevLifecycleErrorRecord `
      -Phase stable-stop-wait `
      -Message (
        'The Azure VM did not reach a stable stopped state within ten ' +
        'minutes. No start mutation was submitted.'
      ) `
      -Command start `
      -VmName $configuration.VmName `
      -ObservedState $ObservedState `
      -Action none
    & $completeStartFailure $timeoutFailure $ElapsedMilliseconds
  }
  $completeRunningWaitTimeout = {
    param(
      [string]$ObservedState,
      [long]$ElapsedMilliseconds
    )

    $timeoutFailure = New-AzureDevLifecycleErrorRecord `
      -Phase running-wait `
      -Message (
        'The Azure VM did not reach running within ten minutes. Azure ' +
        'can still complete the earlier start operation; no rollback or ' +
        'second start was submitted.'
      ) `
      -Command start `
      -VmName $configuration.VmName `
      -ObservedState $ObservedState `
      -Action $operation.Plan.Action `
      -MutationAccepted $operation.MutationAccepted
    & $completeStartFailure $timeoutFailure $ElapsedMilliseconds
  }
  $completeStartLockFailure = {
    param([System.Management.Automation.ErrorRecord]$Caught)

    $lockFailure = if (
      $null -ne $Caught.TargetObject -and
      $Caught.TargetObject.PSObject.TypeNames[0] -eq
        'AzureDev.LifecycleFailure'
    ) {
      $Caught
    } else {
      New-AzureDevLifecycleErrorRecord `
        -Phase lock `
        -Message $Caught.Exception.Message `
        -Command start `
        -VmName $configuration.VmName
    }
    $failedAt = [long](& $getMonotonicMilliseconds)
    & $completeStartFailure `
      $lockFailure `
      ([Math]::Max([long]0, $failedAt - $attemptStartedAt))
  }
  $lockedDecision = {
    param($Lock, $ConfigurationSnapshot)

    $null = $Lock
    Write-AzureDevLifecycleProgress `
      -Event authentication `
      -Command start `
      -VmName $ConfigurationSnapshot.VmName `
      -Phase authentication
    try {
      $authenticated = Connect-AzureDevLifecycleSession `
        -Config $ConfigurationSnapshot `
        -TimeoutSeconds $azureCallTimeoutSeconds
    } catch {
      if (Test-AzureDevInterruption -ErrorObject $_) {
        throw
      }
      $authenticationFailure = New-AzureDevLifecycleErrorRecord `
        -Phase authentication `
        -Message $_.Exception.Message `
        -Command start `
        -VmName $ConfigurationSnapshot.VmName
      throw $authenticationFailure
    }
    if (-not $authenticated) {
      return [pscustomobject]@{
        AuthenticationDeclined = $true
        MutationDeclined = $false
      }
    }

    $observedState = Get-AzureDevLifecycleState `
      -Configuration $ConfigurationSnapshot `
      -TimeoutSeconds $azureCallTimeoutSeconds
    Write-AzureDevLifecycleProgress `
      -Event observed-state `
      -Command start `
      -VmName $ConfigurationSnapshot.VmName `
      -Phase state-read `
      -ObservedState $observedState
    $plan = New-AzureDevStartPlan -ObservedState $observedState
    if ($plan.Decision -eq 'fail') {
      $stateFailure = New-AzureDevLifecycleErrorRecord `
        -Phase $plan.FailurePhase `
        -Message $plan.FailureMessage `
        -Command start `
        -VmName $ConfigurationSnapshot.VmName `
        -ObservedState $observedState `
        -Action none
      throw $stateFailure
    }

    if ($plan.SubmitMutation) {
      $mutationTarget = (
        "$($ConfigurationSnapshot.SubscriptionId)/" +
        "$($ConfigurationSnapshot.ResourceGroup)/" +
        $ConfigurationSnapshot.VmName
      )
      if (-not $lifecycleShouldProcess.ShouldProcess(
          $mutationTarget,
          'Submit asynchronous Azure VM start'
        )) {
        return [pscustomobject]@{
          Plan = $plan
          InitialState = $observedState
          AuthenticationDeclined = $false
          MutationAccepted = $false
          MutationDeclined = $true
        }
      }

      Write-AzureDevLifecycleProgress `
        -Event submission `
        -Command start `
        -VmName $ConfigurationSnapshot.VmName `
        -Phase start-submission `
        -ObservedState $observedState `
        -Action start-requested
      try {
        $null = Invoke-AzCli `
          -Arguments @(
            'vm',
            'start',
            '--subscription',
            $ConfigurationSnapshot.SubscriptionId,
            '--resource-group',
            $ConfigurationSnapshot.ResourceGroup,
            '--name',
            $ConfigurationSnapshot.VmName,
            '--no-wait',
            '--output',
            'none',
            '--only-show-errors'
          ) `
          -TimeoutSeconds $azureCallTimeoutSeconds `
          -SuppressOutputDetails
      } catch {
        if (Test-AzureDevInterruption -ErrorObject $_) {
          throw
        }
        $submissionFailure = New-AzureDevLifecycleErrorRecord `
          -Phase start-submission `
          -Message (
            'Azure did not accept the targeted start request. ' +
            $_.Exception.Message
          ) `
          -Command start `
          -VmName $ConfigurationSnapshot.VmName `
          -ObservedState $observedState `
          -Action start-requested
        throw $submissionFailure
      }
    }

    return [pscustomobject]@{
      Plan = $plan
      InitialState = $observedState
      AuthenticationDeclined = $false
      MutationAccepted = [bool]$plan.SubmitMutation
      MutationDeclined = $false
    }
  }
  $contentionProgress = {
    Write-AzureDevLifecycleProgress `
      -Event contention `
      -Command start `
      -VmName $configuration.VmName `
      -Phase lock
  }
  $operation = $null
  try {
    $operation = Invoke-AzureDevLifecycleLock `
      -ConfigurationSnapshot $configuration `
      -CommandName start `
      -TimeoutSeconds $lockTimeoutSeconds `
      -OnContention $contentionProgress `
      -ScriptBlock $lockedDecision `
      -Confirm:$false
  } catch {
    if (Test-AzureDevInterruption -ErrorObject $_) {
      throw
    }
    & $completeStartLockFailure $_
  }

  if ($operation.AuthenticationDeclined -or $operation.MutationDeclined) {
    return
  }

  if ($operation.Plan.Decision -eq 'wait-stable-stop') {
    $stableState = $operation.InitialState
    Write-AzureDevLifecycleProgress `
      -Event wait-start `
      -Command start `
      -VmName $configuration.VmName `
      -Phase stable-stop-wait `
      -ObservedState $stableState `
      -Action none
    $stableWait = New-AzureDevLifecycleWait `
      -Timing $Timing `
      -Command start `
      -VmName $configuration.VmName `
      -Phase stable-stop-wait `
      -DeadlineMilliseconds $Timing.StableStopDeadlineMilliseconds `
      -ObservedState $stableState

    while ($operation.Plan.Decision -eq 'wait-stable-stop') {
      while ($stableState -in @('stopping', 'deallocating')) {
        $stablePoll = Invoke-AzureDevLifecycleWaitPoll -Wait $stableWait
        if ($stablePoll.DeadlineExpired) {
          & $completeStableStopTimeout `
            $stableState `
            ([Math]::Max(
              [long]0,
              [long](& $getMonotonicMilliseconds) - $attemptStartedAt
            ))
        }

        $nextStableState = Get-AzureDevLifecycleState `
          -Configuration $configuration `
          -TimeoutSeconds $azureCallTimeoutSeconds
        $stableStateObservedAt = [long](& $getMonotonicMilliseconds)
        $stableElapsedMilliseconds = [Math]::Max(
          [long]0,
          $stableStateObservedAt - $stableWait.StartedAt
        )
        if ($nextStableState -ne $stableState) {
          $stableState = $nextStableState
          $stableWait.ObservedState = $stableState
          Write-AzureDevLifecycleProgress `
            -Event state-change `
            -Command start `
            -VmName $configuration.VmName `
            -Phase stable-stop-wait `
            -ObservedState $stableState `
            -Action none `
            -ElapsedMilliseconds $stableElapsedMilliseconds
        }
        if ($stableStateObservedAt -ge $stableWait.DeadlineAt) {
          & $completeStableStopTimeout `
            $stableState `
            ([Math]::Max(
              [long]0,
              $stableStateObservedAt - $attemptStartedAt
            ))
        }
      }

      try {
        $operation = Invoke-AzureDevLifecycleLock `
          -ConfigurationSnapshot $configuration `
          -CommandName start `
          -TimeoutSeconds $lockTimeoutSeconds `
          -OnContention $contentionProgress `
          -ScriptBlock $lockedDecision `
          -Confirm:$false
      } catch {
        if (Test-AzureDevInterruption -ErrorObject $_) {
          throw
        }
        & $completeStartLockFailure $_
      }
      if ($operation.AuthenticationDeclined -or $operation.MutationDeclined) {
        return
      }
      $stableState = $operation.InitialState
      $stableWait.ObservedState = $stableState
    }
  }

  $terminalState = $operation.InitialState
  if ($operation.Plan.WaitForRunning) {
    Write-AzureDevLifecycleProgress `
      -Event wait-start `
      -Command start `
      -VmName $configuration.VmName `
      -Phase running-wait `
      -ObservedState $terminalState `
      -Action $operation.Plan.Action
    $wait = New-AzureDevLifecycleWait `
      -Timing $Timing `
      -Command start `
      -VmName $configuration.VmName `
      -Phase running-wait `
      -DeadlineMilliseconds $Timing.RunningDeadlineMilliseconds `
      -ObservedState $terminalState

    while ($terminalState -ne 'running') {
      $poll = Invoke-AzureDevLifecycleWaitPoll -Wait $wait
      if ($poll.DeadlineExpired) {
        & $completeRunningWaitTimeout `
          $terminalState `
          ([Math]::Max(
            [long]0,
            [long](& $getMonotonicMilliseconds) - $attemptStartedAt
          ))
      }

      $nextState = Get-AzureDevLifecycleState `
        -Configuration $configuration `
        -TimeoutSeconds $azureCallTimeoutSeconds
      $stateObservedAt = [long](& $getMonotonicMilliseconds)
      $stateElapsedMilliseconds = [Math]::Max(
        [long]0,
        $stateObservedAt - $wait.StartedAt
      )
      if ($nextState -ne $terminalState) {
        $terminalState = $nextState
        $wait.ObservedState = $terminalState
        Write-AzureDevLifecycleProgress `
          -Event state-change `
          -Command start `
          -VmName $configuration.VmName `
          -Phase running-wait `
          -ObservedState $terminalState `
          -Action $operation.Plan.Action `
          -ElapsedMilliseconds $stateElapsedMilliseconds
      }
      if ($stateObservedAt -ge $wait.DeadlineAt) {
        & $completeRunningWaitTimeout `
          $terminalState `
          ([Math]::Max([long]0, $stateObservedAt - $attemptStartedAt))
      }
      if ($terminalState -in @(
          'stopping',
          'deallocating',
          'stopped-allocated',
          'deallocated'
        )) {
        $interferenceFailure = New-AzureDevLifecycleErrorRecord `
          -Phase outside-interference `
          -Message (
            "Azure VM state '$terminalState' shows outside interference " +
            'after an upward transition began. Azure may still complete the ' +
            'earlier operation; no rollback or second start was submitted.'
          ) `
          -Command start `
          -VmName $configuration.VmName `
          -ObservedState $terminalState `
          -Action $operation.Plan.Action `
          -MutationAccepted $operation.MutationAccepted
        & $completeStartFailure `
          $interferenceFailure `
          ([Math]::Max([long]0, $stateObservedAt - $attemptStartedAt))
      }
      if ($terminalState -in @(
          'not-found',
          'unavailable',
          'creating',
          'unrecognized'
        )) {
        $waitPhase = if ($terminalState -eq 'not-found') {
          'not-found'
        } else {
          'running-wait'
        }
        $waitFailure = New-AzureDevLifecycleErrorRecord `
          -Phase $waitPhase `
          -Message (
            "Azure VM state '$terminalState' blocked the running wait. " +
            'Azure can still complete the earlier start operation; no ' +
            'rollback or second start was submitted.'
          ) `
          -Command start `
          -VmName $configuration.VmName `
          -ObservedState $terminalState `
          -Action $operation.Plan.Action `
          -MutationAccepted $operation.MutationAccepted
        & $completeStartFailure `
          $waitFailure `
          ([Math]::Max([long]0, $stateObservedAt - $attemptStartedAt))
      }
    }
  }

  Write-Host "SSH: ssh $($configuration.SshHostAlias)"
  Write-Host (
    'VS Code: code --remote ssh-remote+' +
    "$($configuration.SshHostAlias) /workspace"
  )
  $lifecycleResult = New-AzureDevLifecycleResult `
    -Command start `
    -Result $operation.Plan.Result `
    -VmName $configuration.VmName `
    -ObservedState running `
    -Action $operation.Plan.Action
  $completedAt = [long](& $getMonotonicMilliseconds)
  $successRecord = New-AzureDevLifecycleLogRecord `
    -Configuration $configuration `
    -LifecycleResult $lifecycleResult `
    -MutationAccepted $operation.MutationAccepted `
    -ElapsedMilliseconds (
      [Math]::Max([long]0, $completedAt - $attemptStartedAt)
    )
  return Complete-AzureDevLifecycleAttempt `
    -RepositoryRoot $configuration.RepoRoot `
    -Record $successRecord `
    -LifecycleResult $lifecycleResult `
    -Confirm:$false
}

Export-ModuleMember -Function Invoke-AzureDevLifecycleCommand
