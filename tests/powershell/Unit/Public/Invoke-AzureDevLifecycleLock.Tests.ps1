#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Invoke-AzureDevLifecycleLock' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.LifecycleLock'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.LifecycleLock.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'Mock:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }
    Mock New-AzureDevLifecycleMutex {
      New-Object -TypeName System.Management.Automation.PSObject -Property @{
        Identifier = [System.Guid]::NewGuid().ToString('N')
      }
    }
    Mock Enter-AzureDevLifecycleMutex { $true }
    Mock Close-AzureDevLifecycleMutex
  }

  BeforeEach {
    $script:snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
      RepoRoot = $TestDrive
      SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      ResourceGroup = 'target-rg'
      VmName = 'target-vm'
    }
    $script:observedLockPaths = @()
  }

  AfterEach {
    foreach ($observedPath in $script:observedLockPaths) {
      Remove-Item `
        -LiteralPath $observedPath `
        -Force `
        -ErrorAction SilentlyContinue
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When work ends with a terminating interruption' {
    It 'Should release the owned lock through finally without compensation' {
      $script:mutationCount = 0

      {
        $null = Invoke-AzureDevLifecycleLock `
          -ConfigurationSnapshot $script:snapshot `
          -CommandName start `
          -ScriptBlock {
            param($Lock)
            $script:observedLockPaths += $Lock.Path
            $script:mutationCount++
            throw [System.OperationCanceledException]::new('interrupted')
          }
      } | Should-Throw -ExceptionMessage '*interrupted*'

      $script:mutationCount | Should-Be 1
      (Test-Path -LiteralPath $script:observedLockPaths[0]) |
        Should-BeFalse
    }
  }


  Context 'When guarded work is previewed' {
    It 'Should return no lease and invoke no work or lock mutation' {
      $script:mutationCount = 0

      $result = Invoke-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName start `
        -ScriptBlock { $script:mutationCount++ } `
        -WhatIf

      $result | Should-BeNull
      $script:mutationCount | Should-Be 0
      $lockDirectory = Join-Path $TestDrive '.azure/lifecycle-locks'
      @(
        Get-ChildItem `
          -LiteralPath $lockDirectory `
          -Filter 'lifecycle-*.lock' `
          -File `
          -ErrorAction SilentlyContinue
      ).Count | Should-Be 0
      Should-NotInvoke `
        -CommandName New-AzureDevLifecycleMutex `
        -Scope It
    }
  }

  Context 'When polling separates two decisive windows' {
    It 'Should reacquire the same target lock with the unchanged snapshot' {
      $script:observedSnapshots = @()

      $first = Invoke-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName start `
        -ScriptBlock {
          param($Lock, $ConfigurationSnapshot)
          $script:observedLockPaths += $Lock.Path
          $script:observedSnapshots += $ConfigurationSnapshot
          'poll-outside-lock'
        }
      (Test-Path -LiteralPath $script:observedLockPaths[0]) | Should-BeFalse
      $second = Invoke-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName start `
        -ScriptBlock {
          param($Lock, $ConfigurationSnapshot)
          $script:observedLockPaths += $Lock.Path
          $script:observedSnapshots += $ConfigurationSnapshot
          'later-mutation-decision'
        }

      $first | Should-Be 'poll-outside-lock'
      $second | Should-Be 'later-mutation-decision'
      $script:observedLockPaths[1] |
        Should-Be $script:observedLockPaths[0]
      [System.Object]::ReferenceEquals(
        $script:observedSnapshots[0],
        $script:observedSnapshots[1]
      ) | Should-BeTrue
      (Test-Path -LiteralPath $script:observedLockPaths[1]) |
        Should-BeFalse
    }
  }
}
