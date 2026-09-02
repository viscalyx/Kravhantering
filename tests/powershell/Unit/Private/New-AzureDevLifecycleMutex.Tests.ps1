#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'New-AzureDevLifecycleMutex' -Tag 'Unit' {
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

  Context 'When an isolated factory is supplied' {
    It 'Should return the factory mutex without creating a process-wide mutex' {
      $mockMutex = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        Name = 'isolated-mutex'
      }
      $mockState = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        Calls = 0
      }
      $mockFactory = {
        $mockState.Calls++
        $mockMutex
      }.GetNewClosure()

      $result = InModuleScope `
        -Parameters @{ MockFactory = $mockFactory } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          New-AzureDevLifecycleMutex `
            -Name '0123456789abcdef' `
            -Factory $MockFactory
        }

      [System.Object]::ReferenceEquals($result, $mockMutex) |
        Should-BeTrue
      $mockState.Calls | Should-Be 1
    }

    It 'Should not call the factory during preview' {
      $mockState = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        Calls = 0
      }
      $mockFactory = {
        $mockState.Calls++
      }.GetNewClosure()

      $result = InModuleScope `
        -Parameters @{ MockFactory = $mockFactory } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          New-AzureDevLifecycleMutex `
            -Name '0123456789abcdef' `
            -Factory $MockFactory `
            -WhatIf
        }

      $result | Should-BeNull
      $mockState.Calls | Should-Be 0
    }
  }
}
