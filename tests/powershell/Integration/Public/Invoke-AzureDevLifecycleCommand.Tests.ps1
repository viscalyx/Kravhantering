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
    Clear-AzureDevLifecyclePublicCommandEvidence -Fixture $script:fixture
    [System.Environment]::SetEnvironmentVariable(
      'FAKE_AZ_PROFILE_MODE',
      'exact',
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
      'FAKE_AZ_VM_STATE_AFTER_READ',
      $null,
      'Process'
    )
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

    It 'Should exit zero after a complete <CommandName> preview with no result' `
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
      @($output | Where-Object {
          $_ -isnot [System.String] -and
          $_.PSObject.TypeNames -contains 'AzureDev.LifecycleResult'
        }).Count | Should-Be 0
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
        @{ Raw = 'PowerState/stopped'; Expected = 'stopped-allocated' },
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

      $result.Count | Should-Be 0
      @($information.MessageData.Message) |
        Should-ContainCollection "Power state: $Expected"
      $calls.Count | Should-Be 3
      $calls[2] | Should-MatchString (
        "CALL`tvm`tget-instance-view`t--subscription" +
        "`t$($script:fixture.SubscriptionId)`t--resource-group" +
        "`tisolated-rg`t--name`tisolated-vm"
      )
      Test-Path `
        -LiteralPath (Join-Path $script:fixture.RepositoryRoot '.azure') |
        Should-BeFalse
      Test-Path -LiteralPath $script:fixture.ForbiddenLog |
        Should-BeFalse
    }
  }

  Context 'When stop is requested' {
    BeforeDiscovery {
      $stopCases = @(
        @{
          Raw = 'PowerState/running'
          Observed = 'running'
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
      $recordPath = @(Get-ChildItem `
          -LiteralPath (
            Join-Path $script:fixture.RepositoryRoot '.azure/logs'
          ) `
          -Filter '*.jsonl' `
          -File)[0].FullName
      $records = @(Get-Content -LiteralPath $recordPath | ConvertFrom-Json)
      $records.Count | Should-Be 1
      $records[0].command | Should-Be 'stop'
      $records[0].terminalResult | Should-Be $expectedResult
      $records[0].observedState | Should-Be $expectedObserved
      $records[0].action | Should-Be $expectedAction
      $records[0].mutationAccepted |
        Should-Be ($expectedMutationCount -eq 1)
    }

    It 'Should exit zero with one result after Azure accepts deallocation' {
      $output = & $script:powerShellPath `
        -NoLogo `
        -NoProfile `
        -File $script:entryPoint `
        stop `
        -RepositoryRoot $script:fixture.RepositoryRoot 2>&1
      $exitCode = $LASTEXITCODE

      $exitCode | Should-Be 0
      @($output).Count | Should-BeGreaterThan 0
      @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture | Where-Object {
          $_ -match "^CALL`tvm`tdeallocate`t"
        }).Count | Should-Be 1
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
      $recordPath = @(Get-ChildItem `
          -LiteralPath (
            Join-Path $script:fixture.RepositoryRoot '.azure/logs'
          ) `
          -Filter '*.jsonl' `
          -File)[0].FullName
      $record = Get-Content -LiteralPath $recordPath | ConvertFrom-Json
      $record.failurePhase | Should-Be 'not-found'
      $record.terminalResult | Should-BeNull
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
      $recordPath = @(Get-ChildItem `
          -LiteralPath (
            Join-Path $script:fixture.RepositoryRoot '.azure/logs'
          ) `
          -Filter '*.jsonl' `
          -File)[0].FullName
      $record = Get-Content -LiteralPath $recordPath | ConvertFrom-Json
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
  }

  Context 'When start is already running' {
    It 'Should return one typed result and only the two connection entry points' {
      $information = @()

      $result = @(
        & $script:entryPoint `
          start `
          -RepositoryRoot $script:fixture.RepositoryRoot `
          -InformationVariable information
      )
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)

      $result.Count | Should-Be 1
      $result[0].PSObject.TypeNames[0] | Should-Be 'AzureDev.LifecycleResult'
      $result[0].Result | Should-Be 'already-running'
      $result[0].ObservedState | Should-Be 'running'
      $result[0].Action | Should-Be 'none'
      $calls.Count | Should-Be 3
      @($calls | Where-Object { $_ -match "CALL`tvm`tstart" }).Count |
        Should-Be 0
      $guidance = @(
        $information | ForEach-Object {
          if ($_.MessageData.PSObject.Properties['Message']) {
            $_.MessageData.Message
          }
        }
      )
      $guidance | Should-BeCollection @(
        'SSH: ssh isolated-alias',
        'VS Code: code --remote ssh-remote+isolated-alias /workspace'
      )
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
      Test-Path -LiteralPath (Join-Path $script:fixture.HomePath '.ssh') |
        Should-BeFalse
      @(Get-ChildItem -LiteralPath (
            Join-Path $script:fixture.RepositoryRoot '.azure/lifecycle-locks'
          ) -File).Count | Should-Be 0
      $logFile = @(Get-ChildItem -LiteralPath (
          Join-Path $script:fixture.RepositoryRoot '.azure/logs'
        ) -File)[0]
      $logRecord = Get-Content -LiteralPath $logFile.FullName -Raw |
        ConvertFrom-Json
      $logRecord.terminalResult | Should-Be 'already-running'
      $logRecord.action | Should-Be 'none'
      $logRecord.mutationAccepted | Should-BeFalse
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
          -RepositoryRoot $script:fixture.RepositoryRoot
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

      {
        & $script:entryPoint `
          start `
          -RepositoryRoot $script:fixture.RepositoryRoot
      } | Should-Throw
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)

      @($calls | Where-Object { $_ -match "CALL`tvm`tstart" }).Count |
        Should-Be 0
      Test-Path -LiteralPath $script:fixture.ForbiddenLog | Should-BeFalse
    }

    It 'Should exit one and return no result for unavailable state' {
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
      @($output | Where-Object {
          $_ -isnot [System.String] -and
          $_.PSObject.TypeNames -contains 'AzureDev.LifecycleResult'
        }).Count | Should-Be 0
      @($calls | Where-Object { $_ -match "CALL`tvm`tstart" }).Count |
        Should-Be 0
    }
  }
}
