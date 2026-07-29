#requires -Version 7.0

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-TransferTest {
  param(
    [Parameter(Mandatory = $true)]
    [bool]$Condition,

    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Assert-TransferContains {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Value,

    [Parameter(Mandatory = $true)]
    [string]$Expected,

    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  Assert-TransferTest `
    -Condition $Value.Contains($Expected) `
    -Message $Message
}

$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Import-Module `
  (Join-Path $workspace 'scripts/azure-dev/AzureDev.Config.psm1') `
  -Force
Import-Module `
  (Join-Path $workspace 'scripts/azure-dev/AzureDev.Workstation.psm1') `
  -Force
$workstationModule = Get-Module 'AzureDev.Workstation'
$fixtureRoot = Join-Path `
  ([IO.Path]::GetTempPath()) `
  "azure-dev-transfer-test-$([guid]::NewGuid().ToString('N'))"

try {
  New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
  $approverHome = Join-Path $fixtureRoot 'approver-home'
  $destinationHome = Join-Path $fixtureRoot 'destination-home'
  $destinationKeyPath = Join-Path `
    (Join-Path $destinationHome '.ssh') `
    'kravhantering_azure_dev_destination_ed25519'
  New-Item -ItemType Directory -Path $approverHome -Force | Out-Null

  & $workstationModule {
    param($DestinationHome)

    Set-Variable -Name HOME -Value $DestinationHome -Scope Script
    $script:CapturedPackage = $null

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
        [pscustomobject]$Config
      )

      New-Item `
        -ItemType Directory `
        -Path (Split-Path -Parent $Config.SshPrivateKeyPath) `
        -Force |
        Out-Null
      Set-Content -LiteralPath $Config.SshPrivateKeyPath -Value 'private'
      Set-Content -LiteralPath $Config.SshPublicKeyPath -Value 'public'
    }

    function script:Get-AzureDevSshPublicKey {
      param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Config
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
        [pscustomobject]$Config
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

      if (
        $FilePath -eq 'ssh-keygen' -and
        $Arguments.Count -gt 1 -and
        $Arguments[0] -eq '-Y' -and
        $Arguments[1] -eq 'sign'
      ) {
        Set-Content `
          -LiteralPath "$([string]$Arguments[-1]).sig" `
          -Value 'test signature'
        return [pscustomobject]@{ ExitCode = 0; Text = '' }
      }
      if ($FilePath -eq 'ssh-keyscan') {
        return [pscustomobject]@{
          ExitCode = 0
          Text = '203.0.113.10 ssh-ed25519 AAAAexpected'
        }
      }
      if ($FilePath -eq 'ssh-keygen') {
        return [pscustomobject]@{
          ExitCode = 0
          Text = '256 SHA256:host-key 203.0.113.10 (ED25519)'
        }
      }
      if ($FilePath -eq 'chmod') {
        return [pscustomobject]@{ ExitCode = 0; Text = '' }
      }
      if ($FilePath -ne 'age-test') {
        throw "Unexpected native command in transfer test: $FilePath"
      }

      $zipPath = [string]$Arguments[-1]
      $captured = @{}
      $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
      try {
        foreach ($entry in $archive.Entries) {
          $reader = [IO.StreamReader]::new($entry.Open())
          try {
            $captured[$entry.FullName] = $reader.ReadToEnd()
          } finally {
            $reader.Dispose()
          }
        }
      } finally {
        $archive.Dispose()
      }
      $script:CapturedPackage = $captured
      $outputOptionIndex = [Array]::IndexOf($Arguments, '-o')
      if ($outputOptionIndex -lt 0) {
        throw 'age-test invocation did not include the -o option.'
      }
      $outputIndex = $outputOptionIndex + 1
      [IO.File]::WriteAllText([string]$Arguments[$outputIndex], 'encrypted')
      return [pscustomobject]@{ ExitCode = 0; Text = '' }
    }
  } $destinationHome

  $repoRoot = Join-Path $fixtureRoot 'repo'
  New-Item -ItemType Directory -Path $repoRoot -Force | Out-Null
  $primaryPath = Join-Path $repoRoot '.env.azure.development'
  $localPath = Join-Path $repoRoot '.env.azure.development.local'
  Set-Content `
    -LiteralPath $primaryPath `
    -Value 'AZURE_DEV_VM_RESOURCE_GROUP=approver-rg'
  $context = [pscustomobject]@{
    Yes = $true
    Config = [pscustomobject]@{
      RepoRoot = $repoRoot
      EnvironmentFilePath = $primaryPath
      LocalEnvironmentFilePath = $localPath
      SshHostAlias = 'krav-destination'
      SubscriptionId = '00000000-0000-0000-0000-000000000001'
      EnvironmentId = 'personal'
      TenantId = '00000000-0000-0000-0000-000000000002'
      ResourceGroup = 'approver-rg'
      VmName = 'krav-dev-vm'
    }
  }
  $signedRequests = @{}
  foreach ($mode in @('connect-only', 'manage-environment')) {
    $requestPath = Join-Path $fixtureRoot "$mode.kravreq"
    New-AzureDevWorkstationRequest `
      -Context ([pscustomobject]@{
        Yes = $true
        StateDirectory = Join-Path $fixtureRoot 'state'
      }) `
      -WorkstationName 'destination' `
      -IntendedUse $mode `
      -Cidr '198.51.100.4/32' `
      -OutputPath $requestPath
    $armorLines = @(
      Get-Content -LiteralPath $requestPath |
        Where-Object {
          -not [string]::IsNullOrWhiteSpace($_) -and
          $_ -notmatch '^-----' -and
          $_ -notmatch '^Version:'
        }
    )
    $envelopeJson = [Text.Encoding]::UTF8.GetString(
      [Convert]::FromBase64String(($armorLines -join ''))
    )
    $envelope = $envelopeJson | ConvertFrom-Json
    $requestJson = [Text.Encoding]::UTF8.GetString(
      [Convert]::FromBase64String($envelope.payload)
    )
    $signedRequest = $requestJson | ConvertFrom-Json
    Assert-TransferTest `
      -Condition (
        $signedRequest.destinationPrivateKeyPath -ceq $destinationKeyPath
      ) `
      -Message "$mode request did not sign the destination-generated path."
    $signedRequests[$mode] = $signedRequest
  }

  & $workstationModule {
    param($ApproverHome)

    Set-Variable -Name HOME -Value $ApproverHome -Scope Script
  } $approverHome

  foreach ($mode in @('connect-only', 'manage-environment')) {
    $request = $signedRequests[$mode]
    $outputPath = Join-Path $fixtureRoot "$mode.age"
    $captured = & $workstationModule {
      param($Context, $Request, $OutputPath)

      $script:CapturedPackage = $null
      New-AzureDevWorkstationPackage `
        -Context $Context `
        -Request $Request `
        -OutputPath $OutputPath
      return $script:CapturedPackage
    } $context $request $outputPath

    $localContent = [string]$captured[
      'files/.env.azure.development.local'
    ]
    Assert-TransferContains `
      -Value $localContent `
      -Expected "AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH=$destinationKeyPath" `
      -Message "$mode packaged the approver's private-key path."
    $manifest = $captured['manifest.json'] | ConvertFrom-Json
    Assert-TransferTest `
      -Condition (
        $manifest.destinationPrivateKeyPath -ceq $destinationKeyPath
      ) `
      -Message "$mode manifest did not preserve the signed destination path."

    if ($mode -eq 'connect-only') {
      Assert-TransferTest `
        -Condition (
          -not $captured.ContainsKey('files/.env.azure.development')
        ) `
        -Message 'Connect-only unexpectedly packaged the primary file.'
    } else {
      Assert-TransferTest `
        -Condition $captured.ContainsKey('files/.env.azure.development') `
        -Message 'Manage-environment omitted the primary file.'
    }
  }

  Set-Content -LiteralPath $localPath -Value '# existing local configuration'
  $readmeRoot = Join-Path $fixtureRoot 'readme'
  New-Item -ItemType Directory -Path $readmeRoot -Force | Out-Null
  $readmeManifest = [pscustomobject]@{
    intendedUse = 'connect-only'
    destinationPrivateKeyPath = $destinationKeyPath
    workstation = 'destination'
    sshHostAlias = 'krav-destination'
    sshHostName = '203.0.113.10'
    subscriptionId = ''
    tenantId = ''
    signingRequired = $false
  }
  & $workstationModule {
    param($Context, $DestinationPath, $Manifest)

    Write-AzureDevExtractedReadme `
      -Context $Context `
      -DestinationPath $DestinationPath `
      -Manifest $Manifest
  } $context $readmeRoot $readmeManifest
  $readme = Get-Content `
    -LiteralPath (Join-Path $readmeRoot 'README.md') `
    -Raw
  Assert-TransferContains `
    -Value $readme `
    -Expected "AZURE_DEV_VM_SSH_PRIVATE_KEY_PATH=$destinationKeyPath" `
    -Message 'The README did not use the signed destination key path.'

  $referenceRoot = Join-Path $fixtureRoot 'reference'
  New-Item -ItemType Directory -Path $referenceRoot -Force | Out-Null
  $expectedKnownHosts = Join-Path $referenceRoot 'vm-known-hosts'
  $installedKnownHosts = Join-Path $fixtureRoot 'known_hosts'
  Set-Content `
    -LiteralPath $expectedKnownHosts `
    -Value '203.0.113.10 ssh-ed25519 AAAAexpected'
  Set-Content `
    -LiteralPath $installedKnownHosts `
    -Value @(
      '203.0.113.10 ssh-ed25519 AAAAdifferent',
      'unrelated.example ssh-rsa AAAAunrelated'
    )
  $mismatchAccepted = & $workstationModule {
    param($ExpectedPath, $InstalledPath)

    Test-AzureDevKnownHostsMatch `
      -ExpectedPath $ExpectedPath `
      -InstalledPath $InstalledPath `
      -ExpectedHost '203.0.113.10'
  } $expectedKnownHosts $installedKnownHosts
  Assert-TransferTest `
    -Condition (-not $mismatchAccepted) `
    -Message 'A different key for the correct hostname passed readiness.'
  Add-Content `
    -LiteralPath $installedKnownHosts `
    -Value '203.0.113.10   ssh-ed25519   AAAAexpected comment'
  $exactAccepted = & $workstationModule {
    param($ExpectedPath, $InstalledPath)

    Test-AzureDevKnownHostsMatch `
      -ExpectedPath $ExpectedPath `
      -InstalledPath $InstalledPath `
      -ExpectedHost '203.0.113.10'
  } $expectedKnownHosts $installedKnownHosts
  Assert-TransferTest `
    -Condition $exactAccepted `
    -Message 'The exact normalized packaged key did not pass readiness.'

  $partialRepo = Join-Path $fixtureRoot 'partial-repo'
  New-Item -ItemType Directory -Path $partialRepo -Force | Out-Null
  Set-Content `
    -LiteralPath (
      Join-Path $partialRepo '.env.azure.development.local'
    ) `
    -Value 'AZURE_DEV_VM_CONNECTIVITY_MODE=public-ssh'
  $partialConfig = Get-AzureDevConfig `
    -RepositoryRoot $partialRepo `
    -AllowDirectSsh `
    -DirectSshReadiness
  $packageRoot = Join-Path $fixtureRoot 'partial-package'
  $packageReference = Join-Path $packageRoot 'reference'
  $readinessHome = Join-Path $fixtureRoot 'readiness-home'
  $readinessSsh = Join-Path $readinessHome '.ssh'
  New-Item `
    -ItemType Directory `
    -Path $packageReference, $readinessSsh `
    -Force |
    Out-Null
  Copy-Item `
    -LiteralPath $expectedKnownHosts `
    -Destination (Join-Path $packageReference 'vm-known-hosts')
  Set-Content `
    -LiteralPath (Join-Path $readinessSsh 'known_hosts') `
    -Value '203.0.113.10 ssh-ed25519 AAAAdifferent'
  $partialManifest = [ordered]@{
    schema = 2
    kind = 'kravhantering-azure-dev-workstation-package'
    workstation = 'destination'
    intendedUse = 'connect-only'
    sshHostAlias = 'krav-destination'
    sshHostName = '203.0.113.10'
    destinationPrivateKeyPath = $destinationKeyPath
    platform = 'linux'
    signingRequired = $false
  }
  Set-Content `
    -LiteralPath (Join-Path $packageRoot 'manifest.json') `
    -Value ($partialManifest | ConvertTo-Json)
  & $workstationModule {
    param($ReadinessHome)

    Set-Variable -Name HOME -Value $ReadinessHome -Scope Script
    function script:Test-AzureDevPrerequisites {
      throw 'AZURE_PREREQUISITES_INVOKED'
    }
  } $readinessHome
  $readinessContext = [pscustomobject]@{ Config = $partialConfig }
  $readinessInformation = @()
  $readinessError = ''
  try {
    Invoke-AzureDevPrepareWorkstationAccess `
      -Context $readinessContext `
      -DestinationPath $packageRoot `
      -InformationVariable readinessInformation
  } catch {
    $readinessError = $_.Exception.Message
  }
  Assert-TransferTest `
    -Condition ($readinessError -eq 'Workstation access is not ready.') `
    -Message "Unexpected partial readiness error: $readinessError"
  $readinessOutput = @(
    $readinessInformation | ForEach-Object { [string]$_.MessageData }
  ) -join [Environment]::NewLine
  foreach ($expectedOutput in @(
      'Direct SSH host: missing',
      'SSH host alias: missing',
      'SSH private key: missing',
      'Verified known_hosts entry: missing',
      'Managed SSH block: missing or outdated'
    )) {
    Assert-TransferContains `
      -Value $readinessOutput `
      -Expected $expectedOutput `
      -Message "Partial readiness did not report: $expectedOutput"
  }
  Assert-TransferTest `
    -Condition ($readinessError -notmatch 'AZURE_PREREQUISITES_INVOKED') `
    -Message 'Connect-only partial readiness invoked Azure prerequisites.'

  $entryScript = Join-Path $workspace 'scripts/azure-dev.ps1'
  $powerShellPath = [Environment]::ProcessPath
  $entryOutput = & $powerShellPath `
    -NoLogo `
    -NoProfile `
    -File $entryScript `
    -Command 'prepare-workstation-access' `
    -RepositoryRoot $partialRepo `
    -DestinationPath $packageRoot 2>&1 |
    Out-String
  $entryExitCode = $LASTEXITCODE
  Assert-TransferTest `
    -Condition ($entryExitCode -ne 0) `
    -Message 'Partial entry-script readiness unexpectedly succeeded.'
  foreach ($expectedOutput in @(
      'Direct SSH host: missing',
      'SSH host alias: missing',
      'SSH private key: missing',
      'Verified known_hosts entry: missing',
      'Managed SSH block: missing or outdated',
      'Workstation access is not ready.'
    )) {
    Assert-TransferContains `
      -Value $entryOutput `
      -Expected $expectedOutput `
      -Message "Entry-script readiness did not report: $expectedOutput"
  }
  Assert-TransferTest `
    -Condition (
      $entryOutput -notmatch 'Azure CLI is required|az login|az account'
    ) `
    -Message 'Entry-script connect-only readiness entered Azure validation.'

  Write-Output 'Azure workstation transfer behavioral regressions passed.'
} finally {
  if (Test-Path -LiteralPath $fixtureRoot) {
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
  }
}
