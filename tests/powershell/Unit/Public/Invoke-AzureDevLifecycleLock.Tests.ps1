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
        'scripts/azure-dev/AzureDev.LifecycleLock.psm1'
    ) -Force -ErrorAction Stop
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  BeforeEach {
    $script:snapshot = [pscustomobject]@{
      RepoRoot = $TestDrive
      SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      ResourceGroup = 'target-rg'
      VmName = 'target-vm'
    }
  }

  Context 'When work ends with a terminating interruption' {
    It 'Should release the owned lock through finally without compensation' {
      $script:mutationCount = 0
      $script:lockPath = $null

      {
        $null = Invoke-AzureDevLifecycleLock `
          -ConfigurationSnapshot $script:snapshot `
          -CommandName start `
          -ScriptBlock {
            param($Lock, $ConfigurationSnapshot)
            $script:lockPath = $Lock.Path
            $script:mutationCount++
            throw [System.OperationCanceledException]::new(
              'interrupted'
            )
          }
      } | Should-Throw -ExceptionMessage '*interrupted*'

      $script:mutationCount | Should-Be 1
      (Test-Path -LiteralPath $script:lockPath) | Should-BeFalse
    }
  }

  Context 'When polling separates two decisive windows' {
    It 'Should reacquire the same target lock with the unchanged snapshot' {
      $script:observedPaths = @()
      $script:observedSnapshots = @()

      $first = Invoke-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName start `
        -ScriptBlock {
          param($Lock, $ConfigurationSnapshot)
          $script:observedPaths += $Lock.Path
          $script:observedSnapshots += $ConfigurationSnapshot
          'poll-outside-lock'
        }
      (Test-Path -LiteralPath $script:observedPaths[0]) | Should-BeFalse
      $second = Invoke-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName start `
        -ScriptBlock {
          param($Lock, $ConfigurationSnapshot)
          $script:observedPaths += $Lock.Path
          $script:observedSnapshots += $ConfigurationSnapshot
          'later-mutation-decision'
        }

      $first | Should-Be 'poll-outside-lock'
      $second | Should-Be 'later-mutation-decision'
      $script:observedPaths[1] | Should-Be $script:observedPaths[0]
      [object]::ReferenceEquals(
        $script:observedSnapshots[0],
        $script:observedSnapshots[1]
      ) | Should-BeTrue
      (Test-Path -LiteralPath $script:observedPaths[1]) | Should-BeFalse
    }
  }
}
