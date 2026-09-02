#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Enter-AzureDevLifecycleMutex' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.LifecycleLock'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.LifecycleLock.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When an isolated wait adapter is supplied' {
    It 'Should return its immediate acquisition result' {
      $mockMutex = New-Object -TypeName System.Management.Automation.PSObject
      $mockWait = { $true }

      $owned = InModuleScope `
        -Parameters @{ MockMutex = $mockMutex; MockWait = $mockWait } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Enter-AzureDevLifecycleMutex `
            -Mutex $MockMutex `
            -WaitAdapter $MockWait
        }

      $owned | Should-BeTrue
    }

    It 'Should treat an abandoned mutex as acquired ownership' {
      $mockMutex = New-Object -TypeName System.Management.Automation.PSObject
      $mockWait = {
        throw [System.Threading.AbandonedMutexException]::new()
      }

      $owned = InModuleScope `
        -Parameters @{ MockMutex = $mockMutex; MockWait = $mockWait } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Enter-AzureDevLifecycleMutex `
            -Mutex $MockMutex `
            -WaitAdapter $MockWait
        }

      $owned | Should-BeTrue
    }

    It 'Should not call the wait adapter during preview' {
      $mockMutex = New-Object -TypeName System.Management.Automation.PSObject
      $mockState = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        Calls = 0
      }
      $mockWait = { $mockState.Calls++ }.GetNewClosure()

      $owned = InModuleScope `
        -Parameters @{ MockMutex = $mockMutex; MockWait = $mockWait } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Enter-AzureDevLifecycleMutex `
            -Mutex $MockMutex `
            -WaitAdapter $MockWait `
            -WhatIf
        }

      $owned | Should-BeFalse
      $mockState.Calls | Should-Be 0
    }
  }
}
