#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevOpenSshVersion' -Tag 'Unit' {
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
      'InModuleScope:ModuleName' = $script:moduleName
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }

    Mock -CommandName Get-Command -MockWith {
      return $script:mockSshCommand
    }
    Mock -CommandName Invoke-AzureDevNativeCommand -MockWith {
      return $script:mockSshVersionResult
    }
  }

  BeforeEach {
    $script:mockSshCommand = [System.Management.Automation.PSObject]@{
      Source = '/usr/bin/ssh'
      Version = [System.Version]::new(9, 5, 6, 1)
    }
    $script:mockSshVersionResult = [System.Management.Automation.PSObject]@{
      ExitCode = 0
      Text = 'OpenSSH_9.6p1, OpenSSL 3.0.13'
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When Windows exposes application-version metadata' {
    It 'Should return the PowerShell command version' {
      $version = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        Get-AzureDevOpenSshVersion -Platform 'windows'
      }

      $version | Should-Be ([System.Version]::new(9, 5, 6, 1))
      Should-NotInvoke -CommandName Invoke-AzureDevNativeCommand -Scope It
    }
  }

  Context 'When Windows does not expose application-version metadata' {
    It 'Should fail closed' {
      $script:mockSshCommand.Version = [System.Version]::new(0, 0, 0, 0)

      {
        InModuleScope -ScriptBlock {
          Set-StrictMode -Version 1.0
          Get-AzureDevOpenSshVersion -Platform 'windows'
        }
      } | Should-Throw -ExceptionMessage (
        '*Could not determine the Windows OpenSSH client version*'
      )
    }
  }

  Context 'When macOS reports its OpenSSH version' {
    It 'Should parse the upstream major and minor version' {
      $version = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        Get-AzureDevOpenSshVersion -Platform 'macos'
      }

      $version | Should-Be ([System.Version]::new(9, 6))
      Should-Invoke `
        -CommandName Invoke-AzureDevNativeCommand `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter {
          $FilePath -eq '/usr/bin/ssh' -and
          $Arguments.Count -eq 1 -and
          $Arguments[0] -eq '-V'
        }
    }
  }

  Context 'When multiple non-Windows SSH applications are discoverable' {
    It 'Should inspect the first application resolved from PATH' {
      $script:mockSshCommand = @(
        [System.Management.Automation.PSObject]@{
          Source = '/opt/homebrew/bin/ssh'
          Version = [System.Version]::new(9, 9)
        },
        [System.Management.Automation.PSObject]@{
          Source = '/usr/bin/ssh'
          Version = [System.Version]::new(9, 6)
        }
      )

      $version = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        Get-AzureDevOpenSshVersion -Platform 'macos'
      }

      $version | Should-Be ([System.Version]::new(9, 6))
      Should-Invoke `
        -CommandName Invoke-AzureDevNativeCommand `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter {
          $FilePath -eq '/opt/homebrew/bin/ssh' -and
          $Arguments.Count -eq 1 -and
          $Arguments[0] -eq '-V'
        }
    }
  }

  Context 'When Linux reports its OpenSSH version' {
    It 'Should parse the upstream major and minor version' {
      $script:mockSshVersionResult.Text = (
        'OpenSSH_8.5p1 Ubuntu-1, OpenSSL 1.1.1f'
      )

      $version = InModuleScope -ScriptBlock {
        Set-StrictMode -Version 1.0
        Get-AzureDevOpenSshVersion -Platform 'linux'
      }

      $version | Should-Be ([System.Version]::new(8, 5))
    }
  }

  Context 'When a non-Windows version cannot be determined' {
    It 'Should fail closed' {
      $script:mockSshVersionResult.Text = 'unexpected version output'

      {
        InModuleScope -ScriptBlock {
          Set-StrictMode -Version 1.0
          Get-AzureDevOpenSshVersion -Platform 'linux'
        }
      } | Should-Throw -ExceptionMessage (
        '*Could not determine the linux OpenSSH client version*'
      )
    }
  }
}
