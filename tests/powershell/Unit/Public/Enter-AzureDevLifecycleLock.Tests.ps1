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
        'scripts/azure-dev/AzureDev.LifecycleLock.psm1'
    ) -Force -ErrorAction Stop
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When canonical target values identify a lifecycle lock' {
    It 'Should derive one stable checkout-local identity without environment ID' {
      $firstSnapshot = [pscustomobject]@{
        RepoRoot = Join-Path $TestDrive 'checkout-one'
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'Target-RG'
        VmName = 'Target-VM'
      }
      $sameTargetSnapshot = [pscustomobject]@{
        RepoRoot = Join-Path $TestDrive 'checkout-one'
        SubscriptionId = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
      }
      $otherCheckoutSnapshot = [pscustomobject]@{
        RepoRoot = Join-Path $TestDrive 'checkout-two'
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
      }

      $first = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $firstSnapshot `
        -CommandName start
      $firstPath = $first.Path
      $null = Exit-AzureDevLifecycleLock -Lock $first
      $sameTarget = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $sameTargetSnapshot `
        -CommandName stop
      $sameTargetPath = $sameTarget.Path
      $null = Exit-AzureDevLifecycleLock -Lock $sameTarget
      $otherCheckout = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $otherCheckoutSnapshot `
        -CommandName start

      $firstPath | Should-Be $sameTargetPath
      $otherCheckout.Path | Should-NotBe $firstPath
      Split-Path -Leaf $firstPath |
        Should-BeLikeString 'lifecycle-*.lock'
      (Split-Path -Leaf $firstPath).Length | Should-Be 79
      $firstPath | Should-BeLikeString (
        (Join-Path $firstSnapshot.RepoRoot '.azure/lifecycle-locks/*')
      )

      $null = Exit-AzureDevLifecycleLock -Lock $otherCheckout
    }
  }

  Context 'When another invocation owns the target lock' {
    It 'Should wait at most 15 virtual seconds and report safe recovery guidance' {
      $snapshot = [pscustomobject]@{
        RepoRoot = $TestDrive
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
        ClientSecret = 'must-never-appear'
      }
      $owner = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start `
        -OwnerProcessId $PID `
        -OwnerHost ([System.Net.Dns]::GetHostName()) `
        -OwnerUser 'test-user' `
        -OwnerId 'owner-one'
      $clock = [pscustomobject]@{
        Now = [datetimeoffset]'2026-09-02T08:00:00Z'
      }
      $mockClock = { $clock.Now }.GetNewClosure()
      $mockDelay = {
        param([timespan]$Duration)
        $clock.Now = $clock.Now.Add($Duration)
      }.GetNewClosure()

      $caught = $null
      try {
        $null = Enter-AzureDevLifecycleLock `
          -ConfigurationSnapshot $snapshot `
          -CommandName stop `
          -UtcNowProvider $mockClock `
          -DelayProvider $mockDelay
      } catch {
        $caught = $_
      }

      $caught | Should-NotBeNull
      $caught.Exception.Message | Should-BeLikeString '*waiting 15 seconds*'
      $caught.Exception.Message | Should-BeLikeString '*command=start*'
      $caught.Exception.Message |
        Should-BeLikeString "*processId=$PID*"
      $caught.Exception.Message |
        Should-BeLikeString "*host=$([System.Net.Dns]::GetHostName())*"
      $caught.Exception.Message | Should-BeLikeString '*user=test-user*'
      $caught.Exception.Message | Should-BeLikeString '*retry*'
      $caught.Exception.Message |
        Should-BeLikeString '*only after confirming*'
      $caught.Exception.Message |
        Should-NotBeLikeString '*must-never-appear*'
      $clock.Now |
        Should-Be ([datetimeoffset]'2026-09-02T08:00:15Z')
      (Test-Path -LiteralPath $owner.Path -PathType Leaf) | Should-BeTrue

      $null = Exit-AzureDevLifecycleLock -Lock $owner
    }
  }

  Context 'When an abandoned record has no active owner handle' {
    It 'Should recover the stale lock atomically' {
      $snapshot = [pscustomobject]@{
        RepoRoot = $TestDrive
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
      }
      $seed = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start `
        -OwnerProcessId ([int]::MaxValue) `
        -OwnerId 'stale-owner'
      $lockPath = $seed.Path
      $seed.Stream.Dispose()

      $recovered = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName stop `
        -OwnerId 'new-owner'
      $record = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json

      $recovered.RecoveredStaleLock | Should-BeTrue
      $record.ownerId | Should-Be 'new-owner'
      $record.command | Should-Be 'stop'

      $null = Exit-AzureDevLifecycleLock -Lock $recovered
    }
  }

  Context 'When an existing record has no safe stale-owner evidence' {
    It 'Should preserve it and provide manual recovery guidance' {
      $snapshot = [pscustomobject]@{
        RepoRoot = $TestDrive
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'target-rg'
        VmName = 'target-vm'
      }
      $seed = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start
      $lockPath = $seed.Path
      $seed.Stream.Dispose()
      Set-Content -LiteralPath $lockPath -Value '{"unexpected":"record"}'
      $clock = [pscustomobject]@{
        Now = [datetimeoffset]'2026-09-02T08:00:00Z'
      }
      $mockClock = { $clock.Now }.GetNewClosure()
      $mockDelay = {
        param([timespan]$Duration)
        $clock.Now = $clock.Now.Add($Duration)
      }.GetNewClosure()

      {
        $null = Enter-AzureDevLifecycleLock `
          -ConfigurationSnapshot $snapshot `
          -CommandName stop `
          -TimeoutSeconds 1 `
          -UtcNowProvider $mockClock `
          -DelayProvider $mockDelay
      } | Should-Throw -ExceptionMessage (
        '*Owner: command=unknown; processId=unknown; host=unknown*' +
        '*only after confirming*'
      )

      (Test-Path -LiteralPath $lockPath -PathType Leaf) | Should-BeTrue
    }
  }
}
