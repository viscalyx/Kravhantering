#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'New-AzureDevLifecycleWait' -Tag 'Unit' {
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

  Context 'When a lifecycle wait begins' {
    It 'Should derive its deadline and first heartbeat from monotonic time' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $timing = New-AzureDevLifecycleTiming `
          -GetMonotonicMilliseconds { return [long]7500 } `
          -DelayMilliseconds { param([long]$Milliseconds) }

        $wait = New-AzureDevLifecycleWait `
          -Timing $timing `
          -Command start `
          -VmName 'krav-dev-vm' `
          -Phase running-wait `
          -DeadlineMilliseconds $timing.RunningDeadlineMilliseconds `
          -ObservedState starting

        $wait.PSObject.TypeNames[0] | Should-Be 'AzureDev.LifecycleWait'
        $wait.StartedAt | Should-Be 7500
        $wait.DeadlineAt | Should-Be 607500
        $wait.NextHeartbeatAt | Should-Be 37500
      }
    }
  }
}
