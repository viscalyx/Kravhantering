#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'New-AzureDevLifecycleLogRecord' -Tag 'Unit' {
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

  Context 'When a real lifecycle command succeeds' {
    It 'Should construct one versioned self-identifying terminal record' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $configuration = [pscustomobject]@{
          SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          ResourceGroup = 'krav-dev-rg'
          VmName = 'krav-dev-vm'
          ClientSecret = 'must-never-be-recorded'
        }
        $configuration.PSObject.TypeNames.Insert(
          0,
          'AzureDev.LifecycleConfigurationSnapshot'
        )
        $result = New-AzureDevLifecycleResult `
          -Command stop `
          -Result requested `
          -VmName 'krav-dev-vm' `
          -ObservedState unavailable `
          -Action deallocation-requested

        $record = New-AzureDevLifecycleLogRecord `
          -Configuration $configuration `
          -LifecycleResult $result `
          -MutationAccepted $true `
          -Timestamp ([System.DateTimeOffset]::Parse('2026-09-02T18:30:00Z')) `
          -ElapsedMilliseconds 42125

        $record.PSObject.TypeNames[0] |
          Should-Be 'AzureDev.LifecycleLogRecord'
        @($record.PSObject.Properties.Name) | Should-BeCollection @(
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
        $record.schemaVersion | Should-Be 1
        $record.recordType |
          Should-Be 'azure-development-environment-lifecycle'
        $record.timestamp | Should-Be '2026-09-02T18:30:00.0000000+00:00'
        $record.command | Should-Be 'stop'
        $record.subscriptionId |
          Should-Be 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        $record.resourceGroup | Should-Be 'krav-dev-rg'
        $record.vmName | Should-Be 'krav-dev-vm'
        $record.terminalResult | Should-Be 'requested'
        $record.failurePhase | Should-BeNull
        $record.observedState | Should-Be 'unavailable'
        $record.action | Should-Be 'deallocation-requested'
        $record.mutationAccepted | Should-BeTrue
        $record.elapsedMilliseconds | Should-Be 42125
      }
    }
  }

  Context 'When a real lifecycle command fails' {
    BeforeDiscovery {
      $failurePhases = @(
        'configuration',
        'authentication',
        'lock',
        'state-read',
        'not-found',
        'start-submission',
        'deallocation-submission',
        'stable-stop-wait',
        'running-wait',
        'outside-interference'
      )
    }

    It 'Should serialize stable failure phase <_> as the terminal alternative' `
      -ForEach $failurePhases {
      InModuleScope -Parameters @{ FailurePhase = $_ } -ScriptBlock {
        Set-StrictMode -Version 1.0
        $configuration = [pscustomobject]@{
          SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          ResourceGroup = 'krav-dev-rg'
          VmName = 'krav-dev-vm'
        }
        $configuration.PSObject.TypeNames.Insert(
          0,
          'AzureDev.LifecycleConfigurationSnapshot'
        )
        $failure = New-AzureDevLifecycleErrorRecord `
          -Phase $FailurePhase `
          -Message 'Primary lifecycle error.'

        $record = New-AzureDevLifecycleLogRecord `
          -Configuration $configuration `
          -Command start `
          -Failure $failure `
          -ObservedState starting `
          -Action joined-start `
          -MutationAccepted $true `
          -Timestamp ([System.DateTimeOffset]::Parse('2026-09-02T18:30:00Z')) `
          -ElapsedMilliseconds 600000

        $record.terminalResult | Should-BeNull
        $record.failurePhase | Should-Be $FailurePhase
      }
    }
  }

  Context 'When inputs do not come from lifecycle contracts' {
    It 'Should reject an untyped configuration object' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $result = New-AzureDevLifecycleResult `
          -Command start `
          -Result already-running `
          -VmName 'krav-dev-vm' `
          -ObservedState running `
          -Action none

        {
          $null = New-AzureDevLifecycleLogRecord `
            -Configuration ([pscustomobject]@{
              SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
              ResourceGroup = 'krav-dev-rg'
              VmName = 'krav-dev-vm'
            }) `
            -LifecycleResult $result `
            -MutationAccepted $false `
            -ElapsedMilliseconds 1
        } | Should-Throw -ExceptionMessage '*configuration snapshot*'
      }
    }

    It 'Should reject mutation acceptance that contradicts the result action' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $configuration = [pscustomobject]@{
          SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          ResourceGroup = 'krav-dev-rg'
          VmName = 'krav-dev-vm'
        }
        $configuration.PSObject.TypeNames.Insert(
          0,
          'AzureDev.LifecycleConfigurationSnapshot'
        )
        $result = New-AzureDevLifecycleResult `
          -Command stop `
          -Result requested `
          -VmName 'krav-dev-vm' `
          -ObservedState running `
          -Action deallocation-requested

        {
          $null = New-AzureDevLifecycleLogRecord `
            -Configuration $configuration `
            -LifecycleResult $result `
            -MutationAccepted $false `
            -ElapsedMilliseconds 1
        } | Should-Throw -ExceptionMessage '*Mutation acceptance*'
      }
    }
  }
}
