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
        $configuration = [System.Management.Automation.PSObject]@{
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

        Set-StrictMode -Version 1.0
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
        $configuration = [System.Management.Automation.PSObject]@{
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
          -Message 'Primary lifecycle error.' `
          -Command start `
          -VmName 'krav-dev-vm' `
          -ObservedState starting `
          -Action joined-start `
          -MutationAccepted $true

        Set-StrictMode -Version 1.0
        $record = New-AzureDevLifecycleLogRecord `
          -Configuration $configuration `
          -Failure $failure `
          -Timestamp ([System.DateTimeOffset]::Parse('2026-09-02T18:30:00Z')) `
          -ElapsedMilliseconds 600000

        $record.terminalResult | Should-BeNull
        $record.failurePhase | Should-Be $FailurePhase
      }
    }

    It 'Should encode absent pre-state facts as null for <FailurePhase>' `
      -ForEach @(
        @{ FailurePhase = 'configuration' },
        @{ FailurePhase = 'authentication' }
      ) {
      InModuleScope -Parameters $_ -ScriptBlock {
        $configuration = [System.Management.Automation.PSObject]@{
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
          -Message 'Lifecycle failed before state observation.' `
          -Command start `
          -VmName 'krav-dev-vm'

        Set-StrictMode -Version 1.0
        $record = New-AzureDevLifecycleLogRecord `
          -Configuration $configuration `
          -Failure $failure `
          -ElapsedMilliseconds 25
        $parsed = ConvertTo-AzureDevLifecycleLogJson -Record $record |
          ConvertFrom-Json

        $null -eq $record.observedState | Should-BeTrue
        $null -eq $record.action | Should-BeTrue
        $null -eq $parsed.observedState | Should-BeTrue
        $null -eq $parsed.action | Should-BeTrue
      }
    }

    It 'Should preserve canonical discriminators from an uppercase failure input' {
      InModuleScope -ScriptBlock {
        $configuration = [System.Management.Automation.PSObject]@{
          SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          ResourceGroup = 'krav-dev-rg'
          VmName = 'Krav-Dev-VM'
        }
        $configuration.PSObject.TypeNames.Insert(
          0,
          'AzureDev.LifecycleConfigurationSnapshot'
        )
        $failure = New-AzureDevLifecycleErrorRecord `
          -Phase RUNNING-WAIT `
          -Message 'Lifecycle failed.' `
          -Command START `
          -VmName 'Krav-Dev-VM' `
          -ObservedState STARTING `
          -Action JOINED-START `
          -MutationAccepted $false

        Set-StrictMode -Version 1.0
        $record = New-AzureDevLifecycleLogRecord `
          -Configuration $configuration `
          -Failure $failure `
          -ElapsedMilliseconds 10

        $record.command | Should-Be 'start'
        $record.failurePhase | Should-Be 'running-wait'
        $record.observedState | Should-Be 'starting'
        $record.action | Should-Be 'joined-start'
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
          Set-StrictMode -Version 1.0
          $null = New-AzureDevLifecycleLogRecord `
            -Configuration ([System.Management.Automation.PSObject]@{
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

    It 'Should reject an untyped lifecycle result' {
      InModuleScope -ScriptBlock {
        $configuration = [System.Management.Automation.PSObject]@{
          SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          ResourceGroup = 'krav-dev-rg'
          VmName = 'krav-dev-vm'
        }
        $configuration.PSObject.TypeNames.Insert(
          0,
          'AzureDev.LifecycleConfigurationSnapshot'
        )

        {
          Set-StrictMode -Version 1.0
          $null = New-AzureDevLifecycleLogRecord `
            -Configuration $configuration `
            -LifecycleResult ([System.Management.Automation.PSObject]@{
              Command = 'start'
              Result = 'already-running'
              VmName = 'krav-dev-vm'
            }) `
            -MutationAccepted $false `
            -ElapsedMilliseconds 1
        } | Should-Throw -ExceptionMessage '*lifecycle result*'
      }
    }

    It 'Should reject a lifecycle result for another VM' {
      InModuleScope -ScriptBlock {
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
          -Result already-running `
          -VmName 'other-vm' `
          -ObservedState running `
          -Action none

        {
          Set-StrictMode -Version 1.0
          $null = New-AzureDevLifecycleLogRecord `
            -Configuration $configuration `
            -LifecycleResult $result `
            -MutationAccepted $false `
            -ElapsedMilliseconds 1
        } | Should-Throw -ExceptionMessage '*different VMs*'
      }
    }

    It 'Should reject an untyped lifecycle failure target' {
      InModuleScope -ScriptBlock {
        $configuration = [System.Management.Automation.PSObject]@{
          SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          ResourceGroup = 'krav-dev-rg'
          VmName = 'krav-dev-vm'
        }
        $configuration.PSObject.TypeNames.Insert(
          0,
          'AzureDev.LifecycleConfigurationSnapshot'
        )
        $failure = [System.Management.Automation.ErrorRecord]::new(
          [System.InvalidOperationException]::new('failure'),
          'UntypedFailure',
          [System.Management.Automation.ErrorCategory]::OperationStopped,
          [System.Management.Automation.PSObject]@{ Phase = 'lock' }
        )

        {
          Set-StrictMode -Version 1.0
          $null = New-AzureDevLifecycleLogRecord `
            -Configuration $configuration `
            -Failure $failure `
            -ElapsedMilliseconds 1
        } | Should-Throw -ExceptionMessage '*lifecycle failure*'
      }
    }

    It 'Should reject a lifecycle failure without a target contract' {
      InModuleScope -ScriptBlock {
        $configuration = [System.Management.Automation.PSObject]@{
          SubscriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          ResourceGroup = 'krav-dev-rg'
          VmName = 'krav-dev-vm'
        }
        $configuration.PSObject.TypeNames.Insert(
          0,
          'AzureDev.LifecycleConfigurationSnapshot'
        )
        $failure = [System.Management.Automation.ErrorRecord]::new(
          [System.InvalidOperationException]::new('failure'),
          'MalformedFailure',
          [System.Management.Automation.ErrorCategory]::OperationStopped,
          $null
        )

        {
          Set-StrictMode -Version 1.0
          $null = New-AzureDevLifecycleLogRecord `
            -Configuration $configuration `
            -Failure $failure `
            -ElapsedMilliseconds 1
        } | Should-Throw -ExceptionMessage '*lifecycle failure*'
      }
    }

    It 'Should reject mutation acceptance that contradicts the result action' {
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
          -Command stop `
          -Result requested `
          -VmName 'krav-dev-vm' `
          -ObservedState running `
          -Action deallocation-requested

        {
          Set-StrictMode -Version 1.0
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
