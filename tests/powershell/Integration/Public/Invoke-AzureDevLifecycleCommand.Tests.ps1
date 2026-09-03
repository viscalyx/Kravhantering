#requires -Version 7.4

Set-StrictMode -Version Latest

BeforeDiscovery {
  $script:integrationEnabled =
    [System.Environment]::GetEnvironmentVariable(
      'KRAVHANTERING_PESTER_INTEGRATION',
      'Process'
    ) -ceq '1'
}

Describe `
  'Invoke-AzureDevLifecycleCommand' `
  -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    . (Join-Path `
        $PSScriptRoot `
        '../AzureDev.Lifecycle.PublicCommand.TestHelper.ps1')
    $script:fixture = New-AzureDevLifecyclePublicCommandFixture `
      -Root $TestDrive
    $script:entryPoint = Join-Path `
      $script:repositoryRoot `
      'scripts/azure-dev.ps1'
    $script:powerShellPath = (Get-Process -Id $PID).Path
    Enter-AzureDevLifecyclePublicCommandFixture -Fixture $script:fixture
  }

  BeforeEach {
    $script:interruptProcess = $null
    Clear-AzureDevLifecyclePublicCommandEvidence -Fixture $script:fixture
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_PROFILE_MODE',
      'exact',
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_TOKEN_MODE',
      'usable',
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_LOGIN_MODE',
      'accept',
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_VM_STATE',
      'PowerState/running',
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_DEALLOCATE_MODE',
      'accept',
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_START_MODE',
      'accept',
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_VM_STATE_AFTER_READ',
      $null,
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_STATE_CHANGE_AFTER_READS',
      $null,
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_VM_STATE_SEQUENCE',
      $null,
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_EXPECTED_LOCK_STATE_SEQUENCE',
      $null,
      'Process'
    )
    $virtualClock = [System.Management.Automation.PSObject]@{
      Milliseconds = [System.Int64]0
      DelayMultiplier = [System.Int64]1
    }
    $getMonotonicMilliseconds = {
      return [System.Int64]$virtualClock.Milliseconds
    }.GetNewClosure()
    $delayMilliseconds = {
      param([System.Int64]$Milliseconds)
      $virtualClock.Milliseconds += (
        $Milliseconds * $virtualClock.DelayMultiplier
      )
    }.GetNewClosure()
    $script:virtualClock = $virtualClock
    $script:lifecycleTiming = New-Object `
      -TypeName System.Management.Automation.PSObject `
      -Property @{
        PollIntervalMilliseconds = [System.Int64]5000
        HeartbeatIntervalMilliseconds = [System.Int64]30000
        LockDeadlineMilliseconds = [System.Int64]15000
        AzureCallDeadlineMilliseconds = [System.Int64]120000
        StableStopDeadlineMilliseconds = [System.Int64]600000
        RunningDeadlineMilliseconds = [System.Int64]600000
        GetMonotonicMilliseconds = $getMonotonicMilliseconds
        DelayMilliseconds = $delayMilliseconds
      }
    $script:lifecycleTiming.PSObject.TypeNames.Insert(
      0,
      'AzureDev.LifecycleTiming'
    )
  }

  AfterEach {
    if ($null -ne $script:interruptProcess) {
      if (-not $script:interruptProcess.HasExited) {
        $script:interruptProcess.Kill($true)
        $script:interruptProcess.WaitForExit()
      }
      $script:interruptProcess.Dispose()
      $script:interruptProcess = $null
    }
  }

  AfterAll {
    Exit-AzureDevLifecyclePublicCommandFixture -Fixture $script:fixture
  }

  Context 'When start or stop is previewed' {
    BeforeDiscovery {
      $commandCases = @(
        @{ CommandName = 'start' },
        @{ CommandName = 'stop' }
      )
    }

    It 'Should keep <CommandName> at the cache-only public boundary' `
      -ForEach $commandCases {
      $previewInformation = @()
      $result = @(
        & $script:entryPoint `
          $CommandName `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -InformationVariable previewInformation `
          -WhatIf
      )
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)

      $result.Count | Should-Be 0
      $calls | Should-BeCollection @(
        (
          "CALL`taccount`tshow`t--subscription" +
          "`t$($script:fixture.SubscriptionId)`t--output`tjson" +
          "`t--only-show-errors"
        )
      )
      Test-Path `
        -LiteralPath (Join-Path $script:fixture.RepositoryRoot '.azure') |
        Should-BeFalse
      Test-Path -LiteralPath $script:fixture.ForbiddenLog |
        Should-BeFalse
      @(Get-Job).Count | Should-Be 0
      $previewText = @(
        $previewInformation | ForEach-Object { "$_" }
      ) -join [System.Environment]::NewLine
      $previewText |
        Should-NotMatchString 'Repair Azure CLI lifecycle authentication'
    }

    It 'Should exit zero after a complete <CommandName> preview' `
      -ForEach $commandCases {
      $output = & $script:powerShellPath `
        -NoLogo `
        -NoProfile `
        -File $script:entryPoint `
        $CommandName `
        -RepositoryRoot $script:fixture.RepositoryRoot `
        -WhatIf 2>&1
      $exitCode = $LASTEXITCODE
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)

      $exitCode | Should-Be 0
      (@($output | ForEach-Object { "$_" }) -join [System.Environment]::NewLine) |
        Should-MatchString 'What if:'
      $calls.Count | Should-Be 1
    }

    It 'Should not repair a mismatched service principal during preview' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_PROFILE_MODE',
        'mismatch',
        'Process'
      )

      $result = @(
        & $script:entryPoint `
          stop `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -WhatIf
      )
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)

      $result.Count | Should-Be 0
      $calls.Count | Should-Be 1
      $calls[0] | Should-MatchString "CALL`taccount`tshow"
    }
  }

  Context 'When lifecycle status is requested' {
    BeforeDiscovery {
      $statusCases = @(
        @{ Raw = 'PowerState/starting'; Expected = 'starting' },
        @{ Raw = 'PowerState/running'; Expected = 'running' },
        @{ Raw = 'PowerState/stopping'; Expected = 'stopping' },
        @{ Raw = 'PowerState/stopped'; Expected = 'stopped-allocated' },
        @{ Raw = 'PowerState/deallocating'; Expected = 'deallocating' },
        @{ Raw = 'PowerState/deallocated'; Expected = 'deallocated' },
        @{ Raw = 'PowerState/creating'; Expected = 'creating' },
        @{ Raw = 'PowerState/unknown'; Expected = 'unrecognized' },
        @{ Raw = 'not-found'; Expected = 'not-found' },
        @{ Raw = 'read-failed'; Expected = 'unavailable' }
      )
    }

    It 'Should report <Expected> immediately for <Raw>' -ForEach $statusCases {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        $Raw,
        'Process'
      )
      $information = @()

      $result = @(
        & $script:entryPoint `
          status `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -InformationVariable information
      )
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $expectedIdentityCall = Get-AzureDevLifecycleExpectedIdentityCall `
        -Fixture $script:fixture
      $expectedTokenCall = Get-AzureDevLifecycleExpectedTokenCall `
        -Fixture $script:fixture
      $expectedStateCall = Get-AzureDevLifecycleExpectedStateCall `
        -Fixture $script:fixture

      $result.Count | Should-Be 0
      @($information.MessageData.Message) |
        Should-ContainCollection "Power state: $Expected"
      $calls | Should-BeCollection @(
        $expectedIdentityCall,
        $expectedTokenCall,
        $expectedStateCall
      )
      Test-Path `
        -LiteralPath (Join-Path $script:fixture.RepositoryRoot '.azure') |
        Should-BeFalse
      Test-Path -LiteralPath $script:fixture.ForbiddenLog |
        Should-BeFalse
    }
  }

  Context 'When lifecycle authentication requires targeted repair' {
    It 'Should repair the configured service principal without global selection' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_PROFILE_MODE',
        'mismatch',
        'Process'
      )

      $result = @(
        & $script:entryPoint `
          start `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming
      )
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $allCalls = $calls -join [System.Environment]::NewLine
      $expectedIdentityCall = Get-AzureDevLifecycleExpectedIdentityCall `
        -Fixture $script:fixture
      $expectedVersionCall = Get-AzureDevLifecycleExpectedVersionCall
      $expectedLoginCall = Get-AzureDevLifecycleExpectedLoginCall `
        -Fixture $script:fixture
      $expectedStateCall = Get-AzureDevLifecycleExpectedStateCall `
        -Fixture $script:fixture

      $result.Count | Should-Be 1
      $calls | Should-BeCollection @(
        $expectedIdentityCall,
        $expectedVersionCall,
        $expectedLoginCall,
        $expectedIdentityCall,
        $expectedStateCall
      )
      $allCalls | Should-NotMatchString "account`tlist"
      $allCalls | Should-NotMatchString "account`tset"
      $allCalls | Should-NotMatchString "login`t--use-device-code"
    }

    It 'Should repair one stale targeted token and continue without selection' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_TOKEN_MODE',
        'stale',
        'Process'
      )

      $result = @(
        & $script:entryPoint `
          stop `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming
      )
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $allCalls = $calls -join [System.Environment]::NewLine
      $expectedIdentityCall = Get-AzureDevLifecycleExpectedIdentityCall `
        -Fixture $script:fixture
      $expectedTokenCall = Get-AzureDevLifecycleExpectedTokenCall `
        -Fixture $script:fixture
      $expectedVersionCall = Get-AzureDevLifecycleExpectedVersionCall
      $expectedLoginCall = Get-AzureDevLifecycleExpectedLoginCall `
        -Fixture $script:fixture
      $expectedStateCall = Get-AzureDevLifecycleExpectedStateCall `
        -Fixture $script:fixture

      $result.Count | Should-Be 1
      $calls | Should-BeCollection @(
        $expectedIdentityCall,
        $expectedTokenCall,
        $expectedVersionCall,
        $expectedLoginCall,
        $expectedIdentityCall,
        $expectedStateCall,
        (
          "CALL`tvm`tdeallocate`t--subscription" +
          "`t$($script:fixture.SubscriptionId)`t--resource-group" +
          "`tisolated-rg`t--name`tisolated-vm`t--no-wait" +
          "`t--output`tnone`t--only-show-errors"
        )
      )
      $allCalls | Should-NotMatchString "account`tlist|account`tset"
      $allCalls | Should-NotMatchString "login`t--use-device-code"
    }

    It 'Should return one authentication failure after targeted repair fails' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_PROFILE_MODE',
        'mismatch',
        'Process'
      )
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_LOGIN_MODE',
        'reject',
        'Process'
      )

      $result = @()
      $caught = $null
      try {
        $result = @(& $script:entryPoint `
          stop `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming)
      } catch {
        $caught = $_
      }
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $records = @(Get-AzureDevLifecyclePublicCommandRecords `
          -Fixture $script:fixture)

      $caught | Should-NotBeNull
      $result.Count | Should-Be 0
      $records.Count | Should-Be 1
      $record = $records[0]
      $record.failurePhase | Should-Be 'authentication'
      $record.observedState | Should-BeNull
      $record.action | Should-BeNull
      ($record | ConvertTo-Json -Compress) |
        Should-NotMatchString 'fake-harness-secret'
      @($calls | Where-Object { $_ -match "CALL`tvm`t" }).Count |
        Should-Be 0
      @($calls | Where-Object { $_ -match "CALL`tlogin`t" }).Count |
        Should-Be 1
    }
  }

  Context 'When lifecycle configuration is incomplete' {
    BeforeDiscovery {
      $configurationCommands = @(
        @{ CommandName = 'start'; ExpectedCommand = 'start' },
        @{ CommandName = 'stop'; ExpectedCommand = 'stop' },
        @{ CommandName = 'status'; ExpectedCommand = $null }
      )
    }

    It 'Should expose a stable <CommandName> configuration failure before invoking Azure' `
      -ForEach $configurationCommands {
      $incompleteRoot = Join-Path $TestDrive "incomplete-$CommandName"
      New-Item -ItemType Directory -Path $incompleteRoot -Force | Out-Null

      $captured = $null
      try {
        $null = & $script:entryPoint `
          $CommandName `
          -RepositoryRoot $incompleteRoot
      } catch {
        $captured = $_
      }

      $captured.FullyQualifiedErrorId |
        Should-MatchString '^AzureDevLifecycleFailure\.configuration'
      $captured.TargetObject.PSObject.TypeNames[0] |
        Should-Be 'AzureDev.LifecycleFailure'
      $captured.TargetObject.Phase | Should-Be 'configuration'
      $captured.TargetObject.Command | Should-Be $ExpectedCommand
      $captured.TargetObject.VmName | Should-BeNull
      @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture).Count | Should-Be 0
      Test-Path -LiteralPath (Join-Path $incompleteRoot '.azure') |
        Should-BeFalse
    }
  }

  Context 'When lifecycle lock acquisition fails' {
    It 'Should record lock failure before authentication or mutation' {
      $azurePath = Join-Path $script:fixture.RepositoryRoot '.azure'
      New-Item -ItemType Directory -Path $azurePath | Out-Null
      Set-Content `
        -LiteralPath (Join-Path $azurePath 'lifecycle-locks') `
        -Value 'blocks lock directory creation'

      {
        & $script:entryPoint `
          stop `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming
      } | Should-Throw
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $records = @(Get-AzureDevLifecyclePublicCommandRecords `
          -Fixture $script:fixture)

      $calls.Count | Should-Be 0
      $records.Count | Should-Be 1
      $record = $records[0]
      $record.failurePhase | Should-Be 'lock'
      $record.mutationAccepted | Should-BeFalse
    }
  }

  Context 'When stop is requested' {
    BeforeDiscovery {
      $stopCases = @(
        @{
          Raw = 'PowerState/starting'
          Observed = 'starting'
          Result = 'requested'
          Action = 'deallocation-requested'
          MutationCount = 1
        },
        @{
          Raw = 'PowerState/running'
          Observed = 'running'
          Result = 'requested'
          Action = 'deallocation-requested'
          MutationCount = 1
        },
        @{
          Raw = 'PowerState/stopping'
          Observed = 'stopping'
          Result = 'requested'
          Action = 'deallocation-requested'
          MutationCount = 1
        },
        @{
          Raw = 'PowerState/stopped'
          Observed = 'stopped-allocated'
          Result = 'requested'
          Action = 'deallocation-requested'
          MutationCount = 1
        },
        @{
          Raw = 'read-failed'
          Observed = 'unavailable'
          Result = 'requested'
          Action = 'deallocation-requested'
          MutationCount = 1
        },
        @{
          Raw = 'PowerState/creating'
          Observed = 'creating'
          Result = 'requested'
          Action = 'deallocation-requested'
          MutationCount = 1
        },
        @{
          Raw = 'PowerState/deallocating'
          Observed = 'deallocating'
          Result = 'already-requested'
          Action = 'none'
          MutationCount = 0
        },
        @{
          Raw = 'PowerState/deallocated'
          Observed = 'deallocated'
          Result = 'already-deallocated'
          Action = 'none'
          MutationCount = 0
        }
      )
    }

    It 'Should return <Result> from <Observed> with <MutationCount> mutation' `
      -ForEach $stopCases {
      $expectedResult = $Result
      $expectedObserved = $Observed
      $expectedAction = $Action
      $expectedMutationCount = $MutationCount
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        $Raw,
        'Process'
      )

      $information = @()
      $result = @(
        & $script:entryPoint `
          stop `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -InformationVariable information
      )
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $deallocateCalls = @($calls | Where-Object {
          $_ -match "^CALL`tvm`tdeallocate`t"
        })

      $result.Count | Should-Be 1
      $result[0].PSObject.TypeNames[0] | Should-Be 'AzureDev.LifecycleResult'
      $result[0].Command | Should-Be 'stop'
      $result[0].Result | Should-Be $expectedResult
      $result[0].VmName | Should-Be 'isolated-vm'
      $result[0].ObservedState | Should-Be $expectedObserved
      $result[0].Action | Should-Be $expectedAction
      $deallocateCalls.Count | Should-Be $expectedMutationCount
      if ($expectedMutationCount -eq 1) {
        $deallocateCalls[0] | Should-Be (
          "CALL`tvm`tdeallocate`t--subscription" +
          "`t$($script:fixture.SubscriptionId)`t--resource-group" +
          "`tisolated-rg`t--name`tisolated-vm`t--no-wait" +
          "`t--output`tnone`t--only-show-errors"
        )
      }
      @($information.MessageData.Event) |
        Should-ContainCollection 'authentication', 'observed-state'
      if ($expectedMutationCount -eq 1) {
        @($information.MessageData.Event) |
          Should-ContainCollection 'submission'
      }
      Test-Path -LiteralPath $script:fixture.ForbiddenLog |
        Should-BeFalse
      @(Get-ChildItem `
          -LiteralPath (
            Join-Path $script:fixture.RepositoryRoot '.azure/lifecycle-locks'
          ) `
          -File `
          -ErrorAction SilentlyContinue).Count | Should-Be 0
      $records = @(Get-AzureDevLifecyclePublicCommandRecords `
          -Fixture $script:fixture)
      $records.Count | Should-Be 1
      $records[0].command | Should-Be 'stop'
      $records[0].terminalResult | Should-Be $expectedResult
      $records[0].observedState | Should-Be $expectedObserved
      $records[0].action | Should-Be $expectedAction
      $records[0].mutationAccepted |
        Should-Be ($expectedMutationCount -eq 1)
    }

    It 'Should load each appended JSONL record independently' {
      $first = @(
        & $script:entryPoint `
          stop `
          -RepositoryRoot $script:fixture.RepositoryRoot
      )
      $second = @(
        & $script:entryPoint `
          stop `
          -RepositoryRoot $script:fixture.RepositoryRoot
      )

      $records = @(Get-AzureDevLifecyclePublicCommandRecords `
          -Fixture $script:fixture)

      $first.Count | Should-Be 1
      $second.Count | Should-Be 1
      $records.Count | Should-Be 2
      @($records.command) | Should-BeCollection @('stop', 'stop')
    }

    It 'Should fail not-found with no mutation or lifecycle result' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        'not-found',
        'Process'
      )

      $output = & $script:powerShellPath `
        -NoLogo `
        -NoProfile `
        -File $script:entryPoint `
        stop `
        -RepositoryRoot $script:fixture.RepositoryRoot 2>&1
      $exitCode = $LASTEXITCODE
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)

      $exitCode | Should-Be 1
      @($output | Where-Object {
          $_ -isnot [System.String] -and
          $_.PSObject.TypeNames -contains 'AzureDev.LifecycleResult'
        }).Count | Should-Be 0
      @($calls | Where-Object { $_ -match "^CALL`tvm`tdeallocate`t" }).Count |
        Should-Be 0
      $records = @(Get-AzureDevLifecyclePublicCommandRecords `
          -Fixture $script:fixture)
      $records.Count | Should-Be 1
      $record = $records[0]
      $record.failurePhase | Should-Be 'not-found'
      $record.terminalResult | Should-BeNull
    }

    It 'Should fail an unrecognized state without deallocation' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        'PowerState/unknown',
        'Process'
      )

      {
        & $script:entryPoint `
          stop `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming
      } | Should-Throw -ExceptionMessage '*unrecognized*'
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $records = @(Get-AzureDevLifecyclePublicCommandRecords `
          -Fixture $script:fixture)

      @($calls | Where-Object { $_ -match "CALL`tvm`tdeallocate`t" }).Count |
        Should-Be 0
      $records.Count | Should-Be 1
      $record = $records[0]
      $record.failurePhase | Should-Be 'state-read'
      $record.observedState | Should-Be 'unrecognized'
    }

    It 'Should fail a rejected submission with one error and one failure record' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_DEALLOCATE_MODE',
        'reject',
        'Process'
      )

      $output = & $script:powerShellPath `
        -NoLogo `
        -NoProfile `
        -File $script:entryPoint `
        stop `
        -RepositoryRoot $script:fixture.RepositoryRoot 2>&1
      $exitCode = $LASTEXITCODE
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)

      $exitCode | Should-Be 1
      @($output | Where-Object {
          $_ -is [System.Management.Automation.ErrorRecord]
        }).Count | Should-Be 1
      @($output | Where-Object {
          $_ -isnot [System.String] -and
          $_.PSObject.TypeNames -contains 'AzureDev.LifecycleResult'
        }).Count | Should-Be 0
      @($calls | Where-Object { $_ -match "^CALL`tvm`tdeallocate`t" }).Count |
        Should-Be 1
      $records = @(Get-AzureDevLifecyclePublicCommandRecords `
          -Fixture $script:fixture)
      $records.Count | Should-Be 1
      $record = $records[0]
      $record.failurePhase | Should-Be 'deallocation-submission'
      $record.mutationAccepted | Should-BeFalse
    }

    It 'Should preserve success and emit one warning if lifecycle logging fails' {
      $azurePath = Join-Path $script:fixture.RepositoryRoot '.azure'
      New-Item -ItemType Directory -Path $azurePath -Force | Out-Null
      Set-Content -LiteralPath (Join-Path $azurePath 'logs') -Value 'blocked'

      $output = @(
        & $script:entryPoint `
          stop `
          -RepositoryRoot $script:fixture.RepositoryRoot 3>&1
      )

      @($output | Where-Object {
          $_.PSObject.TypeNames -contains 'AzureDev.LifecycleResult'
        }).Count | Should-Be 1
      @($output | Where-Object {
          $_ -is [System.Management.Automation.WarningRecord]
        }).Count | Should-Be 1
    }

    It 'Should exit zero if only lifecycle logging fails' {
      $azurePath = Join-Path $script:fixture.RepositoryRoot '.azure'
      New-Item -ItemType Directory -Path $azurePath -Force | Out-Null
      Set-Content -LiteralPath (Join-Path $azurePath 'logs') -Value 'blocked'

      $output = & $script:powerShellPath `
        -NoLogo `
        -NoProfile `
        -File $script:entryPoint `
        stop `
        -RepositoryRoot $script:fixture.RepositoryRoot 2>&1
      $exitCode = $LASTEXITCODE
      $outputLines = @($output | ForEach-Object { "$_" })

      $exitCode | Should-Be 0
      @($outputLines | Where-Object {
          $_ -match 'lifecycle log record could not be written'
        }).Count | Should-Be 1
    }

    It 'Should preserve the primary error and exit one if logging also fails' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_DEALLOCATE_MODE',
        'reject',
        'Process'
      )
      $azurePath = Join-Path $script:fixture.RepositoryRoot '.azure'
      New-Item -ItemType Directory -Path $azurePath -Force | Out-Null
      Set-Content -LiteralPath (Join-Path $azurePath 'logs') -Value 'blocked'

      $output = & $script:powerShellPath `
        -NoLogo `
        -NoProfile `
        -File $script:entryPoint `
        stop `
        -RepositoryRoot $script:fixture.RepositoryRoot 2>&1
      $exitCode = $LASTEXITCODE
      $outputText = @($output | ForEach-Object { "$_" }) -join `
        [System.Environment]::NewLine

      $exitCode | Should-Be 1
      @($output | Where-Object {
          $_ -is [System.Management.Automation.ErrorRecord]
        }).Count | Should-Be 1
      @($output | Where-Object {
          $_ -isnot [System.String] -and
          $_.PSObject.TypeNames -contains 'AzureDev.LifecycleResult'
        }).Count | Should-Be 0
      $outputText |
        Should-MatchString 'did not accept the asynchronous deallocation'
      @($output | Where-Object {
          "$_" -match 'lifecycle log record could not be written'
        }).Count | Should-Be 1
    }
  }

  Context 'When a successful lifecycle command runs in a child process' {
    BeforeDiscovery {
      $successCases = @(
        @{
          CommandName = 'start'
          Result = 'already-running'
          Action = 'none'
          MutationVerb = 'start'
          MutationCount = 0
        },
        @{
          CommandName = 'stop'
          Result = 'requested'
          Action = 'deallocation-requested'
          MutationVerb = 'deallocate'
          MutationCount = 1
        }
      )
    }

    It 'Should exit zero with exactly one <CommandName> result' `
      -ForEach $successCases {
      $output = & $script:powerShellPath `
        -NoLogo `
        -NoProfile `
        -File $script:fixture.ResultProbePath `
        -EntryPoint $script:entryPoint `
        -CommandName $CommandName `
        -RepositoryRoot $script:fixture.RepositoryRoot 2>&1
      $exitCode = $LASTEXITCODE
      $outputLines = @($output | ForEach-Object { "$_" })

      $exitCode | Should-Be 0
      $outputLines.Count | Should-Be 1
      $contract = $outputLines[0] | ConvertFrom-Json
      $contract.Count | Should-Be 1
      $contract.TypeName | Should-Be 'AzureDev.LifecycleResult'
      @($contract.PropertyNames) | Should-BeCollection @(
        'Command',
        'Result',
        'VmName',
        'ObservedState',
        'Action'
      )
      $contract.Command | Should-Be $CommandName
      $contract.Result | Should-Be $Result
      $contract.VmName | Should-Be 'isolated-vm'
      $contract.ObservedState | Should-Be 'running'
      $contract.Action | Should-Be $Action
      @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture | Where-Object {
          $_ -match "^CALL`tvm`t$MutationVerb`t"
        }).Count | Should-Be $MutationCount
    }
  }

  Context 'When start is already running' {
    It 'Should return one typed result and only the two connection entry points' {
      $azurePath = Join-Path $script:fixture.RepositoryRoot '.azure'
      $setupStatePath = Join-Path $azurePath 'development.state.json'
      New-Item -ItemType Directory -Path $azurePath | Out-Null
      Set-Content `
        -LiteralPath $setupStatePath `
        -Value '{malformed-setup-state-sentinel' `
        -NoNewline
      $unreadAccessTime = [System.DateTime]::UnixEpoch
      [System.IO.File]::SetLastAccessTimeUtc(
        $setupStatePath,
        $unreadAccessTime
      )
      $information = @()
      $commandDiscoveryPath = Join-Path $TestDrive 'command-discovery.log'

      $result = @(
        Trace-Command `
          -Name CommandDiscovery `
          -FilePath $commandDiscoveryPath `
          -Expression {
            & $script:entryPoint `
              start `
              -RepositoryRoot $script:fixture.RepositoryRoot `
              -LifecycleTiming $script:lifecycleTiming `
              -InformationVariable information
          }
      )
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $expectedIdentityCall = Get-AzureDevLifecycleExpectedIdentityCall `
        -Fixture $script:fixture
      $expectedTokenCall = Get-AzureDevLifecycleExpectedTokenCall `
        -Fixture $script:fixture
      $expectedStateCall = Get-AzureDevLifecycleExpectedStateCall `
        -Fixture $script:fixture

      $result.Count | Should-Be 1
      $result[0].PSObject.TypeNames[0] | Should-Be 'AzureDev.LifecycleResult'
      $result[0].Result | Should-Be 'already-running'
      $result[0].ObservedState | Should-Be 'running'
      $result[0].Action | Should-Be 'none'
      $calls | Should-BeCollection @(
        $expectedIdentityCall,
        $expectedTokenCall,
        $expectedStateCall
      )
      $guidance = @(
        $information |
          Where-Object {
            $_.MessageData -is
              [System.Management.Automation.HostInformationMessage]
          } |
          ForEach-Object { $_.MessageData.Message }
      )
      $guidance | Should-BeCollection @(
        'SSH: ssh isolated-alias',
        'VS Code: code --remote ssh-remote+isolated-alias /workspace'
      )
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
      Test-Path -LiteralPath (Join-Path $script:fixture.HomePath '.ssh') |
        Should-BeFalse
      (Get-Item -LiteralPath $setupStatePath).LastAccessTimeUtc |
        Should-Be $unreadAccessTime
      Get-Content -LiteralPath $setupStatePath -Raw |
        Should-Be '{malformed-setup-state-sentinel'
      $commandDiscovery = Get-Content -LiteralPath $commandDiscoveryPath -Raw
      foreach ($commandName in $script:fixture.ForbiddenCommandNames) {
        $escapedCommandName = [System.Text.RegularExpressions.Regex]::Escape(
          $commandName
        )
        $commandDiscovery |
          Should-NotMatchString (
            "Looking (?:up command:|for) $escapedCommandName" +
            '(?:\.ps1)?(?:\s|$)'
          )
      }
      @(Get-ChildItem -LiteralPath (
            Join-Path $script:fixture.RepositoryRoot '.azure/lifecycle-locks'
          ) -File).Count | Should-Be 0
      $logFile = @(Get-ChildItem -LiteralPath (
          Join-Path $script:fixture.RepositoryRoot '.azure/logs'
        ) -File)[0]
      $logRecord = Get-Content -LiteralPath $logFile.FullName -Raw |
        ConvertFrom-Json
      @($logRecord.PSObject.Properties.Name) | Should-BeCollection @(
        'schemaVersion',
        'recordType',
        'timestamp',
        'command',
        'subscriptionId',
        'resourceGroup',
        'vmName',
        'terminalResult',
        'failurePhase',
        'observedState',
        'action',
        'mutationAccepted',
        'elapsedMilliseconds'
      )
      $logRecord.schemaVersion | Should-Be 1
      $logRecord.recordType |
        Should-Be 'azure-development-environment-lifecycle'
      $logRecord.terminalResult | Should-Be 'already-running'
      $logRecord.action | Should-Be 'none'
      $logRecord.mutationAccepted | Should-BeFalse
      (Get-Content -LiteralPath $logFile.FullName -Raw) |
        Should-NotMatchString 'fake-harness-secret|token|setup-state-sentinel'
    }

  }

  Context 'When start first observes a downward transition' {
    BeforeDiscovery {
      $downwardCases = @(
        @{
          Sequence = (
            'PowerState/stopping,PowerState/deallocating,' +
            'PowerState/deallocated,PowerState/deallocated,' +
            'PowerState/running'
          )
          Action = 'start-requested'
          MutationCount = 1
          Result = 'running'
          LockSequence = 'locked,unlocked,unlocked,locked,unlocked'
        },
        @{
          Sequence = (
            'PowerState/deallocating,PowerState/stopped,' +
            'PowerState/starting,PowerState/running'
          )
          Action = 'joined-start'
          MutationCount = 0
          Result = 'running'
          LockSequence = 'locked,unlocked,locked,unlocked'
        },
        @{
          Sequence = (
            'PowerState/stopping,PowerState/stopped,PowerState/running'
          )
          Action = 'none'
          MutationCount = 0
          Result = 'already-running'
          LockSequence = 'locked,unlocked,locked'
        },
        @{
          Sequence = (
            'PowerState/deallocating,PowerState/starting,' +
            'PowerState/starting,PowerState/running'
          )
          Action = 'joined-start'
          MutationCount = 0
          Result = 'running'
          LockSequence = 'locked,unlocked,locked,unlocked'
        }
      )
    }

    It 'Should converge a downward sequence as <Action>' `
      -ForEach $downwardCases {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE_SEQUENCE',
        $Sequence,
        'Process'
      )
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_EXPECTED_LOCK_STATE_SEQUENCE',
        $LockSequence,
        'Process'
      )
      $expectedResult = $Result
      $expectedAction = $Action
      $expectedMutationCount = $MutationCount

      $resultObjects = @(
        & $script:entryPoint `
          start `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming
      )
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $startCalls = @($calls | Where-Object { $_ -match "CALL`tvm`tstart" })
      $profileReads = @($calls | Where-Object {
          $_ -match "CALL`taccount`tshow"
        })

      $resultObjects.Count | Should-Be 1
      $resultObjects[0].Result | Should-Be $expectedResult
      $resultObjects[0].Action | Should-Be $expectedAction
      $startCalls.Count | Should-Be $expectedMutationCount
      $profileReads.Count | Should-Be 2
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
      @(Get-ChildItem -LiteralPath (
            Join-Path $script:fixture.RepositoryRoot '.azure/lifecycle-locks'
          ) -File).Count | Should-Be 0
      $logFile = @(Get-ChildItem -LiteralPath (
          Join-Path $script:fixture.RepositoryRoot '.azure/logs'
        ) -File)[0]
      $logRecord = Get-Content -LiteralPath $logFile.FullName -Raw |
        ConvertFrom-Json
      $logRecord.terminalResult | Should-Be $expectedResult
      $logRecord.action | Should-Be $expectedAction
      $logRecord.mutationAccepted |
        Should-Be ($expectedMutationCount -eq 1)
    }

    It 'Should time out the stable-stop wait without a mutation' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        'PowerState/stopping',
        'Process'
      )
      $script:virtualClock.DelayMultiplier = [System.Int64]120

      $result = @()
      $caught = $null
      try {
        $result = @(& $script:entryPoint `
          start `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming)
      } catch {
        $caught = $_
      }
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $logFile = @(Get-ChildItem -LiteralPath (
          Join-Path $script:fixture.RepositoryRoot '.azure/logs'
        ) -File)[0]
      $logRecord = Get-Content -LiteralPath $logFile.FullName -Raw |
        ConvertFrom-Json

      $caught.Exception.Message | Should-BeLikeString '*stable stopped state*'
      $result.Count | Should-Be 0
      @($calls | Where-Object { $_ -match "CALL`tvm`tstart" }).Count |
        Should-Be 0
      $logRecord.failurePhase | Should-Be 'stable-stop-wait'
      $logRecord.elapsedMilliseconds | Should-Be 600000
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
    }

    It 'Should propagate interruption without a result or lifecycle record' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        'PowerState/deallocating',
        'Process'
      )
      $script:lifecycleTiming.DelayMilliseconds = {
        throw [System.OperationCanceledException]::new('interrupted')
      }

      $result = @()
      $caught = $null
      try {
        $result = @(& $script:entryPoint `
          start `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming)
      } catch {
        $caught = $_
      }

      $caught.Exception.GetType().FullName |
        Should-Be 'System.OperationCanceledException'
      $result.Count | Should-Be 0
      Test-Path -LiteralPath (
        Join-Path $script:fixture.RepositoryRoot '.azure/logs'
      ) | Should-BeFalse
      @(Get-ChildItem -LiteralPath (
            Join-Path $script:fixture.RepositoryRoot '.azure/lifecycle-locks'
          ) -File).Count | Should-Be 0
    }

    It 'Should exit 130 without residue after a real SIGINT' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        'PowerState/deallocating',
        'Process'
      )
      $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
      $startInfo.FileName = $script:powerShellPath
      $startInfo.UseShellExecute = $false
      $startInfo.RedirectStandardOutput = $true
      $startInfo.RedirectStandardError = $true
      foreach ($argument in @(
          '-NoLogo',
          '-NoProfile',
          '-File',
          $script:entryPoint,
          'start',
          '-RepositoryRoot',
          $script:fixture.RepositoryRoot
        )) {
        $startInfo.ArgumentList.Add($argument)
      }
      $script:interruptProcess = [System.Diagnostics.Process]::new()
      $script:interruptProcess.StartInfo = $startInfo

      $script:interruptProcess.Start() | Should-BeTrue
      $readyDeadline = [System.Diagnostics.Stopwatch]::StartNew()
      $lockDirectory = Join-Path `
        $script:fixture.RepositoryRoot `
        '.azure/lifecycle-locks'
      while (
        (
          -not (Test-Path `
            -LiteralPath $script:fixture.VmStateReadCountFile) -or
          @(
            Get-ChildItem `
              -LiteralPath $lockDirectory `
              -Filter 'lifecycle-*.lock' `
              -File `
              -ErrorAction SilentlyContinue
          ).Count -gt 0
        ) -and
        -not $script:interruptProcess.HasExited -and
        $readyDeadline.ElapsedMilliseconds -lt 5000
      ) {
        Start-Sleep -Milliseconds 10
      }
      Test-Path -LiteralPath $script:fixture.VmStateReadCountFile |
        Should-BeTrue
      @(
        Get-ChildItem `
          -LiteralPath $lockDirectory `
          -Filter 'lifecycle-*.lock' `
          -File `
          -ErrorAction SilentlyContinue
      ).Count | Should-Be 0

      & /bin/kill -INT $script:interruptProcess.Id
      $LASTEXITCODE | Should-Be 0
      $script:interruptProcess.WaitForExit(5000) | Should-BeTrue
      $exitCode = $script:interruptProcess.ExitCode
      $output = @(
        $script:interruptProcess.StandardOutput.ReadToEnd(),
        $script:interruptProcess.StandardError.ReadToEnd()
      ) -join [System.Environment]::NewLine
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)

      $exitCode | Should-Be 130
      $output | Should-NotMatchString 'AzureDev.LifecycleResult'
      @($calls | Where-Object { $_ -match "CALL`tvm`tstart" }).Count |
        Should-Be 0
      Test-Path -LiteralPath (
        Join-Path $script:fixture.RepositoryRoot '.azure/logs'
      ) | Should-BeFalse
      @(
        Get-ChildItem `
          -LiteralPath $lockDirectory `
          -Filter 'lifecycle-*.lock' `
          -File `
          -ErrorAction SilentlyContinue
      ).Count | Should-Be 0
    }
  }

  Context 'When start joins or submits an upward transition' {
    BeforeDiscovery {
      $startCases = @(
        @{
          InitialState = 'PowerState/starting'
          Action = 'joined-start'
          MutationCount = 0
        },
        @{
          InitialState = 'PowerState/stopped'
          Action = 'start-requested'
          MutationCount = 1
        },
        @{
          InitialState = 'PowerState/deallocated'
          Action = 'start-requested'
          MutationCount = 1
        }
      )
    }

    It 'Should converge <InitialState> with <Action>' -ForEach $startCases {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        $InitialState,
        'Process'
      )
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE_AFTER_READ',
        'PowerState/running',
        'Process'
      )

      $result = @(
        & $script:entryPoint `
          start `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming
      )
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $startCalls = @($calls | Where-Object { $_ -match "CALL`tvm`tstart" })

      $result.Count | Should-Be 1
      $result[0].Result | Should-Be 'running'
      $result[0].Action | Should-Be $Action
      $startCalls.Count | Should-Be $MutationCount
      if ($MutationCount -eq 1) {
        $startCalls[0] | Should-Be (
          "CALL`tvm`tstart`t--subscription" +
          "`t$($script:fixture.SubscriptionId)" +
          "`t--resource-group`tisolated-rg" +
          "`t--name`tisolated-vm`t--no-wait" +
          "`t--output`tnone`t--only-show-errors"
        )
      }
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
      Test-Path -LiteralPath (Join-Path $script:fixture.HomePath '.ssh') |
        Should-BeFalse
    }

    It 'Should report heartbeat and state-change progress with virtual time' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        'PowerState/starting',
        'Process'
      )
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE_AFTER_READ',
        'PowerState/running',
        'Process'
      )
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_STATE_CHANGE_AFTER_READS',
        '6',
        'Process'
      )
      $information = @()

      $result = & $script:entryPoint `
        start `
        -RepositoryRoot $script:fixture.RepositoryRoot `
        -LifecycleTiming $script:lifecycleTiming `
        -InformationVariable information
      $events = @(
        $information |
          ForEach-Object { $_.MessageData } |
          Where-Object {
            $_.PSObject.TypeNames -contains 'AzureDev.LifecycleProgressEvent'
          }
      )

      $result.Result | Should-Be 'running'
      @($events | Where-Object {
          $_.Event -eq 'heartbeat' -and
          $_.ElapsedMilliseconds -eq 30000
        }).Count | Should-Be 1
      @($events | Where-Object {
          $_.Event -eq 'state-change' -and
          $_.ObservedState -eq 'running'
        }).Count | Should-Be 1
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
    }

    It 'Should record one rejected start without retrying the mutation' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        'PowerState/deallocated',
        'Process'
      )
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_START_MODE',
        'reject',
        'Process'
      )

      {
        & $script:entryPoint `
          start `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming
      } | Should-Throw -ExceptionMessage '*did not accept*'
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $records = @(Get-AzureDevLifecyclePublicCommandRecords `
          -Fixture $script:fixture)

      @($calls | Where-Object { $_ -match "CALL`tvm`tstart`t" }).Count |
        Should-Be 1
      $records.Count | Should-Be 1
      $record = $records[0]
      $record.failurePhase | Should-Be 'start-submission'
      $record.action | Should-Be 'start-requested'
      $record.mutationAccepted | Should-BeFalse
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
    }
  }

  Context 'When real start confirmation reaches the public script boundary' {
    BeforeDiscovery {
      $confirmationCases = @(
        @{
          Response = 'Y'
          MutationCount = 1
          RecordCount = 1
          ExpectedResult = 'running'
        },
        @{
          Response = 'N'
          MutationCount = 0
          RecordCount = 0
          ExpectedResult = $null
        }
      )
    }

    BeforeEach {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        'PowerState/deallocated',
        'Process'
      )
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE_AFTER_READ',
        'PowerState/running',
        'Process'
      )
    }

    It 'Should honor a <Response> answer at the exact start mutation boundary' `
      -ForEach $confirmationCases {
      $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
      $startInfo.FileName = $script:powerShellPath
      $startInfo.UseShellExecute = $false
      $startInfo.RedirectStandardInput = $true
      $startInfo.RedirectStandardOutput = $true
      $startInfo.RedirectStandardError = $true
      foreach ($argument in @(
          '-NoLogo',
          '-NoProfile',
          '-File',
          $script:entryPoint,
          'start',
          '-RepositoryRoot',
          $script:fixture.RepositoryRoot,
          '-Confirm'
        )) {
        $startInfo.ArgumentList.Add($argument)
      }
      $process = [System.Diagnostics.Process]::new()
      $process.StartInfo = $startInfo
      $script:interruptProcess = $process

      $process.Start() | Should-BeTrue
      $process.StandardInput.WriteLine($Response)
      $process.StandardInput.Close()
      $process.WaitForExit(10000) | Should-BeTrue
      $output = @(
        $process.StandardOutput.ReadToEnd(),
        $process.StandardError.ReadToEnd()
      ) -join [System.Environment]::NewLine
      $exitCode = $process.ExitCode
      $process.Dispose()
      $script:interruptProcess = $null
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $records = [System.Object[]]@(
        Get-AzureDevLifecyclePublicCommandRecords -Fixture $script:fixture
      )

      $exitCode | Should-Be 0 -Because $output
      $output | Should-MatchString 'Submit asynchronous Azure VM start'
      @($calls | Where-Object { $_ -match "CALL`tvm`tstart`t" }).Count |
        Should-Be $MutationCount
      $records.Count | Should-Be $RecordCount
      if ($null -ne $ExpectedResult) {
        $records[0].terminalResult | Should-Be $ExpectedResult
        $records[0].mutationAccepted | Should-BeTrue
      } else {
        $output | Should-NotMatchString 'SSH:'
        $output | Should-NotMatchString 'VS Code:'
      }
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
      @(Get-ChildItem -LiteralPath (
            Join-Path $script:fixture.RepositoryRoot '.azure/lifecycle-locks'
          ) -File).Count | Should-Be 0
    }

    It 'Should preserve stop confirmation before any real execution' {
      $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
      $startInfo.FileName = $script:powerShellPath
      $startInfo.UseShellExecute = $false
      $startInfo.RedirectStandardInput = $true
      $startInfo.RedirectStandardOutput = $true
      $startInfo.RedirectStandardError = $true
      foreach ($argument in @(
          '-NoLogo',
          '-NoProfile',
          '-File',
          $script:entryPoint,
          'stop',
          '-RepositoryRoot',
          $script:fixture.RepositoryRoot,
          '-Confirm'
        )) {
        $startInfo.ArgumentList.Add($argument)
      }
      $process = [System.Diagnostics.Process]::new()
      $process.StartInfo = $startInfo
      $script:interruptProcess = $process

      $process.Start() | Should-BeTrue
      $process.StandardInput.WriteLine('N')
      $process.StandardInput.Close()
      $process.WaitForExit(10000) | Should-BeTrue
      $output = @(
        $process.StandardOutput.ReadToEnd(),
        $process.StandardError.ReadToEnd()
      ) -join [System.Environment]::NewLine
      $exitCode = $process.ExitCode
      $process.Dispose()
      $script:interruptProcess = $null

      $exitCode | Should-Be 0
      $output |
        Should-MatchString 'Execute the normalized stop plan'
      @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture).Count | Should-Be 0
      Test-Path -LiteralPath (
        Join-Path $script:fixture.RepositoryRoot '.azure/logs'
      ) | Should-BeFalse
    }
  }

  Context 'When an upward transition fails after the lock is released' {
    BeforeDiscovery {
      $waitFailureCases = @(
        @{
          InitialState = 'PowerState/starting'
          Action = 'joined-start'
          MutationAccepted = $false
          MutationCount = 0
        },
        @{
          InitialState = 'PowerState/deallocated'
          Action = 'start-requested'
          MutationAccepted = $true
          MutationCount = 1
        }
      )
    }

    It 'Should record <Action> without another start' -ForEach $waitFailureCases {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        $InitialState,
        'Process'
      )
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE_AFTER_READ',
        'read-failed',
        'Process'
      )

      {
        & $script:entryPoint `
          start `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming
      } | Should-Throw -ExceptionMessage '*can still complete*'
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $startCalls = @($calls | Where-Object { $_ -match "CALL`tvm`tstart" })
      $logFile = @(Get-ChildItem -LiteralPath (
          Join-Path $script:fixture.RepositoryRoot '.azure/logs'
        ) -File)[0]
      $logRecord = Get-Content -LiteralPath $logFile.FullName -Raw |
        ConvertFrom-Json

      $startCalls.Count | Should-Be $MutationCount
      $logRecord.failurePhase | Should-Be 'running-wait'
      $logRecord.action | Should-Be $Action
      $logRecord.mutationAccepted | Should-Be $MutationAccepted
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
    }

    BeforeDiscovery {
      $outsideInterferenceCases = @(
        @{
          InitialState = 'PowerState/deallocated'
          DownwardState = 'PowerState/stopping'
          MutationCount = 1
          Action = 'start-requested'
          MutationAccepted = $true
        },
        @{
          InitialState = 'PowerState/deallocated'
          DownwardState = 'PowerState/deallocating'
          MutationCount = 1
          Action = 'start-requested'
          MutationAccepted = $true
        },
        @{
          InitialState = 'PowerState/starting'
          DownwardState = 'PowerState/stopped'
          MutationCount = 0
          Action = 'joined-start'
          MutationAccepted = $false
        },
        @{
          InitialState = 'PowerState/starting'
          DownwardState = 'PowerState/deallocated'
          MutationCount = 0
          Action = 'joined-start'
          MutationAccepted = $false
        }
      )
    }

    It 'Should expose <DownwardState> interference without a second start' `
      -ForEach $outsideInterferenceCases {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE_SEQUENCE',
        "$InitialState,$DownwardState",
        'Process'
      )
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_EXPECTED_LOCK_STATE_SEQUENCE',
        'locked,unlocked',
        'Process'
      )

      {
        & $script:entryPoint `
          start `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming
      } | Should-Throw -ExceptionMessage (
        '*outside interference*Azure may still complete the earlier operation*'
      )
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $logFile = @(Get-ChildItem -LiteralPath (
          Join-Path $script:fixture.RepositoryRoot '.azure/logs'
        ) -File)[0]
      $logRecord = Get-Content -LiteralPath $logFile.FullName -Raw |
        ConvertFrom-Json

      @($calls | Where-Object { $_ -match "CALL`tvm`tstart" }).Count |
        Should-Be $MutationCount
      $logRecord.failurePhase | Should-Be 'outside-interference'
      $logRecord.action | Should-Be $Action
      $logRecord.mutationAccepted | Should-Be $MutationAccepted
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
    }
  }

  Context 'When the running deadline expires' {
    BeforeEach {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        'PowerState/starting',
        'Process'
      )
      $script:virtualClock.DelayMultiplier = [System.Int64]120
    }

    It 'Should record timeout without rollback or a second start' {
      $result = @()
      $caught = $null
      try {
        $result = @(& $script:entryPoint `
          start `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming)
      } catch {
        $caught = $_
      }
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)
      $logFile = @(Get-ChildItem -LiteralPath (
          Join-Path $script:fixture.RepositoryRoot '.azure/logs'
        ) -File)[0]
      $logRecord = Get-Content -LiteralPath $logFile.FullName -Raw |
        ConvertFrom-Json

      $caught | Should-NotBeNull
      $caught.Exception.Message | Should-BeLikeString (
        '*within ten minutes*can still complete*no rollback or second start*'
      )
      $result.Count | Should-Be 0
      @($calls | Where-Object { $_ -match "CALL`tvm`tstart" }).Count |
        Should-Be 0
      $logRecord.failurePhase | Should-Be 'running-wait'
      $logRecord.action | Should-Be 'joined-start'
      $logRecord.elapsedMilliseconds | Should-Be 600000
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
    }

  }

  Context 'When start is blocked by the decisive state' {
    BeforeDiscovery {
      $blockedCases = @(
        @{ RawState = 'not-found' },
        @{ RawState = 'read-failed' },
        @{ RawState = 'PowerState/creating' },
        @{ RawState = 'PowerState/unknown' }
      )
    }

    It 'Should fail <RawState> without a lifecycle mutation' `
      -ForEach $blockedCases {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        $RawState,
        'Process'
      )

      $result = @()
      $caught = $null
      try {
        $result = @(& $script:entryPoint `
          start `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -LifecycleTiming $script:lifecycleTiming)
      } catch {
        $caught = $_
      }
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)

      $caught | Should-NotBeNull
      $result.Count | Should-Be 0
      @($calls | Where-Object { $_ -match "CALL`tvm`tstart" }).Count |
        Should-Be 0
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
    }

    It 'Should exit one and report unavailable state from a child process' {
      [System.Environment]::SetEnvironmentVariable(
        'FAKE_AZ_VM_STATE',
        'read-failed',
        'Process'
      )

      $output = & $script:powerShellPath `
        -NoLogo `
        -NoProfile `
        -File $script:entryPoint `
        start `
        -RepositoryRoot $script:fixture.RepositoryRoot 2>&1
      $exitCode = $LASTEXITCODE
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)

      $exitCode | Should-Be 1
      (@($output | ForEach-Object { "$_" }) -join [System.Environment]::NewLine) |
        Should-MatchString "state 'unavailable' cannot safely be started"
      @($calls | Where-Object { $_ -match "CALL`tvm`tstart" }).Count |
        Should-Be 0
    }
  }
}
