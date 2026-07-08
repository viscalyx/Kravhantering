Set-StrictMode -Version Latest

function Get-AzureDevQuadletUnitNames {
  [CmdletBinding()]
  param()

  return @(
    'krav-support.network',
    'krav-sqlserver.volume',
    'krav-hsa-mtls-certs.volume',
    'krav-db.container',
    'krav-idp.container',
    'krav-hsa-mtls-cert-generator.container',
    'krav-hsa-directory-mock.container',
    'krav-hsa-person-lookup-adapter.container',
    'krav-kong.container'
  )
}

function Get-AzureDevSupportPorts {
  [CmdletBinding()]
  param()

  return [ordered]@{
    sqlServer = '127.0.0.1:1433'
    keycloak = '127.0.0.1:8080'
    kongProxy = '127.0.0.1:18000'
  }
}

function Test-AzureDevLoopbackBinding {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$PublishPort
  )

  if ($PublishPort -notmatch '^127\.0\.0\.1:\d+:\d+$') {
    throw "Support-service ports must bind to loopback only: $PublishPort"
  }
  return $true
}

Export-ModuleMember -Function `
  Get-AzureDevQuadletUnitNames, `
  Get-AzureDevSupportPorts, `
  Test-AzureDevLoopbackBinding
