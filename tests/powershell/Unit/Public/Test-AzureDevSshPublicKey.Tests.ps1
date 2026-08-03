#requires -Version 7.4

Set-StrictMode -Version Latest

Describe 'Test-AzureDevSshPublicKey' -Tag 'Unit' {
  BeforeAll {
    $script:moduleName = 'AzureDev.Config'
    $script:repositoryRoot = [System.IO.Path]::GetFullPath(
      (Join-Path $PSScriptRoot '../../../..')
    )
    Import-Module (
      Join-Path $script:repositoryRoot 'scripts/azure-dev/AzureDev.Config.psm1'
    ) -Force -ErrorAction Stop

    function New-TestSshPublicKey {
      param(
        [Parameter(Mandatory = $true)]
        [System.String]$Algorithm,

        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [AllowEmptyString()]
        [System.String[]]$EncodedFields
      )

      $blob = [System.Collections.Generic.List[System.Byte]]::new()
      $encodedParts = @(
        [System.Convert]::ToBase64String(
          [System.Text.Encoding]::UTF8.GetBytes($Algorithm)
        )
        $EncodedFields
      )
      foreach ($encodedPart in $encodedParts) {
        $part = [System.Convert]::FromBase64String($encodedPart)
        $lengthBytes = [System.BitConverter]::GetBytes(
          [System.UInt32]$part.Length
        )
        if ([System.BitConverter]::IsLittleEndian) {
          [System.Array]::Reverse($lengthBytes)
        }
        $blob.AddRange([System.Byte[]]$lengthBytes)
        $blob.AddRange([System.Byte[]]$part)
      }
      return "$Algorithm $([System.Convert]::ToBase64String($blob.ToArray()))"
    }
  }

  AfterAll {
    Get-Module $script:moduleName -All | Remove-Module -Force
  }

  Context 'When validating an SSH public key wire blob' {
    It 'Should accept a structurally valid key' {
      $publicKey = (
        'ssh-ed25519 ' +
        'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
      )

      $result = Test-AzureDevSshPublicKey -Value $publicKey

      $result | Should-BeTrue
    }

    It 'Should reject Base64 without an SSH wire-format key' {
      $result = Test-AzureDevSshPublicKey -Value 'ssh-ed25519 QQ=='

      $result | Should-BeFalse
    }

    It 'Should reject an Ed25519 blob with the wrong key size' {
      $result = Test-AzureDevSshPublicKey `
        -Value 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAAUE='

      $result | Should-BeFalse
    }

    It 'Should reject a blob whose embedded algorithm does not match' {
      $rsaLabelWithEd25519Blob = (
        'ssh-rsa ' +
        'AAAAC3NzaC1lZDI1NTE5AAAAIK4Gak3xSoCDBBTD/UDsPazk1sN3TfGiZttuZXbTgQda'
      )

      $result = Test-AzureDevSshPublicKey -Value $rsaLabelWithEd25519Blob

      $result | Should-BeFalse
    }

    It 'Should reject a noncanonical algorithm name casing' {
      $publicKey = New-TestSshPublicKey `
        -Algorithm 'SSH-ED25519' `
        -EncodedFields @(
          [System.Convert]::ToBase64String([System.Byte[]]::new(32))
        )

      $result = Test-AzureDevSshPublicKey -Value $publicKey

      $result | Should-BeFalse
    }

    It 'Should accept supported RSA and DSS MPINT structures' {
      $rsa = New-TestSshPublicKey `
        -Algorithm 'ssh-rsa' `
        -EncodedFields @('AQAB', 'AQI=')
      $dss = New-TestSshPublicKey `
        -Algorithm 'ssh-dss' `
        -EncodedFields @('AQ==', 'Ag==', 'Aw==', 'BA==')

      (Test-AzureDevSshPublicKey -Value $rsa) | Should-BeTrue
      (Test-AzureDevSshPublicKey -Value $dss) | Should-BeTrue
    }

    It 'Should reject malformed RSA MPINT structures' {
      $negative = New-TestSshPublicKey `
        -Algorithm 'ssh-rsa' `
        -EncodedFields @('gA==', 'AQI=')
      $nonMinimal = New-TestSshPublicKey `
        -Algorithm 'ssh-rsa' `
        -EncodedFields @('AAE=', 'AQI=')
      $missingModulus = New-TestSshPublicKey `
        -Algorithm 'ssh-rsa' `
        -EncodedFields @('AQAB')

      (Test-AzureDevSshPublicKey -Value $negative) | Should-BeFalse
      (Test-AzureDevSshPublicKey -Value $nonMinimal) | Should-BeFalse
      (Test-AzureDevSshPublicKey -Value $missingModulus) | Should-BeFalse
    }

    It 'Should accept each supported ECDSA curve structure' {
      $curveCases = @(
        @{ Name = 'nistp256'; PointLength = 65 },
        @{ Name = 'nistp384'; PointLength = 97 },
        @{ Name = 'nistp521'; PointLength = 133 }
      )

      foreach ($curveCase in $curveCases) {
        $point = [System.Byte[]]::new($curveCase.PointLength)
        $point[0] = 4
        $publicKey = New-TestSshPublicKey `
          -Algorithm "ecdsa-sha2-$($curveCase.Name)" `
          -EncodedFields @(
            [System.Convert]::ToBase64String(
              [System.Text.Encoding]::UTF8.GetBytes($curveCase.Name)
            ),
            [System.Convert]::ToBase64String($point)
          )

        (Test-AzureDevSshPublicKey -Value $publicKey) | Should-BeTrue
      }
    }

    It 'Should reject a mismatched ECDSA curve and point structure' {
      $point = [System.Byte[]]::new(65)
      $point[0] = 3
      $publicKey = New-TestSshPublicKey `
        -Algorithm 'ecdsa-sha2-nistp256' `
        -EncodedFields @(
          [System.Convert]::ToBase64String(
            [System.Text.Encoding]::UTF8.GetBytes('nistp384')
          ),
          [System.Convert]::ToBase64String($point)
        )
      $missingPoint = New-TestSshPublicKey `
        -Algorithm 'ecdsa-sha2-nistp256' `
        -EncodedFields @(
          [System.Convert]::ToBase64String(
            [System.Text.Encoding]::UTF8.GetBytes('nistp256')
          )
        )

      (Test-AzureDevSshPublicKey -Value $publicKey) | Should-BeFalse
      (Test-AzureDevSshPublicKey -Value $missingPoint) | Should-BeFalse
    }

    It 'Should accept supported security-key structures' {
      $ed25519Key = [System.Byte[]]::new(32)
      $ecdsaPoint = [System.Byte[]]::new(65)
      $ecdsaPoint[0] = 4
      $application = [System.Convert]::ToBase64String(
        [System.Text.Encoding]::UTF8.GetBytes('ssh:test')
      )
      $ed25519 = New-TestSshPublicKey `
        -Algorithm 'sk-ssh-ed25519@openssh.com' `
        -EncodedFields @(
          [System.Convert]::ToBase64String($ed25519Key),
          $application
        )
      $ecdsa = New-TestSshPublicKey `
        -Algorithm 'sk-ecdsa-sha2-nistp256@openssh.com' `
        -EncodedFields @(
          [System.Convert]::ToBase64String(
            [System.Text.Encoding]::UTF8.GetBytes('nistp256')
          ),
          [System.Convert]::ToBase64String($ecdsaPoint),
          $application
        )

      (Test-AzureDevSshPublicKey -Value $ed25519) | Should-BeTrue
      (Test-AzureDevSshPublicKey -Value $ecdsa) | Should-BeTrue
    }

    It 'Should reject malformed security-key and unsupported structures' {
      $shortEd25519Key = [System.Byte[]]::new(31)
      $malformedSecurityKey = New-TestSshPublicKey `
        -Algorithm 'sk-ssh-ed25519@openssh.com' `
        -EncodedFields @(
          [System.Convert]::ToBase64String($shortEd25519Key),
          'YXBw'
        )
      $malformedEcdsaSecurityKey = New-TestSshPublicKey `
        -Algorithm 'sk-ecdsa-sha2-nistp256@openssh.com' `
        -EncodedFields @(
          [System.Convert]::ToBase64String(
            [System.Text.Encoding]::UTF8.GetBytes('nistp256')
          ),
          [System.Convert]::ToBase64String([System.Byte[]]::new(65))
        )
      $unsupported = New-TestSshPublicKey `
        -Algorithm 'ssh-xmss@openssh.com' `
        -EncodedFields @('AQ==')

      (Test-AzureDevSshPublicKey -Value $malformedSecurityKey) |
        Should-BeFalse
      (Test-AzureDevSshPublicKey -Value $malformedEcdsaSecurityKey) |
        Should-BeFalse
      (Test-AzureDevSshPublicKey -Value $unsupported) | Should-BeFalse
    }

    It 'Should reject empty fields and trailing partial field data' {
      $emptyField = New-TestSshPublicKey `
        -Algorithm 'ssh-rsa' `
        -EncodedFields @('', 'AQI=')
      $valid = New-TestSshPublicKey `
        -Algorithm 'ssh-ed25519' `
        -EncodedFields @(
          [System.Convert]::ToBase64String([System.Byte[]]::new(32))
        )
      $parts = $valid.Split(' ', 2)
      $blob = [System.Collections.Generic.List[System.Byte]]::new(
        [System.Convert]::FromBase64String($parts[1])
      )
      $blob.Add(0)
      $trailingPartialField = (
        "$($parts[0]) $([System.Convert]::ToBase64String($blob.ToArray()))"
      )
      $oversizedFieldBlob = [System.Convert]::FromBase64String($parts[1])
      $oversizedFieldBlob[18] = 33
      $oversizedField = (
        "$($parts[0]) $([System.Convert]::ToBase64String($oversizedFieldBlob))"
      )

      (Test-AzureDevSshPublicKey -Value $emptyField) | Should-BeFalse
      (Test-AzureDevSshPublicKey -Value $trailingPartialField) |
        Should-BeFalse
      (Test-AzureDevSshPublicKey -Value $oversizedField) | Should-BeFalse
    }
  }
}
