#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevVmSshHostKeyEvidence' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Ssh'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Config.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
      'Mock:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Ssh.psm1'
    ) -Force -ErrorAction Stop
    $script:context = [System.Management.Automation.PSObject]@{
      Config = [System.Management.Automation.PSObject]@{
        SubscriptionId = '00000000-0000-0000-0000-000000000000'
        ResourceGroup = 'rg-test'
        VmName = 'vm-test'
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Config' -All | Remove-Module -Force
  }

  Context 'When Run Command returns valid public keys' {
    BeforeAll {
      Mock -CommandName Invoke-AzureDevHostKeyRunCommand -MockWith {
        return [System.Management.Automation.PSObject]@{
          value = @(
            New-Object -TypeName System.Management.Automation.PSObject -Property @{
              code = 'ComponentStatus/StdOut/succeeded'
              message = (
                'ssh-ed25519 ' +
                'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda' +
                ' guest-comment'
              )
            }
          )
        }
      }
    }

    It 'Should return normalized authenticated key material' {
      $result = InModuleScope `
        -Parameters @{ Context = $script:context } `
        -ScriptBlock {
          Set-StrictMode -Version 1.0
          Get-AzureDevVmSshHostKeyEvidence -Context $Context
        }

      $result | Should-BeString -Expected (
        'ssh-ed25519 ' +
        'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
      ) -CaseSensitive
    }
  }

  Context 'When Run Command is unavailable' {
    BeforeAll {
      Mock -CommandName Invoke-AzureDevHostKeyRunCommand -MockWith {
        throw 'VM agent unavailable'
      }
    }

    It 'Should fail closed with no network fallback' {
      {
        InModuleScope `
          -Parameters @{ Context = $script:context } `
          -ScriptBlock {
            Set-StrictMode -Version 1.0
            Get-AzureDevVmSshHostKeyEvidence -Context $Context
          }
      } | Should-Throw -ExceptionMessage (
        '*control-plane SSH host-key retrieval failed*'
      )
    }
  }

  Context 'When Run Command returns malformed key material' {
    BeforeAll {
      Mock -CommandName Invoke-AzureDevHostKeyRunCommand -MockWith {
        return [System.Management.Automation.PSObject]@{
          value = @(
            New-Object -TypeName System.Management.Automation.PSObject -Property @{
              code = 'ComponentStatus/StdOut/succeeded'
              message = 'ssh-ed25519 QQ=='
            }
          )
        }
      }
    }

    It 'Should reject the unverified evidence' {
      {
        InModuleScope `
          -Parameters @{ Context = $script:context } `
          -ScriptBlock {
            Set-StrictMode -Version 1.0
            Get-AzureDevVmSshHostKeyEvidence -Context $Context
          }
      } | Should-Throw -ExceptionMessage (
        '*control-plane SSH host-key evidence was malformed*'
      )
    }
  }

  Context 'When Run Command omits its value collection' {
    BeforeAll {
      Mock -CommandName Invoke-AzureDevHostKeyRunCommand -MockWith {
        return New-Object `
          -TypeName System.Management.Automation.PSObject `
          -Property @{
          status = 'succeeded'
        }
      }
    }

    It 'Should reject the malformed response' {
      {
        InModuleScope `
          -Parameters @{ Context = $script:context } `
          -ScriptBlock {
            Set-StrictMode -Version 1.0
            Get-AzureDevVmSshHostKeyEvidence -Context $Context
          }
      } | Should-Throw -ExceptionMessage (
        '*control-plane SSH host-key evidence was malformed*'
      )
    }
  }

  Context 'When a Run Command result omits its code' {
    BeforeAll {
      Mock -CommandName Invoke-AzureDevHostKeyRunCommand -MockWith {
        return New-Object `
          -TypeName System.Management.Automation.PSObject `
          -Property @{
          value = @(
            New-Object -TypeName System.Management.Automation.PSObject -Property @{
              message = 'unexpected output'
            }
          )
        }
      }
    }

    It 'Should report malformed evidence explicitly' {
      {
        InModuleScope `
          -Parameters @{ Context = $script:context } `
          -ScriptBlock {
            Set-StrictMode -Version 1.0
            Get-AzureDevVmSshHostKeyEvidence -Context $Context
          }
      } | Should-Throw -ExceptionMessage (
        '*control-plane SSH host-key evidence was malformed*'
      )
    }
  }

  Context 'When Run Command returns guest errors' {
    BeforeAll {
      Mock -CommandName Invoke-AzureDevHostKeyRunCommand -MockWith {
        return New-Object `
          -TypeName System.Management.Automation.PSObject `
          -Property @{
          value = @(
            New-Object -TypeName System.Management.Automation.PSObject -Property @{
              code = 'ComponentStatus/StdErr/succeeded'
              message = 'host keys unavailable'
            }
          )
        }
      }
    }

    It 'Should fail closed before accepting output' {
      {
        InModuleScope `
          -Parameters @{ Context = $script:context } `
          -ScriptBlock {
            Set-StrictMode -Version 1.0
            Get-AzureDevVmSshHostKeyEvidence -Context $Context
          }
      } | Should-Throw -ExceptionMessage (
        '*control-plane SSH host-key retrieval returned guest errors*'
      )
    }
  }

  Context 'When Run Command repeats valid keys across algorithms' {
    BeforeAll {
      Mock -CommandName Invoke-AzureDevHostKeyRunCommand -MockWith {
        $ed25519 = (
          'ssh-ed25519 ' +
          'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
        )
        $rsa = (
          'ssh-rsa ' +
          'AAAAB3NzaC1yc2EAAAADAQABAAAAgQC5rITfpGc4oPleBfphM/dw00CuU8+E0xzLsRxLfTzCwsn5r4+mYeYNvdpxLaIVqPxiX6EXI8mdU6KwWExxo/QDLy8XXw27VFwgeFQJTQB/SVLRkDMjpP6q0a17E9Xm3BoSwDCyQNBFtO4CBF82p5otDgLCt6+AChsr36+GeJ8QCw=='
        )
        return New-Object `
          -TypeName System.Management.Automation.PSObject `
          -Property @{
          value = @(
            New-Object -TypeName System.Management.Automation.PSObject -Property @{
              code = 'ComponentStatus/StdOut/succeeded'
              message = "$ed25519`n$rsa"
            }
            New-Object -TypeName System.Management.Automation.PSObject -Property @{
              code = 'ComponentStatus/StdOut/succeeded'
              message = "$rsa duplicate`n$ed25519 duplicate"
            }
          )
        }
      }
    }

    It 'Should preserve only unique normalized key material' {
      $result = @(
        InModuleScope `
          -Parameters @{ Context = $script:context } `
          -ScriptBlock {
            Set-StrictMode -Version 1.0
            Get-AzureDevVmSshHostKeyEvidence -Context $Context
          }
      )

      $result.Count | Should-Be 2
      $result[0] | Should-BeString `
        -Expected (
          'ssh-ed25519 ' +
          'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
        ) `
        -CaseSensitive
      $result[1] | Should-BeString `
        -Expected (
          'ssh-rsa ' +
          'AAAAB3NzaC1yc2EAAAADAQABAAAAgQC5rITfpGc4oPleBfphM/dw00CuU8+E0xzLsRxLfTzCwsn5r4+mYeYNvdpxLaIVqPxiX6EXI8mdU6KwWExxo/QDLy8XXw27VFwgeFQJTQB/SVLRkDMjpP6q0a17E9Xm3BoSwDCyQNBFtO4CBF82p5otDgLCt6+AChsr36+GeJ8QCw=='
        ) `
        -CaseSensitive
    }
  }
}
