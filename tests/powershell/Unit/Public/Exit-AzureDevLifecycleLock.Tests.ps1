#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Exit-AzureDevLifecycleLock' -Tag 'Unit' {
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
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }
    Mock New-AzureDevLifecycleMutex {
      New-Object -TypeName System.Management.Automation.PSObject -Property @{
        Identifier = [System.Guid]::NewGuid().ToString('N')
      }
    }
    Mock Enter-AzureDevLifecycleMutex { $true }
    Mock Close-AzureDevLifecycleMutex {
      if ($script:mockMutexReleaseFailure) {
        throw 'mutex release failed'
      }
    }
  }

  BeforeEach {
    $script:ownedLocks = @()
    $script:mockMutexReleaseFailure = $false
    $script:snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
      RepoRoot = $TestDrive
      SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      ResourceGroup = 'target-rg'
      VmName = 'target-vm'
    }
  }

  AfterEach {
    $script:mockMutexReleaseFailure = $false
    foreach ($ownedLock in $script:ownedLocks) {
      if (-not $ownedLock.Released) {
        $null = Exit-AzureDevLifecycleLock -Lock $ownedLock
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When the current invocation owns the lock' {
    It 'Should remove its record and make a repeated release harmless' {
      $lock = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName start
      $script:ownedLocks += $lock

      $released = Exit-AzureDevLifecycleLock -Lock $lock
      $releasedAgain = Exit-AzureDevLifecycleLock -Lock $lock

      $released | Should-BeTrue
      $releasedAgain | Should-BeFalse
      (Test-Path -LiteralPath $lock.Path) | Should-BeFalse
    }
  }

  Context 'When release is previewed' {
    It 'Should preserve the active lease and its record' {
      $owner = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName start
      $script:ownedLocks += $owner

      $released = Exit-AzureDevLifecycleLock -Lock $owner -WhatIf

      $released | Should-BeFalse
      $owner.Released | Should-BeFalse
      (Test-Path -LiteralPath $owner.Path -PathType Leaf) |
        Should-BeTrue
      Should-NotInvoke `
        -CommandName Close-AzureDevLifecycleMutex `
        -Scope It
    }
  }

  Context 'When a different invocation is represented by the lease' {
    It 'Should preserve the owned lock record and mutex' {
      $owner = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName start
      $script:ownedLocks += $owner
      $nonOwner = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        PSTypeName = 'AzureDev.LifecycleLockLease'
        Path = $owner.Path
        MutexName = $owner.MutexName
        OwnerId = 'different-owner'
        Mutex = $owner.Mutex
        Released = $false
      }

      $released = Exit-AzureDevLifecycleLock -Lock $nonOwner

      $released | Should-BeFalse
      (Test-Path -LiteralPath $owner.Path -PathType Leaf) | Should-BeTrue
      $owner.Released | Should-BeFalse
    }
  }

  Context 'When owner diagnostics no longer prove ownership' {
    BeforeDiscovery {
      $releaseCases = @(
        @{ Name = 'missing'; Content = $null },
        @{ Name = 'malformed'; Content = '{' },
        @{ Name = 'blank'; Content = '{"ownerId":""}' },
        @{ Name = 'replacement'; Content = '{"ownerId":"replacement"}' }
      )
    }

    It 'Should preserve <Name> diagnostics while releasing the mutex' `
      -ForEach $releaseCases {
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        ResourceGroup = $Name
        VmName = 'target-vm'
      }
      $owner = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName stop
      $script:ownedLocks += $owner
      if ($null -eq $Content) {
        Remove-Item -LiteralPath $owner.Path -Force
      } else {
        Set-Content -LiteralPath $owner.Path -Value $Content
      }

      $released = Exit-AzureDevLifecycleLock -Lock $owner

      $released | Should-BeFalse
      $owner.Released | Should-BeTrue
      if ($null -ne $Content) {
        (Get-Content -LiteralPath $owner.Path -Raw) |
          Should-MatchString (
            [System.Text.RegularExpressions.Regex]::Escape($Content)
          )
      }
    }
  }

  Context 'When the lease omits mutex ownership' {
    It 'Should leave the current invocation untouched' {
      $owner = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName start
      $script:ownedLocks += $owner
      $malformedLease = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        Path = $owner.Path
        OwnerId = $owner.OwnerId
        Released = $false
      }

      $released = Exit-AzureDevLifecycleLock -Lock $malformedLease

      $released | Should-BeFalse
      $owner.Released | Should-BeFalse
      (Test-Path -LiteralPath $owner.Path) | Should-BeTrue
    }
  }

  Context 'When release cleanup fails' {
    BeforeAll {
      Mock Remove-AzureDevLifecycleLockRecord {
        if ($script:mockRecordRemovalFailure) {
          throw 'record removal failed'
        }
        [System.IO.File]::Delete($Path)
        return $true
      }
    }

    BeforeEach {
      $script:mockRecordRemovalFailure = $false
    }

    It 'Should clear nested ownership after record removal throws' {
      $owner = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName start
      $script:ownedLocks += $owner
      $script:mockRecordRemovalFailure = $true

      {
        $null = Exit-AzureDevLifecycleLock -Lock $owner
      } | Should-Throw -ExceptionMessage '*record removal failed*'
      $script:mockRecordRemovalFailure = $false
      $replacement = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName stop
      $script:ownedLocks += $replacement

      $owner.Released | Should-BeTrue
      $replacement.Released | Should-BeFalse
      Should-Invoke `
        -CommandName Close-AzureDevLifecycleMutex `
        -Exactly `
        -Times 1 `
        -Scope It
    }

    It 'Should clear nested ownership after mutex release throws' {
      $owner = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName start
      $script:ownedLocks += $owner
      $script:mockMutexReleaseFailure = $true

      {
        $null = Exit-AzureDevLifecycleLock -Lock $owner
      } | Should-Throw -ExceptionMessage '*mutex release failed*'
      $script:mockMutexReleaseFailure = $false
      $replacement = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $script:snapshot `
        -CommandName stop
      $script:ownedLocks += $replacement

      $owner.Released | Should-BeTrue
      $replacement.Released | Should-BeFalse
      Should-Invoke `
        -CommandName Close-AzureDevLifecycleMutex `
        -Exactly `
        -Times 1 `
        -Scope It
    }
  }
}
