#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Invoke-AzureDevLifecycleWaitPoll' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Lifecycle'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Lifecycle.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When virtual time advances through a running wait' {
    It 'Should poll every five seconds and heartbeat every thirty seconds' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $script:virtualMilliseconds = [System.Int64]0
        $script:delays = [System.Collections.Generic.List[System.Int64]]::new()
        $timing = New-AzureDevLifecycleTiming `
          -GetMonotonicMilliseconds {
            return $script:virtualMilliseconds
          } `
          -DelayMilliseconds {
            param([System.Int64]$Milliseconds)
            $script:delays.Add($Milliseconds)
            $script:virtualMilliseconds += $Milliseconds
          }
        $wait = New-AzureDevLifecycleWait `
          -Timing $timing `
          -Command start `
          -VmName 'krav-dev-vm' `
          -Phase running-wait `
          -DeadlineMilliseconds $timing.RunningDeadlineMilliseconds `
          -ObservedState starting
        $information = @()

        $polls = @(
          1..120 | ForEach-Object {
            Set-StrictMode -Version 1.0
            Invoke-AzureDevLifecycleWaitPoll `
              -Wait $wait `
              -InformationVariable +information
          }
        )

        $script:delays.Count | Should-Be 120
        $script:delays | Should-All { $_ -eq 5000 }
        $information.Count | Should-Be 20
        $information[0].MessageData.ElapsedMilliseconds | Should-Be 30000
        $information[-1].MessageData.ElapsedMilliseconds | Should-Be 600000
        $polls[-2].DeadlineExpired | Should-BeFalse
        $polls[-1].DeadlineExpired | Should-BeTrue
        $polls[-1].ElapsedMilliseconds | Should-Be 600000
      }
    }
  }

  Context 'When a poll skips more than one heartbeat boundary' {
    It 'Should report current elapsed time once and advance the next boundary' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $script:virtualMilliseconds = [System.Int64]0
        $timing = New-AzureDevLifecycleTiming `
          -GetMonotonicMilliseconds {
            return $script:virtualMilliseconds
          } `
          -DelayMilliseconds {
            param([System.Int64]$Milliseconds)
            $script:virtualMilliseconds += 65000
          }
        $wait = New-AzureDevLifecycleWait `
          -Timing $timing `
          -Command stop `
          -VmName 'krav-dev-vm' `
          -Phase stable-stop-wait `
          -DeadlineMilliseconds $timing.StableStopDeadlineMilliseconds `
          -ObservedState stopping
        $information = @()

        Set-StrictMode -Version 1.0
        $poll = Invoke-AzureDevLifecycleWaitPoll `
          -Wait $wait `
          -InformationVariable information

        $information.Count | Should-Be 1
        $information[0].MessageData.ElapsedMilliseconds | Should-Be 65000
        $wait.NextHeartbeatAt | Should-Be 90000
        $poll.DeadlineExpired | Should-BeFalse
      }
    }
  }

  Context 'When the wait is not a lifecycle wait contract' {
    It 'Should reject the poll before delaying' {
      InModuleScope -ScriptBlock {
        {
          Set-StrictMode -Version 1.0
          $null = Invoke-AzureDevLifecycleWaitPoll `
            -Wait ([System.Management.Automation.PSObject]@{})
        } | Should-Throw -ExceptionMessage '*lifecycle wait contract*'
      }
    }
  }
}
