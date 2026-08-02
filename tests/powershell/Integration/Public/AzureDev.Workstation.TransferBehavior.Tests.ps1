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
  'AzureDev.Workstation.TransferBehavior' `
  -Tag 'Integration' `
  -Skip:(-not $script:integrationEnabled) {
  BeforeAll {
    . (Join-Path `
      $PSScriptRoot `
      '../AzureDev.Workstation.Transfer.TestHelper.ps1')
    $script:mockAzureDevNativeCommandEmulator =
      (Get-Command Invoke-TestAzureDevNativeCommand).ScriptBlock
    $script:moduleName = 'AzureDev.Workstation'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.Config.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.Azure.psm1'
    ) -Force -ErrorAction Stop
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.Workstation.psm1'
    ) -Force -ErrorAction Stop
    $script:workstationModule = Get-Module $script:moduleName

    $PSDefaultParameterValues = @{
      'InModuleScope:ModuleName' = $script:moduleName
      'Mock:ModuleName' = $script:moduleName
      'Should-Invoke:ModuleName' = $script:moduleName
      'Should-NotInvoke:ModuleName' = $script:moduleName
    }

    function Initialize-TestWorkstationModule {
      param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationHome
      )

      & $script:workstationModule {
        param($MockDestinationHome, $MockNativeCommandEmulator)

        Set-Variable `
          -Name HOME `
          -Value $MockDestinationHome `
          -Scope Script
        $script:mockAzureDevWorkstationState = [PSCustomObject]@{
          CapturedPackage = $null
          EncryptedPackages = @{}
          IdentityRecipients = @{}
        }
        $script:mockAzureDevNativeCommandEmulator =
          $MockNativeCommandEmulator

        function script:Get-AzureDevAgePath {
          return 'age-test'
        }

        function script:ConvertTo-AzureDevAccessName {
          param(
            [Parameter(Mandatory = $true)]
            [string]$Value,

            [string]$Label
          )

          return $Value
        }

        function script:Get-AzureDevWorkstationCidr {
          param(
            [Parameter(Mandatory = $true)]
            [string]$Cidr
          )

          return $Cidr
        }

        function script:New-AzureDevSshKey {
          param(
            [Parameter(Mandatory = $true)]
            [PSCustomObject]$Config
          )

          $null = New-Item `
            -ItemType Directory `
            -Path (Split-Path -Parent $Config.SshPrivateKeyPath) `
            -Force
          Set-Content -LiteralPath $Config.SshPrivateKeyPath -Value 'private'
          Set-Content -LiteralPath $Config.SshPublicKeyPath -Value 'public'
        }

        function script:Get-AzureDevSshPublicKey {
          param(
            [Parameter(Mandatory = $true)]
            [PSCustomObject]$Config
          )

          return 'ssh-ed25519 AAAAdestination'
        }

        function script:Get-AzureDevPublicKeyFingerprint {
          param(
            [Parameter(Mandatory = $true)]
            [string]$PublicKey
          )

          return 'SHA256:destination'
        }

        function script:Get-AzureDevPublicIpAddress {
          param(
            [Parameter(Mandatory = $true)]
            [PSCustomObject]$Config
          )

          return '203.0.113.10'
        }

        function script:Get-AzureDevAccount {
          return $null
        }

        function script:Invoke-AzureDevNativeCommand {
          param(
            [Parameter(Mandatory = $true)]
            [string]$FilePath,

            [Parameter(Mandatory = $true)]
            [object[]]$Arguments
          )

          & $script:mockAzureDevNativeCommandEmulator `
            -FilePath $FilePath `
            -Arguments $Arguments `
            -State $script:mockAzureDevWorkstationState `
            -SupportSigning `
            -SupportChmod
        }
      } $DestinationHome $script:mockAzureDevNativeCommandEmulator
    }

    function New-TestTransferContext {
      param(
        [Parameter(Mandatory = $true)]
        [string]$RepositoryRoot,

        [Parameter(Mandatory = $true)]
        [string]$DestinationKeyPath
      )

      $primaryPath = Join-Path `
        $RepositoryRoot `
        '.env.azure.development'
      $localPath = Join-Path `
        $RepositoryRoot `
        '.env.azure.development.local'
      $null = New-Item `
        -ItemType Directory `
        -Path $RepositoryRoot `
        -Force
      Set-Content `
        -LiteralPath $primaryPath `
        -Value 'AZURE_DEV_VM_RESOURCE_GROUP=approver-rg'

      return [PSCustomObject]@{
        Yes = $true
        StateDirectory = Join-Path $RepositoryRoot 'state'
        Config = [PSCustomObject]@{
          RepoRoot = $RepositoryRoot
          EnvironmentFilePath = $primaryPath
          LocalEnvironmentFilePath = $localPath
          SshHostAlias = 'krav-destination'
          SubscriptionId = '00000000-0000-0000-0000-000000000001'
          EnvironmentId = 'personal'
          TenantId = '00000000-0000-0000-0000-000000000002'
          ResourceGroup = 'approver-rg'
          VmName = 'krav-dev-vm'
          SshPrivateKeyPath = $DestinationKeyPath
        }
      }
    }

    function Read-TestArmoredRequest {
      param(
        [Parameter(Mandatory = $true)]
        [string]$Path
      )

      $armorLines = @(
        Get-Content -LiteralPath $Path |
          Where-Object {
            -not [string]::IsNullOrWhiteSpace($_) -and
            $_ -notmatch '^-----' -and
            $_ -notmatch '^Version:'
          }
      )
      $envelopeJson = [System.Text.Encoding]::UTF8.GetString(
        [System.Convert]::FromBase64String(($armorLines -join ''))
      )
      $envelope = $envelopeJson | ConvertFrom-Json
      $requestJson = [System.Text.Encoding]::UTF8.GetString(
        [System.Convert]::FromBase64String($envelope.payload)
      )
      return $requestJson | ConvertFrom-Json
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Azure' -All | Remove-Module -Force
    Get-Module 'AzureDev.Config' -All | Remove-Module -Force
  }

  BeforeEach {
    $script:originalHome = [System.Environment]::GetEnvironmentVariable(
      'HOME',
      'Process'
    )
    Import-Module (
      Join-Path $script:repositoryRoot `
        'scripts/azure-dev/AzureDev.Workstation.psm1'
    ) -Force -ErrorAction Stop
    $script:workstationModule = Get-Module $script:moduleName
  }

  AfterEach {
    [System.Environment]::SetEnvironmentVariable(
      'HOME',
      $script:originalHome,
      'Process'
    )
  }

  BeforeDiscovery {
    $requestCases = @(
      @{ IntendedUse = 'connect-only' },
      @{ IntendedUse = 'manage-environment' }
    )
  }

  Context 'When a destination creates a signed workstation request' {
    It `
      'Should sign its destination-generated key path for <IntendedUse>' `
      -ForEach $requestCases {
      $destinationHome = Join-Path $TestDrive 'destination-home'
      Initialize-TestWorkstationModule -DestinationHome $destinationHome
      $destinationKeyPath = Join-Path `
        (Join-Path $destinationHome '.ssh') `
        'kravhantering_azure_dev_destination_ed25519'
      $requestPath = Join-Path $TestDrive "$IntendedUse.kravreq"
      $context = New-TestTransferContext `
        -RepositoryRoot (Join-Path $TestDrive 'request-repo') `
        -DestinationKeyPath $destinationKeyPath

      $null = New-AzureDevWorkstationRequest `
        -Context $context `
        -WorkstationName 'destination' `
        -IntendedUse $IntendedUse `
        -Cidr '198.51.100.4/32' `
        -OutputPath $requestPath `
        -Confirm:$false
      $signedRequest = Read-TestArmoredRequest -Path $requestPath

      $signedRequest.destinationPrivateKeyPath |
        Should-BeString -Expected $destinationKeyPath -CaseSensitive
    }
  }

  Context 'When an approver creates a workstation package' {
    It `
      'Should preserve destination paths and mode files for <IntendedUse>' `
      -ForEach $requestCases {
      $destinationHome = Join-Path $TestDrive 'destination-home'
      Initialize-TestWorkstationModule -DestinationHome $destinationHome
      $destinationKeyPath = Join-Path `
        (Join-Path $destinationHome '.ssh') `
        'kravhantering_azure_dev_destination_ed25519'
      $context = New-TestTransferContext `
        -RepositoryRoot (Join-Path $TestDrive 'package-repo') `
        -DestinationKeyPath $destinationKeyPath
      $request = [PSCustomObject]@{
        requestId = [System.Guid]::NewGuid().ToString('N')
        workstation = 'destination'
        intendedUse = $IntendedUse
        destinationPrivateKeyPath = $destinationKeyPath
        publicKey = 'ssh-ed25519 AAAAdestination'
        publicKeyFingerprint = 'SHA256:destination'
        platform = 'linux'
        architecture = 'x64'
      }
      $outputPath = Join-Path $TestDrive "$IntendedUse.age"

      $null = InModuleScope -Parameters @{
        TestContext = $context
        TestOutputPath = $outputPath
        TestRequest = $request
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        New-AzureDevWorkstationPackage `
          -Context $TestContext `
          -Request $TestRequest `
          -OutputPath $TestOutputPath `
          -Confirm:$false
      }
      $mockCaptured = & $script:workstationModule {
        return $script:mockAzureDevWorkstationState.CapturedPackage
      }
      $localContent = [string]$mockCaptured[
        'files/.env.azure.development.local'
      ]
      $manifest = $mockCaptured['manifest.json'] | ConvertFrom-Json

      $localContent.Contains(
        "AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH=$destinationKeyPath"
      ) | Should-BeTrue
      $manifest.destinationPrivateKeyPath |
        Should-BeString -Expected $destinationKeyPath -CaseSensitive
      if ($IntendedUse -eq 'connect-only') {
        @($mockCaptured.Keys) | Should-NotContainCollection `
          'files/.env.azure.development'
      } else {
        @($mockCaptured.Keys) | Should-ContainCollection `
          'files/.env.azure.development'
      }
    }
  }

  Context 'When setup guidance is written for an extracted package' {
    It 'Should use the signed destination key path' {
      $destinationKeyPath = Join-Path `
        (Join-Path $TestDrive 'destination-home/.ssh') `
        'kravhantering_azure_dev_destination_ed25519'
      $context = New-TestTransferContext `
        -RepositoryRoot (Join-Path $TestDrive 'readme-repo') `
        -DestinationKeyPath $destinationKeyPath
      Set-Content `
        -LiteralPath $context.Config.LocalEnvironmentFilePath `
        -Value '# existing local configuration'
      $readmeRoot = Join-Path $TestDrive 'readme'
      $null = New-Item -ItemType Directory -Path $readmeRoot -Force
      $manifest = [PSCustomObject]@{
        intendedUse = 'connect-only'
        destinationPrivateKeyPath = $destinationKeyPath
        workstation = 'destination'
        sshHostAlias = 'krav-destination'
        sshHostName = '203.0.113.10'
        subscriptionId = ''
        tenantId = ''
        signingRequired = $false
      }

      InModuleScope -Parameters @{
        TestContext = $context
        TestDestinationPath = $readmeRoot
        TestManifest = $manifest
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Write-AzureDevExtractedReadme `
          -Context $TestContext `
          -DestinationPath $TestDestinationPath `
          -Manifest $TestManifest
      }
      $readme = Get-Content `
        -LiteralPath (Join-Path $readmeRoot 'README.md') `
        -Raw

      $readme.Contains(
        "AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH=$destinationKeyPath"
      ) | Should-BeTrue
    }
  }

  Context `
    'When a private extraction directory is created on Windows' `
    -Skip:(-not $IsWindows) {
    It 'Should grant access only to the current user' {
      $privateDirectory = Join-Path $TestDrive 'private-extraction'

      InModuleScope -Parameters @{
        TestPrivateDirectory = $privateDirectory
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        New-AzureDevPrivateDirectory -Path $TestPrivateDirectory
      }
      $acl = Get-Acl -LiteralPath $privateDirectory
      $currentSid =
        [System.Security.Principal.WindowsIdentity]::GetCurrent().User
      $owner = $acl.GetOwner(
        [System.Security.Principal.SecurityIdentifier]
      )
      $rules = @(
        $acl.GetAccessRules(
          $true,
          $true,
          [System.Security.Principal.SecurityIdentifier]
        )
      )

      $acl.AreAccessRulesProtected | Should-BeTrue
      $rules | Should-HaveCount -Expected 1
      $owner.Value |
        Should-BeString -Expected $currentSid.Value -CaseSensitive
      $rules[0].IdentityReference.Value |
        Should-BeString -Expected $currentSid.Value -CaseSensitive
      $rules[0].AccessControlType |
        Should-Be -Expected (
          [System.Security.AccessControl.AccessControlType]::Allow
        )
      $rules[0].InheritanceFlags |
        Should-Be -Expected (
          [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
          [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
        )
    }
  }

  Context 'When installed known-host entries are checked' {
    It 'Should require every exact normalized packaged key' {
      $expectedPath = Join-Path $TestDrive 'vm-known-hosts'
      $installedPath = Join-Path $TestDrive 'known_hosts'
      Set-Content `
        -LiteralPath $expectedPath `
        -Value '203.0.113.10 ssh-ed25519 AAAAexpected'
      Set-Content `
        -LiteralPath $installedPath `
        -Value @(
          '203.0.113.10 ssh-ed25519 AAAAdifferent',
          'unrelated.example ssh-rsa AAAAunrelated'
        )

      $mismatchAccepted = InModuleScope -Parameters @{
        TestExpectedPath = $expectedPath
        TestInstalledPath = $installedPath
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Test-AzureDevKnownHostsMatch `
          -ExpectedPath $TestExpectedPath `
          -InstalledPath $TestInstalledPath `
          -ExpectedHost '203.0.113.10'
      }
      Add-Content `
        -LiteralPath $installedPath `
        -Value '203.0.113.10   ssh-ed25519   AAAAexpected comment'
      $exactAccepted = InModuleScope -Parameters @{
        TestExpectedPath = $expectedPath
        TestInstalledPath = $installedPath
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Test-AzureDevKnownHostsMatch `
          -ExpectedPath $TestExpectedPath `
          -InstalledPath $TestInstalledPath `
          -ExpectedHost '203.0.113.10'
      }

      $mismatchAccepted | Should-BeFalse
      $exactAccepted | Should-BeTrue
    }
  }

  Context 'When connect-only workstation readiness is incomplete' {
    BeforeEach {
      Mock -CommandName Test-AzureDevPrerequisites -MockWith {
        throw 'AZURE_PREREQUISITES_INVOKED'
      }
    }

    It 'Should report all missing access requirements without Azure checks' {
      $partialRepo = Join-Path $TestDrive 'partial-repo'
      $null = New-Item -ItemType Directory -Path $partialRepo -Force
      Set-Content `
        -LiteralPath (
          Join-Path $partialRepo '.env.azure.development.local'
        ) `
        -Value 'AZURE_DEV_VM_CONNECTIVITY_MODE=public-ssh'
      $partialConfig = Get-AzureDevConfig `
        -RepositoryRoot $partialRepo `
        -AllowDirectSsh `
        -DirectSshReadiness
      $packageRoot = Join-Path $TestDrive 'partial-package'
      $packageReference = Join-Path $packageRoot 'reference'
      $null = New-Item `
        -ItemType Directory `
        -Path $packageReference `
        -Force
      Set-Content `
        -LiteralPath (Join-Path $packageReference 'vm-known-hosts') `
        -Value '203.0.113.10 ssh-ed25519 AAAAexpected'
      $manifest = [ordered]@{
        schema = 2
        kind = 'kravhantering-azure-dev-workstation-package'
        workstation = 'destination'
        intendedUse = 'connect-only'
        sshHostAlias = 'krav-destination'
        sshHostName = '203.0.113.10'
        destinationPrivateKeyPath = Join-Path `
          (Join-Path $TestDrive '.ssh') `
          'kravhantering_azure_dev_destination_ed25519'
        platform = 'linux'
        signingRequired = $false
      }
      Set-Content `
        -LiteralPath (Join-Path $packageRoot 'manifest.json') `
        -Value ($manifest | ConvertTo-Json)
      $context = [PSCustomObject]@{ Config = $partialConfig }
      $script:readinessInformation = @()

      {
        Invoke-AzureDevPrepareWorkstationAccess `
          -Context $context `
          -DestinationPath $packageRoot `
          -InformationVariable +script:readinessInformation
      } | Should-Throw -ExceptionMessage 'Workstation access is not ready.'
      $readinessOutput = @(
        $script:readinessInformation |
          ForEach-Object { [string]$_.MessageData }
      ) -join [System.Environment]::NewLine

      foreach ($expectedOutput in @(
          'Direct SSH host: missing',
          'SSH host alias: missing',
          'SSH private key: missing',
          'Verified known_hosts entry: missing',
          'Managed SSH block: missing or outdated'
        )) {
        $readinessOutput.Contains($expectedOutput) | Should-BeTrue
      }
      Should-NotInvoke `
        -CommandName Test-AzureDevPrerequisites `
        -Scope It
    }

    It 'Should expose the same diagnostics through the entry script' {
      $partialRepo = Join-Path $TestDrive 'entry-repo'
      $packageRoot = Join-Path $TestDrive 'entry-package'
      $packageReference = Join-Path $packageRoot 'reference'
      $readinessHome = Join-Path $TestDrive 'readiness-home'
      $readinessSsh = Join-Path $readinessHome '.ssh'
      $null = New-Item `
        -ItemType Directory `
        -Path $partialRepo, $packageReference, $readinessSsh `
        -Force
      Set-Content `
        -LiteralPath (
          Join-Path $partialRepo '.env.azure.development.local'
        ) `
        -Value 'AZURE_DEV_VM_CONNECTIVITY_MODE=public-ssh'
      Set-Content `
        -LiteralPath (Join-Path $packageReference 'vm-known-hosts') `
        -Value '203.0.113.10 ssh-ed25519 AAAAexpected'
      Set-Content `
        -LiteralPath (Join-Path $readinessSsh 'known_hosts') `
        -Value '203.0.113.10 ssh-ed25519 AAAAdifferent'
      $manifest = [ordered]@{
        schema = 2
        kind = 'kravhantering-azure-dev-workstation-package'
        workstation = 'destination'
        intendedUse = 'connect-only'
        sshHostAlias = 'krav-destination'
        sshHostName = '203.0.113.10'
        destinationPrivateKeyPath = Join-Path `
          (Join-Path $TestDrive '.ssh') `
          'kravhantering_azure_dev_destination_ed25519'
        platform = 'linux'
        signingRequired = $false
      }
      Set-Content `
        -LiteralPath (Join-Path $packageRoot 'manifest.json') `
        -Value ($manifest | ConvertTo-Json)
      [System.Environment]::SetEnvironmentVariable(
        'HOME',
        $readinessHome,
        'Process'
      )
      $entryScript = Join-Path $script:repositoryRoot 'scripts/azure-dev.ps1'
      $powerShellPath = [System.Environment]::ProcessPath

      $entryStartInfo = [System.Diagnostics.ProcessStartInfo]::new()
      $entryStartInfo.FileName = $powerShellPath
      $entryStartInfo.UseShellExecute = $false
      $entryStartInfo.RedirectStandardOutput = $true
      $entryStartInfo.RedirectStandardError = $true
      foreach ($argument in @(
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          $entryScript,
          '-Command',
          'prepare-workstation-access',
          '-RepositoryRoot',
          $partialRepo,
          '-DestinationPath',
          $packageRoot
        )) {
        $entryStartInfo.ArgumentList.Add($argument)
      }
      $entryProcess = [System.Diagnostics.Process]::new()
      $entryProcess.StartInfo = $entryStartInfo
      $null = $entryProcess.Start()
      $entryStandardOutput = $entryProcess.StandardOutput.ReadToEndAsync()
      $entryStandardError = $entryProcess.StandardError.ReadToEndAsync()
      if (-not $entryProcess.WaitForExit(30000)) {
        $entryProcess.Kill($true)
        $entryProcess.WaitForExit()
        $entryProcess.Dispose()
        throw (
          'prepare-workstation-access child PowerShell timed out after ' +
          '30000 ms.'
        )
      }
      $entryExitCode = $entryProcess.ExitCode
      $entryOutput = @(
        $entryStandardOutput.GetAwaiter().GetResult(),
        $entryStandardError.GetAwaiter().GetResult()
      ) -join [System.Environment]::NewLine
      $entryProcess.Dispose()

      $entryExitCode | Should-NotBe -Expected 0
      foreach ($expectedOutput in @(
          'Direct SSH host: missing',
          'SSH host alias: missing',
          'SSH private key: missing',
          'Verified known_hosts entry: missing',
          'Managed SSH block: missing or outdated',
          'Workstation access is not ready.'
        )) {
        $entryOutput.Contains($expectedOutput) | Should-BeTrue
      }
      $entryOutput | Should-NotMatchString `
        -Expected 'Azure CLI is required|az login|az account' `
        -CaseSensitive
    }
  }
}
