#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Invoke-AzureDevLifecycleCommand' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Lifecycle'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    foreach ($module in @(
        'AzureDev.Config.psm1',
        'AzureDev.Logging.psm1',
        'AzureDev.Azure.psm1',
        'AzureDev.LifecycleLock.psm1',
        'AzureDev.Lifecycle.psm1'
      )) {
      Import-Module (
        Join-Path $script:repositoryRoot "scripts/azure-dev/$module"
      ) -Force -ErrorAction Stop
    }
    $PSDefaultParameterValues = @{
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }
    $script:configuration = New-Object `
      -TypeName System.Management.Automation.PSObject `
      -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = '11111111-1111-1111-1111-111111111111'
        ResourceGroup = 'integration-rg'
        VmName = 'integration-vm'
        TenantId = '22222222-2222-2222-2222-222222222222'
        ClientId = '33333333-3333-3333-3333-333333333333'
        ClientSecret = 'test-only-secret'
        SshHostAlias = 'integration-alias'
      }
    $script:configuration.PSObject.TypeNames.Insert(
      0,
      'AzureDev.LifecycleConfigurationSnapshot'
    )
    $script:newLifecycleTiming = {
      param(
        [System.Int64]$PollIntervalMilliseconds = 5000,
        [System.Int64]$LockDeadlineMilliseconds = 15000,
        [System.Int64]$AzureCallDeadlineMilliseconds = 120000,
        [System.Int64]$StableStopDeadlineMilliseconds = 600000,
        [System.Int64]$RunningDeadlineMilliseconds = 600000
      )

      $timing = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{
          PollIntervalMilliseconds = $PollIntervalMilliseconds
          HeartbeatIntervalMilliseconds = [System.Int64]30000
          LockDeadlineMilliseconds = $LockDeadlineMilliseconds
          AzureCallDeadlineMilliseconds = $AzureCallDeadlineMilliseconds
          StableStopDeadlineMilliseconds = $StableStopDeadlineMilliseconds
          RunningDeadlineMilliseconds = $RunningDeadlineMilliseconds
          GetMonotonicMilliseconds = { return $script:now }
          DelayMilliseconds = {
            param([System.Int64]$Milliseconds)
            $script:now += $Milliseconds
          }
        }
      $timing.PSObject.TypeNames.Insert(0, 'AzureDev.LifecycleTiming')
      return $timing
    }
  }

  BeforeEach {
    Mock Get-AzureDevLifecycleConfig -MockWith {
      return $script:configuration
    }
    Mock Connect-AzureDevLifecycleSession -MockWith { return $true }
    Mock Invoke-AzureDevLifecycleLock -ParameterFilter { $WhatIf }
    Mock Invoke-AzureDevLifecycleLock -ParameterFilter { -not $WhatIf } `
      -MockWith {
        return & $ScriptBlock $null $ConfigurationSnapshot
      }
    Mock Get-AzureDevLifecycleState -MockWith { return 'running' }
    Mock Invoke-AzCli
    Mock Complete-AzureDevLifecycleAttempt -MockWith {
      return $LifecycleResult
    }
  }

  AfterAll {
    @(
      'AzureDev.Lifecycle',
      'AzureDev.LifecycleLock',
      'AzureDev.Azure',
      'AzureDev.Logging',
      'AzureDev.Config'
    ) | ForEach-Object {
      Get-Module $_ -All | Remove-Module -Force
    }
  }

  Context 'When start or stop is previewed' {
    BeforeDiscovery {
      $commandCases = @(
        @{ CommandName = 'start' },
        @{ CommandName = 'stop' }
      )
    }

    It 'Should plan <CommandName> without observing live state or returning a result' `
      -ForEach $commandCases {
      $expectedCommandName = $CommandName
      $result = @(
        Invoke-AzureDevLifecycleCommand `
          -CommandName $CommandName `
          -RepositoryRoot $TestDrive `
          -EnvironmentFile 'lifecycle.env' `
          -WhatIf
      )

      $result.Count | Should-Be 0
      Should-Invoke Get-AzureDevLifecycleConfig -Exactly -Times 1 -Scope It `
        -ParameterFilter {
          $CommandName -ceq $expectedCommandName -and
          $RepositoryRoot -ceq $TestDrive -and
          $EnvironmentFile -ceq 'lifecycle.env'
        }
      Should-Invoke Connect-AzureDevLifecycleSession `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter { $WhatIf }
      Should-Invoke Invoke-AzureDevLifecycleLock `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter {
          $CommandName -ceq $expectedCommandName -and
          $WhatIf
        }
      Should-NotInvoke Get-AzureDevLifecycleState -Scope It
    }
  }

  Context 'When status is requested' {
    It 'Should report one immediate normalized observation without a lock' {
      $information = @()
      $result = @(
        Invoke-AzureDevLifecycleCommand `
          -CommandName status `
          -RepositoryRoot $TestDrive `
          -InformationVariable information
      )

      $result.Count | Should-Be 0
      @($information.MessageData.Message) |
        Should-ContainCollection 'Power state: running'
      Should-Invoke Connect-AzureDevLifecycleSession `
        -Exactly -Times 1 -Scope It
      Should-Invoke Get-AzureDevLifecycleState `
        -Exactly -Times 1 -Scope It
      Should-NotInvoke Invoke-AzureDevLifecycleLock -Scope It
    }
  }

  Context 'When lifecycle configuration cannot be loaded' {
    BeforeDiscovery {
      $configurationCommands = @(
        @{ CommandName = 'start'; ExpectedCommand = 'start' },
        @{ CommandName = 'stop'; ExpectedCommand = 'stop' },
        @{ CommandName = 'status'; ExpectedCommand = $null }
      )
    }

    BeforeEach {
      Mock Get-AzureDevLifecycleConfig -MockWith {
        throw 'configuration source failed'
      }
    }

    It 'Should expose a stable <CommandName> configuration failure without a record' `
      -ForEach $configurationCommands {
      $captured = $null
      try {
        $null = Invoke-AzureDevLifecycleCommand `
          -CommandName $CommandName `
          -RepositoryRoot $TestDrive
      } catch {
        $captured = $_
      }

      $captured.FullyQualifiedErrorId |
        Should-MatchString '^AzureDevLifecycleFailure\.configuration'
      $captured.TargetObject.PSObject.TypeNames[0] |
        Should-Be 'AzureDev.LifecycleFailure'
      $captured.TargetObject.Phase | Should-Be 'configuration'
      $captured.TargetObject.Command | Should-Be $ExpectedCommand
      $captured.TargetObject.VmName | Should-BeNull
      Should-NotInvoke Connect-AzureDevLifecycleSession -Scope It
      Should-NotInvoke Invoke-AzureDevLifecycleLock -Scope It
      Should-NotInvoke Complete-AzureDevLifecycleAttempt -Scope It
    }
  }

  Context 'When Azure CLI authentication repair is declined' {
    BeforeDiscovery {
      $declinedCommands = @(
        @{ CommandName = 'start' },
        @{ CommandName = 'stop' }
      )
    }

    BeforeEach {
      Mock Connect-AzureDevLifecycleSession -MockWith { return $false }
    }

    It 'Should abort <CommandName> without state, mutation, output, or a record' `
      -ForEach $declinedCommands {
      $information = @()
      $result = @(
        Invoke-AzureDevLifecycleCommand `
          -CommandName $CommandName `
          -RepositoryRoot $TestDrive `
          -InformationVariable information
      )

      $result.Count | Should-Be 0
      @(
        $information | Where-Object {
          $_.MessageData -is
            [System.Management.Automation.HostInformationMessage]
        }
      ).Count | Should-Be 0
      Should-Invoke Connect-AzureDevLifecycleSession `
        -Exactly -Times 1 -Scope It
      Should-NotInvoke Get-AzureDevLifecycleState -Scope It
      Should-NotInvoke Invoke-AzCli -Scope It
      Should-NotInvoke Complete-AzureDevLifecycleAttempt -Scope It
    }
  }

  Context 'When lifecycle execution is interrupted at a decisive boundary' {
    BeforeDiscovery {
      $interruptionCases = @(
        @{ CommandName = 'start'; Stage = 'lock' },
        @{ CommandName = 'start'; Stage = 'authentication' },
        @{ CommandName = 'start'; Stage = 'state-read' },
        @{ CommandName = 'start'; Stage = 'mutation' },
        @{ CommandName = 'stop'; Stage = 'lock' },
        @{ CommandName = 'stop'; Stage = 'authentication' },
        @{ CommandName = 'stop'; Stage = 'state-read' },
        @{ CommandName = 'stop'; Stage = 'mutation' }
      )
    }

    BeforeEach {
      $script:mockInterruption = [System.InvalidOperationException]::new(
        'wrapped interruption',
        [System.OperationCanceledException]::new('interrupted')
      )
      Mock Invoke-AzureDevLifecycleLock -ParameterFilter { -not $WhatIf } `
        -MockWith {
          if ($script:mockInterruptedStage -eq 'lock') {
            throw $script:mockInterruption
          }
          return & $ScriptBlock $null $ConfigurationSnapshot
        }
      Mock Connect-AzureDevLifecycleSession -MockWith {
        if ($script:mockInterruptedStage -eq 'authentication') {
          throw $script:mockInterruption
        }
        return $true
      }
      Mock Get-AzureDevLifecycleState -MockWith {
        if ($script:mockInterruptedStage -eq 'state-read') {
          throw $script:mockInterruption
        }
        if ($script:mockInterruptedStage -eq 'mutation') {
          if ($script:mockInterruptedCommand -eq 'start') {
            return 'deallocated'
          }
          return 'running'
        }
        return 'running'
      }
      Mock Invoke-AzCli -MockWith {
        if ($script:mockInterruptedStage -eq 'mutation') {
          throw $script:mockInterruption
        }
      }
    }

    It 'Should propagate <CommandName> <Stage> cancellation without a terminal record' `
      -ForEach $interruptionCases {
      $script:mockInterruptedCommand = $CommandName
      $script:mockInterruptedStage = $Stage
      $captured = $null
      try {
        $null = Invoke-AzureDevLifecycleCommand `
          -CommandName $CommandName `
          -RepositoryRoot $TestDrive
      } catch {
        $captured = $_
      }

      $captured.Exception.InnerException.GetType().FullName |
        Should-Be 'System.OperationCanceledException'
      Should-NotInvoke Complete-AzureDevLifecycleAttempt -Scope It
      if ($Stage -eq 'mutation') {
        Should-Invoke Invoke-AzCli -Exactly -Times 1 -Scope It
      } else {
        Should-NotInvoke Invoke-AzCli -Scope It
      }
    }
  }

  Context 'When stop state parsing is cancelled at the Azure CLI boundary' {
    BeforeEach {
      Mock Get-AzureDevLifecycleState -MockWith {
        $interruption = [System.OperationCanceledException]::new('interrupted')
        throw [System.InvalidOperationException]::new(
          'JSON parsing interrupted',
          $interruption
        )
      }
    }

    It 'Should propagate cancellation without submitting deallocation' {
      $captured = $null
      try {
        $null = Invoke-AzureDevLifecycleCommand `
          -CommandName stop `
          -RepositoryRoot $TestDrive
      } catch {
        $captured = $_
      }

      $captured.Exception.Message | Should-Be 'JSON parsing interrupted'
      $captured.Exception.InnerException.GetType().FullName |
        Should-Be 'System.OperationCanceledException'
      Should-NotInvoke Invoke-AzCli -Scope It
      Should-NotInvoke Complete-AzureDevLifecycleAttempt -Scope It
    }
  }

  Context 'When custom deadlines and lock contention reach orchestration' {
    BeforeDiscovery {
      $deadlineCases = @(
        @{ CommandName = 'start' },
        @{ CommandName = 'stop' }
      )
    }

    BeforeEach {
      $script:mockTimingStates =
        [System.Collections.Generic.Queue[System.String]]::new()
      Mock Invoke-AzureDevLifecycleLock -ParameterFilter { -not $WhatIf } `
        -MockWith {
          $null = & $OnContention
          return & $ScriptBlock $null $ConfigurationSnapshot
        }
      Mock Get-AzureDevLifecycleState -MockWith {
        return $script:mockTimingStates.Dequeue()
      }
    }

    It 'Should propagate rounded <CommandName> timeouts and one tagged contention event' `
      -ForEach $deadlineCases {
      if ($CommandName -eq 'start') {
        $script:mockTimingStates.Enqueue('deallocated')
        $script:mockTimingStates.Enqueue('running')
        $expectedStateReads = 2
      } else {
        $script:mockTimingStates.Enqueue('running')
        $expectedStateReads = 1
      }
      $script:now = [System.Int64]0
      $timing = & $script:newLifecycleTiming `
        -LockDeadlineMilliseconds 2301 `
        -AzureCallDeadlineMilliseconds 7001
      $information = @()

      $result = Invoke-AzureDevLifecycleCommand `
        -CommandName $CommandName `
        -RepositoryRoot $TestDrive `
        -Timing $timing `
        -InformationVariable information

      @($result).Count | Should-Be 1
      Should-Invoke Invoke-AzureDevLifecycleLock `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter { $TimeoutSeconds -eq 3 }
      Should-Invoke Connect-AzureDevLifecycleSession `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter { $TimeoutSeconds -eq 8 }
      Should-Invoke Get-AzureDevLifecycleState `
        -Exactly -Times $expectedStateReads -Scope It `
        -ParameterFilter { $TimeoutSeconds -eq 8 }
      Should-Invoke Invoke-AzCli -Exactly -Times 1 -Scope It `
        -ParameterFilter { $TimeoutSeconds -eq 8 }
      $contentionEvents = @(
        $information | Where-Object {
          $_.Tags -contains 'AzureDevLifecycleProgress' -and
          $_.Tags -contains 'contention'
        }
      )
      $contentionEvents.Count | Should-Be 1
      $contentionEvents[0].MessageData.Event | Should-Be 'contention'
      $contentionEvents[0].MessageData.Command | Should-Be $CommandName
      $contentionEvents[0].MessageData.Phase | Should-Be 'lock'
    }
  }

  Context 'When a real stop is requested' {
    BeforeAll {
      Mock Invoke-AzureDevStopCommand -MockWith {
        $result = [System.Management.Automation.PSObject][ordered]@{
          Command = 'stop'
          Result = 'already-deallocated'
          VmName = 'integration-vm'
          ObservedState = 'deallocated'
          Action = 'none'
        }
        $result.PSObject.TypeNames.Insert(0, 'AzureDev.LifecycleResult')
        return $result
      }
    }

    It 'Should delegate the validated immutable snapshot to stop orchestration' {
      $result = Invoke-AzureDevLifecycleCommand `
        -CommandName stop `
        -RepositoryRoot $TestDrive `
        -EnvironmentFile 'lifecycle.env'

      $result.Result | Should-Be 'already-deallocated'
      Should-Invoke Invoke-AzureDevStopCommand `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter { $Configuration -eq $script:configuration }
      Should-NotInvoke Connect-AzureDevLifecycleSession -Scope It
      Should-NotInvoke Invoke-AzureDevLifecycleLock -Scope It
      Should-NotInvoke Get-AzureDevLifecycleState -Scope It
    }
  }

  Context 'When start converges a stable or upward state' {
    BeforeDiscovery {
      $startCases = @(
        @{
          State = 'running'
          Result = 'already-running'
          Action = 'none'
          MutationCount = 0
        },
        @{
          State = 'starting'
          Result = 'running'
          Action = 'joined-start'
          MutationCount = 0
        },
        @{
          State = 'stopped-allocated'
          Result = 'running'
          Action = 'start-requested'
          MutationCount = 1
        },
        @{
          State = 'deallocated'
          Result = 'running'
          Action = 'start-requested'
          MutationCount = 1
        }
      )
    }

    BeforeEach {
      $script:mockStates = [System.Collections.Generic.Queue[System.String]]::new()
      $script:mockStates.Enqueue($State)
      if ($State -ne 'running') {
        $script:mockStates.Enqueue('running')
      }
      Mock Get-AzureDevLifecycleState -MockWith {
        return $script:mockStates.Dequeue()
      }
      $script:now = [System.Int64]0
    }

    It 'Should converge <State> with action <Action>' -ForEach $startCases {
      $timing = & $script:newLifecycleTiming
      $information = @()

      $resultObject = Invoke-AzureDevLifecycleCommand `
        -CommandName start `
        -RepositoryRoot $TestDrive `
        -Timing $timing `
        -InformationVariable information

      $resultObject.Result | Should-Be $Result
      $resultObject.Action | Should-Be $Action
      $resultObject.ObservedState | Should-Be 'running'
      Should-Invoke Invoke-AzCli -Exactly -Times $MutationCount -Scope It
      if ($MutationCount -eq 1) {
        Should-Invoke Invoke-AzCli -Exactly -Times 1 -Scope It `
          -ParameterFilter {
            @($Arguments) -join "`n" -ceq @(
              'vm',
              'start',
              '--subscription',
              '11111111-1111-1111-1111-111111111111',
              '--resource-group',
              'integration-rg',
              '--name',
              'integration-vm',
              '--no-wait',
              '--output',
              'none',
              '--only-show-errors'
            ) -join "`n" -and
            $TimeoutSeconds -eq 120 -and
            $SuppressOutputDetails
          }
      }
      $guidance = @(
        $information |
          Where-Object {
            $_.MessageData -is
              [System.Management.Automation.HostInformationMessage]
          } |
          ForEach-Object { $_.MessageData.Message }
      )
      $guidance | Should-ContainCollection 'SSH: ssh integration-alias'
      $guidance |
        Should-ContainCollection (
          'VS Code: code --remote ssh-remote+integration-alias /workspace'
        )
    }
  }

  Context 'When start first observes a downward transition' {
    BeforeEach {
      $script:mockStates =
        [System.Collections.Generic.Queue[System.String]]::new()
      $script:mockLockCalls = 0
      $script:mockLockHeld = $false
      $script:mockInterruptOnLockCall = 0
      $script:mockRepeatLastState = $false
      $script:mockConstantState = $null
      $script:mockThrowCompletionFailure = $false
      $script:mockInterruptAuthentication = $false
      $script:mockStateReadLockFacts =
        [System.Collections.Generic.List[System.Boolean]]::new()
      Mock Invoke-AzureDevLifecycleLock -ParameterFilter { -not $WhatIf } `
        -MockWith {
          $script:mockLockCalls++
          if (
            $script:mockLockCalls -eq $script:mockInterruptOnLockCall
          ) {
            throw [System.OperationCanceledException]::new('interrupted')
          }
          $script:mockLockHeld = $true
          try {
            return & $ScriptBlock $null $ConfigurationSnapshot
          } finally {
            $script:mockLockHeld = $false
          }
        }
      Mock Get-AzureDevLifecycleState -MockWith {
        $script:mockStateReadLockFacts.Add($script:mockLockHeld)
        if ($null -ne $script:mockConstantState) {
          return $script:mockConstantState
        }
        if (
          $script:mockRepeatLastState -and $script:mockStates.Count -eq 1
        ) {
          return $script:mockStates.Peek()
        }
        return $script:mockStates.Dequeue()
      }
      Mock Connect-AzureDevLifecycleSession -MockWith {
        if ($script:mockInterruptAuthentication) {
          throw [System.OperationCanceledException]::new('interrupted')
        }
        return $true
      }
      Mock Complete-AzureDevLifecycleAttempt -MockWith {
        if ($script:mockThrowCompletionFailure) {
          throw $Failure
        }
        return $LifecycleResult
      }
      Mock Write-AzureDevLifecycleProgress
      $script:now = [System.Int64]0
    }

    It 'Should wait unlocked, reacquire, reread, and submit one start' {
      @('stopping', 'deallocating', 'deallocated', 'deallocated', 'running') |
        ForEach-Object { $script:mockStates.Enqueue($_) }
      $timing = & $script:newLifecycleTiming

      $resultObject = Invoke-AzureDevLifecycleCommand `
        -CommandName start `
        -RepositoryRoot $TestDrive `
        -Timing $timing

      $resultObject.Result | Should-Be 'running'
      $resultObject.Action | Should-Be 'start-requested'
      $script:mockStateReadLockFacts | Should-BeCollection `
        $true, $false, $false, $true, $false
      Should-Invoke Invoke-AzureDevLifecycleLock `
        -Exactly -Times 2 -Scope It
      Should-Invoke Connect-AzureDevLifecycleSession `
        -Exactly -Times 2 -Scope It
      Should-Invoke Invoke-AzCli -Exactly -Times 1 -Scope It
    }

    It 'Should join a refreshed starting state without a mutation' {
      @('deallocating', 'deallocated', 'starting', 'running') |
        ForEach-Object { $script:mockStates.Enqueue($_) }
      $timing = & $script:newLifecycleTiming

      $resultObject = Invoke-AzureDevLifecycleCommand `
        -CommandName start `
        -RepositoryRoot $TestDrive `
        -Timing $timing

      $resultObject.Result | Should-Be 'running'
      $resultObject.Action | Should-Be 'joined-start'
      Should-Invoke Invoke-AzCli -Exactly -Times 0 -Scope It
    }

    It 'Should converge after another workstation starts between polls' {
      @('deallocating', 'starting', 'starting', 'running') |
        ForEach-Object { $script:mockStates.Enqueue($_) }
      $timing = & $script:newLifecycleTiming

      $resultObject = Invoke-AzureDevLifecycleCommand `
        -CommandName start `
        -RepositoryRoot $TestDrive `
        -Timing $timing

      $resultObject.Result | Should-Be 'running'
      $resultObject.Action | Should-Be 'joined-start'
      $script:mockStateReadLockFacts | Should-BeCollection `
        $true, $false, $true, $false
      Should-Invoke Invoke-AzCli -Exactly -Times 0 -Scope It
    }

    It 'Should accept a refreshed running state without a mutation' {
      @('stopping', 'stopped-allocated', 'running') |
        ForEach-Object { $script:mockStates.Enqueue($_) }
      $timing = & $script:newLifecycleTiming

      $resultObject = Invoke-AzureDevLifecycleCommand `
        -CommandName start `
        -RepositoryRoot $TestDrive `
        -Timing $timing

      $resultObject.Result | Should-Be 'already-running'
      $resultObject.Action | Should-Be 'none'
      Should-Invoke Invoke-AzCli -Exactly -Times 0 -Scope It
    }

    It 'Should use a stable-stop deadline independent of the running deadline' {
      @('stopping', 'deallocating', 'deallocating') |
        ForEach-Object { $script:mockStates.Enqueue($_) }
      $script:mockRepeatLastState = $true
      $script:mockThrowCompletionFailure = $true
      $timing = & $script:newLifecycleTiming `
        -StableStopDeadlineMilliseconds 10000 `
        -RunningDeadlineMilliseconds 90000

      {
        Invoke-AzureDevLifecycleCommand `
          -CommandName start `
          -RepositoryRoot $TestDrive `
          -Timing $timing
      } | Should-Throw -ExceptionMessage '*stable stopped state within ten minutes*'

      $script:now | Should-Be 10000
      Should-Invoke Invoke-AzureDevLifecycleLock `
        -Exactly -Times 1 -Scope It
      Should-Invoke Invoke-AzCli -Exactly -Times 0 -Scope It
      Should-Invoke Complete-AzureDevLifecycleAttempt `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter {
          $Failure.TargetObject.Phase -ceq 'stable-stop-wait' -and
          $Record.elapsedMilliseconds -eq 10000
        }
    }

    It 'Should propagate interruption without a result or terminal record' {
      @('stopping') | ForEach-Object { $script:mockStates.Enqueue($_) }
      $timing = & $script:newLifecycleTiming
      $timing.DelayMilliseconds = {
        throw [System.OperationCanceledException]::new('interrupted')
      }

      {
        Invoke-AzureDevLifecycleCommand `
          -CommandName start `
          -RepositoryRoot $TestDrive `
          -Timing $timing
      } | Should-Throw -ExceptionMessage '*interrupted*'

      $script:mockLockHeld | Should-BeFalse
      Should-Invoke Invoke-AzureDevLifecycleLock `
        -Exactly -Times 1 -Scope It
      Should-Invoke Invoke-AzCli -Exactly -Times 0 -Scope It
      Should-Invoke Complete-AzureDevLifecycleAttempt `
        -Exactly -Times 0 -Scope It
    }

    It 'Should release an owned lock after authentication is interrupted' {
      $script:mockInterruptAuthentication = $true
      $timing = & $script:newLifecycleTiming

      {
        Invoke-AzureDevLifecycleCommand `
          -CommandName start `
          -RepositoryRoot $TestDrive `
          -Timing $timing
      } | Should-Throw -ExceptionMessage '*interrupted*'

      $script:mockLockHeld | Should-BeFalse
      Should-Invoke Invoke-AzureDevLifecycleLock `
        -Exactly -Times 1 -Scope It
      Should-Invoke Get-AzureDevLifecycleState `
        -Exactly -Times 0 -Scope It
      Should-Invoke Complete-AzureDevLifecycleAttempt `
        -Exactly -Times 0 -Scope It
    }

    It 'Should propagate interruption while reacquiring without a terminal record' {
      @('stopping', 'deallocated') |
        ForEach-Object { $script:mockStates.Enqueue($_) }
      $script:mockInterruptOnLockCall = 2
      $timing = & $script:newLifecycleTiming

      {
        Invoke-AzureDevLifecycleCommand `
          -CommandName start `
          -RepositoryRoot $TestDrive `
          -Timing $timing
      } | Should-Throw -ExceptionMessage '*interrupted*'

      Should-Invoke Invoke-AzureDevLifecycleLock `
        -Exactly -Times 2 -Scope It
      Should-Invoke Invoke-AzCli -Exactly -Times 0 -Scope It
      Should-Invoke Complete-AzureDevLifecycleAttempt `
        -Exactly -Times 0 -Scope It
    }

    It 'Should report stable-stop heartbeats on virtual 30-second boundaries' {
      $script:mockConstantState = 'stopping'
      $script:mockThrowCompletionFailure = $true
      $timing = & $script:newLifecycleTiming `
        -StableStopDeadlineMilliseconds 60000

      {
        Invoke-AzureDevLifecycleCommand `
          -CommandName start `
          -RepositoryRoot $TestDrive `
          -Timing $timing
      } | Should-Throw -ExceptionMessage '*stable stopped state*'

      $script:now | Should-Be 60000
      Should-Invoke Write-AzureDevLifecycleProgress `
        -Exactly -Times 2 -Scope It `
        -ParameterFilter {
          $Event -ceq 'heartbeat' -and
          $Phase -ceq 'stable-stop-wait'
        }
      Should-Invoke Get-AzureDevLifecycleState `
        -Exactly -Times 12 -Scope It
    }
  }

  Context 'When an upward transition is externally reversed' {
    BeforeDiscovery {
      $interferenceCases = @(
        @{
          InitialState = 'deallocated'
          DownwardState = 'stopping'
          Mutations = 1
        },
        @{
          InitialState = 'deallocated'
          DownwardState = 'deallocating'
          Mutations = 1
        },
        @{
          InitialState = 'starting'
          DownwardState = 'stopped-allocated'
          Mutations = 0
        },
        @{
          InitialState = 'starting'
          DownwardState = 'deallocated'
          Mutations = 0
        }
      )
    }

    BeforeEach {
      $script:mockStates =
        [System.Collections.Generic.Queue[System.String]]::new()
      Mock Get-AzureDevLifecycleState -MockWith {
        return $script:mockStates.Dequeue()
      }
      Mock Complete-AzureDevLifecycleAttempt -MockWith { throw $Failure }
      $script:now = [System.Int64]0
    }

    It 'Should fail a later <DownwardState> without a second start' `
      -ForEach $interferenceCases {
      $script:mockStates.Enqueue($InitialState)
      $script:mockStates.Enqueue($DownwardState)
      $timing = & $script:newLifecycleTiming

      {
        Invoke-AzureDevLifecycleCommand `
          -CommandName start `
          -RepositoryRoot $TestDrive `
          -Timing $timing
      } | Should-Throw -ExceptionMessage (
        '*outside interference*Azure may still complete the earlier operation*'
      )

      Should-Invoke Invoke-AzCli -Exactly -Times $Mutations -Scope It
      Should-Invoke Complete-AzureDevLifecycleAttempt `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter {
          $Failure.TargetObject.Phase -ceq 'outside-interference' -and
          $Failure.TargetObject.ObservedState -ceq $DownwardState
        }
    }
  }

  Context 'When start cannot safely choose an action' {
    BeforeDiscovery {
      $failureCases = @(
        @{ State = 'not-found'; Phase = 'not-found' },
        @{ State = 'unavailable'; Phase = 'state-read' },
        @{ State = 'creating'; Phase = 'state-read' },
        @{ State = 'unrecognized'; Phase = 'state-read' }
      )
    }

    BeforeEach {
      Mock Get-AzureDevLifecycleState -MockWith { return $State }
      Mock Complete-AzureDevLifecycleAttempt -MockWith { throw $Failure }
    }

    It 'Should fail <State> without mutation' -ForEach $failureCases {
      {
        Invoke-AzureDevLifecycleCommand `
          -CommandName start `
          -RepositoryRoot $TestDrive
      } | Should-Throw -ExceptionMessage "*$State*"
      Should-NotInvoke Invoke-AzCli -Scope It
      Should-Invoke Complete-AzureDevLifecycleAttempt `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter { $Failure.TargetObject.Phase -ceq $Phase }
    }
  }

  Context 'When an existing start does not finish by the deadline' {
    BeforeEach {
      $script:mockStateReads = 0
      Mock Get-AzureDevLifecycleState -MockWith {
        $script:mockStateReads++
        if ($script:mockStateReads -eq 1) {
          $script:now += 10000
        }
        return 'starting'
      }
      Mock Complete-AzureDevLifecycleAttempt -MockWith { throw $Failure }
      Mock Write-AzureDevLifecycleProgress
      $script:now = [System.Int64]0
    }

    It 'Should use virtual five-second polls and 30-second heartbeats' {
      $timing = & $script:newLifecycleTiming
      {
        Invoke-AzureDevLifecycleCommand `
          -CommandName start `
          -RepositoryRoot $TestDrive `
          -Timing $timing
      } | Should-Throw -ExceptionMessage (
        '*did not reach running within ten minutes*can still complete*'
      )

      $script:now | Should-Be 610000
      Should-Invoke Write-AzureDevLifecycleProgress `
        -Exactly -Times 20 -Scope It `
        -ParameterFilter { $Event -ceq 'heartbeat' }
      Should-Invoke Write-AzureDevLifecycleProgress `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter {
          $Event -ceq 'heartbeat' -and
          $ElapsedMilliseconds -eq 600000
        }
      Should-Invoke Get-AzureDevLifecycleState `
        -Exactly -Times 120 -Scope It
      Should-NotInvoke Invoke-AzCli -Scope It
      Should-Invoke Complete-AzureDevLifecycleAttempt `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter {
          $Failure.TargetObject.Phase -ceq 'running-wait' -and
          $Failure.TargetObject.Action -ceq 'joined-start' -and
          -not $Failure.TargetObject.MutationAccepted -and
          $Record.elapsedMilliseconds -eq 610000
        }
    }
  }

  Context 'When a state read completes after the running deadline' {
    BeforeEach {
      $script:mockStateReads = 0
      $script:now = [System.Int64]0
      Mock Get-AzureDevLifecycleState -MockWith {
        $script:mockStateReads++
        if ($script:mockStateReads -eq 1) {
          return 'starting'
        }
        $script:now += 2000
        return 'running'
      }
      Mock Complete-AzureDevLifecycleAttempt -MockWith { throw $Failure }
    }

    It 'Should time out rather than accept a late running observation' {
      $timing = & $script:newLifecycleTiming `
        -PollIntervalMilliseconds 599000

      {
        Invoke-AzureDevLifecycleCommand `
          -CommandName start `
          -RepositoryRoot $TestDrive `
          -Timing $timing
      } | Should-Throw -ExceptionMessage '*did not reach running within*'

      $script:now | Should-Be 601000
      Should-Invoke Complete-AzureDevLifecycleAttempt `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter {
          $Failure.TargetObject.Phase -ceq 'running-wait' -and
          $Failure.TargetObject.ObservedState -ceq 'running' -and
          $Record.elapsedMilliseconds -eq 601000
        }
    }
  }
}
