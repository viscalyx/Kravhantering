#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Enter-AzureDevLifecycleLock' -Tag 'Unit' {
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
      'Should-Invoke:ModuleName' = $script:moduleName
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
    $script:ownedLocks = @()
  }

  AfterEach {
    foreach ($ownedLock in $script:ownedLocks) {
      if (-not $ownedLock.Released) {
        $null = Exit-AzureDevLifecycleLock -Lock $ownedLock
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When canonical target values identify a lifecycle lock' {
    It 'Should derive one stable checkout-local identity without environment ID' {
      $firstSnapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = Join-Path $TestDrive 'checkout-one'
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'Target-RG'
        VmName = 'Target-VM'
      }
      $sameTargetSnapshot = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{
          RepoRoot = Join-Path $TestDrive 'checkout-one'
          SubscriptionId = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'
          ResourceGroup = 'target-rg'
          VmName = 'target-vm'
        }
      $otherCheckoutSnapshot = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{
          RepoRoot = Join-Path $TestDrive 'checkout-two'
          SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          ResourceGroup = 'target-rg'
          VmName = 'target-vm'
        }
      $otherTargetSnapshot = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{
          RepoRoot = Join-Path $TestDrive 'checkout-one'
          SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          ResourceGroup = 'target-rg'
          VmName = 'other-vm'
        }

      $first = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $firstSnapshot `
        -CommandName start
      $script:ownedLocks += $first
      $firstPath = $first.Path
      $firstMutexName = $first.MutexName
      $null = Exit-AzureDevLifecycleLock -Lock $first
      $sameTarget = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $sameTargetSnapshot `
        -CommandName stop
      $script:ownedLocks += $sameTarget
      $otherCheckout = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $otherCheckoutSnapshot `
        -CommandName start
      $script:ownedLocks += $otherCheckout
      $otherTarget = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $otherTargetSnapshot `
        -CommandName start
      $script:ownedLocks += $otherTarget

      $sameTarget.Path | Should-Be $firstPath
      $sameTarget.MutexName | Should-Be $firstMutexName
      $otherCheckout.MutexName | Should-NotBe $firstMutexName
      $otherTarget.MutexName | Should-NotBe $firstMutexName
      $otherTarget.Path | Should-NotBe $firstPath
      $firstMutexName | Should-MatchString '^[0-9a-f]{64}$'
    }
  }

  Context 'When acquisition is previewed' {
    It 'Should return no lease and create no lock artifacts' {
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = '19191919-1919-1919-1919-191919191919'
        ResourceGroup = 'preview-rg'
        VmName = 'preview-vm'
      }

      $result = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start `
        -WhatIf

      $result | Should-BeNull
      (Test-Path -LiteralPath (Join-Path $TestDrive '.azure')) |
        Should-BeFalse
      Should-NotInvoke `
        -CommandName New-AzureDevLifecycleMutex `
        -Scope It
    }
  }

  Context 'When another invocation owns the target mutex' {
    BeforeAll {
      Mock Get-AzureDevLifecycleMonotonicTimestamp {
        $script:mockTimestamp
      }
      Mock Wait-AzureDevLifecycleLockRetry {
        $script:mockTimestamp += [System.Int64](
          $Duration.TotalSeconds *
          [System.Diagnostics.Stopwatch]::Frequency
        )
      }
    }

    BeforeEach {
      $script:mockTimestamp = [System.Int64]0
    }

    It 'Should wait exactly 15 virtual monotonic seconds with safe owner guidance' {
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
        ClientSecret = 'must-never-appear'
      }
      $owner = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start
      $script:ownedLocks += $owner
      $script:mockContentionCount = 0

      $caught = $null
      try {
        $null = Enter-AzureDevLifecycleLock `
          -ConfigurationSnapshot $snapshot `
          -CommandName stop `
          -OnContention {
            $script:mockContentionCount++
          }
      } catch {
        $caught = $_
      }

      $caught | Should-NotBeNull
      $caught.Exception.Message | Should-MatchString 'waiting 15 seconds'
      $caught.Exception.Message | Should-MatchString 'command=start'
      $caught.Exception.Message | Should-MatchString "processId=$PID"
      $caught.Exception.Message |
        Should-MatchString "host=$([System.Net.Dns]::GetHostName())"
      $caught.Exception.Message | Should-MatchString 'retry'
      $caught.Exception.Message | Should-MatchString 'only after confirming'
      $caught.Exception.Message | Should-NotMatchString 'must-never-appear'
      $script:mockTimestamp | Should-Be (
        [System.Int64](15 * [System.Diagnostics.Stopwatch]::Frequency)
      )
      $script:mockContentionCount | Should-Be 1
      Should-Invoke `
        -CommandName Wait-AzureDevLifecycleLockRetry `
        -Exactly `
        -Times 60 `
        -Scope It
    }
  }

  Context 'When stale diagnostics remain without an owned mutex' {
    It 'Should atomically replace them before returning the new lease' {
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
      }
      $seed = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start
      $script:ownedLocks += $seed
      $null = Exit-AzureDevLifecycleLock -Lock $seed
      Set-Content `
        -LiteralPath $seed.Path `
        -Value '{"ownerId":"stale-owner","host":"foreign-host"}'

      $recovered = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName stop
      $script:ownedLocks += $recovered
      $record = Get-Content -LiteralPath $recovered.Path -Raw |
        ConvertFrom-Json

      $record.ownerId | Should-Be $recovered.OwnerId
      $record.command | Should-Be 'stop'
      $recovered.PSObject.Properties.Name |
        Should-NotContainCollection 'RecoveredStaleLock'
    }

    It 'Should preserve a live replacement from a second contender' {
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
      }
      $first = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start
      $script:ownedLocks += $first
      $before = Get-Content -LiteralPath $first.Path -Raw

      {
        $null = Enter-AzureDevLifecycleLock `
          -ConfigurationSnapshot $snapshot `
          -CommandName stop `
          -TimeoutSeconds 0
      } | Should-Throw -ExceptionMessage '*timed out*'

      (Get-Content -LiteralPath $first.Path -Raw) | Should-Be $before
    }
  }

  Context 'When owner diagnostics are unavailable or foreign' {
    BeforeDiscovery {
      $ownerCases = @(
        @{
          Name = 'missing'
          Content = $null
          Expected = 'owner information unavailable'
        },
        @{
          Name = 'malformed'
          Content = '{'
          Expected = 'owner information unavailable'
        },
        @{
          Name = 'foreign'
          Content = '{"command":"stop","processId":7,"host":"other-host"}'
          Expected = 'command=stop; processId=7; host=other-host'
        }
      )
    }

    It 'Should retain safe guidance for <Name> evidence' -ForEach $ownerCases {
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
        ResourceGroup = $Name
        VmName = 'target-vm'
      }
      $owner = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start
      $script:ownedLocks += $owner
      if ($null -eq $Content) {
        Remove-Item -LiteralPath $owner.Path -Force
      } else {
        Set-Content -LiteralPath $owner.Path -Value $Content
      }

      {
        $null = Enter-AzureDevLifecycleLock `
          -ConfigurationSnapshot $snapshot `
          -CommandName stop `
          -TimeoutSeconds 0
      } | Should-Throw -ExceptionMessage "*$Expected*"
    }
  }

  Context 'When owner-record writing fails' {
    BeforeAll {
      Mock Write-AzureDevLifecycleLockRecord {
        $script:mockCapturedRecordPath = $Path
        if (-not $script:mockWriteFailureEnabled) {
          [System.IO.File]::WriteAllText(
            $Path,
            ($Record | ConvertTo-Json -Compress)
          )
          return
        }
        if ($script:mockWriteCurrentOwnerBeforeFailure) {
          [System.IO.File]::WriteAllText(
            $Path,
            ($Record | ConvertTo-Json -Compress)
          )
        }
        throw 'record write failed'
      }
    }

    BeforeEach {
      $script:mockWriteFailureEnabled = $true
      $script:mockWriteCurrentOwnerBeforeFailure = $false
      $script:mockCapturedRecordPath = $null
    }

    It 'Should release the mutex and preserve unrelated stale diagnostics' {
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
      }
      $script:mockWriteFailureEnabled = $false
      $seed = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start
      $script:ownedLocks += $seed
      $null = Exit-AzureDevLifecycleLock -Lock $seed
      Set-Content `
        -LiteralPath $seed.Path `
        -Value '{"ownerId":"prior-owner"}'
      $script:mockWriteFailureEnabled = $true

      {
        $null = Enter-AzureDevLifecycleLock `
          -ConfigurationSnapshot $snapshot `
          -CommandName start
      } | Should-Throw -ExceptionMessage '*record write failed*'
      $record = Get-Content -LiteralPath $seed.Path -Raw |
        ConvertFrom-Json

      $record.ownerId | Should-Be 'prior-owner'
      Should-Invoke `
        -CommandName Close-AzureDevLifecycleMutex `
        -Exactly `
        -Times 2 `
        -Scope It
    }

    It 'Should remove its partial current-owner diagnostics' {
      $script:mockWriteCurrentOwnerBeforeFailure = $true
      $snapshot = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{
          RepoRoot = $TestDrive
          SubscriptionId = '12121212-1212-1212-1212-121212121212'
          ResourceGroup = 'target-rg'
          VmName = 'target-vm'
        }

      {
        $null = Enter-AzureDevLifecycleLock `
          -ConfigurationSnapshot $snapshot `
          -CommandName start
      } | Should-Throw -ExceptionMessage '*record write failed*'

      (Test-Path -LiteralPath $script:mockCapturedRecordPath) |
        Should-BeFalse
      Should-Invoke `
        -CommandName Close-AzureDevLifecycleMutex `
        -Exactly `
        -Times 1 `
        -Scope It
    }
  }

  Context 'When owner-record writing is interrupted' {
    BeforeAll {
      Mock Write-AzureDevLifecycleLockRecord {
        $script:mockCapturedRecordPath = $Path
        [System.IO.File]::WriteAllText(
          $Path,
          ($Record | ConvertTo-Json -Compress)
        )
        throw [System.OperationCanceledException]::new('interrupted')
      }
    }

    BeforeEach {
      $script:mockCapturedRecordPath = $null
    }

    It 'Should release the acquired mutex without leaving diagnostics' {
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
      }

      {
        $null = Enter-AzureDevLifecycleLock `
          -ConfigurationSnapshot $snapshot `
          -CommandName start
      } | Should-Throw -ExceptionMessage '*interrupted*'

      (Test-Path -LiteralPath $script:mockCapturedRecordPath) |
        Should-BeFalse
      Should-Invoke `
        -CommandName Close-AzureDevLifecycleMutex `
        -Exactly `
        -Times 1 `
        -Scope It
    }
  }

  Context 'When diagnostic cleanup is interrupted' {
    BeforeAll {
      Mock Write-AzureDevLifecycleLockRecord -MockWith {
        throw [System.InvalidOperationException]::new('record write failed')
      }
      Mock Remove-AzureDevLifecycleLockRecord -MockWith {
        $interruption = [System.OperationCanceledException]::new('interrupted')
        throw [System.InvalidOperationException]::new(
          'cleanup interrupted',
          $interruption
        )
      }
    }

    It 'Should propagate cleanup cancellation after releasing the mutex' {
      $snapshot = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{
          RepoRoot = $TestDrive
          SubscriptionId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
          ResourceGroup = 'target-rg'
          VmName = 'target-vm'
        }

      $captured = $null
      try {
        $null = Enter-AzureDevLifecycleLock `
          -ConfigurationSnapshot $snapshot `
          -CommandName start
      } catch {
        $captured = $_
      }

      $captured.Exception.Message | Should-Be 'cleanup interrupted'
      $captured.Exception.InnerException.GetType().FullName |
        Should-Be 'System.OperationCanceledException'
      Should-Invoke Close-AzureDevLifecycleMutex `
        -Exactly -Times 1 -Scope It
    }
  }
}
