#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Invoke-AzureDevLifecycleCommand' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Lifecycle'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    foreach ($module in @(
        'AzureDev.Config.psm1',
        'AzureDev.Logging.psm1',
        'AzureDev.Azure.psm1',
        'AzureDev.LifecycleLock.psm1',
        'AzureDev.Lifecycle.psm1'
      )) {
      Import-Module (
        Join-Path $script:repositoryRoot "scripts/azure-dev/$module"
      ) -Force -ErrorAction Stop
    }
    $PSDefaultParameterValues = @{
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }
    $script:configuration = New-Object `
      -TypeName System.Management.Automation.PSObject `
      -Property @{
        RepoRoot = $TestDrive
        SubscriptionId = '11111111-1111-1111-1111-111111111111'
        ResourceGroup = 'integration-rg'
        VmName = 'integration-vm'
        TenantId = '22222222-2222-2222-2222-222222222222'
        ClientId = '33333333-3333-3333-3333-333333333333'
        ClientSecret = 'test-only-secret'
        SshHostAlias = 'integration-alias'
      }
    $script:configuration.PSObject.TypeNames.Insert(
      0,
      'AzureDev.LifecycleConfigurationSnapshot'
    )
    Mock Get-AzureDevLifecycleConfig -MockWith {
      return $script:configuration
    }
    Mock Connect-AzureDevLifecycleSession
    Mock Invoke-AzureDevLifecycleLock
    Mock Get-AzureDevLifecycleState -MockWith { return 'running' }
  }

  AfterAll {
    @(
      'AzureDev.Lifecycle',
      'AzureDev.LifecycleLock',
      'AzureDev.Azure',
      'AzureDev.Logging',
      'AzureDev.Config'
    ) | ForEach-Object {
      Get-Module $_ -All | Remove-Module -Force
    }
  }

  Context 'When start or stop is previewed' {
    BeforeDiscovery {
      $commandCases = @(
        @{ CommandName = 'start' },
        @{ CommandName = 'stop' }
      )
    }

    It 'Should plan <CommandName> without observing live state or returning a result' `
      -ForEach $commandCases {
      $expectedCommandName = $CommandName
      $result = @(
        Invoke-AzureDevLifecycleCommand `
          -CommandName $CommandName `
          -RepositoryRoot $TestDrive `
          -EnvironmentFile 'lifecycle.env' `
          -WhatIf
      )

      $result.Count | Should-Be 0
      Should-Invoke Get-AzureDevLifecycleConfig -Exactly -Times 1 -Scope It `
        -ParameterFilter {
          $CommandName -ceq $expectedCommandName -and
          $RepositoryRoot -ceq $TestDrive -and
          $EnvironmentFile -ceq 'lifecycle.env'
        }
      Should-Invoke Connect-AzureDevLifecycleSession `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter { $WhatIf }
      Should-Invoke Invoke-AzureDevLifecycleLock `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter {
          $CommandName -ceq $expectedCommandName -and
          $WhatIf
        }
      Should-NotInvoke Get-AzureDevLifecycleState -Scope It
    }
  }

  Context 'When status is requested' {
    It 'Should report one immediate normalized observation without a lock' {
      $information = @()
      $result = @(
        Invoke-AzureDevLifecycleCommand `
          -CommandName status `
          -RepositoryRoot $TestDrive `
          -InformationVariable information
      )

      $result.Count | Should-Be 0
      @($information.MessageData.Message) |
        Should-ContainCollection 'Power state: running'
      Should-Invoke Connect-AzureDevLifecycleSession `
        -Exactly -Times 1 -Scope It
      Should-Invoke Get-AzureDevLifecycleState `
        -Exactly -Times 1 -Scope It
      Should-NotInvoke Invoke-AzureDevLifecycleLock -Scope It
    }
  }

  Context 'When a real stop is requested' {
    BeforeAll {
      Mock Invoke-AzureDevStopCommand -MockWith {
        $result = [System.Management.Automation.PSObject][ordered]@{
          Command = 'stop'
          Result = 'already-deallocated'
          VmName = 'integration-vm'
          ObservedState = 'deallocated'
          Action = 'none'
        }
        $result.PSObject.TypeNames.Insert(0, 'AzureDev.LifecycleResult')
        return $result
      }
    }

    It 'Should delegate the validated immutable snapshot to stop orchestration' {
      $result = Invoke-AzureDevLifecycleCommand `
        -CommandName stop `
        -RepositoryRoot $TestDrive `
        -EnvironmentFile 'lifecycle.env'

      $result.Result | Should-Be 'already-deallocated'
      Should-Invoke Invoke-AzureDevStopCommand `
        -Exactly -Times 1 -Scope It `
        -ParameterFilter { $Configuration -eq $script:configuration }
      Should-NotInvoke Connect-AzureDevLifecycleSession -Scope It
      Should-NotInvoke Invoke-AzureDevLifecycleLock -Scope It
      Should-NotInvoke Get-AzureDevLifecycleState -Scope It
    }
  }
}
