#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'New-AzureDevLifecycleErrorRecord' -Tag 'Unit' {
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

  Context 'When a lifecycle phase fails' {
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

    It 'Should represent stable phase <_> without embedding unsafe details' `
      -ForEach $failurePhases {
      InModuleScope -Parameters @{ FailurePhase = $_ } -ScriptBlock {
        Set-StrictMode -Version 1.0

        $errorRecord = New-AzureDevLifecycleErrorRecord `
          -Phase $FailurePhase `
          -Message "Lifecycle failed in $FailurePhase."

        ($errorRecord -is [System.Management.Automation.ErrorRecord]) |
          Should-BeTrue
        $errorRecord.FullyQualifiedErrorId |
          Should-Be "AzureDevLifecycleFailure.$FailurePhase"
        $errorRecord.CategoryInfo.Category |
          Should-Be ([System.Management.Automation.ErrorCategory]::OperationStopped)
        $errorRecord.Exception.Message |
          Should-Be "Lifecycle failed in $FailurePhase."
        $errorRecord.TargetObject.PSObject.TypeNames[0] |
          Should-Be 'AzureDev.LifecycleFailure'
        $errorRecord.TargetObject.Phase | Should-Be $FailurePhase
        @($errorRecord.TargetObject.PSObject.Properties.Name) |
          Should-BeCollection @(
            'Phase',
            'Command',
            'VmName',
            'ObservedState',
            'Action',
            'MutationAccepted'
          )
        $errorRecord.TargetObject.Command | Should-BeNull
        $errorRecord.TargetObject.VmName | Should-BeNull
        $errorRecord.TargetObject.ObservedState | Should-BeNull
        $errorRecord.TargetObject.Action | Should-BeNull
        $errorRecord.TargetObject.MutationAccepted | Should-BeFalse
      }
    }
  }

  Context 'When contract values use noncanonical casing' {
    It 'Should normalize every lifecycle discriminator to lowercase' {
      InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        $errorRecord = New-AzureDevLifecycleErrorRecord `
          -Phase RUNNING-WAIT `
          -Message 'Lifecycle failed.' `
          -Command START `
          -VmName 'Krav-Dev-VM' `
          -ObservedState STARTING `
          -Action JOINED-START `
          -MutationAccepted $false

        $errorRecord.TargetObject.Phase | Should-Be 'running-wait'
        $errorRecord.TargetObject.Command | Should-Be 'start'
        $errorRecord.TargetObject.VmName | Should-Be 'Krav-Dev-VM'
        $errorRecord.TargetObject.ObservedState | Should-Be 'starting'
        $errorRecord.TargetObject.Action | Should-Be 'joined-start'
      }
    }
  }
}
