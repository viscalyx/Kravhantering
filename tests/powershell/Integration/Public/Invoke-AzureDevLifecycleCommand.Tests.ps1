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

    It 'Should exit zero after a complete preview with no result object' {
      $output = & $script:powerShellPath `
        -NoLogo `
        -NoProfile `
        -File $script:entryPoint `
        start `
        -RepositoryRoot $script:fixture.RepositoryRoot `
        -WhatIf 2>&1
      $exitCode = $LASTEXITCODE
      $calls = @(Get-AzureDevLifecyclePublicCommandCalls `
          -Fixture $script:fixture)

      $exitCode | Should-Be 0
      @($output | Where-Object {
          $_ -isnot [string] -and
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
}
