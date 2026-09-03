#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Invoke-AzureDevStopCommand' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Lifecycle'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    foreach ($module in @(
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
      'InModuleScope:ModuleName' = $script:moduleName
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
    }
    $script:configuration = [System.Management.Automation.PSObject]@{
      RepoRoot = $TestDrive
      SubscriptionId = '11111111-1111-1111-1111-111111111111'
      ResourceGroup = 'integration-rg'
      VmName = 'integration-vm'
    }
    $script:configuration.PSObject.TypeNames.Insert(
      0,
      'AzureDev.LifecycleConfigurationSnapshot'
    )
    Mock Invoke-AzureDevLifecycleLock -MockWith {
      $script:mockLockInvocationCount++
      if ($null -ne $script:mockLockFailure) {
        throw $script:mockLockFailure
      }
      if ($script:mockReportContention -and $null -ne $OnContention) {
        $null = & $OnContention
      }
      $script:mockLockHeld = $true
      try {
        return & $ScriptBlock $null $ConfigurationSnapshot
      } finally {
        $script:mockLockHeld = $false
      }
    }
    Mock Invoke-AzureDevStopLifecycle -MockWith {
      $script:mockStopLifecycleInvocationCount++
      $script:mockAzureCallTimeoutSeconds = $AzureCallTimeoutSeconds
      $result = [System.Management.Automation.PSObject][ordered]@{
        Command = 'stop'
        Result = 'requested'
        VmName = 'integration-vm'
        ObservedState = 'running'
        Action = 'deallocation-requested'
      }
      $result.PSObject.TypeNames.Insert(0, 'AzureDev.LifecycleResult')
      return $result
    }
    Mock Write-AzureDevLifecycleLogRecord -MockWith {
      $script:mockLogWriteInvocationCount++
      $script:mockLockHeldAtLogWrite = $script:mockLockHeld
      $script:mockCapturedRecord = $Record
    }
  }

  BeforeEach {
    $script:mockLockHeld = $false
    $script:mockLockHeldAtLogWrite = $null
    $script:mockCapturedRecord = $null
    $script:mockLockInvocationCount = 0
    $script:mockStopLifecycleInvocationCount = 0
    $script:mockLogWriteInvocationCount = 0
    $script:mockLockFailure = $null
    $script:mockReportContention = $false
    $script:mockAzureCallTimeoutSeconds = $null
  }

  AfterAll {
    @(
      'AzureDev.Lifecycle',
      'AzureDev.LifecycleLock',
      'AzureDev.Azure',
      'AzureDev.Logging'
    ) | ForEach-Object {
      Get-Module $_ -All | Remove-Module -Force
    }
  }

  Context 'When guarded stop work succeeds' {
    It 'Should complete one result and one terminal record after lock release' {
      $timing = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        New-AzureDevLifecycleTiming -GetMonotonicMilliseconds {
          return [System.Int64]100
        }
      }

      $result = InModuleScope -Parameters @{
        Configuration = $script:configuration
        Timing = $timing
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Invoke-AzureDevStopCommand `
          -Configuration $Configuration `
          -Timing $Timing
      }

      @($result).Count | Should-Be 1
      $result.PSObject.TypeNames[0] | Should-Be 'AzureDev.LifecycleResult'
      $result.Result | Should-Be 'requested'
      $script:mockLockHeldAtLogWrite | Should-BeFalse
      $script:mockCapturedRecord.command | Should-Be 'stop'
      $script:mockCapturedRecord.terminalResult | Should-Be 'requested'
      $script:mockCapturedRecord.mutationAccepted | Should-BeTrue
      $script:mockCapturedRecord.elapsedMilliseconds | Should-Be 0
      Should-Invoke Invoke-AzureDevLifecycleLock `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter {
          $CommandName -ceq 'stop' -and
          $ConfigurationSnapshot -eq $script:configuration
        }
      Should-Invoke Write-AzureDevLifecycleLogRecord `
        -Exactly -Times 1 -Scope It
    }
  }

  Context 'When the outer stop operation is denied' {
    It 'Should not acquire a lock, execute stop work, log, or return a result' {
      $result = @(
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          Invoke-AzureDevStopCommand `
            -Configuration $Configuration `
            -WhatIf
        }
      )

      $result.Count | Should-Be 0
      $script:mockLockInvocationCount | Should-Be 0
      $script:mockStopLifecycleInvocationCount | Should-Be 0
      $script:mockLogWriteInvocationCount | Should-Be 0
    }
  }

  Context 'When guarded stop work reports a lifecycle failure' {
    It 'Should classify lock failure and retain owner recovery guidance' {
      $script:mockLockFailure = (
        'lock held by pid 123; inspect the owner before recovery'
      )

      $captured = $null
      try {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          $null = Invoke-AzureDevStopCommand -Configuration $Configuration
        }
      } catch {
        $captured = $_
      }

      $captured.TargetObject.Phase | Should-Be 'lock'
      $captured.Exception.Message | Should-MatchString 'pid 123'
      $script:mockLockHeldAtLogWrite | Should-BeFalse
      $script:mockCapturedRecord.failurePhase | Should-Be 'lock'
      Should-Invoke Write-AzureDevLifecycleLogRecord `
        -Exactly -Times 1 -Scope It
    }

    It 'Should propagate lock cancellation without writing a terminal record' {
      $script:mockLockFailure = [System.InvalidOperationException]::new(
        'wrapped interruption',
        [System.OperationCanceledException]::new('interrupted')
      )

      $captured = $null
      try {
        InModuleScope -Parameters @{
          Configuration = $script:configuration
        } -ScriptBlock {
          Set-StrictMode -Version 1.0
          $null = Invoke-AzureDevStopCommand -Configuration $Configuration
        }
      } catch {
        $captured = $_
      }

      $captured.Exception.InnerException.GetType().FullName |
        Should-Be 'System.OperationCanceledException'
      $script:mockLogWriteInvocationCount | Should-Be 0
      Should-Invoke Invoke-AzureDevLifecycleLock `
        -Exactly -Times 1 -Scope It
    }
  }

  Context 'When stop uses non-default lifecycle deadlines' {
    BeforeAll {
      Mock Write-AzureDevLifecycleProgress
    }

    It 'Should round up deadlines and emit one contention event' {
      $script:mockReportContention = $true
      $timing = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $contract = New-AzureDevLifecycleTiming -GetMonotonicMilliseconds {
          return [System.Int64]100
        }
        $contract.LockDeadlineMilliseconds = [System.Int64]2301
        $contract.AzureCallDeadlineMilliseconds = [System.Int64]7001
        return $contract
      }

      $result = InModuleScope -Parameters @{
        Configuration = $script:configuration
        Timing = $timing
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Invoke-AzureDevStopCommand `
          -Configuration $Configuration `
          -Timing $Timing
      }

      $result.Result | Should-Be 'requested'
      $script:mockAzureCallTimeoutSeconds | Should-Be 8
      Should-Invoke Invoke-AzureDevLifecycleLock `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter { $TimeoutSeconds -eq 3 }
      Should-Invoke Write-AzureDevLifecycleProgress `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter {
          $Event -ceq 'contention' -and
          $Command -ceq 'stop' -and
          $Phase -ceq 'lock'
        }
    }
  }
}
