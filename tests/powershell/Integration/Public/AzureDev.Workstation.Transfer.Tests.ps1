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
        'scripts/azure-dev/AzureDev.Config.psm1'
    ) -Force -ErrorAction Stop
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
    $script:approverPublicKey = (
      'ssh-ed25519 ' +
      'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
    )
    $script:destinationPublicKey = (
      'ssh-ed25519 ' +
      'AAAAC3NzaC1lZDI1NTE5AAAAIElRFe/K9qM55tJk2DRl7IsDK+cTTRpJ5nNiN2g358Z4'
    )
    $script:wrongPublicKey = (
      'ssh-ed25519 ' +
      'AAAAC3NzaC1lZDI1NTE5AAAAINkMOfviqHtQivWNECpHCBn472BbZ/TaFf75Zcxnabsy'
    )
    $script:signatureFixture = @'
-----BEGIN SSH SIGNATURE-----
U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAgrgZqTfFKgIMEFMP9QOw9rOTWw3
dN8aJm225ldtOBB1oAAAAha3JhdmhhbnRlcmluZy13b3Jrc3RhdGlvbi1wYWNrYWdlAAAA
AAAAAAZzaGE1MTIAAABTAAAAC3NzaC1lZDI1NTE5AAAAQKkNHeuk3RSlM/B/0PyBTeOYr3
61eD3vvH1aJEXPI9KxaOJSf7X0Euiv34mtAidW4vXkAeqj7djkBIcZyGAxwwY=
-----END SSH SIGNATURE-----
'@
    $script:packageSignatureVerifier = InModuleScope -ScriptBlock {
      (Get-Command Test-AzureDevWorkstationPackageSignature).ScriptBlock
    }

    function New-TestWorkstationPackage {
      param(
        [Parameter(Mandatory = $true)]
        [System.Management.Automation.PSObject]$Context,

        [Parameter(Mandatory = $true)]
        [System.Management.Automation.PSObject]$Request,

        [Parameter(Mandatory = $true)]
        [System.String]$OutputPath,

        [System.String[]]$ApprovedPrompts = @()
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
      return [System.Management.Automation.PSObject]@{
        Entries = $global:mockAzureDevWorkstationState.CapturedPackage
        Recipient = $global:mockAzureDevWorkstationState.LastRecipient
      }
    }

    function Get-TestWorkstationPackageEnvelope {
      param(
        [Parameter(Mandatory = $true)]
        [System.String]$Path
      )

      $encoded = @(
        Get-Content -LiteralPath $Path |
          Where-Object {
            -not [System.String]::IsNullOrWhiteSpace($_) -and
            $_ -notmatch '^-----' -and
            $_ -notmatch '^Version:'
          }
      ) -join ''
      $json = [System.Text.Encoding]::UTF8.GetString(
        [System.Convert]::FromBase64String($encoded)
      )
      return $json | ConvertFrom-Json
    }

    function Set-TestWorkstationPackageEnvelope {
      param(
        [Parameter(Mandatory = $true)]
        [System.String]$Path,

        [Parameter(Mandatory = $true)]
        [System.Management.Automation.PSObject]$Envelope
      )

      $json = $Envelope | ConvertTo-Json -Compress
      $encoded = [System.Convert]::ToBase64String(
        [System.Text.Encoding]::UTF8.GetBytes($json)
      )
      $lines = for (
        $offset = 0
        $offset -lt $encoded.Length
        $offset += 64
      ) {
        $length = [System.Math]::Min(64, $encoded.Length - $offset)
        $encoded.Substring($offset, $length)
      }
      Set-Content -LiteralPath $Path -Value @(
        '-----BEGIN KRAVHANTERING WORKSTATION PACKAGE-----'
        'Version: 3'
        ''
        $lines
        '-----END KRAVHANTERING WORKSTATION PACKAGE-----'
      )
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
    Get-Module 'AzureDev.Azure' -All | Remove-Module -Force
    Get-Module 'AzureDev.Config' -All | Remove-Module -Force
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
    $script:approvalKeyPath = Join-Path `
      $TestDrive `
      'kravhantering_azure_dev_approval_ed25519'
    Set-Content `
      -LiteralPath $script:approvalKeyPath `
      -Value 'managed approval private key'
    Set-Content `
      -LiteralPath "$script:approvalKeyPath.pub" `
      -Value $script:approverPublicKey
    $script:context = [System.Management.Automation.PSObject]@{
      Yes = $false
      Config = [System.Management.Automation.PSObject]@{
        RepoRoot = $script:repoRoot
        EnvironmentFilePath = $script:primaryPath
        LocalEnvironmentFilePath = $script:localPath
        SshHostAlias = 'krav-destination'
        SubscriptionId = '00000000-0000-0000-0000-000000000001'
        EnvironmentId = 'personal'
        TenantId = '00000000-0000-0000-0000-000000000002'
        ResourceGroup = 'approver-rg'
        VmName = 'krav-dev-vm'
        SshPrivateKeyPath = $script:approvalKeyPath
        SshPublicKeyPath = "$script:approvalKeyPath.pub"
        WorkstationApproverPublicKeyPath = "$script:approvalKeyPath.pub"
        PackageIdentityPath = $script:destinationKeyPath
      }
    }
    $script:request = [System.Management.Automation.PSObject]@{
      requestId = [System.Guid]::NewGuid().ToString()
      workstation = 'destination'
      intendedUse = 'connect-only'
      destinationPrivateKeyPath = $script:destinationKeyPath
      publicKey = $script:destinationPublicKey
      publicKeyFingerprint = 'SHA256:destination'
      approverPublicKeyFingerprint = InModuleScope -Parameters @{
        PublicKey = $script:approverPublicKey
      } -ScriptBlock {
        Set-StrictMode -Version 1.0
        Get-AzureDevPublicKeyFingerprint `
          -PublicKey $PublicKey
      }
      platform = 'linux'
      architecture = 'x64'
    }

    $global:mockAzureDevWorkstationState = [System.Management.Automation.PSObject]@{
      ApprovedPrompts = @()
      CapturedPackage = $null
      DecryptCalls = 0
      EncryptedPackages = @{}
      IdentityRecipients = @{}
      LastRecipient = ''
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
      -MockWith {
        @($Context.Config.PackageIdentityPath)
      }
    Mock -CommandName Write-AzureDevExtractedReadme
    Mock `
      -CommandName Test-AzureDevWorkstationPackageSignature `
      -MockWith {
        return Test-TestAzureDevWorkstationPackageSignature `
          -Payload $Payload `
          -Signature $Signature
      }
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
          -State $global:mockAzureDevWorkstationState `
          -SupportSigning
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

  Context 'When verifying an OpenSSH package signature' {
    It 'Should accept the exact signed binary payload and namespace' {
      $payload = [System.Convert]::FromBase64String(
        'YWdlLWVuY3J5cHRlZC1wYXlsb2FkLWZpeHR1cmUK'
      )

      $verified = & $script:packageSignatureVerifier `
        -Payload $payload `
        -Signature $script:signatureFixture `
        -PublicKey $script:approverPublicKey

      $verified | Should-BeTrue
    }

    It 'Should reject a modified binary payload' {
      $payload = [System.Convert]::FromBase64String(
        'YWdlLWVuY3J5cHRlZC1wYXlsb2FkLWZpeHR1cmUK'
      )
      $payload[0] = $payload[0] -bxor 1

      $verified = & $script:packageSignatureVerifier `
        -Payload $payload `
        -Signature $script:signatureFixture `
        -PublicKey $script:approverPublicKey

      $verified | Should-BeFalse
    }

    It 'Should reject a signature from a different trusted key' {
      $payload = [System.Convert]::FromBase64String(
        'YWdlLWVuY3J5cHRlZC1wYXlsb2FkLWZpeHR1cmUK'
      )

      $verified = & $script:packageSignatureVerifier `
        -Payload $payload `
        -Signature $script:signatureFixture `
        -PublicKey $script:wrongPublicKey

      $verified | Should-BeFalse
    }
  }

  Context 'When process tokens have not been approved for transfer' {
    It 'Should exclude both process tokens' {
      $packagePath = Join-Path $TestDrive 'default.kravpkg'
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
      $packagePath = Join-Path $TestDrive "$IncludedToken.kravpkg"
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
      $packagePath = Join-Path $TestDrive 'both-tokens.kravpkg'
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
      $wrongContext = [System.Management.Automation.PSObject]@{
        Config = [System.Management.Automation.PSObject]@{
          PackageIdentityPath = $wrongKeyPath
          WorkstationApproverPublicKeyPath = "$script:approvalKeyPath.pub"
        }
      }
      $global:mockAzureDevWorkstationState.IdentityRecipients[$wrongKeyPath] =
        $script:wrongPublicKey
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

  Context 'When a response package is unsigned' {
    It 'Should reject the legacy payload before decryption' {
      $packagePath = Join-Path $TestDrive 'unsigned.age'
      Set-Content `
        -LiteralPath $packagePath `
        -Value @(
          '-----BEGIN AGE ENCRYPTED FILE-----'
          'dW5zaWduZWQ='
          '-----END AGE ENCRYPTED FILE-----'
        )
      $destination = Join-Path $TestDrive 'unsigned-extraction'

      {
        Expand-AzureDevWorkstationPackage `
          -Context $script:context `
          -PackagePath $packagePath `
          -DestinationPath $destination `
          -Confirm:$false
      } | Should-Throw -ExceptionMessage (
        'The workstation package envelope or signature is malformed.*'
      )
      $global:mockAzureDevWorkstationState.DecryptCalls |
        Should-Be -Expected 0
      Test-Path -LiteralPath $destination | Should-BeFalse
    }

    It 'Should reject an envelope with a missing signature before decryption' {
      $packagePath = Join-Path $TestDrive 'missing-signature.kravpkg'
      $null = New-TestWorkstationPackage `
        -Context $script:context `
        -Request $script:request `
        -OutputPath $packagePath
      $envelope = Get-TestWorkstationPackageEnvelope -Path $packagePath
      $envelope.signature = ''
      Set-TestWorkstationPackageEnvelope `
        -Path $packagePath `
        -Envelope $envelope
      $destination = Join-Path $TestDrive 'missing-signature-extraction'

      {
        Expand-AzureDevWorkstationPackage `
          -Context $script:context `
          -PackagePath $packagePath `
          -DestinationPath $destination `
          -Confirm:$false
      } | Should-Throw -ExceptionMessage (
        'The workstation package envelope or signature is malformed.*'
      )
      $global:mockAzureDevWorkstationState.DecryptCalls |
        Should-Be -Expected 0
      Test-Path -LiteralPath $destination | Should-BeFalse
    }
  }

  BeforeDiscovery {
    $tamperCases = @(
      @{ TamperTarget = 'payload' },
      @{ TamperTarget = 'signature' }
    )
  }

  Context 'When a signed response package is modified' {
    It `
      'Should reject the modified <TamperTarget> before decryption' `
      -ForEach $tamperCases {
      $packagePath = Join-Path $TestDrive "tampered-$TamperTarget.kravpkg"
      $null = New-TestWorkstationPackage `
        -Context $script:context `
        -Request $script:request `
        -OutputPath $packagePath
      $envelope = Get-TestWorkstationPackageEnvelope -Path $packagePath
      if ($TamperTarget -eq 'payload') {
        $payload = [System.Convert]::FromBase64String($envelope.payload)
        $payload[0] = $payload[0] -bxor 1
        $envelope.payload = [System.Convert]::ToBase64String($payload)
      } else {
        $signature = [System.Text.Encoding]::ASCII.GetString(
          [System.Convert]::FromBase64String($envelope.signature)
        )
        $signature = $signature -replace '(?m)^([A-Za-z0-9+/])', 'A'
        $envelope.signature = [System.Convert]::ToBase64String(
          [System.Text.Encoding]::ASCII.GetBytes($signature)
        )
      }
      Set-TestWorkstationPackageEnvelope `
        -Path $packagePath `
        -Envelope $envelope
      $destination = Join-Path $TestDrive "$TamperTarget-extraction"

      {
        Expand-AzureDevWorkstationPackage `
          -Context $script:context `
          -PackagePath $packagePath `
          -DestinationPath $destination `
          -Confirm:$false
      } | Should-Throw -ExceptionMessage (
        'The workstation package approval signature is invalid*'
      )
      $global:mockAzureDevWorkstationState.DecryptCalls |
        Should-Be -Expected 0
      Test-Path -LiteralPath $destination | Should-BeFalse
    }
  }

  Context 'When the configured approver key has changed' {
    It 'Should reject the pending package before decryption' {
      $packagePath = Join-Path $TestDrive 'rotated-key.kravpkg'
      $null = New-TestWorkstationPackage `
        -Context $script:context `
        -Request $script:request `
        -OutputPath $packagePath
      Set-Content `
        -LiteralPath "$script:approvalKeyPath.pub" `
        -Value $script:wrongPublicKey
      $destination = Join-Path $TestDrive 'rotated-key-extraction'

      {
        Expand-AzureDevWorkstationPackage `
          -Context $script:context `
          -PackagePath $packagePath `
          -DestinationPath $destination `
          -Confirm:$false
      } | Should-Throw -ExceptionMessage (
        'The workstation package approval signature is invalid*'
      )
      $global:mockAzureDevWorkstationState.DecryptCalls |
        Should-Be -Expected 0
      Test-Path -LiteralPath $destination | Should-BeFalse
    }
  }

  Context 'When the decrypted manifest names another approver' {
    It 'Should reject the package and remove decrypted output' {
      $packagePath = Join-Path $TestDrive 'manifest-mismatch.kravpkg'
      $null = New-TestWorkstationPackage `
        -Context $script:context `
        -Request $script:request `
        -OutputPath $packagePath
      $envelope = Get-TestWorkstationPackageEnvelope -Path $packagePath
      $encryptedPackageId = [System.Text.Encoding]::UTF8.GetString(
        [System.Convert]::FromBase64String($envelope.payload)
      )
      $encryptedPackage =
        $global:mockAzureDevWorkstationState.EncryptedPackages[
          $encryptedPackageId
        ]
      $sourceZipPath = Join-Path $TestDrive 'manifest-source.zip'
      $payloadDirectory = Join-Path $TestDrive 'manifest-payload'
      $modifiedZipPath = Join-Path $TestDrive 'manifest-modified.zip'
      [System.IO.File]::WriteAllBytes(
        $sourceZipPath,
        $encryptedPackage.ZipBytes
      )
      [System.IO.Compression.ZipFile]::ExtractToDirectory(
        $sourceZipPath,
        $payloadDirectory
      )
      $manifestPath = Join-Path $payloadDirectory 'manifest.json'
      $manifest = Get-Content -LiteralPath $manifestPath -Raw |
        ConvertFrom-Json
      $manifest.approverPublicKeyFingerprint = 'SHA256:' + ('A' * 43)
      Set-Content `
        -LiteralPath $manifestPath `
        -Value ($manifest | ConvertTo-Json -Depth 8)
      [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $payloadDirectory,
        $modifiedZipPath
      )
      $encryptedPackage.ZipBytes = [System.IO.File]::ReadAllBytes(
        $modifiedZipPath
      )
      $global:mockAzureDevWorkstationState.IdentityRecipients[
        $script:destinationKeyPath
      ] = $script:request.publicKey
      $destination = Join-Path $TestDrive 'manifest-mismatch-extraction'

      {
        Expand-AzureDevWorkstationPackage `
          -Context $script:context `
          -PackagePath $packagePath `
          -DestinationPath $destination `
          -Confirm:$false
      } | Should-Throw -ExceptionMessage (
        'The workstation package manifest approver identity does not match*'
      )
      $global:mockAzureDevWorkstationState.DecryptCalls |
        Should-Be -Expected 1
      Test-Path -LiteralPath $destination | Should-BeFalse
    }
  }
}
