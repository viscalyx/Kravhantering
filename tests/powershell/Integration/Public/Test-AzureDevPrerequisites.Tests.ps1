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
  'Test-AzureDevPrerequisites' `
  -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    $script:moduleName = 'AzureDev.Azure'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Logging.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Azure.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'Mock:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }

    Mock -CommandName Test-AzureDevRuntime
    Mock -CommandName Test-AzureDevLocalTool -MockWith { return $true }
    Mock -CommandName Get-AzureDevOpenSshVersion -MockWith {
      return [System.Version]::new(7, 7)
    }
    Mock -CommandName Connect-AzureDevServicePrincipal -MockWith { return $true }
    Mock -CommandName Test-AzureDevSubscriptionVisible -MockWith { return $true }
    Mock -CommandName Test-AzureDevSkuAvailability -MockWith { return $true }

    if ($IsWindows) {
      $script:expectedPlatformLabel = 'Windows'
      $script:expectedMinimumVersion = [System.Version]::new(8, 6)
    } elseif ($IsMacOS) {
      $script:expectedPlatformLabel = 'macOS'
      $script:expectedMinimumVersion = [System.Version]::new(8, 5)
    } else {
      $script:expectedPlatformLabel = 'Linux'
      $script:expectedMinimumVersion = [System.Version]::new(8, 5)
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When an unsupported OpenSSH version crosses the public boundary' {
    It 'Should reject the client before Azure access' {
      $context = [System.Management.Automation.PSObject]@{
        Config = [System.Management.Automation.PSObject]@{}
      }

      {
        Test-AzureDevPrerequisites -Context $context
      } | Should-Throw -ExceptionMessage (
        "*OpenSSH $($script:expectedMinimumVersion) or later is required on " +
        "$($script:expectedPlatformLabel)*Detected OpenSSH 7.7*"
      )

      Should-NotInvoke -CommandName Connect-AzureDevServicePrincipal -Scope It
    }
  }
}
