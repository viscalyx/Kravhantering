#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Write-AzureDevLifecycleProgress' -Tag 'Unit' {
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

  Context 'When lifecycle progress is emitted' {
    BeforeDiscovery {
      $eventCases = @(
        @{ Event = 'authentication'; Phase = 'authentication' },
        @{ Event = 'contention'; Phase = 'lock' },
        @{ Event = 'observed-state'; Phase = 'state-read' },
        @{ Event = 'submission'; Phase = 'start-submission' },
        @{ Event = 'wait-start'; Phase = 'running-wait' },
        @{ Event = 'state-change'; Phase = 'running-wait' },
        @{ Event = 'heartbeat'; Phase = 'running-wait' }
      )
    }

    It 'Should emit tagged <Event> information without success output' `
      -ForEach $eventCases {
      InModuleScope -Parameters $_ -ScriptBlock {
        Set-StrictMode -Version 1.0
        $information = @()

        $success = @(
          Set-StrictMode -Version 1.0
          Write-AzureDevLifecycleProgress `
            -Event $Event `
            -Command start `
            -VmName 'krav-dev-vm' `
            -Phase $Phase `
            -ObservedState starting `
            -Action joined-start `
            -ElapsedMilliseconds 30000 `
            -InformationVariable information
        )

        $success.Count | Should-Be 0
        $information.Count | Should-Be 1
        $information[0].Tags |
          Should-BeCollection @('AzureDevLifecycleProgress', $Event)
        $eventData = $information[0].MessageData
        $eventData.PSObject.TypeNames[0] |
          Should-Be 'AzureDev.LifecycleProgressEvent'
        $eventData.Event | Should-Be $Event
        $eventData.Command | Should-Be 'start'
        $eventData.VmName | Should-Be 'krav-dev-vm'
        $eventData.Phase | Should-Be $Phase
        $eventData.ObservedState | Should-Be 'starting'
        $eventData.Action | Should-Be 'joined-start'
        $eventData.ElapsedMilliseconds | Should-Be 30000
      }
    }
  }

  Context 'When progress discriminators use noncanonical casing' {
    It 'Should emit canonical lowercase information data and tags' {
      InModuleScope -ScriptBlock {
        $information = @()

        Set-StrictMode -Version 1.0
        Write-AzureDevLifecycleProgress `
          -Event STATE-CHANGE `
          -Command START `
          -VmName 'Krav-Dev-VM' `
          -Phase RUNNING-WAIT `
          -ObservedState RUNNING `
          -Action JOINED-START `
          -InformationVariable information

        $information[0].Tags |
          Should-BeCollection @('AzureDevLifecycleProgress', 'state-change')
        $eventData = $information[0].MessageData
        $eventData.Event | Should-Be 'state-change'
        $eventData.Command | Should-Be 'start'
        $eventData.VmName | Should-Be 'Krav-Dev-VM'
        $eventData.Phase | Should-Be 'running-wait'
        $eventData.ObservedState | Should-Be 'running'
        $eventData.Action | Should-Be 'joined-start'
      }
    }
  }
}
