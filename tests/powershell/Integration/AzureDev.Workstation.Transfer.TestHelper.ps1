function Invoke-TestAzureDevNativeCommand {
  param(
    [Parameter(Mandatory = $true)]
    [System.String]$FilePath,

    [Parameter(Mandatory = $true)]
    [System.Object[]]$Arguments,

    [Parameter(Mandatory = $true)]
    [System.Management.Automation.PSObject]$State,

    [System.Management.Automation.SwitchParameter]$SupportSigning,

    [System.Management.Automation.SwitchParameter]$SupportChmod
  )

  if (
    $SupportSigning -and
    $FilePath -eq 'ssh-keygen' -and
    $Arguments.Count -gt 1 -and
    $Arguments[0] -eq '-Y' -and
    $Arguments[1] -eq 'sign'
  ) {
    $payloadBytes = [System.IO.File]::ReadAllBytes(
      [System.String]$Arguments[-1]
    )
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
      $digest = $hasher.ComputeHash($payloadBytes)
    } finally {
      $hasher.Dispose()
    }
    $signatureBody = [System.Convert]::ToBase64String($digest)
    Set-Content `
      -LiteralPath "$([System.String]$Arguments[-1]).sig" `
      -Value @(
        '-----BEGIN SSH SIGNATURE-----'
        $signatureBody
        '-----END SSH SIGNATURE-----'
      )
    return [System.Management.Automation.PSObject]@{ ExitCode = 0; Text = '' }
  }
  if ($FilePath -eq 'ssh-keyscan') {
    return [System.Management.Automation.PSObject]@{
      ExitCode = 0
      Text = '203.0.113.10 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
    }
  }
  if ($FilePath -eq 'ssh-keygen') {
    return [System.Management.Automation.PSObject]@{
      ExitCode = 0
      Text = '256 SHA256:host-key 203.0.113.10 (ED25519)'
    }
  }
  if ($SupportChmod -and $FilePath -eq 'chmod') {
    return [System.Management.Automation.PSObject]@{ ExitCode = 0; Text = '' }
  }
  if ($FilePath -ne 'age-test') {
    throw "Unexpected native command in transfer test: $FilePath"
  }

  if ($Arguments[0] -eq '-d') {
    $State.DecryptCalls += 1
    $packagePath = [System.String]$Arguments[-1]
    $encryptedPackageId = Get-Content -LiteralPath $packagePath -Raw
    $encryptedPackage = $State.EncryptedPackages[$encryptedPackageId]
    if ($null -eq $encryptedPackage) {
      return [System.Management.Automation.PSObject]@{
        ExitCode = 1
        Text = 'Unknown encrypted package.'
      }
    }

    $recipientMatched = $false
    for ($index = 0; $index -lt $Arguments.Count - 1; $index += 1) {
      if ($Arguments[$index] -ne '-i') {
        continue
      }
      $identityPath = [System.String]$Arguments[$index + 1]
      if (
        $State.IdentityRecipients.ContainsKey($identityPath) -and
        $State.IdentityRecipients[$identityPath] -ceq
          $encryptedPackage.Recipient
      ) {
        $recipientMatched = $true
        break
      }
    }
    if (-not $recipientMatched) {
      return [System.Management.Automation.PSObject]@{
        ExitCode = 1
        Text = 'No identity matched the package recipient.'
      }
    }

    $outputOptionIndex = [System.Array]::IndexOf($Arguments, '-o')
    if ($outputOptionIndex -lt 0) {
      throw 'age-test invocation did not include the -o option.'
    }
    [System.IO.File]::WriteAllBytes(
      [System.String]$Arguments[$outputOptionIndex + 1],
      [System.Byte[]]$encryptedPackage.ZipBytes
    )
    return [System.Management.Automation.PSObject]@{ ExitCode = 0; Text = '' }
  }

  $zipPath = [System.String]$Arguments[-1]
  $captured = @{}
  $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  foreach ($entry in $archive.Entries) {
    $reader = [System.IO.StreamReader]::new($entry.Open())
    $captured[$entry.FullName] = $reader.ReadToEnd()
    $reader.Dispose()
  }
  $archive.Dispose()
  $State.CapturedPackage = $captured

  $recipientOptionIndex = [System.Array]::IndexOf($Arguments, '-R')
  $outputOptionIndex = [System.Array]::IndexOf($Arguments, '-o')
  if ($recipientOptionIndex -lt 0) {
    throw 'age-test invocation did not include the -R option.'
  }
  if ($outputOptionIndex -lt 0) {
    throw 'age-test invocation did not include the -o option.'
  }
  $recipientPath = [System.String]$Arguments[$recipientOptionIndex + 1]
  $outputPath = [System.String]$Arguments[$outputOptionIndex + 1]
  $encryptedPackageId = "encrypted-$($State.EncryptedPackages.Count)"
  $State.EncryptedPackages[$encryptedPackageId] = [System.Management.Automation.PSObject]@{
    Recipient = (Get-Content -LiteralPath $recipientPath -Raw).Trim()
    ZipBytes = [System.IO.File]::ReadAllBytes($zipPath)
  }
  $State.LastRecipient = (Get-Content -LiteralPath $recipientPath -Raw).Trim()
  [System.IO.File]::WriteAllText($outputPath, $encryptedPackageId)
  return [System.Management.Automation.PSObject]@{ ExitCode = 0; Text = '' }
}

function Test-TestAzureDevWorkstationPackageSignature {
  param(
    [Parameter(Mandatory = $true)]
    [System.Byte[]]$Payload,

    [Parameter(Mandatory = $true)]
    [System.String]$Signature
  )

  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $digest = $hasher.ComputeHash($Payload)
  } finally {
    $hasher.Dispose()
  }
  $expectedBody = [System.Convert]::ToBase64String($digest)
  return $Signature -match (
    '(?s)^-----BEGIN SSH SIGNATURE-----\r?\n' +
    [System.Text.RegularExpressions.Regex]::Escape($expectedBody) +
    '\r?\n-----END SSH SIGNATURE-----\r?\n?$'
  )
}
