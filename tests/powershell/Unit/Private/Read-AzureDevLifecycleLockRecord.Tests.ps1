#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Read-AzureDevLifecycleLockRecord' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.LifecycleLock'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.LifecycleLock.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  BeforeEach {
    $script:recordPath = Join-Path $TestDrive 'target.lock'
  }

  AfterEach {
    Remove-Item `
      -LiteralPath $script:recordPath `
      -Recurse `
      -Force `
      -ErrorAction SilentlyContinue
  }

  Context 'When the owner record is readable JSON' {
    It 'Should return its metadata without retaining a file handle' {
      Set-Content `
        -LiteralPath $script:recordPath `
        -Value '{"ownerId":"owner-one"}'

      $record = InModuleScope `
        -Parameters @{ Path = $script:recordPath } `
        -ScriptBlock {
        Set-StrictMode -Version 1.0
        Read-AzureDevLifecycleLockRecord -Path $Path
      }

      $record.ownerId | Should-Be 'owner-one'
    }
  }

  Context 'When the owner record cannot provide diagnostics' {
    BeforeDiscovery {
      $recordCases = @(
        @{ Name = 'missing'; Kind = 'missing' },
        @{ Name = 'malformed'; Kind = 'malformed' },
        @{ Name = 'inaccessible'; Kind = 'directory' }
      )
    }

    It 'Should return null for <Name> owner evidence' -ForEach $recordCases {
      if ($Kind -eq 'malformed') {
        Set-Content -LiteralPath $script:recordPath -Value '{'
      } elseif ($Kind -eq 'directory') {
        $null = New-Item -ItemType Directory -Path $script:recordPath
      }

      $record = InModuleScope `
        -Parameters @{ Path = $script:recordPath } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Read-AzureDevLifecycleLockRecord -Path $Path
        }

      $record | Should-BeNull
    }
  }
}
