#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Get-AzureDevLifecycleConfig' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Config'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Config.psm1'
    ) -Force -ErrorAction Stop
    $PSDefaultParameterValues = @{
      'Mock:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }
    $script:lifecycleKeys = @(
      'AZURE_DEV_VM_SUBSCRIPTION_ID',
      'AZURE_DEV_VM_RESOURCE_GROUP',
      'AZURE_DEV_VM_NAME',
      'AZURE_TENANT_ID',
      'AZURE_CLIENT_ID',
      'AZURE_CLIENT_SECRET',
      'AZURE_DEV_VM_SSH_HOST_ALIAS'
    )
    $script:originalEnvironment = @{}
    foreach ($key in $script:lifecycleKeys) {
      $item = Get-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
      $script:originalEnvironment[$key] = [System.Management.Automation.PSObject]@{
        Present = $null -ne $item
        Value = if ($null -eq $item) { $null } else { $item.Value }
      }
    }
  }

  BeforeEach {
    foreach ($key in $script:lifecycleKeys) {
      Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
    }
    Remove-Item `
      -LiteralPath (Join-Path $TestDrive 'primary.env') `
      -Force `
      -ErrorAction SilentlyContinue
    Remove-Item `
      -LiteralPath (Join-Path $TestDrive '.env.azure.development.local') `
      -Force `
      -ErrorAction SilentlyContinue
  }

  AfterEach {
    foreach ($key in $script:lifecycleKeys) {
      Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
      if ($script:originalEnvironment[$key].Present) {
        Set-Item `
          -LiteralPath "Env:$key" `
          -Value $script:originalEnvironment[$key].Value
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When every lifecycle source provides an allowed field' {
    It 'Should apply deterministic precedence and retain source provenance' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=primary-rg
AZURE_DEV_VM_RESOURCE_GROUP=primary-rg-last
AZURE_DEV_VM_NAME=primary-vm
UNRELATED_SETUP_KEY=ignored
'@
      Set-Content `
        -LiteralPath (Join-Path $TestDrive '.env.azure.development.local') `
        -Value @'
AZURE_DEV_VM_SUBSCRIPTION_ID=AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA
AZURE_DEV_VM_RESOURCE_GROUP=local-rg
AZURE_CLIENT_ID=BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB
'@
      Set-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
        'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC'
      Set-Item Env:AZURE_DEV_VM_RESOURCE_GROUP 'process-rg'
      Set-Item Env:AZURE_TENANT_ID 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD'
      Set-Item Env:AZURE_CLIENT_SECRET '  preserve this secret exactly  '

      $snapshot = Get-AzureDevLifecycleConfig `
        -CommandName start `
        -RepositoryRoot $TestDrive `
        -EnvironmentFile 'primary.env'

      $snapshot.SubscriptionId |
        Should-Be 'cccccccc-cccc-cccc-cccc-cccccccccccc'
      $snapshot.ResourceGroup | Should-Be 'process-rg'
      $snapshot.VmName | Should-Be 'primary-vm'
      $snapshot.TenantId | Should-Be 'dddddddd-dddd-dddd-dddd-dddddddddddd'
      $snapshot.ClientId | Should-Be 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      $snapshot.ClientSecret | Should-Be '  preserve this secret exactly  '
      $snapshot.SshHostAlias | Should-Be 'kravhantering-azure-dev'
      $snapshot.Provenance.AZURE_DEV_VM_SUBSCRIPTION_ID.Source.Kind |
        Should-Be 'process-environment'
      $snapshot.Provenance.AZURE_DEV_VM_SUBSCRIPTION_ID.Source.Path |
        Should-BeNull
      $snapshot.Provenance.AZURE_DEV_VM_RESOURCE_GROUP.Source.Kind |
        Should-Be 'process-environment'
      $snapshot.Provenance.AZURE_DEV_VM_NAME.Source.Kind |
        Should-Be 'primary-dotenv'
      $snapshot.Provenance.AZURE_DEV_VM_NAME.Source.Line | Should-Be 3
      $snapshot.Provenance.AZURE_CLIENT_ID.Source.Kind |
        Should-Be 'local-dotenv'
      $snapshot.Provenance.AZURE_CLIENT_ID.Source.Line | Should-Be 3
      $snapshot.Provenance.AZURE_DEV_VM_SSH_HOST_ALIAS.Source.Kind |
        Should-Be 'lifecycle-default'
    }
  }

  Context 'When one dotenv file repeats an allowed field' {
    It 'Should retain the last occurrence and its line within one file' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=first
AZURE_DEV_VM_RESOURCE_GROUP=second
AZURE_DEV_VM_NAME=target-vm
'@
      Set-Content `
        -LiteralPath (Join-Path $TestDrive '.env.azure.development.local') `
        -Value 'AZURE_DEV_VM_SUBSCRIPTION_ID=AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'

      $snapshot = Get-AzureDevLifecycleConfig `
        -CommandName status `
        -RepositoryRoot $TestDrive `
        -EnvironmentFile 'primary.env'

      $snapshot.ResourceGroup | Should-Be 'second'
      $snapshot.Provenance.AZURE_DEV_VM_RESOURCE_GROUP.Source.Line | Should-Be 2
    }
  }

  Context 'When the selected primary dotenv file does not exist' {
    It 'Should allow the selected primary dotenv file to be absent' {
      Set-Content `
        -LiteralPath (Join-Path $TestDrive '.env.azure.development.local') `
        -Value @'
AZURE_DEV_VM_SUBSCRIPTION_ID=AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA
AZURE_DEV_VM_RESOURCE_GROUP=local-rg
AZURE_DEV_VM_NAME=local-vm
'@

      $snapshot = Get-AzureDevLifecycleConfig `
        -CommandName stop `
        -RepositoryRoot $TestDrive `
        -EnvironmentFile 'missing-primary.env'

      $snapshot.SubscriptionId |
        Should-Be 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      $snapshot.ResourceGroup | Should-Be 'local-rg'
      $snapshot.VmName | Should-Be 'local-vm'
    }
  }

  Context 'When stop and status encounter an invalid SSH alias' {
    It 'Should not resolve or validate the SSH alias for stop or status' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=target-rg
AZURE_DEV_VM_NAME=target-vm
AZURE_DEV_VM_SSH_HOST_ALIAS=not valid
'@
      Set-Content `
        -LiteralPath (Join-Path $TestDrive '.env.azure.development.local') `
        -Value 'AZURE_DEV_VM_SUBSCRIPTION_ID=AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'
      Set-Item Env:AZURE_DEV_VM_SSH_HOST_ALIAS "invalid`nprocess"

      $stopSnapshot = Get-AzureDevLifecycleConfig `
        -CommandName stop `
        -RepositoryRoot $TestDrive `
        -EnvironmentFile 'primary.env'
      $statusSnapshot = Get-AzureDevLifecycleConfig `
        -CommandName status `
        -RepositoryRoot $TestDrive `
        -EnvironmentFile 'primary.env'

      @($stopSnapshot.Keys) |
        Should-NotContainCollection 'SshHostAlias'
      @($statusSnapshot.Keys) |
        Should-NotContainCollection 'SshHostAlias'
      @($stopSnapshot.Provenance.Keys) |
        Should-NotContainCollection 'AZURE_DEV_VM_SSH_HOST_ALIAS'
    }
  }

  Context 'When required target fields are absent' {
    It 'Should require every target field without an implicit default' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
UNRELATED_SETUP_KEY=ignored
'@

      {
        Get-AzureDevLifecycleConfig `
          -CommandName status `
          -RepositoryRoot $TestDrive `
          -EnvironmentFile 'primary.env'
      } | Should-Throw -ExceptionMessage (
        '*AZURE_DEV_VM_SUBSCRIPTION_ID is required*' +
        '*AZURE_DEV_VM_RESOURCE_GROUP is required*' +
        '*AZURE_DEV_VM_NAME is required*'
      )
    }
  }

  Context 'When an empty process value masks a nonempty local value' {
    BeforeEach {
      Mock -CommandName Get-Item -MockWith {
        return Microsoft.PowerShell.Management\Get-Item `
          -LiteralPath $LiteralPath `
          -ErrorAction SilentlyContinue
      }
      Mock -CommandName Get-Item -MockWith {
        return [System.Management.Automation.PSObject]@{ Value = '' }
      } -ParameterFilter {
        $LiteralPath -eq 'Env:AZURE_DEV_VM_RESOURCE_GROUP'
      }
    }

    It 'Should diagnose an empty winner and its masked source without values' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=primary-rg
AZURE_DEV_VM_NAME=target-vm
'@
      Set-Content `
        -LiteralPath (Join-Path $TestDrive '.env.azure.development.local') `
        -Value @'
AZURE_DEV_VM_SUBSCRIPTION_ID=11111111-1111-1111-1111-111111111111
AZURE_DEV_VM_RESOURCE_GROUP=lower-secret-rg
'@
      $message = $null
      try {
        $null = Get-AzureDevLifecycleConfig `
          -CommandName stop `
          -RepositoryRoot $TestDrive `
          -EnvironmentFile 'primary.env'
      } catch {
        $message = $_.Exception.Message
      }

      $message | Should-MatchString 'AZURE_DEV_VM_RESOURCE_GROUP'
      $message | Should-MatchString 'process environment'
      $message | Should-MatchString 'masks a nonempty value'
      $message | Should-MatchString '.env.azure.development.local line 2'
      $message | Should-NotMatchString 'lower-secret-rg'
      $message | Should-NotMatchString 'primary-rg'
    }
  }

  Context 'When the primary dotenv file contains restricted identity fields' {
    It 'Should reject every restricted key in the primary dotenv file' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
AZURE_DEV_VM_SUBSCRIPTION_ID=primary-subscription-secret
AZURE_TENANT_ID=primary-tenant-secret
AZURE_CLIENT_ID=primary-client-secret
AZURE_CLIENT_SECRET=primary-password-secret
AZURE_DEV_VM_RESOURCE_GROUP=target-rg
AZURE_DEV_VM_NAME=target-vm
'@
      Set-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
        '11111111-1111-1111-1111-111111111111'

      $message = $null
      try {
        $null = Get-AzureDevLifecycleConfig `
          -CommandName start `
          -RepositoryRoot $TestDrive `
          -EnvironmentFile 'primary.env'
      } catch {
        $message = $_.Exception.Message
      }

      $message | Should-MatchString 'AZURE_DEV_VM_SUBSCRIPTION_ID.*line 1'
      $message | Should-MatchString 'AZURE_TENANT_ID.*line 2'
      $message | Should-MatchString 'AZURE_CLIENT_ID.*line 3'
      $message | Should-MatchString 'AZURE_CLIENT_SECRET.*line 4'
      $message | Should-NotMatchString 'primary-subscription-secret'
      $message | Should-NotMatchString 'primary-password-secret'
    }
  }

  Context 'When service-principal fields are incomplete across sources' {
    BeforeEach {
      Mock -CommandName Get-Item -MockWith {
        return Microsoft.PowerShell.Management\Get-Item `
          -LiteralPath $LiteralPath `
          -ErrorAction SilentlyContinue
      }
      Mock -CommandName Get-Item -MockWith {
        return [System.Management.Automation.PSObject]@{ Value = '' }
      } -ParameterFilter {
        $LiteralPath -eq 'Env:AZURE_CLIENT_SECRET'
      }
    }

    It 'Should report every incomplete service-principal field without values' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=target-rg
AZURE_DEV_VM_NAME=target-vm
'@
      Set-Content `
        -LiteralPath (Join-Path $TestDrive '.env.azure.development.local') `
        -Value @'
AZURE_DEV_VM_SUBSCRIPTION_ID=11111111-1111-1111-1111-111111111111
AZURE_TENANT_ID=22222222-2222-2222-2222-222222222222
AZURE_CLIENT_SECRET=lower-client-secret
'@
      $message = $null
      try {
        $null = Get-AzureDevLifecycleConfig `
          -CommandName stop `
          -RepositoryRoot $TestDrive `
          -EnvironmentFile 'primary.env'
      } catch {
        $message = $_.Exception.Message
      }

      $message | Should-MatchString 'AZURE_CLIENT_ID is absent'
      $message | Should-MatchString 'AZURE_CLIENT_SECRET is empty'
      $message | Should-MatchString 'masks a nonempty value'
      $message | Should-NotMatchString 'lower-client-secret'
    }
  }

  Context 'When a UUID field is invalid' {
    It 'Should reject an invalid UUID without disclosing its value' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=target-rg
AZURE_DEV_VM_NAME=target-vm
'@
      Set-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID 'not-a-secret-uuid-value'

      $message = $null
      try {
        $null = Get-AzureDevLifecycleConfig `
          -CommandName status `
          -RepositoryRoot $TestDrive `
          -EnvironmentFile 'primary.env'
      } catch {
        $message = $_.Exception.Message
      }

      $message | Should-MatchString 'AZURE_DEV_VM_SUBSCRIPTION_ID'
      $message | Should-MatchString 'process environment'
      $message | Should-MatchString 'valid UUID'
      $message | Should-NotMatchString 'not-a-secret-uuid-value'
    }
  }

  Context 'When a start SSH alias is unsafe' {
    It 'Should reject the alias without echoing its value' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=target-rg
AZURE_DEV_VM_NAME=target-vm
AZURE_DEV_VM_SSH_HOST_ALIAS=-unsafe-alias
'@
      Set-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
        '11111111-1111-1111-1111-111111111111'

      {
        Get-AzureDevLifecycleConfig `
          -CommandName start `
          -RepositoryRoot $TestDrive `
          -EnvironmentFile 'primary.env'
      } | Should-Throw -ExceptionMessage (
        '*AZURE_DEV_VM_SSH_HOST_ALIAS contains unsupported characters*'
      )
    }
  }

  Context 'When a target name contains a control character' {
    It 'Should reject control characters in target names without echoing values' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=target-rg
AZURE_DEV_VM_NAME=target-vm
'@
      Set-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
        '11111111-1111-1111-1111-111111111111'
      Set-Item Env:AZURE_DEV_VM_RESOURCE_GROUP "unsafe`tresource-group"

      $message = $null
      try {
        $null = Get-AzureDevLifecycleConfig `
          -CommandName stop `
          -RepositoryRoot $TestDrive `
          -EnvironmentFile 'primary.env'
      } catch {
        $message = $_.Exception.Message
      }

      $message | Should-Be (
        'AZURE_DEV_VM_RESOURCE_GROUP contains unsupported control characters.'
      )
      $message | Should-NotMatchString 'unsafe'
    }
  }

  Context 'When an unrelated dotenv line is malformed' {
    It 'Should reject malformed dotenv syntax even for an unrelated key' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=target-rg
this is not an assignment
AZURE_DEV_VM_NAME=target-vm
'@
      Set-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
        '11111111-1111-1111-1111-111111111111'

      {
        Get-AzureDevLifecycleConfig `
          -CommandName status `
          -RepositoryRoot $TestDrive `
          -EnvironmentFile 'primary.env'
      } | Should-Throw -ExceptionMessage '*primary.env line 2*'
    }
  }

  Context 'When a caller attempts to mutate the returned snapshot' {
    It 'Should expose read-only configuration and provenance properties' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=target-rg
AZURE_DEV_VM_NAME=target-vm
'@
      Set-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
        '11111111-1111-1111-1111-111111111111'

      $snapshot = Get-AzureDevLifecycleConfig `
        -CommandName start `
        -RepositoryRoot $TestDrive `
        -EnvironmentFile 'primary.env'

      $snapshot.PSObject.TypeNames[0] |
        Should-Be 'AzureDev.LifecycleConfigurationSnapshot'
      { $snapshot.VmName = 'changed' } | Should-Throw
      $snapshot.PSObject.Properties.Remove('VmName')
      {
        $snapshot.Provenance.AZURE_DEV_VM_NAME.Source.Line = 999
      } | Should-Throw
      $snapshot.VmName | Should-Be 'target-vm'
      $snapshot.Provenance.AZURE_DEV_VM_NAME.Source.Line | Should-Be 2
    }
  }

  Context 'When configuration sources change after snapshot creation' {
    It 'Should retain one value set after files and process variables change' {
      $primaryPath = Join-Path $TestDrive 'primary.env'
      Set-Content -LiteralPath $primaryPath -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=initial-rg
AZURE_DEV_VM_NAME=initial-vm
'@
      Set-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
        '11111111-1111-1111-1111-111111111111'
      $snapshot = Get-AzureDevLifecycleConfig `
        -CommandName start `
        -RepositoryRoot $TestDrive `
        -EnvironmentFile 'primary.env'

      Set-Content -LiteralPath $primaryPath -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=changed-rg
AZURE_DEV_VM_NAME=changed-vm
'@
      Set-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
        '99999999-9999-9999-9999-999999999999'

      $snapshot.SubscriptionId |
        Should-Be '11111111-1111-1111-1111-111111111111'
      $snapshot.ResourceGroup | Should-Be 'initial-rg'
      $snapshot.VmName | Should-Be 'initial-vm'
    }
  }

  Context 'When a caller passes the snapshot across lifecycle boundaries' {
    It 'Should retain the identical snapshot across simulated wait and lock calls' {
      Set-Content -LiteralPath (Join-Path $TestDrive 'primary.env') -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=target-rg
AZURE_DEV_VM_NAME=target-vm
'@
      Set-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
        '11111111-1111-1111-1111-111111111111'
      $snapshot = Get-AzureDevLifecycleConfig `
        -CommandName start `
        -RepositoryRoot $TestDrive `
        -EnvironmentFile 'primary.env'
      $simulatedWait = {
        param([System.Object]$ConfigurationSnapshot)
        return $ConfigurationSnapshot
      }
      $simulatedLockReacquisition = {
        param([System.Object]$ConfigurationSnapshot)
        return $ConfigurationSnapshot
      }

      $afterWait = & $simulatedWait $snapshot
      $afterReacquisition = & $simulatedLockReacquisition $afterWait

      [System.Object]::ReferenceEquals($snapshot, $afterWait) | Should-BeTrue
      [System.Object]::ReferenceEquals($snapshot, $afterReacquisition) |
        Should-BeTrue
      $afterReacquisition.VmName | Should-Be 'target-vm'
    }
  }

  Context 'When forbidden local configuration boundaries are unavailable' {
    BeforeAll {
      Mock Get-AzureDevLocalGitConfigValue {
        throw 'Git configuration must not be read.'
      }
      Mock Resolve-AzureDevPath {
        throw 'SSH or host paths must not be resolved.'
      }
      Mock Get-AzureDevDefaultConfig {
        throw 'Setup defaults must not be read.'
      }
      Mock Get-Command {
        throw 'Local tool availability must not be read.'
      }
      Mock Test-Path {
        if ($LiteralPath -notin $script:mockAllowedLifecyclePaths) {
          throw "Unexpected lifecycle file read: $LiteralPath"
        }
        return Microsoft.PowerShell.Management\Test-Path `
          -LiteralPath $LiteralPath `
          -PathType $PathType
      }
      Mock Get-Content {
        if ($LiteralPath -notin $script:mockAllowedLifecyclePaths) {
          throw "Unexpected lifecycle file read: $LiteralPath"
        }
        return Microsoft.PowerShell.Management\Get-Content `
          -LiteralPath $LiteralPath
      }
    }

    It 'Should avoid setup, Git, SSH, cache, workspace, and tool discovery reads' {
      $primaryPath = Join-Path $TestDrive 'primary.env'
      $localPath = Join-Path $TestDrive '.env.azure.development.local'
      $script:mockAllowedLifecyclePaths = @($primaryPath, $localPath)
      Set-Content -LiteralPath $primaryPath -Value @'
AZURE_DEV_VM_RESOURCE_GROUP=target-rg
AZURE_DEV_VM_NAME=target-vm
'@
      Set-Item Env:AZURE_DEV_VM_SUBSCRIPTION_ID `
        '11111111-1111-1111-1111-111111111111'
      $snapshot = Get-AzureDevLifecycleConfig `
        -CommandName stop `
        -RepositoryRoot $TestDrive `
        -EnvironmentFile 'primary.env'

      $snapshot.VmName | Should-Be 'target-vm'
      Should-NotInvoke `
        -CommandName Get-AzureDevLocalGitConfigValue `
        -Scope It
      Should-NotInvoke `
        -CommandName Resolve-AzureDevPath `
        -Scope It
      Should-NotInvoke `
        -CommandName Get-AzureDevDefaultConfig `
        -Scope It
      Should-NotInvoke `
        -CommandName Get-Command `
        -Scope It
    }
  }
}
