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

function Invoke-AzureDevBootstrap {
  [CmdletBinding(SupportsShouldProcess = $true)]
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Context
  )

  $remoteBootstrapPath = '/tmp/krav-bootstrap-host.sh'
  $remoteQuadletPath = '/tmp/krav-azure-dev/quadlet'
  Copy-AzureDevBootstrapFile `
    -Context $Context `
    -RemotePath $remoteBootstrapPath
  Copy-AzureDevQuadletFiles `
    -Context $Context `
    -RemotePath $remoteQuadletPath

  $command = @(
    'if command -v cloud-init >/dev/null 2>&1; then sudo cloud-init status --wait || true; fi'
    "chmod 0755 $remoteBootstrapPath"
    "sudo env AZURE_DEV_QUADLET_SOURCE=$remoteQuadletPath bash $remoteBootstrapPath"
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
  Invoke-AzureDevBootstrap, `
  Invoke-AzureDevRemoteCommand
