#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Test-AzureDevPrerequisites' -Tag 'Unit' {
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
      'Should-Invoke:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }

    Mock -CommandName Test-AzureDevRuntime
    Mock -CommandName Test-AzureDevLocalTool -MockWith { return $true }
    Mock -CommandName Get-AzureDevOpenSshVersion -MockWith {
      return $script:mockOpenSshVersion
    }
    Mock -CommandName Connect-AzureDevServicePrincipal -MockWith { return $true }
    Mock -CommandName Test-AzureDevSubscriptionVisible -MockWith { return $true }
    Mock -CommandName Test-AzureDevSkuAvailability -MockWith { return $true }

    $script:context = [System.Management.Automation.PSObject]@{
      Config = [System.Management.Automation.PSObject]@{}
    }
    if ($IsWindows) {
      $script:expectedPlatform = 'windows'
      $script:expectedPlatformLabel = 'Windows'
      $script:expectedMinimumVersion = [System.Version]::new(8, 6)
    } elseif ($IsMacOS) {
      $script:expectedPlatform = 'macos'
      $script:expectedPlatformLabel = 'macOS'
      $script:expectedMinimumVersion = [System.Version]::new(8, 5)
    } else {
      $script:expectedPlatform = 'linux'
      $script:expectedPlatformLabel = 'Linux'
      $script:expectedMinimumVersion = [System.Version]::new(8, 5)
    }
  }

  BeforeEach {
    $script:mockOpenSshVersion = $script:expectedMinimumVersion
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When OpenSSH meets the platform minimum' {
    It 'Should continue prerequisite validation' {
      $null = Test-AzureDevPrerequisites -Context $script:context

      Should-Invoke `
        -CommandName Get-AzureDevOpenSshVersion `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter { $Platform -eq $script:expectedPlatform }
      Should-Invoke `
        -CommandName Test-AzureDevSubscriptionVisible `
        -Exactly `
        -Times 1 `
        -Scope It
    }
  }

  Context 'When OpenSSH is older than the platform minimum' {
    It 'Should reject the unsupported client before Azure validation' {
      $script:mockOpenSshVersion = [System.Version]::new(
        $script:expectedMinimumVersion.Major,
        $script:expectedMinimumVersion.Minor - 1
      )

      {
        Test-AzureDevPrerequisites -Context $script:context
      } | Should-Throw -ExceptionMessage (
        "*OpenSSH $($script:expectedMinimumVersion) or later is required on " +
        "$($script:expectedPlatformLabel)*Detected OpenSSH " +
        "$($script:mockOpenSshVersion)*"
      )

      Should-NotInvoke -CommandName Connect-AzureDevServicePrincipal -Scope It
      Should-NotInvoke -CommandName Test-AzureDevSubscriptionVisible -Scope It
    }
  }
}
