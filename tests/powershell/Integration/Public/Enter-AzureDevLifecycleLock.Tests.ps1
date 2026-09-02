#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    $env:KRAVHANTERING_PESTER_INTEGRATION -eq '1'
}

Describe 'Enter-AzureDevLifecycleLock' -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:moduleName = 'AzureDev.LifecycleLock'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    $script:modulePath = Join-Path $script:repositoryRoot `
      'scripts/azure-dev/AzureDev.LifecycleLock.psm1'
    Import-Module $script:modulePath -Force -ErrorAction Stop

    function Start-TestLifecycleLockOwner {
      param(
        [Parameter(Mandatory = $true)]
        [System.String]$Root,

        [Parameter(Mandatory = $true)]
        [System.String]$ReadyPath,

        [Parameter(Mandatory = $true)]
        [System.String]$ReleasePath
      )

      $childScriptPath = Join-Path $Root 'lock-owner.ps1'
      Set-Content -LiteralPath $childScriptPath -Value @'
param(
  [System.String]$ModulePath,
  [System.String]$Root,
  [System.String]$ReadyPath,
  [System.String]$ReleasePath
)
Import-Module $ModulePath -Force -ErrorAction Stop
$snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
  RepoRoot = $Root
  SubscriptionId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  ResourceGroup = 'concurrent-rg'
  VmName = 'concurrent-vm'
}
$null = Invoke-AzureDevLifecycleLock `
  -ConfigurationSnapshot $snapshot `
  -CommandName start `
  -ScriptBlock {
    Set-Content -LiteralPath $ReadyPath -Value 'ready'
    while (-not (Test-Path -LiteralPath $ReleasePath)) {
      Start-Sleep -Milliseconds 10
    }
  }
'@
      $processPath = (Get-Process -Id $PID).Path
      return Start-Process `
        -FilePath $processPath `
        -ArgumentList @(
          '-NoLogo',
          '-NoProfile',
          '-File',
          $childScriptPath,
          $script:modulePath,
          $Root,
          $ReadyPath,
          $ReleasePath
        ) `
        -PassThru
    }
  }

  BeforeEach {
    $script:ownedLocks = @()
    $script:childProcess = $null
    $script:readyPath = Join-Path $TestDrive 'owner.ready'
    $script:releasePath = Join-Path $TestDrive 'owner.release'
  }

  AfterEach {
    foreach ($ownedLock in $script:ownedLocks) {
      if (-not $ownedLock.Released) {
        $null = Exit-AzureDevLifecycleLock -Lock $ownedLock
      }
    }
    if ($null -ne $script:childProcess) {
      if (-not $script:childProcess.HasExited) {
        Set-Content -LiteralPath $script:releasePath -Value 'release'
        if (-not $script:childProcess.WaitForExit(3000)) {
          Stop-Process -Id $script:childProcess.Id -Force
          $script:childProcess.WaitForExit()
        }
      }
      $script:childProcess.Dispose()
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When acquiring a target lock in an isolated checkout' {
    It 'Should atomically create a readable owner record' {
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        ResourceGroup = 'integration-rg'
        VmName = 'integration-vm'
      }

      $lock = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName start
      $script:ownedLocks += $lock
      $record = Get-Content -LiteralPath $lock.Path -Raw | ConvertFrom-Json

      $record.ownerId | Should-Be $lock.OwnerId
      $record.command | Should-Be 'start'
      $record.processId | Should-Be $PID
    }
  }

  Context 'When two processes contend for one stale-derived target' {
    It 'Should keep the live owner record while the second process is denied' {
      $script:childProcess = Start-TestLifecycleLockOwner `
        -Root $TestDrive `
        -ReadyPath $script:readyPath `
        -ReleasePath $script:releasePath
      $deadline = [System.DateTime]::UtcNow.AddSeconds(5)
      while (
        -not (Test-Path -LiteralPath $script:readyPath) -and
        -not $script:childProcess.HasExited -and
        [System.DateTime]::UtcNow -lt $deadline
      ) {
        Start-Sleep -Milliseconds 10
      }
      (Test-Path -LiteralPath $script:readyPath) | Should-BeTrue
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
        ResourceGroup = 'concurrent-rg'
        VmName = 'concurrent-vm'
      }
      $recordPath = (
        Get-ChildItem `
          -LiteralPath (Join-Path $TestDrive '.azure/lifecycle-locks') `
          -Filter 'lifecycle-*.lock'
      ).FullName
      $before = Get-Content -LiteralPath $recordPath -Raw

      {
        $null = Enter-AzureDevLifecycleLock `
          -ConfigurationSnapshot $snapshot `
          -CommandName stop `
          -TimeoutSeconds 0
      } | Should-Throw -ExceptionMessage '*timed out*'

      (Get-Content -LiteralPath $recordPath -Raw) | Should-Be $before
    }

    It 'Should recover atomically after the owning process is abandoned' {
      $script:childProcess = Start-TestLifecycleLockOwner `
        -Root $TestDrive `
        -ReadyPath $script:readyPath `
        -ReleasePath $script:releasePath
      $deadline = [System.DateTime]::UtcNow.AddSeconds(5)
      while (
        -not (Test-Path -LiteralPath $script:readyPath) -and
        -not $script:childProcess.HasExited -and
        [System.DateTime]::UtcNow -lt $deadline
      ) {
        Start-Sleep -Milliseconds 10
      }
      (Test-Path -LiteralPath $script:readyPath) | Should-BeTrue
      Stop-Process -Id $script:childProcess.Id -Force
      $script:childProcess.WaitForExit()
      $snapshot = New-Object -TypeName System.Management.Automation.PSObject -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
        ResourceGroup = 'concurrent-rg'
        VmName = 'concurrent-vm'
      }

      $recovered = Enter-AzureDevLifecycleLock `
        -ConfigurationSnapshot $snapshot `
        -CommandName stop
      $script:ownedLocks += $recovered
      $record = Get-Content -LiteralPath $recovered.Path -Raw |
        ConvertFrom-Json

      $record.ownerId | Should-Be $recovered.OwnerId
      $record.processId | Should-Be $PID
    }
  }
}
