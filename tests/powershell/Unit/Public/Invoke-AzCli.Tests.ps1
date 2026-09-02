#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Invoke-AzCli' -Tag 'Unit' {
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
  }

  BeforeEach {
    $script:mockJob = New-Object `
      -TypeName System.Management.Automation.PSObject `
      -Property @{ Id = 7 }
    $script:mockCompletedJob = $script:mockJob
    $script:mockJobResult = New-Object `
      -TypeName System.Management.Automation.PSObject `
      -Property @{
        ExitCode = 0
        Text = '{"status":"usable"}'
      }
    Mock -CommandName Start-ThreadJob -MockWith {
      return $script:mockJob
    }
    Mock `
      -CommandName Wait-Job `
      -RemoveParameterType 'Job' `
      -MockWith { return $script:mockCompletedJob }
    Mock `
      -CommandName Receive-Job `
      -RemoveParameterType 'Job' `
      -MockWith { return $script:mockJobResult }
    Mock -CommandName Stop-Job -RemoveParameterType 'Job'
    Mock -CommandName Remove-Job -RemoveParameterType 'Job'
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When the Azure CLI call exceeds its fixed deadline' {
    BeforeEach {
      $script:mockCompletedJob = $null
    }

    It 'Should stop and remove the boundary job after 120 seconds' {
      {
        Invoke-AzCli `
          -Arguments @('account', 'show') `
          -TimeoutSeconds 120 `
          -SuppressOutputDetails
      } | Should-Throw -ExceptionMessage '*timed out after 120 seconds*'

      Should-Invoke `
        -CommandName Start-ThreadJob `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter {
          $ArgumentList.Count -eq 1 -and
          $ArgumentList[0].Count -eq 2 -and
          $ArgumentList[0][0] -eq 'account' -and
          $ArgumentList[0][1] -eq 'show'
        }
      Should-Invoke `
        -CommandName Wait-Job `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter { $Job -eq $script:mockJob -and $Timeout -eq 120 }
      Should-Invoke `
        -CommandName Stop-Job `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter { $Job -eq $script:mockJob }
      Should-Invoke `
        -CommandName Remove-Job `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter { $Job -eq $script:mockJob -and $Force }
    }
  }

  Context 'When a failed Azure CLI call returns raw output' {
    BeforeEach {
      $script:mockJobResult.ExitCode = 7
      $script:mockJobResult.Text = 'raw token and credential output'
    }

    It 'Should suppress the output while retaining the targeted command' {
      $message = $null
      try {
        $null = Invoke-AzCli `
          -Arguments @(
            'account',
            'get-access-token',
            '--subscription',
            '11111111-1111-1111-1111-111111111111',
            '--output',
            'none'
          ) `
          -TimeoutSeconds 120 `
          -SuppressOutputDetails
      } catch {
        $message = $_.Exception.Message
      }

      $message | Should-MatchString 'az account get-access-token'
      $message | Should-MatchString 'exit code 7'
      $message | Should-NotMatchString 'raw token'
      $message | Should-NotMatchString 'credential output'
      Should-Invoke `
        -CommandName Receive-Job `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter { $Job -eq $script:mockJob -and $Wait }
      Should-NotInvoke -CommandName Stop-Job -Scope It
    }
  }
}
