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
    & (Get-Module $script:moduleName) {
      function script:az {
        throw 'The Azure CLI test boundary must be mocked.'
      }
    }
    $PSDefaultParameterValues = @{
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }
  }

  BeforeEach {
    $script:mockStderrPath = Join-Path $TestDrive 'az-stderr.txt'
    $null = New-Item -ItemType File -Path $script:mockStderrPath
    $script:mockTempFile = New-Object `
      -TypeName System.Management.Automation.PSObject `
      -Property @{ FullName = $script:mockStderrPath }
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
    Mock -CommandName New-TemporaryFile -MockWith {
      return $script:mockTempFile
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
          $ArgumentList.Count -eq 2 -and
          $ArgumentList[0].Count -eq 2 -and
          $ArgumentList[0][0] -eq 'account' -and
          $ArgumentList[0][1] -eq 'show' -and
          $ArgumentList[1] -eq $script:mockStderrPath
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

  Context 'When a timed Azure CLI call writes to both native streams' {
    BeforeEach {
      Set-Content `
        -LiteralPath $script:mockStderrPath `
        -Value 'diagnostic warning'
    }

    It 'Should parse JSON only from the captured standard output' {
      $result = Invoke-AzCli `
        -Arguments @('account', 'show') `
        -Json `
        -TimeoutSeconds 120

      $result.status | Should-Be 'usable'
      Test-Path -LiteralPath $script:mockStderrPath | Should-BeFalse
    }
  }

  Context 'When a failed Azure CLI call returns raw output' {
    BeforeEach {
      $script:mockJobResult.ExitCode = 7
      $script:mockJobResult.Text = 'raw token and credential output'
    }

    It 'Should suppress the output while retaining the targeted command' {
      $message = $null
      $mockExitCode = $null
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
        $mockExitCode = $_.Exception.Data['AzureDevCliExitCode']
      }

      $mockExitCode | Should-Be 7
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

  Context 'When the caller uses the default native execution path' {
    BeforeEach {
      $lastExitCodeVariable = Get-Variable `
        -Name LASTEXITCODE `
        -Scope Global `
        -ErrorAction SilentlyContinue
      $script:mockOriginalLastExitCodeDefined = $null -ne $lastExitCodeVariable
      $script:mockOriginalLastExitCode = if ($lastExitCodeVariable) {
        $lastExitCodeVariable.Value
      } else {
        $null
      }
      Mock -CommandName az -MockWith {
        $global:LASTEXITCODE = 0
        return '{"status":"usable"}'
      }
    }

    AfterEach {
      if ($script:mockOriginalLastExitCodeDefined) {
        $global:LASTEXITCODE = $script:mockOriginalLastExitCode
      } else {
        Remove-Variable `
          -Name LASTEXITCODE `
          -Scope Global `
          -ErrorAction SilentlyContinue
      }
    }

    It 'Should parse output through the temporary stderr-file path' {
      $result = Invoke-AzCli `
        -Arguments @('account', 'show') `
        -Json

      $result.status | Should-Be 'usable'
      Test-Path -LiteralPath $script:mockStderrPath | Should-BeFalse
      Should-Invoke `
        -CommandName New-TemporaryFile `
        -Exactly `
        -Times 1 `
        -Scope It
      Should-Invoke -CommandName az -Exactly -Times 1 -Scope It
      Should-NotInvoke -CommandName Start-ThreadJob -Scope It
    }
  }

  Context 'When a successful Azure CLI call returns invalid JSON' {
    BeforeEach {
      $script:mockJobResult.Text = 'raw token and malformed JSON'
    }

    It 'Should suppress the invalid output from the parsing failure' {
      $message = $null
      try {
        $null = Invoke-AzCli `
          -Arguments @('account', 'show') `
          -Json `
          -TimeoutSeconds 120 `
          -SuppressOutputDetails
      } catch {
        $message = $_.Exception.Message
      }

      $message | Should-BeString `
        -Expected 'az account show did not return valid JSON.'
      $message | Should-NotMatchString 'raw token'
      $message | Should-NotMatchString 'malformed JSON'
    }
  }

  Context 'When JSON parsing is interrupted' {
    BeforeEach {
      Mock ConvertFrom-Json -MockWith {
        $interruption = [System.OperationCanceledException]::new('interrupted')
        throw [System.InvalidOperationException]::new(
          'parsing interrupted',
          $interruption
        )
      }
    }

    It 'Should preserve cancellation instead of translating it as invalid JSON' {
      $captured = $null
      try {
        $null = Invoke-AzCli `
          -Arguments @('account', 'show') `
          -Json `
          -TimeoutSeconds 120 `
          -SuppressOutputDetails
      } catch {
        $captured = $_
      }

      $captured.Exception.Message | Should-Be 'parsing interrupted'
      $captured.Exception.InnerException.GetType().FullName |
        Should-Be 'System.OperationCanceledException'
      $captured.Exception.Message |
        Should-NotMatchString 'did not return valid JSON'
    }
  }
}
