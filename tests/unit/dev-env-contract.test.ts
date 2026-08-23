// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Contract tests assert literal shell interpolation syntax.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseJsonc } from './test-helpers'

function readWorkspaceFile(path: string) {
  return readFileSync(path, 'utf8')
}

function collapseAdjacentPowerShellStringLiterals(content: string) {
  return content.replace(/(['"])\s*\+\r?\n\s*\1/gu, '')
}

function runtimeImageReferences(content: string) {
  return content.split(/\r?\n/u).flatMap(line => {
    const match =
      line.match(/^\s*image:\s*(\S+)\s*(?:#.*)?$/iu) ??
      line.match(/^Image=(\S+)\s*$/u)
    return match?.[1] ? [match[1]] : []
  })
}

const hsaPersonLookupEnvVars = [
  'HSA_PERSON_LOOKUP_TIMEOUT_MS',
  'HSA_PERSON_LOOKUP_URL',
  'HSA_PERSON_LOOKUP_CA_PATH',
  'HSA_PERSON_LOOKUP_CLIENT_CERT_PATH',
  'HSA_PERSON_LOOKUP_CLIENT_KEY_PATH',
  'HSA_PERSON_LOOKUP_TLS_SERVER_NAME',
  'HSA_PERSON_LOOKUP_OAUTH_TOKEN_URL',
  'HSA_PERSON_LOOKUP_OAUTH_ISSUER_URL',
  'HSA_PERSON_LOOKUP_OAUTH_CLIENT_ID',
  'HSA_PERSON_LOOKUP_OAUTH_CLIENT_SECRET',
  'HSA_PERSON_LOOKUP_OAUTH_SCOPE',
  'HSA_PERSON_LOOKUP_OAUTH_AUDIENCE',
] as const

const productionDeployDocs = [
  'docs/operations/rhel10-production-deploy.md',
  'docs/operations/rhel10-production-single-node-self-contained-deploy.md',
] as const

function expectEnvVars(content: string, names: readonly string[]) {
  for (const name of names) {
    expect(content).toContain(`${name}=`)
  }
}

function expectDocsMentionEnvVars(content: string, names: readonly string[]) {
  for (const name of names) {
    expect(content).toContain(name)
  }
}

describe('development environment contract', () => {
  it('anchors Azure VM configuration to the repository root', () => {
    const entryScript = readWorkspaceFile('scripts/azure-dev.ps1')
    const configModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Config.psm1',
    )
    expect(entryScript).toContain(
      'if ([string]::IsNullOrWhiteSpace($RepositoryRoot))',
    )
    expect(entryScript).toContain(
      '$RepositoryRoot = Split-Path -Parent $scriptRoot',
    )
    expect(entryScript).toContain('[string]$RepositoryRoot')
    expect(entryScript).toContain('-RepositoryRoot $RepositoryRoot')
    expect(configModule).toContain('[string]$RepositoryRoot')
    expect(configModule).toContain(
      '$primaryPath = Join-Path $RepositoryRoot $EnvironmentFile',
    )
    expect(configModule).not.toContain('$repoRoot = (Get-Location).Path')
  })

  it('keeps development service tags aligned with canonical image locks', () => {
    const services = [
      {
        lockPath: 'containers/sqlserver/image.lock.json',
        referencePaths: [
          '.devcontainer/docker-compose.yml',
          '.devcontainer/elevated/docker-compose.yml',
          'scripts/azure-dev/templates/quadlet/krav-db.container',
        ],
      },
      {
        lockPath: 'containers/keycloak/image.lock.json',
        referencePaths: [
          '.devcontainer/docker-compose.yml',
          '.devcontainer/elevated/docker-compose.yml',
          'scripts/azure-dev/templates/quadlet/krav-idp.container',
        ],
      },
      {
        lockPath: 'containers/kong/image.lock.json',
        referencePaths: [
          '.devcontainer/docker-compose.yml',
          '.devcontainer/elevated/docker-compose.yml',
          'scripts/azure-dev/templates/quadlet/krav-kong.container',
        ],
      },
    ] as const

    for (const service of services) {
      const lock = JSON.parse(readWorkspaceFile(service.lockPath)) as {
        image: string
        tag: string
      }
      const expectedReference = `${lock.image}:${lock.tag}`
      expect(lock.tag).toMatch(
        /^(?!latest$)[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/iu,
      )

      for (const referencePath of service.referencePaths) {
        const matchingReferences = runtimeImageReferences(
          readWorkspaceFile(referencePath),
        ).filter(reference => reference.startsWith(`${lock.image}:`))
        expect(matchingReferences).toEqual([expectedReference])
      }
    }
  })

  it('keeps the exact devcontainer base tag aligned with its image lock', () => {
    const lock = JSON.parse(
      readWorkspaceFile('containers/devcontainer-base/image.lock.json'),
    ) as { image: string; tag: string }
    const dockerfile = readWorkspaceFile('.devcontainer/Dockerfile')
    const references = [...dockerfile.matchAll(/^FROM\s+(\S+)/gimu)]
      .map(match => match[1])
      .filter(reference => reference?.startsWith(`${lock.image}:`))

    expect(lock.tag).toMatch(
      /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-ubuntu-24\.04$/u,
    )
    expect(references).toEqual([`${lock.image}:${lock.tag}`])
  })

  it('forwards only approved GitHub tokens through devcontainer remote environments', () => {
    for (const relativePath of [
      '.devcontainer/devcontainer.json',
      '.devcontainer/elevated/devcontainer.json',
    ]) {
      const devcontainer = parseJsonc(readWorkspaceFile(relativePath)) as {
        remoteEnv: Record<string, string>
      }

      expect(devcontainer.remoteEnv).toEqual({
        COPILOT_GITHUB_TOKEN: '${localEnv:COPILOT_GITHUB_TOKEN}',
        GH_TOKEN: '${localEnv:GH_TOKEN}',
      })
    }
  })

  it('preserves the immutable image reference of an existing Azure VM', () => {
    const entryScript = readWorkspaceFile('scripts/azure-dev.ps1')
    const azureModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Azure.psm1',
    )
    expect(entryScript).toContain(
      '$image = Get-AzureDevDeploymentImage -Config $Context.Config',
    )
    expect(azureModule).toContain("'storageProfile.imageReference'")
    expect(azureModule).toContain(
      '$existingImage = Get-AzureDevVmImage -Config $Config',
    )
    expect(azureModule).toContain('if ($null -ne $existingImage)')
    expect(azureModule).toContain(
      'Write-AzureDevImageDeprecationWarning `\n' +
        '      -Config $Config `\n' +
        '      -Image $existingImage',
    )
    expect(azureModule).toContain('return $existingImage')
    expect(azureModule).toContain(
      'return Get-AzureDevUbuntuImage -Config $Config',
    )
  })

  it('warns when configured image coordinates differ from an existing VM', () => {
    const azureModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Azure.psm1',
    )
    const resolverStart = azureModule.indexOf(
      'function Get-AzureDevDeploymentImage',
    )
    const resolverEnd = azureModule.indexOf(
      '\nfunction Get-AzureDevResourceGroup',
      resolverStart,
    )
    const resolver = azureModule.slice(resolverStart, resolverEnd)

    expect(resolverStart).toBeGreaterThanOrEqual(0)
    expect(resolverEnd).toBeGreaterThan(resolverStart)
    expect(resolver).toContain(
      '$existingImage.publisher -ine $Config.ImagePublisher',
    )
    expect(resolver).toContain('$existingImage.offer -ine $Config.ImageOffer')
    expect(resolver).toContain('$existingImage.sku -ine $Config.ImageSku')
    expect(resolver).toContain('if ($imageFamilyChanged)')
    expect(resolver).toContain('Azure cannot change the image publisher, " +')
    expect(resolver).toContain(
      "'Gen2 Trusted Launch, but Azure retains their original Gen1 image ' +",
    )
    expect(resolver).toContain(
      "'reference. Setup will preserve the existing image and attached disks ' +",
    )
    expect(resolver).toContain(
      "'and run setup again; the managed OS and data disks are deleted during ' +",
    )
    expect(resolver).toContain("'removal.'")
    expect(resolver).toContain('return $existingImage')
  })

  it('checks exact existing image deprecation during setup and status', () => {
    const entryScript = readWorkspaceFile('scripts/azure-dev.ps1')
    const azureModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Azure.psm1',
    )
    const warningStart = azureModule.indexOf(
      'function Write-AzureDevImageDeprecationWarning',
    )
    const warningEnd = azureModule.indexOf(
      '\nfunction Get-AzureDevDeploymentImage',
      warningStart,
    )
    const warningFunction = azureModule.slice(warningStart, warningEnd)

    expect(warningStart).toBeGreaterThanOrEqual(0)
    expect(warningEnd).toBeGreaterThan(warningStart)
    expect(warningFunction).toContain("'image',\n      'show'")
    expect(warningFunction).toContain('$Image.urn')
    expect(warningFunction).toContain("-Name 'imageDeprecationStatus'")
    expect(warningFunction).toContain(
      "if ($imageState -eq 'ScheduledForDeprecation')",
    )
    expect(warningFunction).toContain("-Name 'scheduledDeprecationTime'")
    expect(warningFunction).toContain(`"yyyy-MM-dd HH:mm:ss 'UTC'"`)
    expect(warningFunction).toContain(
      "'continue using the existing VM and OS disk. Check Azure Advisor",
    )
    const statusStart = entryScript.indexOf('function Get-AzureDevStatus')
    const statusEnd = entryScript.indexOf(
      '\nfunction Get-AzureDevSshConfig',
      statusStart,
    )
    const statusFunction = entryScript.slice(statusStart, statusEnd)

    expect(statusStart).toBeGreaterThanOrEqual(0)
    expect(statusEnd).toBeGreaterThan(statusStart)
    expect(statusFunction.indexOf('$securityState =')).toBeLessThan(
      statusFunction.indexOf('$image ='),
    )
    expect(statusFunction).toContain('$hasMarketplaceImage = (')
    expect(statusFunction).toContain(
      '"$($securityState.ImagePublisher):$($securityState.ImageOffer):" +',
    )
    expect(statusFunction).toContain(
      '"$($securityState.ImageSku):$($securityState.ImageVersion)"',
    )
    expect(statusFunction).toContain(
      'Get-AzureDevVmImage -Config $Context.Config',
    )
    expect(statusFunction).toContain(
      'Write-AzureDevImageDeprecationWarning `\n' +
        '      -Config $Context.Config `\n' +
        '      -Image $image',
    )
    expect(statusFunction).toContain(
      'Write-Host "Image: $(if ($null -eq $image)',
    )
  })

  it('resolves an active stable Ubuntu LTS image for a new Azure VM', () => {
    const entryScript = readWorkspaceFile('scripts/azure-dev.ps1')
    const azureModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Azure.psm1',
    )
    const configModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Config.psm1',
    )
    const envExample = readWorkspaceFile('.env.azure.development.example')
    const resolverStart = azureModule.indexOf(
      'function Get-AzureDevUbuntuImage',
    )
    const resolverEnd = azureModule.indexOf(
      '\nfunction Get-AzureDevVmImage',
      resolverStart,
    )
    const resolver = azureModule.slice(resolverStart, resolverEnd)

    expect(resolverStart).toBeGreaterThanOrEqual(0)
    expect(resolverEnd).toBeGreaterThan(resolverStart)
    expect(configModule).toContain("AZURE_DEV_VM_IMAGE_PUBLISHER = 'Canonical'")
    expect(configModule).toContain(
      "AZURE_DEV_VM_IMAGE_OFFER = 'ubuntu-24_04-lts'",
    )
    expect(configModule).toContain("AZURE_DEV_VM_IMAGE_SKU = 'server'")
    expect(configModule).toContain(
      'ImagePublisher = $values.AZURE_DEV_VM_IMAGE_PUBLISHER',
    )
    expect(configModule).toContain(
      'ImageOffer = $values.AZURE_DEV_VM_IMAGE_OFFER',
    )
    expect(configModule).toContain('ImageSku = $values.AZURE_DEV_VM_IMAGE_SKU')
    expect(envExample).toContain('AZURE_DEV_VM_IMAGE_PUBLISHER=Canonical')
    expect(envExample).toContain('AZURE_DEV_VM_IMAGE_OFFER=ubuntu-24_04-lts')
    expect(envExample).toContain('AZURE_DEV_VM_IMAGE_SKU=server')
    expect(resolver).toContain('$publisher = $Config.ImagePublisher')
    expect(resolver).toContain('$offer = $Config.ImageOffer')
    expect(resolver).toContain('$sku = $Config.ImageSku')
    expect(resolver).toContain(
      '$latestUrn = "${publisher}:${offer}:${sku}:latest"',
    )
    expect(resolver).toContain("-Name 'imageDeprecationStatus'")
    expect(resolver).toContain("if ($imageState -ne 'Active')")
    expect(resolver).toContain("-Name 'hyperVGeneration'")
    expect(resolver).toContain("if ($hyperVGeneration -ne 'V2')")
    expect(resolver).toContain("'SecurityType'")
    expect(resolver).toContain(
      `"$supportedSecurityTypes" -notmatch '(?i)TrustedLaunch'`,
    )
    expect(resolver).toContain(
      '$urn = "${publisher}:${offer}:${sku}:${version}"',
    )
    expect(resolver).not.toContain("'image',\n    'list'")
    expect(resolver).not.toContain('Sort-Object -Property version')
    expect(entryScript).toContain(
      '"$($Context.Config.ImagePublisher):$($Context.Config.ImageOffer):" +',
    )
    expect(entryScript).toContain(
      '"$($Context.Config.ImageSku):latest, resolved during setup"',
    )
  })

  it('provisions and converges Trusted Launch without breaking unsupported existing VMs', () => {
    const entryScript = readWorkspaceFile('scripts/azure-dev.ps1')
    const entryScriptText =
      collapseAdjacentPowerShellStringLiterals(entryScript)
    const azureModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Azure.psm1',
    )
    const configModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Config.psm1',
    )
    const bicepTemplate = readWorkspaceFile(
      'scripts/azure-dev/templates/main.bicep',
    )
    const sshHostKeyArgumentsStart = configModule.indexOf(
      '  $sshKnownHostsPath =',
    )
    const sshHostKeyArgumentsEnd = configModule.indexOf(
      '\n  $workstationApproverPublicKeyPath =',
      sshHostKeyArgumentsStart,
    )
    const sshHostKeyArgumentsBlock = configModule.slice(
      sshHostKeyArgumentsStart,
      sshHostKeyArgumentsEnd,
    )
    const sshHostKeyArgumentValues = [
      ...sshHostKeyArgumentsBlock.matchAll(/^\s*(['"])(.*?)\1,?\s*$/gmu),
    ].flatMap(match => (match[2] ? [match[2]] : []))
    const readinessStart = entryScript.indexOf(
      'function Wait-AzureDevTrustedLaunchGuestReadiness',
    )
    const readinessEnd = entryScript.indexOf(
      '\nfunction Set-AzureDevSetupState',
      readinessStart,
    )
    const readinessFunction = entryScript.slice(readinessStart, readinessEnd)
    const readinessCommandText =
      collapseAdjacentPowerShellStringLiterals(readinessFunction)
    const setupStart = entryScript.indexOf('function Invoke-AzureDevSetup')
    const setupEnd = entryScript.indexOf(
      '\nfunction Start-AzureDevEnvironment',
      setupStart,
    )
    const setupFunction = entryScript.slice(setupStart, setupEnd)
    const planEvaluationEnd = setupFunction.indexOf(
      '    $dataDisk = Get-AzureDevDataDisk',
    )
    expect(planEvaluationEnd).toBeGreaterThanOrEqual(0)
    const planEvaluation = setupFunction.slice(0, planEvaluationEnd)
    const skuSupportStart = azureModule.indexOf(
      'function Get-AzureDevTrustedLaunchSkuSupport',
    )
    const skuSupportEnd = azureModule.indexOf(
      '\nfunction Test-AzureDevSkuAvailability',
      skuSupportStart,
    )
    const skuSupportFunction = azureModule.slice(skuSupportStart, skuSupportEnd)
    const restrictionIndex = skuSupportFunction.indexOf("-Name 'restrictions'")
    const capabilityIndex = skuSupportFunction.indexOf(
      "-Name 'HyperVGenerations'",
    )

    expect(bicepTemplate).toContain('param trustedLaunchEnabled bool = true')
    expect(bicepTemplate).toContain(
      "securityType: 'TrustedLaunch'\n      uefiSettings: {",
    )
    expect(bicepTemplate).toContain('secureBootEnabled: true')
    expect(bicepTemplate).toContain('vTpmEnabled: true')
    expect(bicepTemplate).toContain(
      '}, trustedLaunchEnabled ? {\n    securityProfile:',
    )

    expect(azureModule).toContain('function Get-AzureDevVmSecurityState')
    expect(azureModule).toContain('function Get-AzureDevTrustedLaunchPlan')
    expect(azureModule).toContain("if ($state.HyperVGeneration -eq 'V1')")
    expect(azureModule).toContain("-Action 'UpgradeGen1'")
    expect(azureModule).toContain("-Action 'UpgradeGen2'")
    expect(azureModule).toContain("-Action 'EnableFeatures'")
    expect(azureModule).toContain("-Action 'Unsupported'")
    expect(azureModule).toContain('if ("$trustedLaunchDisabled" -ieq \'True\')')
    expect(azureModule).toContain("'--security-type',\n      'TrustedLaunch',")
    expect(azureModule).toContain("'--enable-secure-boot',\n      'true',")
    expect(azureModule).toContain("'--enable-vtpm',\n      'true',")
    expect(azureModule).toContain(
      'trustedLaunchEnabled=$($TrustedLaunchEnabled.ToString().ToLowerInvariant())',
    )
    expect(skuSupportStart).toBeGreaterThanOrEqual(0)
    expect(skuSupportEnd).toBeGreaterThan(skuSupportStart)
    expect(restrictionIndex).toBeGreaterThanOrEqual(0)
    expect(capabilityIndex).toBeGreaterThan(restrictionIndex)
    expect(skuSupportFunction).toContain("'NotAvailableForSubscription'")
    expect(skuSupportFunction).toContain("'QuotaId'")
    expect(skuSupportFunction).toContain(
      "$restrictionType -in @('Location', 'Zone')",
    )
    expect(skuSupportFunction).toContain(
      '$script:AzureDevTrustedLaunchSkuSupportCache[$cacheKey] = $result',
    )
    expect(azureModule).toContain(
      "The VM remains deallocated; inspect ' +\n" +
        "        'it in Azure and restart it manually before retrying.'",
    )
    expect(azureModule).toContain(
      "'remains deallocated and must be restarted manually after inspection.'",
    )

    expect(readinessStart).toBeGreaterThanOrEqual(0)
    expect(readinessEnd).toBeGreaterThan(readinessStart)
    expect(sshHostKeyArgumentsStart).toBeGreaterThanOrEqual(0)
    expect(sshHostKeyArgumentsEnd).toBeGreaterThan(sshHostKeyArgumentsStart)
    expect(entryScript).not.toContain(
      'function Test-AzureDevTrustedLaunchGuestReadiness',
    )
    expect(readinessFunction).toContain('$Context.Config.SshHostKeyArguments')
    expect(sshHostKeyArgumentsBlock).toContain(
      "$sshKnownHostsPath = Join-Path (Join-Path $HOME '.ssh') 'known_hosts'",
    )
    expect(sshHostKeyArgumentValues).toContain('StrictHostKeyChecking=yes')
    expect(sshHostKeyArgumentValues).toContain(
      'UserKnownHostsFile=$sshKnownHostsPath',
    )
    expect(sshHostKeyArgumentValues).toContain('GlobalKnownHostsFile=none')
    expect(sshHostKeyArgumentValues).toContain('KnownHostsCommand=none')
    expect(sshHostKeyArgumentValues).toContain('VerifyHostKeyDNS=no')
    expect(sshHostKeyArgumentValues).toContain('UpdateHostKeys=no')
    const userKnownHostsFile = sshHostKeyArgumentValues.find(value =>
      value.startsWith('UserKnownHostsFile='),
    )
    expect(userKnownHostsFile).toBeTruthy()
    expect(userKnownHostsFile).not.toBe('UserKnownHostsFile=')
    expect(userKnownHostsFile).not.toBe('UserKnownHostsFile=none')
    expect(readinessFunction).toContain('$Context.Config.SshHostAlias')
    expect(readinessFunction).toContain(
      'DKMS kernel modules require manual Secure Boot validation',
    )
    expect(readinessCommandText).toContain('Boot disk is not GPT')
    expect(readinessCommandText).toContain('EFI system partition is missing')
    expect(readinessCommandText).toContain(
      '/boot/efi is missing from /etc/fstab',
    )
    expect(planEvaluation).toContain(
      'if ($WhatIfPreference -and $trustedLaunchPlan.RequiresGuestValidation)',
    )
    expect(planEvaluation).toContain(
      "live guest validation is skipped during ' +",
    )
    expect(planEvaluation).toContain(
      "'assumes the guest readiness checks will pass during setup.'",
    )
    expect(planEvaluation).not.toContain(
      'Wait-AzureDevTrustedLaunchGuestReadiness',
    )
    expect(entryScript).toContain(
      "'Guest readiness validation did not pass: ' +",
    )
    expect(entryScript).toContain(
      "'preserve the current VM and disks, and continue repairing mutable ' +",
    )
    expect(entryScript).toContain(
      '-TrustedLaunchEnabled $trustedLaunchPlan.TemplateEnabled',
    )
    expect(setupFunction).toContain(
      'Set-AzureDevManagedSshConfig `\n' +
        '            -Context $Context `\n' +
        '            -HostName $trustedLaunchHostName',
    )
    const startIndex = setupFunction.indexOf(
      '          Start-AzureDevAzureVm -Context $Context',
    )
    const readinessIndex = setupFunction.indexOf(
      '          Wait-AzureDevTrustedLaunchGuestReadiness',
      startIndex,
    )
    const updateIndex = setupFunction.indexOf(
      '          $trustedLaunchResult = Set-AzureDevTrustedLaunch',
    )
    expect(startIndex).toBeGreaterThanOrEqual(0)
    expect(readinessIndex).toBeGreaterThan(startIndex)
    expect(updateIndex).toBeGreaterThan(readinessIndex)
    expect(entryScriptText).toContain(
      'This irreversibly converts the VM from Gen1 to Gen2; Azure retains',
    )
    expect(entryScript).toContain(
      'if ($WhatIfPreference) {\n        Write-Host (',
    )
    expect(entryScript).toContain(
      'Write-Host "Hyper-V generation: $generationText"',
    )
    expect(entryScript).toContain(
      'Write-Host "Security type: $securityTypeText"',
    )
    expect(entryScript).toContain('Write-Host "Secure Boot: $secureBootText"')
    expect(entryScript).toContain('Write-Host "vTPM: $vTpmText"')
  })

  it('cleans up Azure CLI stderr capture during WhatIf', () => {
    const azureModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Azure.psm1',
    )

    expect(azureModule).toContain('$WhatIfPreference = $false')
    expect(azureModule).toContain('[System.IO.File]::Delete($stderrPath)')
  })

  it('provisions distinct runtime and migration SQL identities in every development topology', () => {
    const devcontainerEnv = readWorkspaceFile('.devcontainer/.env.example')
    const defaultProfile = readWorkspaceFile('.devcontainer/devcontainer.json')
    const elevatedProfile = readWorkspaceFile(
      '.devcontainer/elevated/devcontainer.json',
    )
    const azureBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const azureValidation = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Validation.psm1',
    )

    expect(devcontainerEnv).toMatch(/^DB_USER=kravhantering_app$/mu)
    expect(devcontainerEnv).toMatch(/^DB_RUNTIME_USER=kravhantering_app$/mu)
    expect(devcontainerEnv).toMatch(/^DB_MIGRATION_USER=kravhantering_job$/mu)
    expect(devcontainerEnv).toContain('DB_BOOTSTRAP_ADMIN_USER=sa')
    expect(defaultProfile).toContain('npm run db:setup')
    expect(elevatedProfile).toContain('npm run db:setup')
    expect(azureBootstrap).toContain(
      "printf 'DB_MIGRATION_USER=kravhantering_job\\n'",
    )
    expect(azureBootstrap).toContain(
      "printf 'DB_RUNTIME_USER=kravhantering_app\\n'",
    )
    expect(azureBootstrap).toContain('generate_sql_password()')
    expect(azureBootstrap).toContain(
      'printf \'DB_BOOTSTRAP_APP_PASSWORD=%s\\n\' "${app_password}"',
    )
    expect(azureBootstrap).toContain(
      'printf \'DB_MIGRATION_PASSWORD=%s\\n\' "${migration_password}"',
    )
    expect(azureBootstrap).toContain(
      'printf \'DB_PASSWORD=%s\\n\' "${app_password}"',
    )
    expect(azureBootstrap).toContain(
      'while [ "${migration_password}" = "${app_password}" ]; do',
    )
    expect(azureBootstrap).toContain(
      'SQL Server environment file is missing or unreadable:',
    )
    expect(azureBootstrap).toContain('MSSQL_SA_PASSWORD is missing or empty in')
    expect(azureBootstrap).not.toContain('RuntimeOnly!Passw0rd7')
    expect(azureBootstrap).not.toContain('MigrationOnly!Passw0rd7')
    expect(azureValidation).toContain('npm run db:permission-status')
  })

  it('provisions the local AI provider-secret keyring in every managed development topology', () => {
    const defaultProfile = readWorkspaceFile('.devcontainer/devcontainer.json')
    const elevatedProfile = readWorkspaceFile(
      '.devcontainer/elevated/devcontainer.json',
    )
    const azureBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )

    for (const content of [defaultProfile, elevatedProfile, azureBootstrap]) {
      expect(content).toContain(
        'node scripts/provision-ai-provider-secret-keyring.mjs',
      )
    }
    expect(readWorkspaceFile('.gitignore')).toContain(
      '/.local/ai-provider-secret-keyring.json',
    )
    expect(readWorkspaceFile('.env.development')).toContain(
      'AI_PROVIDER_SECRET_KEYRING_FILE=.local/ai-provider-secret-keyring.json',
    )
  })

  it('manages Azure data disk size outside the VM deployment', () => {
    const entryScript = readWorkspaceFile('scripts/azure-dev.ps1')
    const azureModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Azure.psm1',
    )
    const bicepTemplate = readWorkspaceFile(
      'scripts/azure-dev/templates/main.bicep',
    )
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )

    expect(entryScript).toContain('Set-AzureDevDataDiskSize')
    expect(azureModule).toContain("'Expand Azure managed data disk'")
    expect(azureModule).toContain(
      'Azure managed disks cannot be shrunk. Setup will preserve the existing',
    )
    expect(bicepTemplate).toContain('param dataDiskExists bool = false')
    expect(bicepTemplate).toContain(
      'dataDiskExists ? {} : {\n  diskSizeGB: dataDiskGiB',
    )
    expect(hostBootstrap).toContain('resize2fs "${DATA_DEVICE}"')
  })

  it('keeps growing development storage on the 64 GiB data disk', () => {
    const configModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Config.psm1',
    )
    const bootstrapModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Bootstrap.psm1',
    )
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const smokeValidation = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Validation.psm1',
    )

    expect(configModule).toContain("AZURE_DEV_VM_DATA_DISK_GIB = '64'")
    expect(bootstrapModule).toContain("'storage-report.sh'")
    expect(bootstrapModule).toContain(
      'AZURE_DEV_STORAGE_REPORT_SOURCE=$remoteToolingPath/storage-report.sh',
    )
    for (const [mountDefinition, mountPoint] of [
      [
        'VSCODE_SERVER_DIR="${VSCODE_HOME}/.vscode-server"',
        '/home/vscode/.vscode-server',
      ],
      ['CODEX_HOME_DIR="${VSCODE_HOME}/.codex"', '/home/vscode/.codex'],
      ['VSCODE_CACHE_DIR="${VSCODE_HOME}/.cache"', '/home/vscode/.cache'],
      ['VSCODE_TEMP_DIR="/var/tmp/krav-vscode"', '/var/tmp/krav-vscode'],
      ['DOCKER_DIR="/var/lib/docker"', '/var/lib/docker'],
      ['CONTAINERD_DIR="/var/lib/containerd"', '/var/lib/containerd'],
    ]) {
      expect(hostBootstrap).toContain(mountDefinition)
      expect(smokeValidation).toContain(`findmnt ${mountPoint}`)
    }
    expect(hostBootstrap).toContain('configure_npm_caches()')
    expect(hostBootstrap).toContain('storage-report --check')
    expect(smokeValidation).toContain(
      'test "$(npm config get cache)" = "/mnt/krav-azure-dev-data/cache/npm/vscode"',
    )

    const stopDockerIndex = hostBootstrap.indexOf(
      'stop_docker_services_before_storage_change\n  mount_data_disk',
    )
    const startDockerIndex = hostBootstrap.indexOf(
      'mount_data_disk\n  start_docker_services_after_storage_change',
    )
    expect(stopDockerIndex).toBeGreaterThanOrEqual(0)
    expect(startDockerIndex).toBeGreaterThan(stopDockerIndex)
  })

  it('runs managed shell output before Powerlevel10k initialization', () => {
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const zshTemplate = readWorkspaceFile(
      'scripts/azure-dev/templates/zshrc.template.example',
    )
    const managedEnvironmentIndex = hostBootstrap.indexOf(
      '# Managed Azure development storage environment.',
    )
    const profileAppendIndex = hostBootstrap.indexOf(
      'cat "${VSCODE_HOME}/.zshrc" >> "${zshrc_with_storage}"',
    )

    expect(managedEnvironmentIndex).toBeGreaterThanOrEqual(0)
    expect(profileAppendIndex).toBeGreaterThan(managedEnvironmentIndex)
    expect(zshTemplate).not.toContain('locate-shell-integration-path')
  })

  it('repairs disposable Podman build state without pruning named volumes', () => {
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const recoveryStart = hostBootstrap.indexOf('build_hsa_images()')
    const recoveryEnd = hostBootstrap.indexOf(
      '\nrun_user_systemctl()',
      recoveryStart,
    )
    const recovery = hostBootstrap.slice(recoveryStart, recoveryEnd)

    expect(recoveryStart).toBeGreaterThanOrEqual(0)
    expect(recoveryEnd).toBeGreaterThan(recoveryStart)
    expect(recovery).toContain(
      "'layer not known|exists in local storage but may be corrupted'",
    )
    expect(recovery).toContain('podman system prune --external --force')
    expect(recovery).toContain('podman system prune --all --build --force')
    expect(recovery).toContain('build_hsa_images_once no-cache')
    expect(recovery).not.toContain('--volumes')
  })

  it('adds the Azure workspace to Git safe directories only once', () => {
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )

    expect(hostBootstrap).toContain(
      '  if ! git config --system --get-all safe.directory |\n' +
        '    grep -Fxq -- "${WORKSPACE_DIR}"; then\n' +
        '    git config --system --add safe.directory "${WORKSPACE_DIR}"\n' +
        '  fi',
    )
  })

  it('generates HSA lookup Swagger UI for the Next dev server', () => {
    const packageJson = JSON.parse(readWorkspaceFile('package.json'))
    const scripts = packageJson.scripts

    expect(scripts.predev).toBe('npm run dev:prepare')
    expect(scripts['dev:prepare']).toContain(
      'openapi:hsa-person-lookup:generate:public',
    )
    expect(scripts['dev:fresh']).toContain('npm run dev')
    expect(scripts['openapi:hsa-person-lookup:generate:public']).toContain(
      'public/api-docs/hsa-person-lookup',
    )
    expect(scripts['openapi:hsa-person-lookup:generate:public']).toContain(
      '--asset-base-path /api-docs/hsa-person-lookup/',
    )
  })

  it('generates HSA lookup Swagger UI before a clean prod-like build', () => {
    const packageJson = JSON.parse(readWorkspaceFile('package.json'))
    const scripts = packageJson.scripts

    expect(scripts['prebuild:local-prod']).toBe(
      'node ./scripts/prebuild.js && npm run openapi:hsa-person-lookup:generate:public',
    )
    expect(scripts['build:local-prod']).toContain('next build')
  })

  it('ships the devcontainer Kong HSA lookup URL in the committed dev env', () => {
    const env = readWorkspaceFile('.env.development')

    expect(env).toContain('HSA_PERSON_LOOKUP_TIMEOUT_MS=5000')
    expect(env).toContain(
      'HSA_PERSON_LOOKUP_URL=https://kong:8443/hsa/person-records/lookup',
    )
    expect(env).toContain('HSA_PERSON_LOOKUP_TLS_SERVER_NAME=kong')
  })

  it('documents the HSA lookup settings in the local env example', () => {
    const envExample = readWorkspaceFile('.env.example')

    expectEnvVars(envExample, hsaPersonLookupEnvVars)
  })

  it('keeps standalone production disabled and documents strict deployment settings', () => {
    const prodlikeEnv = readWorkspaceFile('.env.prodlike')
    const releaseAppEnv = readWorkspaceFile(
      'containers/production/env/app.env.template',
    )
    const containerAppExampleEnv = readWorkspaceFile(
      'containers/app/.env.app.example',
    )

    expect(prodlikeEnv).toContain('HSA_PERSON_LOOKUP_TIMEOUT_MS=5000')
    expect(prodlikeEnv).not.toMatch(/^HSA_PERSON_LOOKUP_URL=/m)
    expect(releaseAppEnv).toContain('HSA_PERSON_LOOKUP_TIMEOUT_MS=5000')
    expect(releaseAppEnv).not.toMatch(/^HSA_PERSON_LOOKUP_URL=/m)
    expect(containerAppExampleEnv).toContain(
      'HSA_PERSON_LOOKUP_TIMEOUT_MS=5000',
    )
    expect(containerAppExampleEnv).toMatch(/^HSA_PERSON_LOOKUP_URL=$/m)

    expectEnvVars(releaseAppEnv, hsaPersonLookupEnvVars)
    expectEnvVars(containerAppExampleEnv, hsaPersonLookupEnvVars)
  })

  it('documents deploy-time HSA lookup auth variables in production docs', () => {
    for (const path of productionDeployDocs) {
      const deployDoc = readWorkspaceFile(path)

      expect(deployDoc).toContain(
        '[HSA person lookup integration](../integrations/hsa-person-lookup-integration.md)',
      )
      expectDocsMentionEnvVars(deployDoc, hsaPersonLookupEnvVars)
    }
  })

  it('documents upgrade-time HSA lookup auth handoff', () => {
    const upgradeNotes = readWorkspaceFile(
      'docs/operations/operator-upgrade-notes.md',
    )

    expect(upgradeNotes).toContain(
      '[HSA person lookup integration](../integrations/hsa-person-lookup-integration.md)',
    )
    expectDocsMentionEnvVars(upgradeNotes, hsaPersonLookupEnvVars)
    expect(upgradeNotes).toContain('mTLS')
    expect(upgradeNotes).toContain('OAuth2')
  })
})
