#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Connect-AzureDevLifecycleSession' -Tag 'Unit' {
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

    $script:subscriptionId = '11111111-1111-1111-1111-111111111111'
    $script:tenantId = '22222222-2222-2222-2222-222222222222'
    $script:clientId = '33333333-3333-3333-3333-333333333333'
    $script:clientSecret = 'credential value --password=do-not-print'
    $script:servicePrincipalConfig = [System.Management.Automation.PSObject]@{
      SubscriptionId = $script:subscriptionId
      ResourceGroup = 'target-rg'
      VmName = 'target-vm'
      TenantId = $script:tenantId
      ClientId = $script:clientId
      ClientSecret = $script:clientSecret
    }
    $script:userConfig = [System.Management.Automation.PSObject]@{
      SubscriptionId = $script:subscriptionId
      ResourceGroup = 'target-rg'
      VmName = 'target-vm'
      TenantId = $null
      ClientId = $null
      ClientSecret = $null
    }
  }

  BeforeEach {
    $mockProfileUser = New-Object `
      -TypeName System.Management.Automation.PSObject `
      -Property @{
        name = $script:clientId.ToUpperInvariant()
        type = 'servicePrincipal'
      }
    $script:mockProfile = New-Object `
      -TypeName System.Management.Automation.PSObject `
      -Property @{
        id = $script:subscriptionId.ToUpperInvariant()
        tenantId = $script:tenantId.ToUpperInvariant()
        user = $mockProfileUser
      }
    Mock -CommandName Invoke-AzCli -MockWith {
      if ($Arguments[0] -eq 'account') {
        return $script:mockProfile
      }
      if ($Arguments[0] -eq 'version') {
        return '2.86.0'
      }
      return $null
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Logging' -All | Remove-Module -Force
  }

  Context 'When a configured service-principal session is exact and usable' {
    It 'Should reuse the targeted profile after a silent ARM token proof' {
      $null = Connect-AzureDevLifecycleSession `
        -Config $script:servicePrincipalConfig

      Should-Invoke `
        -CommandName Invoke-AzCli `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter {
          $Json -and
          $TimeoutSeconds -eq 120 -and
          $SuppressOutputDetails -and
          $Arguments.Count -eq 7 -and
          $Arguments[0] -eq 'account' -and
          $Arguments[1] -eq 'show' -and
          $Arguments[2] -eq '--subscription' -and
          $Arguments[3] -eq $script:subscriptionId -and
          $Arguments[4] -eq '--output' -and
          $Arguments[5] -eq 'json' -and
          $Arguments[6] -eq '--only-show-errors'
        }
      Should-Invoke `
        -CommandName Invoke-AzCli `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter {
          -not $Json -and
          $TimeoutSeconds -eq 120 -and
          $SuppressOutputDetails -and
          $Arguments.Count -eq 9 -and
          $Arguments[0] -eq 'account' -and
          $Arguments[1] -eq 'get-access-token' -and
          $Arguments[2] -eq '--subscription' -and
          $Arguments[3] -eq $script:subscriptionId -and
          $Arguments[4] -eq '--tenant' -and
          $Arguments[5] -eq $script:tenantId -and
          $Arguments[6] -eq '--output' -and
          $Arguments[7] -eq 'none' -and
          $Arguments[8] -eq '--only-show-errors'
        }
      Should-NotInvoke `
        -CommandName Invoke-AzCli `
        -Scope It `
        -ParameterFilter { $Arguments[0] -in @('version', 'login') }
    }
  }

  Context 'When the configured service-principal token is stale' {
    BeforeEach {
      Mock -CommandName Invoke-AzCli -MockWith {
        if (
          $Arguments[0] -eq 'account' -and
          $Arguments[1] -eq 'get-access-token'
        ) {
          throw 'stale token raw output'
        }
        if ($Arguments[0] -eq 'version') {
          return '2.86.0'
        }
        if ($Arguments[0] -eq 'account') {
          return $script:mockProfile
        }
        return $null
      }
    }

    It 'Should perform one targeted noninteractive repair and recheck identity' {
      $authenticated = Connect-AzureDevLifecycleSession `
        -Config $script:servicePrincipalConfig

      $authenticated | Should-BeTrue
      Should-Invoke `
        -CommandName Invoke-AzCli `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter {
          $TimeoutSeconds -eq 120 -and
          $SuppressOutputDetails -and
          $Arguments.Count -eq 13 -and
          $Arguments[0] -eq 'login' -and
          $Arguments[1] -eq '--service-principal' -and
          $Arguments[2] -eq '--username' -and
          $Arguments[3] -eq $script:clientId -and
          $Arguments[4] -eq "--password=$($script:clientSecret)" -and
          $Arguments[5] -eq '--tenant' -and
          $Arguments[6] -eq $script:tenantId -and
          $Arguments[7] -eq '--skip-subscription-discovery' -and
          $Arguments[8] -eq '--subscription' -and
          $Arguments[9] -eq $script:subscriptionId -and
          $Arguments[10] -eq '--output' -and
          $Arguments[11] -eq 'none' -and
          $Arguments[12] -eq '--only-show-errors'
        }
      Should-Invoke `
        -CommandName Invoke-AzCli `
        -Exactly `
        -Times 2 `
        -Scope It `
        -ParameterFilter {
          $Arguments[0] -eq 'account' -and $Arguments[1] -eq 'show'
        }
      Should-Invoke `
        -CommandName Invoke-AzCli `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter {
          $TimeoutSeconds -eq 120 -and
          $SuppressOutputDetails -and
          $Arguments.Count -eq 6 -and
          $Arguments[0] -eq 'version' -and
          $Arguments[1] -eq '--query' -and
          $Arguments[2] -eq '"azure-cli"' -and
          $Arguments[3] -eq '--output' -and
          $Arguments[4] -eq 'tsv' -and
          $Arguments[5] -eq '--only-show-errors'
        }
      Should-NotInvoke `
        -CommandName Invoke-AzCli `
        -Scope It `
        -ParameterFilter {
          ($Arguments[0] -eq 'account' -and $Arguments[1] -eq 'list') -or
          ($Arguments[0] -eq 'account' -and $Arguments[1] -eq 'set')
        }
    }

  }

  Context 'When the cached service-principal identity is mismatched' {
    BeforeDiscovery {
      $profileMismatchCases = @(
        @{
          Name = 'subscription'
          Field = 'id'
          Value = '44444444-4444-4444-4444-444444444444'
        },
        @{
          Name = 'tenant'
          Field = 'tenantId'
          Value = '44444444-4444-4444-4444-444444444444'
        },
        @{
          Name = 'client identity'
          Field = 'clientId'
          Value = '44444444-4444-4444-4444-444444444444'
        },
        @{
          Name = 'account type'
          Field = 'accountType'
          Value = 'user'
        }
      )
    }

    BeforeEach {
      Mock -CommandName Invoke-AzCli -MockWith {
        if ($Arguments[0] -eq 'version') {
          return '2.86.0'
        }
        if ($Arguments[0] -eq 'account') {
          $script:mockProfileReads++
          if ($script:mockProfileReads -gt 1) {
            $script:mockProfile.id = $script:subscriptionId
            $script:mockProfile.tenantId = $script:tenantId
            $script:mockProfile.user.name = $script:clientId
            $script:mockProfile.user.type = 'servicePrincipal'
          }
          return $script:mockProfile
        }
        return $null
      }
    }

    It 'Should repair an exact <Name> mismatch without using its token' `
      -ForEach $profileMismatchCases {
      switch ($Field) {
        'id' { $script:mockProfile.id = $Value }
        'tenantId' { $script:mockProfile.tenantId = $Value }
        'clientId' { $script:mockProfile.user.name = $Value }
        'accountType' { $script:mockProfile.user.type = $Value }
      }
      $script:mockProfileReads = 0

      $null = Connect-AzureDevLifecycleSession `
        -Config $script:servicePrincipalConfig

      Should-NotInvoke `
        -CommandName Invoke-AzCli `
        -Scope It `
        -ParameterFilter {
          $Arguments[0] -eq 'account' -and
          $Arguments[1] -eq 'get-access-token'
        }
      Should-Invoke `
        -CommandName Invoke-AzCli `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter { $Arguments[0] -eq 'login' }
    }
  }

  Context 'When Azure CLI is older than the lifecycle minimum' {
    BeforeEach {
      $script:mockProfile = $null
      Mock -CommandName Invoke-AzCli -MockWith {
        if ($Arguments[0] -eq 'version') {
          return '2.85.0'
        }
        return $script:mockProfile
      }
    }

    It 'Should reject repair before any login attempt' {
      {
        Connect-AzureDevLifecycleSession `
          -Config $script:servicePrincipalConfig
      } | Should-Throw -ExceptionMessage (
        '*Azure CLI 2.86.0 or later is required*Detected 2.85.0*'
      )

      Should-NotInvoke `
        -CommandName Invoke-AzCli `
        -Scope It `
        -ParameterFilter { $Arguments[0] -eq 'login' }
    }
  }

  Context 'When the Azure CLI version query fails' {
    BeforeEach {
      $script:mockProfile = $null
      Mock -CommandName Invoke-AzCli -MockWith {
        if ($Arguments[0] -eq 'version') {
          throw 'raw version-query output'
        }
        return $script:mockProfile
      }
    }

    It 'Should report a targeted failure before login' {
      {
        Connect-AzureDevLifecycleSession `
          -Config $script:servicePrincipalConfig
      } | Should-Throw -ExceptionMessage (
        '*Could not verify the Azure CLI version during authentication*'
      )

      Should-NotInvoke `
        -CommandName Invoke-AzCli `
        -Scope It `
        -ParameterFilter { $Arguments[0] -eq 'login' }
    }
  }

  Context 'When the Azure CLI version cannot be parsed' {
    BeforeEach {
      $script:mockProfile = $null
      Mock -CommandName Invoke-AzCli -MockWith {
        if ($Arguments[0] -eq 'version') {
          return 'not-a-version'
        }
        return $script:mockProfile
      }
    }

    It 'Should report a targeted failure before login' {
      {
        Connect-AzureDevLifecycleSession `
          -Config $script:servicePrincipalConfig
      } | Should-Throw -ExceptionMessage (
        '*Could not parse the Azure CLI version during authentication*'
      )

      Should-NotInvoke `
        -CommandName Invoke-AzCli `
        -Scope It `
        -ParameterFilter { $Arguments[0] -eq 'login' }
    }
  }

  Context 'When targeted service-principal login fails' {
    BeforeEach {
      $script:mockProfile = $null
      Mock -CommandName Invoke-AzCli -MockWith {
        if ($Arguments[0] -eq 'version') {
          return '2.86.0'
        }
        if ($Arguments[0] -eq 'login') {
          throw 'raw login output containing credential material'
        }
        return $script:mockProfile
      }
    }

    It 'Should report a targeted failure without rechecking the profile' {
      $message = $null
      try {
        $null = Connect-AzureDevLifecycleSession `
          -Config $script:servicePrincipalConfig
      } catch {
        $message = $_.Exception.Message
      }

      $message | Should-BeString `
        -Expected (
          'Targeted service-principal login failed during authentication.'
        )
      $message | Should-NotMatchString 'raw login output'
      $message | Should-NotMatchString 'credential material'
      Should-Invoke `
        -CommandName Invoke-AzCli `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter { $Arguments[0] -eq 'account' }
    }
  }

  Context 'When a matching user session has a stale token' {
    BeforeEach {
      $mockProfileUser = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{
          name = 'operator@example.test'
          type = 'user'
        }
      $script:mockProfile = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{
          id = $script:subscriptionId
          tenantId = '66666666-6666-6666-6666-666666666666'
          user = $mockProfileUser
        }
      Mock -CommandName Invoke-AzCli -MockWith {
        if (
          $Arguments[0] -eq 'account' -and
          $Arguments[1] -eq 'get-access-token'
        ) {
          throw 'raw stale user token output'
        }
        return $script:mockProfile
      }
    }

    It 'Should reject it without starting interactive or service-principal login' {
      {
        Connect-AzureDevLifecycleSession -Config $script:userConfig
      } | Should-Throw -ExceptionMessage (
        '*matching Azure CLI user session with a usable ARM token*' +
        '*Log in before retrying*'
      )

      Should-NotInvoke `
        -CommandName Invoke-AzCli `
        -Scope It `
        -ParameterFilter { $Arguments[0] -eq 'login' }
    }
  }

  Context 'When repaired identity does not match the configured target' {
    BeforeEach {
      $script:mockProfile = $null
      $mockRecheckedUser = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{
          name = '55555555-5555-5555-5555-555555555555'
          type = 'servicePrincipal'
        }
      $script:mockRecheckedProfile = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{
          id = $script:subscriptionId
          tenantId = $script:tenantId
          user = $mockRecheckedUser
        }
      Mock -CommandName Invoke-AzCli -MockWith {
        if ($Arguments[0] -eq 'version') {
          return '2.86.0'
        }
        if ($Arguments[0] -eq 'login') {
          return $null
        }
        return $script:mockRecheckedProfile
      }
    }

    It 'Should fail after one login without exposing the client secret' {
      $message = $null
      try {
        $null = Connect-AzureDevLifecycleSession `
          -Config $script:servicePrincipalConfig
      } catch {
        $message = $_.Exception.Message
      }

      $message | Should-MatchString 'authentication'
      $message | Should-MatchString 'did not establish the configured identity'
      $message | Should-NotMatchString (
        [System.Text.RegularExpressions.Regex]::Escape(
          $script:clientSecret
        )
      )
      Should-Invoke `
        -CommandName Invoke-AzCli `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter { $Arguments[0] -eq 'login' }
    }
  }

  Context 'When a cached user session matches and has a usable token' {
    It 'Should reuse it without any login or subscription mutation' {
      $mockProfileUser = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{
          name = 'operator@example.test'
          type = 'user'
        }
      $script:mockProfile = New-Object `
        -TypeName System.Management.Automation.PSObject `
        -Property @{
          id = $script:subscriptionId.ToUpperInvariant()
          tenantId = '66666666-6666-6666-6666-666666666666'
          user = $mockProfileUser
        }

      $null = Connect-AzureDevLifecycleSession -Config $script:userConfig

      Should-Invoke `
        -CommandName Invoke-AzCli `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter {
          $Arguments[0] -eq 'account' -and
          $Arguments[1] -eq 'get-access-token' -and
          $Arguments[2] -eq '--subscription' -and
          $Arguments[3] -eq $script:subscriptionId -and
          $Arguments[4] -eq '--output' -and
          $Arguments[5] -eq 'none' -and
          $Arguments[6] -eq '--only-show-errors'
        }
      Should-NotInvoke `
        -CommandName Invoke-AzCli `
        -Scope It `
        -ParameterFilter {
          $Arguments[0] -in @('login', 'version') -or
          ($Arguments[0] -eq 'account' -and $Arguments[1] -in @('list', 'set'))
        }
    }
  }

  Context 'When user mode finds a service-principal or managed-identity session' {
    BeforeDiscovery {
      $unsupportedAccountTypes = @('servicePrincipal', 'managedIdentity')
    }

    It 'Should reject <_> with targeted noninteractive guidance' `
      -ForEach $unsupportedAccountTypes {
      $script:mockProfile.user.type = $_

      {
        Connect-AzureDevLifecycleSession -Config $script:userConfig
      } | Should-Throw -ExceptionMessage (
        '*matching Azure CLI user session*' +
        "*subscription $($script:subscriptionId)*" +
        '*Log in before retrying*'
      )

      Should-NotInvoke `
        -CommandName Invoke-AzCli `
        -Scope It `
        -ParameterFilter {
          $Arguments[0] -eq 'login' -or
          ($Arguments[0] -eq 'account' -and
            $Arguments[1] -eq 'get-access-token')
        }
    }
  }

  Context 'When an Azure CLI call reaches its deadline' {
    BeforeEach {
      Mock -CommandName Invoke-AzCli -MockWith {
        throw [System.TimeoutException]::new(
          'secret-token raw command output timed out'
        )
      }
    }

    It 'Should attribute the timeout to authentication without raw output' {
      $message = $null
      try {
        $null = Connect-AzureDevLifecycleSession `
          -Config $script:servicePrincipalConfig
      } catch {
        $message = $_.Exception.Message
      }

      $message | Should-MatchString 'authentication'
      $message | Should-MatchString '120 seconds'
      $message | Should-NotMatchString 'secret-token'
      $message | Should-NotMatchString 'raw command output'
    }
  }

  Context 'When cached authentication inspection is interrupted' {
    BeforeDiscovery {
      $interruptionCases = @(
        @{ Stage = 'profile' },
        @{ Stage = 'token' }
      )
    }

    It 'Should propagate <Stage> cancellation without attempting login' `
      -ForEach $interruptionCases {
      $script:mockInterruptedStage = $Stage
      Mock -CommandName Invoke-AzCli -MockWith {
        $isProfile = (
          $Arguments[0] -eq 'account' -and
          $Arguments[1] -eq 'show'
        )
        $isToken = (
          $Arguments[0] -eq 'account' -and
          $Arguments[1] -eq 'get-access-token'
        )
        if (
          ($script:mockInterruptedStage -eq 'profile' -and $isProfile) -or
          ($script:mockInterruptedStage -eq 'token' -and $isToken)
        ) {
          $inner = [System.OperationCanceledException]::new('interrupted')
          throw [System.InvalidOperationException]::new('wrapper', $inner)
        }
        return $script:mockProfile
      }

      {
        Connect-AzureDevLifecycleSession `
          -Config $script:servicePrincipalConfig
      } | Should-Throw -ExceptionMessage '*wrapper*'

      Should-NotInvoke `
        -CommandName Invoke-AzCli `
        -Scope It `
        -ParameterFilter { $Arguments[0] -in @('version', 'login') }
    }
  }

  Context 'When authentication uses a non-default Azure deadline' {
    It 'Should apply the same timeout to profile and token proofs' {
      $null = Connect-AzureDevLifecycleSession `
        -Config $script:servicePrincipalConfig `
        -TimeoutSeconds 7

      Should-Invoke `
        -CommandName Invoke-AzCli `
        -Exactly `
        -Times 2 `
        -Scope It `
        -ParameterFilter { $TimeoutSeconds -eq 7 }
    }
  }

  Context 'When preview checks a matching cached profile' {
    It 'Should not acquire a token or change Azure CLI state' {
      $null = Connect-AzureDevLifecycleSession `
        -Config $script:servicePrincipalConfig `
        -WhatIf

      Should-Invoke `
        -CommandName Invoke-AzCli `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter {
          $Arguments[0] -eq 'account' -and $Arguments[1] -eq 'show'
        }
      Should-NotInvoke `
        -CommandName Invoke-AzCli `
        -Scope It `
        -ParameterFilter {
          -not ($Arguments[0] -eq 'account' -and $Arguments[1] -eq 'show')
        }
    }
  }

  Context 'When preview finds a mismatched configured service principal' {
    It 'Should preview repair without version, token, or login calls' {
      $script:mockProfile.user.name = '44444444-4444-4444-4444-444444444444'

      $authenticated = Connect-AzureDevLifecycleSession `
        -Config $script:servicePrincipalConfig `
        -WhatIf

      $authenticated | Should-BeFalse
      Should-Invoke `
        -CommandName Invoke-AzCli `
        -Exactly `
        -Times 1 `
        -Scope It `
        -ParameterFilter {
          $Arguments[0] -eq 'account' -and $Arguments[1] -eq 'show'
        }
      Should-NotInvoke `
        -CommandName Invoke-AzCli `
        -Scope It `
        -ParameterFilter {
          -not ($Arguments[0] -eq 'account' -and $Arguments[1] -eq 'show')
        }
    }
  }
}
