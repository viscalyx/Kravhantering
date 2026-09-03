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
    Mock Get-AzureDevLifecycleConfig -MockWith {
      return $script:configuration
    }
    Mock Connect-AzureDevLifecycleSession
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

    It 'Should converge <State> with action <Action>' -ForEach $startCases {
      $script:states = [System.Collections.Generic.Queue[string]]::new()
      $script:states.Enqueue($State)
      if ($State -ne 'running') {
        $script:states.Enqueue('running')
      }
      Mock Get-AzureDevLifecycleState -MockWith {
        return $script:states.Dequeue()
      }
      $script:now = [long]0
      $timing = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        PollIntervalMilliseconds = [long]5000
        HeartbeatIntervalMilliseconds = [long]30000
        LockDeadlineMilliseconds = [long]15000
        AzureCallDeadlineMilliseconds = [long]120000
        StableStopDeadlineMilliseconds = [long]600000
        RunningDeadlineMilliseconds = [long]600000
        GetMonotonicMilliseconds = { return $script:now }
        DelayMilliseconds = { param([long]$Milliseconds) $script:now += $Milliseconds }
      }
      $timing.PSObject.TypeNames.Insert(0, 'AzureDev.LifecycleTiming')
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
      @($information.MessageData.Message) |
        Should-ContainCollection 'SSH: ssh integration-alias'
      @($information.MessageData.Message) |
        Should-ContainCollection (
          'VS Code: code --remote ssh-remote+integration-alias /workspace'
        )
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

    It 'Should fail <State> without mutation' -ForEach $failureCases {
      Mock Get-AzureDevLifecycleState -MockWith { return $State }
      Mock Complete-AzureDevLifecycleAttempt -MockWith { throw $Failure }

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
    It 'Should use virtual five-second polls and 30-second heartbeats' {
      Mock Get-AzureDevLifecycleState -MockWith { return 'starting' }
      Mock Complete-AzureDevLifecycleAttempt -MockWith { throw $Failure }
      Mock Write-AzureDevLifecycleProgress
      $script:now = [long]0
      $timing = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        PollIntervalMilliseconds = [long]5000
        HeartbeatIntervalMilliseconds = [long]30000
        LockDeadlineMilliseconds = [long]15000
        AzureCallDeadlineMilliseconds = [long]120000
        StableStopDeadlineMilliseconds = [long]600000
        RunningDeadlineMilliseconds = [long]600000
        GetMonotonicMilliseconds = { return $script:now }
        DelayMilliseconds = { param([long]$Milliseconds) $script:now += $Milliseconds }
      }
      $timing.PSObject.TypeNames.Insert(0, 'AzureDev.LifecycleTiming')
      {
        Invoke-AzureDevLifecycleCommand `
          -CommandName start `
          -RepositoryRoot $TestDrive `
          -Timing $timing
      } | Should-Throw -ExceptionMessage (
        '*did not reach running within ten minutes*can still complete*'
      )

      $script:now | Should-Be 600000
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
          -not $Failure.TargetObject.MutationAccepted
        }
    }
  }
}
