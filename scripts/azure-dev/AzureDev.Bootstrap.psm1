Set-StrictMode -Version Latest

function Invoke-AzureDevRemoteCommand {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$Command,

    [string]$Description = 'Run remote command'
  )

  if ($PSCmdlet.ShouldProcess($Context.Config.SshHostAlias, $Description)) {
    $result = Invoke-AzureDevNativeCommand `
      -FilePath 'ssh' `
      -Arguments @(
        '-o',
        'BatchMode=yes',
        '-o',
        'ClearAllForwardings=yes',
        '-o',
        'StrictHostKeyChecking=accept-new',
        $Context.Config.SshHostAlias,
        $Command
      )
    if ($result.ExitCode -ne 0) {
      throw "Remote command failed: $Description`n$($result.Text.Trim())"
    }
  }
}

function Copy-AzureDevBootstrapFile {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$RemotePath
  )

  if (-not (Test-Path -LiteralPath $Context.BootstrapPath -PathType Leaf)) {
    throw "Bootstrap script is missing: $($Context.BootstrapPath)"
  }

  if ($PSCmdlet.ShouldProcess($Context.Config.SshHostAlias, 'Upload host bootstrap')) {
    $result = Invoke-AzureDevNativeCommand `
      -FilePath 'scp' `
      -Arguments @(
        '-o',
        'BatchMode=yes',
        '-o',
        'ClearAllForwardings=yes',
        '-o',
        'StrictHostKeyChecking=accept-new',
        $Context.BootstrapPath,
        "$($Context.Config.SshHostAlias):$RemotePath"
      )
    if ($result.ExitCode -ne 0) {
      throw "Bootstrap upload failed.`n$($result.Text.Trim())"
    }
  }
}

function Copy-AzureDevQuadletFiles {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$RemotePath
  )

  $templatesPath = Split-Path -Parent $Context.BootstrapPath
  $quadletPath = Join-Path $templatesPath 'quadlet'
  if (-not (Test-Path -LiteralPath $quadletPath -PathType Container)) {
    throw "Quadlet template directory is missing: $quadletPath"
  }

  $quadletFiles = @(Get-ChildItem -LiteralPath $quadletPath -File | Sort-Object -Property Name)
  if ($quadletFiles.Count -eq 0) {
    throw "Quadlet template directory contains no files: $quadletPath"
  }

  if ($PSCmdlet.ShouldProcess($Context.Config.SshHostAlias, 'Upload Quadlet templates')) {
    Invoke-AzureDevRemoteCommand `
      -Context $Context `
      -Command "rm -rf $RemotePath && mkdir -p $RemotePath" `
      -Description 'Prepare Quadlet upload directory'

    $arguments = @(
      '-o',
      'BatchMode=yes',
      '-o',
      'ClearAllForwardings=yes',
      '-o',
      'StrictHostKeyChecking=accept-new'
    )
    $arguments += @($quadletFiles | ForEach-Object { $_.FullName })
    $arguments += "$($Context.Config.SshHostAlias):$RemotePath/"

    $result = Invoke-AzureDevNativeCommand `
      -FilePath 'scp' `
      -Arguments $arguments
    if ($result.ExitCode -ne 0) {
      throw "Quadlet upload failed.`n$($result.Text.Trim())"
    }
  }
}

function Copy-AzureDevZshTemplate {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$RemotePath
  )

  $templatesPath = Split-Path -Parent $Context.BootstrapPath
  $customPath = Join-Path $templatesPath 'zshrc.template'
  $examplePath = Join-Path $templatesPath 'zshrc.template.example'
  $sourcePath = if (Test-Path -LiteralPath $customPath -PathType Leaf) {
    $customPath
  } else {
    $examplePath
  }

  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Zsh template is missing: $sourcePath"
  }

  if ($PSCmdlet.ShouldProcess($Context.Config.SshHostAlias, 'Upload Zsh template')) {
    $lastSlash = $RemotePath.LastIndexOf('/')
    if ($lastSlash -le 0) {
      throw "Zsh template remote path must be absolute: $RemotePath"
    }
    $remoteDirectory = $RemotePath.Substring(0, $lastSlash)
    Invoke-AzureDevRemoteCommand `
      -Context $Context `
      -Command "mkdir -p $remoteDirectory" `
      -Description 'Prepare Zsh template upload directory'

    $result = Invoke-AzureDevNativeCommand `
      -FilePath 'scp' `
      -Arguments @(
        '-o',
        'BatchMode=yes',
        '-o',
        'ClearAllForwardings=yes',
        '-o',
        'StrictHostKeyChecking=accept-new',
        $sourcePath,
        "$($Context.Config.SshHostAlias):$RemotePath"
      )
    if ($result.ExitCode -ne 0) {
      throw "Zsh template upload failed.`n$($result.Text.Trim())"
    }
  }
}

function Test-AzureDevBootstrapSecrets {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $required = [ordered]@{
    KEYCLOAK_ADMIN_PASSWORD = $Config.KeycloakAdminPassword
    MSSQL_SA_PASSWORD = $Config.SqlServerSaPassword
  }
  foreach ($item in $required.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace($item.Value)) {
      throw (
        "$($item.Key) is required for setup. Set it in the session environment " +
        'or .env.azure.development.local.'
      )
    }
    if ($item.Value.Contains("`r") -or $item.Value.Contains("`n")) {
      throw "$($item.Key) must not contain newline characters."
    }
  }
}

function Copy-AzureDevServiceEnvironmentFiles {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context,

    [Parameter(Mandatory = $true)]
    [string]$RemotePath
  )

  Test-AzureDevBootstrapSecrets -Config $Context.Config

  $localPath = Join-Path `
    ([System.IO.Path]::GetTempPath()) `
    "krav-azure-dev-env-$([guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Path $localPath | Out-Null
  $uploadCompleted = $false

  try {
    if (-not $IsWindows) {
      & chmod 0700 $localPath
      if ($LASTEXITCODE -ne 0) {
        throw 'Failed to secure the temporary support-service environment directory.'
      }
    }

    $sqlServerPath = Join-Path $localPath 'sqlserver.env'
    $keycloakPath = Join-Path $localPath 'keycloak.env'
    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllLines(
      $sqlServerPath,
      @(
        'ACCEPT_EULA=Y',
        'MSSQL_PID=Developer',
        "MSSQL_SA_PASSWORD=$($Context.Config.SqlServerSaPassword)"
      ),
      $encoding
    )
    [System.IO.File]::WriteAllLines(
      $keycloakPath,
      @(
        'KEYCLOAK_ADMIN=admin',
        "KEYCLOAK_ADMIN_PASSWORD=$($Context.Config.KeycloakAdminPassword)"
      ),
      $encoding
    )

    if (-not $IsWindows) {
      & chmod 0600 $sqlServerPath $keycloakPath
      if ($LASTEXITCODE -ne 0) {
        throw 'Failed to secure the temporary support-service environment files.'
      }
    }

    if ($PSCmdlet.ShouldProcess($Context.Config.SshHostAlias, 'Upload support-service environment files')) {
      Invoke-AzureDevRemoteCommand `
        -Context $Context `
        -Command (
          "mkdir -p $RemotePath && chmod 0700 $RemotePath && " +
          "rm -f $RemotePath/sqlserver.env $RemotePath/keycloak.env"
        ) `
        -Description 'Prepare support-service environment upload directory'

      $result = Invoke-AzureDevNativeCommand `
        -FilePath 'scp' `
        -Arguments @(
          '-o',
          'BatchMode=yes',
          '-o',
          'ClearAllForwardings=yes',
          '-o',
          'StrictHostKeyChecking=accept-new',
          $sqlServerPath,
          $keycloakPath,
          "$($Context.Config.SshHostAlias):$RemotePath/"
        )
      if ($result.ExitCode -ne 0) {
        throw "Support-service environment upload failed.`n$($result.Text.Trim())"
      }
      $uploadCompleted = $true
    }
  } finally {
    try {
      Remove-Item -LiteralPath $localPath -Recurse -Force -ErrorAction Stop
      if (Test-Path -LiteralPath $localPath) {
        throw 'The temporary support-service environment directory still exists after removal.'
      }
    } catch {
      $stage = if ($uploadCompleted) { 'after a successful upload' } else { 'before upload completed' }
      throw "Failed to remove local support-service environment files $stage. $($_.Exception.Message)"
    }
  }
}

function Invoke-AzureDevBootstrap {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  $remoteBootstrapPath = '/tmp/krav-bootstrap-host.sh'
  $remoteQuadletPath = '/tmp/krav-azure-dev/quadlet'
  $remoteZshrcPath = '/tmp/krav-azure-dev/zshrc'
  $remoteServiceEnvironmentPath = '/tmp/krav-azure-dev/service-env'
  Copy-AzureDevBootstrapFile `
    -Context $Context `
    -RemotePath $remoteBootstrapPath
  Copy-AzureDevQuadletFiles `
    -Context $Context `
    -RemotePath $remoteQuadletPath
  Copy-AzureDevZshTemplate `
    -Context $Context `
    -RemotePath $remoteZshrcPath
  Copy-AzureDevServiceEnvironmentFiles `
    -Context $Context `
    -RemotePath $remoteServiceEnvironmentPath

  $command = @(
    'if command -v cloud-init >/dev/null 2>&1; then sudo cloud-init status --wait || true; fi'
    "chmod 0755 $remoteBootstrapPath"
    (
      "sudo env AZURE_DEV_QUADLET_SOURCE=$remoteQuadletPath " +
      "AZURE_DEV_ZSHRC_SOURCE=$remoteZshrcPath " +
      "AZURE_DEV_SERVICE_ENV_SOURCE=$remoteServiceEnvironmentPath " +
      "bash $remoteBootstrapPath"
    )
  ) -join ' && '
  if ($PSCmdlet.ShouldProcess($Context.Config.SshHostAlias, 'Run host bootstrap')) {
    Invoke-AzureDevRemoteCommand `
      -Context $Context `
      -Command $command `
      -Description 'Run host bootstrap'
  }
}

Export-ModuleMember -Function `
  Copy-AzureDevBootstrapFile, `
  Copy-AzureDevQuadletFiles, `
  Copy-AzureDevZshTemplate, `
  Copy-AzureDevServiceEnvironmentFiles, `
  Invoke-AzureDevBootstrap, `
  Invoke-AzureDevRemoteCommand, `
  Test-AzureDevBootstrapSecrets
