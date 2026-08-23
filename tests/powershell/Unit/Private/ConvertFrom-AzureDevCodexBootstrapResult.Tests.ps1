#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'ConvertFrom-AzureDevCodexBootstrapResult' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Bootstrap'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
    }
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Bootstrap.psm1'
    ) -Force -ErrorAction Stop
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When bootstrap emits one valid result among ordinary logs' {
    It 'Should return the exact target version' {
      $output = @'
[krav-azure-bootstrap] starting host bootstrap
KRAV_AZURE_CODEX_RESULT={"schemaVersion":1,"targetVersion":"1.2.3"}
[krav-azure-bootstrap] host bootstrap completed
'@

      $result = InModuleScope -Parameters @{ Output = $output } -ScriptBlock {
        Set-StrictMode -Version 1.0
        ConvertFrom-AzureDevCodexBootstrapResult -Output $Output
      }

      $result | Should-BeString -Expected '1.2.3'
    }
  }

  Context 'When bootstrap does not emit exactly one valid result' {
    BeforeDiscovery {
      $invalidResults = @(
        @{
          Name = 'missing'
          Output = '[krav-azure-bootstrap] host bootstrap completed'
        },
        @{
          Name = 'malformed'
          Output = 'KRAV_AZURE_CODEX_RESULT={"targetVersion":'
        },
        @{
          Name = 'ambiguous'
          Output = @'
KRAV_AZURE_CODEX_RESULT={"schemaVersion":1,"targetVersion":"1.2.3"}
KRAV_AZURE_CODEX_RESULT={"schemaVersion":1,"targetVersion":"1.2.3"}
'@
        },
        @{
          Name = 'conflicting'
          Output = @'
KRAV_AZURE_CODEX_RESULT={"schemaVersion":1,"targetVersion":"1.2.3"}
KRAV_AZURE_CODEX_RESULT={"schemaVersion":1,"targetVersion":"1.2.4"}
'@
        },
        @{
          Name = 'conflicting duplicate field'
          Output = 'KRAV_AZURE_CODEX_RESULT={"schemaVersion":1,"targetVersion":"1.2.3","targetVersion":"1.2.4"}'
        }
      )
    }

    It 'Should fail closed for a <Name> result' -ForEach $invalidResults {
      {
        InModuleScope -Parameters @{ Output = $Output } -ScriptBlock {
          Set-StrictMode -Version 1.0
          ConvertFrom-AzureDevCodexBootstrapResult -Output $Output
        }
      } | Should-Throw -ExceptionMessage '*Codex result*'
    }
  }
}
