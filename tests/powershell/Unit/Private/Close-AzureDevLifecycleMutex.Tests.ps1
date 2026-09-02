#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Close-AzureDevLifecycleMutex' -Tag 'Unit' {
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

  Context 'When isolated close adapters are supplied' {
    BeforeEach {
      $script:mockMutex = New-Object -TypeName System.Management.Automation.PSObject
      $script:mockState = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{ Releases = 0; Disposals = 0 }
      $script:mockRelease = {
        $script:mockState.Releases++
      }
      $script:mockDispose = {
        $script:mockState.Disposals++
      }
    }

    It 'Should release an owned mutex and always dispose it' {
      $null = InModuleScope `
        -Parameters @{
          MockMutex = $script:mockMutex
          MockRelease = $script:mockRelease
          MockDispose = $script:mockDispose
        } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Close-AzureDevLifecycleMutex `
            -Mutex $MockMutex `
            -Owned `
            -ReleaseAdapter $MockRelease `
            -DisposeAdapter $MockDispose
        }

      $script:mockState.Releases | Should-Be 1
      $script:mockState.Disposals | Should-Be 1
    }

    It 'Should dispose an unowned mutex without releasing it' {
      $null = InModuleScope `
        -Parameters @{
          MockMutex = $script:mockMutex
          MockRelease = $script:mockRelease
          MockDispose = $script:mockDispose
        } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Close-AzureDevLifecycleMutex `
            -Mutex $MockMutex `
            -ReleaseAdapter $MockRelease `
            -DisposeAdapter $MockDispose
        }

      $script:mockState.Releases | Should-Be 0
      $script:mockState.Disposals | Should-Be 1
    }

    It 'Should dispose an owned mutex after release fails' {
      $mockFailingRelease = {
        $script:mockState.Releases++
        throw 'release failed'
      }

      {
        $null = InModuleScope `
          -Parameters @{
            MockMutex = $script:mockMutex
            MockRelease = $mockFailingRelease
            MockDispose = $script:mockDispose
          } `
          -ScriptBlock {
            Set-StrictMode -Version 1.0
            Close-AzureDevLifecycleMutex `
              -Mutex $MockMutex `
              -Owned `
              -ReleaseAdapter $MockRelease `
              -DisposeAdapter $MockDispose
          }
      } | Should-Throw -ExceptionMessage '*release failed*'

      $script:mockState.Releases | Should-Be 1
      $script:mockState.Disposals | Should-Be 1
    }

    It 'Should call neither close adapter during preview' {
      $null = InModuleScope `
        -Parameters @{
          MockMutex = $script:mockMutex
          MockRelease = $script:mockRelease
          MockDispose = $script:mockDispose
        } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Close-AzureDevLifecycleMutex `
            -Mutex $MockMutex `
            -Owned `
            -ReleaseAdapter $MockRelease `
            -DisposeAdapter $MockDispose `
            -WhatIf
        }

      $script:mockState.Releases | Should-Be 0
      $script:mockState.Disposals | Should-Be 0
    }
  }
}
