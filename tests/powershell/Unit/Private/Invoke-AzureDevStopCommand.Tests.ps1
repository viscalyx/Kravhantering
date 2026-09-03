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
  }

  BeforeEach {
    $script:lockHeld = $false
    $script:lockHeldAtLogWrite = $null
    $script:capturedRecord = $null
    Mock Invoke-AzureDevLifecycleLock -MockWith {
      $script:lockHeld = $true
      try {
        return & $ScriptBlock $null $ConfigurationSnapshot
      } finally {
        $script:lockHeld = $false
      }
    }
    Mock Invoke-AzureDevStopLifecycle -MockWith {
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
      $script:lockHeldAtLogWrite = $script:lockHeld
      $script:capturedRecord = $Record
    }
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
          return [long]100
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
      $script:lockHeldAtLogWrite | Should-BeFalse
      $script:capturedRecord.command | Should-Be 'stop'
      $script:capturedRecord.terminalResult | Should-Be 'requested'
      $script:capturedRecord.mutationAccepted | Should-BeTrue
      $script:capturedRecord.elapsedMilliseconds | Should-Be 0
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

  Context 'When guarded stop work reports a lifecycle failure' {
    It 'Should classify lock failure and retain owner recovery guidance' {
      Mock Invoke-AzureDevLifecycleLock -MockWith {
        throw 'lock held by pid 123; inspect the owner before recovery'
      }

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
      $script:lockHeldAtLogWrite | Should-BeFalse
      $script:capturedRecord.failurePhase | Should-Be 'lock'
      Should-Invoke Write-AzureDevLifecycleLogRecord `
        -Exactly -Times 1 -Scope It
    }
  }
}
