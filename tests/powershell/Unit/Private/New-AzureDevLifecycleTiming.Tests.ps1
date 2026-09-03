#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'New-AzureDevLifecycleTiming' -Tag 'Unit' {
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

  Context 'When deterministic seams are supplied' {
    It 'Should expose fixed intervals and use virtual monotonic time and delay' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $script:virtualMilliseconds = 125
        Set-StrictMode -Version 1.0
        $timing = New-AzureDevLifecycleTiming `
          -GetMonotonicMilliseconds {
            return $script:virtualMilliseconds
          } `
          -DelayMilliseconds {
            param([System.Int64]$Milliseconds)
            $script:virtualMilliseconds += $Milliseconds
          }

        $timing.PollIntervalMilliseconds | Should-Be 5000
        $timing.HeartbeatIntervalMilliseconds | Should-Be 30000
        $timing.LockDeadlineMilliseconds | Should-Be 15000
        $timing.AzureCallDeadlineMilliseconds | Should-Be 120000
        $timing.StableStopDeadlineMilliseconds | Should-Be 600000
        $timing.RunningDeadlineMilliseconds | Should-Be 600000
        (& $timing.GetMonotonicMilliseconds) | Should-Be 125

        $null = & $timing.DelayMilliseconds 5000

        (& $timing.GetMonotonicMilliseconds) | Should-Be 5125
      }
    }
  }

  Context 'When production seams are used' {
    It 'Should expose a monotonic value independent of wall-clock representation' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $timing = New-AzureDevLifecycleTiming

        $first = & $timing.GetMonotonicMilliseconds
        $second = & $timing.GetMonotonicMilliseconds

        ($first -is [System.Int64]) | Should-BeTrue
        ($second -ge $first) | Should-BeTrue
      }
    }
  }
}
