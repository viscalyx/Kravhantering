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
  'AzureDev.Workstation.Transfer' `
  -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    . (Join-Path `
      $PSScriptRoot `
      '../AzureDev.Workstation.Transfer.TestHelper.ps1')
    $global:mockAzureDevNativeCommandEmulator =
      (Get-Command Invoke-TestAzureDevNativeCommand).ScriptBlock
    $script:moduleName = 'AzureDev.Workstation'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.Azure.psm1'
    ) -Force -ErrorAction Stop

    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.Workstation.psm1'
    ) -Force -ErrorAction Stop

    function New-TestWorkstationPackage {
      param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Context,

        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Request,

        [Parameter(Mandatory = $true)]
        [string]$OutputPath,

        [string[]]$ApprovedPrompts = @()
      )

      $global:mockAzureDevWorkstationState.ApprovedPrompts =
        @($ApprovedPrompts)
      $global:mockAzureDevWorkstationState.CapturedPackage = $null
      $null = InModuleScope -Parameters @{
        Context = $Context
        OutputPath = $OutputPath
        Request = $Request
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        New-AzureDevWorkstationPackage `
          -Context $Context `
          -Request $Request `
          -OutputPath $OutputPath `
          -Confirm:$false
      }
      return [PSCustomObject]@{
        Entries = $global:mockAzureDevWorkstationState.CapturedPackage
        Recipient = $global:mockAzureDevWorkstationState.EncryptedPackages[
          $OutputPath
        ].Recipient
      }
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Azure' -All | Remove-Module -Force
    Remove-Variable `
      -Name mockAzureDevNativeCommandEmulator `
      -Scope Global `
      -ErrorAction SilentlyContinue
  }

  BeforeEach {
    $script:originalGhToken = [System.Environment]::GetEnvironmentVariable(
      'GH_TOKEN',
      'Process'
    )
    $script:originalCopilotToken = [System.Environment]::GetEnvironmentVariable(
      'COPILOT_GITHUB_TOKEN',
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'GH_TOKEN',
      'gh-token-transfer-test',
      'Process'
    )
    [System.Environment]::SetEnvironmentVariable(
      'COPILOT_GITHUB_TOKEN',
      'copilot-token-transfer-test',
      'Process'
    )

    $script:repoRoot = Join-Path $TestDrive 'repo'
    New-Item -ItemType Directory -Path $script:repoRoot -Force | Out-Null
    $script:primaryPath = Join-Path `
      $script:repoRoot `
      '.env.azure.development'
    $script:localPath = Join-Path `
      $script:repoRoot `
      '.env.azure.development.local'
    Set-Content `
      -LiteralPath $script:primaryPath `
      -Value 'AZURE_DEV_VM_RESOURCE_GROUP=approver-rg'
    $script:destinationKeyPath = Join-Path `
      $TestDrive `
      'kravhantering_azure_dev_destination_ed25519'
    $script:context = [PSCustomObject]@{
      Yes = $false
      Config = [PSCustomObject]@{
        RepoRoot = $script:repoRoot
        EnvironmentFilePath = $script:primaryPath
        LocalEnvironmentFilePath = $script:localPath
        SshHostAlias = 'krav-destination'
        SubscriptionId = '00000000-0000-0000-0000-000000000001'
        EnvironmentId = 'personal'
        TenantId = '00000000-0000-0000-0000-000000000002'
        ResourceGroup = 'approver-rg'
        VmName = 'krav-dev-vm'
        SshPrivateKeyPath = $script:destinationKeyPath
      }
    }
    $script:request = [PSCustomObject]@{
      requestId = [System.Guid]::NewGuid().ToString()
      workstation = 'destination'
      intendedUse = 'connect-only'
      destinationPrivateKeyPath = $script:destinationKeyPath
      publicKey = 'ssh-ed25519 AAAAdestination'
      publicKeyFingerprint = 'SHA256:destination'
      platform = 'linux'
      architecture = 'x64'
    }

    $global:mockAzureDevWorkstationState = [PSCustomObject]@{
      ApprovedPrompts = @()
      CapturedPackage = $null
      EncryptedPackages = @{}
      IdentityRecipients = @{}
    }

    Mock `
      -CommandName Get-AzureDevAgePath `
      -MockWith { 'age-test' }
    Mock -CommandName Set-AzureDevPrivatePermissions
    Mock `
      -CommandName Get-AzureDevPublicIpAddress `
      -MockWith { '203.0.113.10' }
    Mock -CommandName Get-AzureDevAccount
    Mock `
      -CommandName Get-AzureDevWorkstationPackageIdentityPaths `
      -MockWith { @($Context.Config.SshPrivateKeyPath) }
    Mock -CommandName Write-AzureDevExtractedReadme
    Mock `
      -CommandName Confirm-AzureDevWorkstationAction `
      -MockWith {
        if (-not $Optional) {
          return $true
        }
        return $Prompt -cin $global:mockAzureDevWorkstationState.ApprovedPrompts
      }
    Mock `
      -CommandName Invoke-AzureDevNativeCommand `
      -MockWith {
        & $global:mockAzureDevNativeCommandEmulator `
          -FilePath $FilePath `
          -Arguments $Arguments `
          -State $global:mockAzureDevWorkstationState
      }
  }

  AfterEach {
    [System.Environment]::SetEnvironmentVariable(
      'GH_TOKEN',
      $script:originalGhToken,
      'Process'
    )
    Remove-Variable `
      -Name mockAzureDevWorkstationState `
      -Scope Global `
      -ErrorAction SilentlyContinue
    [System.Environment]::SetEnvironmentVariable(
      'COPILOT_GITHUB_TOKEN',
      $script:originalCopilotToken,
      'Process'
    )
  }

  Context 'When process tokens have not been approved for transfer' {
    It 'Should exclude both process tokens' {
      $packagePath = Join-Path $TestDrive 'default.age'
      $package = New-TestWorkstationPackage `
        -Context $script:context `
        -Request $script:request `
        -OutputPath $packagePath

      @($package.Entries.Keys) |
        Should-NotContainCollection @(
          'secrets/GH_TOKEN',
          'secrets/COPILOT_GITHUB_TOKEN'
        )
      $package.Recipient |
        Should-BeString -Expected $script:request.publicKey -CaseSensitive
    }
  }

  BeforeDiscovery {
    $tokenCases = @(
      @{
        IncludedToken = 'GH_TOKEN'
        ExcludedToken = 'COPILOT_GITHUB_TOKEN'
        Prompt = 'Include GH_TOKEN from the current process?'
        ExpectedValue = 'gh-token-transfer-test'
      },
      @{
        IncludedToken = 'COPILOT_GITHUB_TOKEN'
        ExcludedToken = 'GH_TOKEN'
        Prompt = 'Include COPILOT_GITHUB_TOKEN from the current process?'
        ExpectedValue = 'copilot-token-transfer-test'
      }
    )
  }

  Context 'When one process token has been approved for transfer' {
    It 'Should include only <IncludedToken>' -ForEach $tokenCases {
      $packagePath = Join-Path $TestDrive "$IncludedToken.age"
      $package = New-TestWorkstationPackage `
        -Context $script:context `
        -Request $script:request `
        -OutputPath $packagePath `
        -ApprovedPrompts @($Prompt)

      $package.Entries["secrets/$IncludedToken"] |
        Should-BeString -Expected $ExpectedValue -CaseSensitive
      @($package.Entries.Keys) |
        Should-NotContainCollection "secrets/$ExcludedToken"
    }
  }

  Context 'When an encrypted package contains approved process tokens' {
    It 'Should decrypt only for the signed recipient and remove plaintext' {
      $approvedPrompts = @(
        'Include GH_TOKEN from the current process?',
        'Include COPILOT_GITHUB_TOKEN from the current process?'
      )
      $packagePath = Join-Path $TestDrive 'both-tokens.age'
      $package = New-TestWorkstationPackage `
        -Context $script:context `
        -Request $script:request `
        -OutputPath $packagePath `
        -ApprovedPrompts $approvedPrompts
      foreach ($tokenName in @('GH_TOKEN', 'COPILOT_GITHUB_TOKEN')) {
        @($package.Entries.Keys) |
          Should-ContainCollection "secrets/$tokenName"
      }

      $wrongKeyPath = Join-Path `
        $TestDrive `
        'kravhantering_azure_dev_wrong_ed25519'
      $wrongContext = [PSCustomObject]@{
        Config = [PSCustomObject]@{ SshPrivateKeyPath = $wrongKeyPath }
      }
      $global:mockAzureDevWorkstationState.IdentityRecipients[$wrongKeyPath] =
        'ssh-ed25519 AAAAwrong'
      $wrongDestination = Join-Path $TestDrive 'wrong-key-extraction'

      {
        Expand-AzureDevWorkstationPackage `
          -Context $wrongContext `
          -PackagePath $packagePath `
          -DestinationPath $wrongDestination `
          -Confirm:$false
      } | Should-Throw `
        -ExceptionMessage 'Could not decrypt the workstation package:*'
      (Test-Path -LiteralPath $wrongDestination) | Should-BeFalse

      $global:mockAzureDevWorkstationState.IdentityRecipients[
        $script:destinationKeyPath
      ] = $script:request.publicKey
      $destination = Join-Path $TestDrive 'token-extraction'
      Expand-AzureDevWorkstationPackage `
        -Context $script:context `
        -PackagePath $packagePath `
        -DestinationPath $destination `
        -Confirm:$false

      foreach ($tokenName in @('GH_TOKEN', 'COPILOT_GITHUB_TOKEN')) {
        Test-Path `
          -LiteralPath (Join-Path $destination "secrets/$tokenName") `
          -PathType Leaf |
          Should-BeTrue
      }

      Remove-AzureDevExtractedPackage `
        -Context $script:context `
        -DestinationPath $destination `
        -Confirm:$false
      (Test-Path -LiteralPath $destination) | Should-BeFalse
    }

  }
}
