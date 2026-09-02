#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'ConvertTo-AzureDevLifecycleLogJson' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Lifecycle'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Lifecycle.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When a lifecycle record has unrelated attached properties' {
    It 'Should serialize only the allowlisted schema as one compact JSON line' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $configuration = [System.Management.Automation.PSObject]@{
          SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          ResourceGroup = 'krav-dev-rg'
          VmName = 'krav-dev-vm'
        }
        $configuration.PSObject.TypeNames.Insert(
          0,
          'AzureDev.LifecycleConfigurationSnapshot'
        )
        $result = New-AzureDevLifecycleResult `
          -Command start `
          -Result running `
          -VmName 'krav-dev-vm' `
          -ObservedState running `
          -Action start-requested
        $record = New-AzureDevLifecycleLogRecord `
          -Configuration $configuration `
          -LifecycleResult $result `
          -MutationAccepted $true `
          -Timestamp ([System.DateTimeOffset]::Parse('2026-09-02T18:30:00Z')) `
          -ElapsedMilliseconds 35000
        Add-Member `
          -InputObject $record `
          -NotePropertyName ClientSecret `
          -NotePropertyValue 'top-secret-value'
        Add-Member `
          -InputObject $record `
          -NotePropertyName Token `
          -NotePropertyValue 'access-token-value'
        Add-Member `
          -InputObject $record `
          -NotePropertyName CommandOutput `
          -NotePropertyValue 'raw-native-output'

        Set-StrictMode -Version 1.0
        $json = ConvertTo-AzureDevLifecycleLogJson -Record $record
        $parsed = $json | ConvertFrom-Json

        $json.Contains("`n") | Should-BeFalse
        (
          $json -match 'top-secret-value|access-token-value|raw-native-output'
        ) | Should-BeFalse
        @($parsed.PSObject.Properties.Name) | Should-BeCollection @(
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
      }
    }
  }

  Context 'When the value is not a lifecycle log record' {
    It 'Should reject the value before serialization' {
      InModuleScope -ScriptBlock {
        {
          Set-StrictMode -Version 1.0
          $null = ConvertTo-AzureDevLifecycleLogJson `
            -Record ([System.Management.Automation.PSObject]@{
              command = 'start'
            })
        } | Should-Throw -ExceptionMessage '*lifecycle log record*'
      }
    }
  }
}
