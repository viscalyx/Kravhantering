// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Contract tests assert literal shell interpolation syntax.
// cSpell:words uefi vtpm
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readWorkspaceFile(path: string) {
  return readFileSync(path, 'utf8')
}

function collapseAdjacentPowerShellStringLiterals(content: string) {
  return content.replace(/(['"])\s*\+\r?\n\s*\1/gu, '')
}

function withoutSingleQuotedLiterals(content: string) {
  return content.replace(/'(?:''|[^'\r\n])*'/gu, "''")
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
      '\nfunction Update-AzureDevCidr',
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
    const bicepTemplate = readWorkspaceFile(
      'scripts/azure-dev/templates/main.bicep',
    )
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
    expect(entryScript).not.toContain(
      'function Test-AzureDevTrustedLaunchGuestReadiness',
    )
    expect(readinessFunction).toContain('StrictHostKeyChecking=accept-new')
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

  it('configures the Azure VM Git identity before Remote SSH use', () => {
    const entryScript = readWorkspaceFile('scripts/azure-dev.ps1')
    const envExample = readWorkspaceFile('.env.azure.development.example')
    const configModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Config.psm1',
    )
    const loggingModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Logging.psm1',
    )
    const bootstrapModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Bootstrap.psm1',
    )
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const validationModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Validation.psm1',
    )

    expect(envExample).toContain('# AZURE_DEV_GIT_USER_NAME=')
    expect(envExample).toContain('# AZURE_DEV_GIT_USER_EMAIL=')
    expect(envExample).toContain(
      '# AZURE_DEV_GIT_SSH_SIGNING_KEY=~/.ssh/id_ed25519.pub',
    )
    expect(configModule).toContain(
      "-Arguments @('-C', $RepositoryRoot, 'config', '--get', $Key)",
    )
    expect(configModule).toContain('using module ./AzureDev.Logging.psm1')
    expect(configModule).toContain("-Key 'user.name'")
    expect(configModule).toContain("-Key 'user.email'")
    expect(configModule).toContain("-Key 'gpg.format'")
    expect(configModule).toContain("-Key 'commit.gpgsign'")
    expect(configModule).toContain("-Key 'user.signingkey'")
    expect(configModule).toContain(
      'GitUserName = $values.AZURE_DEV_GIT_USER_NAME',
    )
    expect(configModule).toContain(
      'GitUserEmail = $values.AZURE_DEV_GIT_USER_EMAIL',
    )
    expect(configModule).toContain('Resolve-AzureDevGitSshSigningPublicKey')
    expect(configModule).toContain(
      'GitSshSigningPublicKey = $gitSshSigningPublicKey',
    )
    expect(configModule).toContain('private-key path with a matching .pub file')
    expect(entryScript).toContain(
      'Test-AzureDevGitIdentity -Config $Context.Config',
    )
    const gitIdentityCheckIndex = entryScript.indexOf(
      'Test-AzureDevGitIdentity -Config $Context.Config',
    )
    const firstRemoteSshOperationIndex = entryScript.indexOf('Wait-AzureDevSsh')
    const firstBootstrapOperationIndex = entryScript.indexOf(
      'Invoke-AzureDevBootstrap -Context $Context',
    )
    const setupStateStart = entryScript.indexOf(
      'function Set-AzureDevSetupState',
    )
    const setupStateEnd = entryScript.indexOf(
      '\nfunction Invoke-AzureDevSetup',
      setupStateStart,
    )
    const persistedSetupState = entryScript.slice(
      setupStateStart,
      setupStateEnd,
    )
    expect(gitIdentityCheckIndex).toBeGreaterThanOrEqual(0)
    expect(firstRemoteSshOperationIndex).toBeGreaterThan(gitIdentityCheckIndex)
    expect(firstBootstrapOperationIndex).toBeGreaterThan(gitIdentityCheckIndex)
    expect(setupStateStart).toBeGreaterThanOrEqual(0)
    expect(setupStateEnd).toBeGreaterThan(setupStateStart)
    expect(persistedSetupState).not.toContain('GitUserEmail')
    expect(loggingModule).toContain('function ConvertTo-AzureDevPiiSafeText')
    expect(loggingModule).toContain(
      '$piiSafeText = ConvertTo-AzureDevPiiSafeText -Value $text',
    )
    expect(loggingModule).toContain(
      '$displayArgument = ConvertTo-AzureDevPiiSafeText -Value $displayArgument',
    )
    expect(loggingModule).toContain(
      '$displayText = ConvertTo-AzureDevPiiSafeText -Value $text',
    )
    expect(bootstrapModule).toContain(
      'AZURE_DEV_GIT_USER_NAME=$gitUserNameLiteral',
    )
    expect(bootstrapModule).toContain(
      'AZURE_DEV_GIT_USER_EMAIL=$gitUserEmailLiteral',
    )
    expect(bootstrapModule).toContain(
      'AZURE_DEV_GIT_SSH_SIGNING_PUBLIC_KEY=$gitSshSigningPublicKeyLiteral',
    )
    expect(hostBootstrap).toContain('configure_git_identity')
    expect(hostBootstrap).toContain(
      'git config --global user.name "${GIT_USER_NAME}"',
    )
    expect(hostBootstrap).toContain(
      'git config --global user.email "${GIT_USER_EMAIL}"',
    )
    expect(hostBootstrap).toContain('git config --global gpg.format ssh')
    expect(hostBootstrap).toContain(
      'git config --global user.signingkey "key::${GIT_SSH_SIGNING_PUBLIC_KEY}"',
    )
    expect(hostBootstrap).toContain('git config --global commit.gpgsign true')
    expect(hostBootstrap).toContain(
      'git config --global --unset-all gpg.ssh.program',
    )
    expect(validationModule).toContain('git config --global --get user.name')
    expect(validationModule).toContain('git config --global --get user.email')
    expect(validationModule).toContain(
      'The configured Git signing key is not available from the forwarded SSH agent.',
    )
    expect(validationModule).toContain(
      'git -C "${signing_probe_dir}" commit-tree -S',
    )
  })

  it('classifies only allowlisted Bicep WhatIf false positives', () => {
    const azureModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Azure.psm1',
    )
    const developmentGuide = readWorkspaceFile(
      'docs/development/azure-vm-remote-ssh-development.md',
    )

    expect(azureModule).toContain('Get-AzureDevWhatIfClassification')
    expect(azureModule).toContain('Test-AzureDevKnownWhatIfNoise')
    expect(azureModule).toContain(
      "$PropertyChange.PropertyChangeType -ne 'Delete'",
    )
    expect(azureModule).toContain('properties.allowPort25Out')
    expect(azureModule).toContain('properties.ddosSettings')
    expect(azureModule).toContain('Unknown changes remain actionable.')
    expect(developmentGuide).toContain(
      'https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deploy-what-if',
    )
  })

  it('keeps Azure VM bootstrap secrets out of command arguments and tracked files', () => {
    const envExample = readWorkspaceFile('.env.azure.development.example')
    const configModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Config.psm1',
    )
    const bootstrapModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Bootstrap.psm1',
    )
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )

    expect(envExample).toContain('# KEYCLOAK_ADMIN_PASSWORD=')
    expect(envExample).toContain('# MSSQL_SA_PASSWORD=')
    expect(envExample).toContain('# AZURE_DEV_UBUNTU_PRO_TOKEN=')
    expect(configModule).toContain(
      'KeycloakAdminPassword = $values.KEYCLOAK_ADMIN_PASSWORD',
    )
    expect(configModule).toContain(
      'SqlServerSaPassword = $values.MSSQL_SA_PASSWORD',
    )
    expect(configModule).toContain(
      'UbuntuProToken = $values.AZURE_DEV_UBUNTU_PRO_TOKEN',
    )
    expect(bootstrapModule).toContain(
      'AZURE_DEV_SERVICE_ENV_SOURCE=$remoteServiceEnvironmentPath',
    )
    expect(bootstrapModule).toContain(
      'Test-AzureDevBootstrapSecrets -Config $Context.Config',
    )
    expect(bootstrapModule).toContain(
      'Remove-Item -LiteralPath $localPath -Recurse -Force -ErrorAction Stop',
    )
    expect(bootstrapModule).toContain(
      'Failed to remove local support-service environment files $stage.',
    )
    expect(bootstrapModule).toContain('$operationError = $_')
    expect(bootstrapModule).toContain('Write-Warning $cleanupMessage')
    expect(bootstrapModule).toContain("'ubuntu-pro-attach.yaml'")
    expect(bootstrapModule).not.toContain(
      'AZURE_DEV_UBUNTU_PRO_TOKEN=$($Context.Config.UbuntuProToken)',
    )
    expect(hostBootstrap).toContain(
      'pro attach --attach-config "${attach_config}"',
    )
    expect(hostBootstrap).toContain(
      '"${SERVICE_ENV_SOURCE_DIR}/ubuntu-pro-attach.yaml"',
    )
    expect(hostBootstrap).not.toContain('AZURE_DEV_UBUNTU_PRO_TOKEN')
    expect(hostBootstrap).not.toContain('MSSQL_SA_PASSWORD=YourStrong!Passw0rd')
    expect(hostBootstrap).not.toContain('KEYCLOAK_ADMIN_PASSWORD=admin')
  })

  it('installs the customizable Azure VM Zsh profile with a safe default', () => {
    const entryScript = readWorkspaceFile('scripts/azure-dev.ps1')
    const gitignore = readWorkspaceFile('.gitignore')
    const bootstrapModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Bootstrap.psm1',
    )
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const zshExample = readWorkspaceFile(
      'scripts/azure-dev/templates/zshrc.template.example',
    )
    const validationModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Validation.psm1',
    )

    expect(gitignore).toContain('/scripts/azure-dev/templates/zshrc.template')
    expect(bootstrapModule).toContain(
      "$customPath = Join-Path $templatesPath 'zshrc.template'",
    )
    expect(bootstrapModule).toContain(
      "$examplePath = Join-Path $templatesPath 'zshrc.template.example'",
    )
    expect(bootstrapModule).toContain('AZURE_DEV_ZSHRC_SOURCE=$remoteZshrcPath')
    expect(hostBootstrap).toContain('custom/themes/powerlevel10k')
    expect(hostBootstrap).toContain('"${ZSHRC_SOURCE}"')
    expect(hostBootstrap).toContain('"${VSCODE_HOME}/.zshrc"')
    expect(zshExample).toContain('ZSH_THEME="powerlevel10k/powerlevel10k"')
    expect(zshExample).toContain('POWERLEVEL9K_MODE=nerdfont-v3')
    expect(zshExample).toContain('POWERLEVEL9K_TRANSIENT_PROMPT=always')
    expect(zshExample).toContain('zsh-autosuggestions')
    expect(zshExample).toContain('zsh-syntax-highlighting')
    expect(zshExample).not.toContain('OP_SERVICE_ACCOUNT_TOKEN')
    expect(zshExample).not.toContain('/Users/')
    expect(entryScript).toContain('Assert-AzureDevTerminalFontInstalled')
    expect(entryScript).toContain('p10k configure to customize the prompt.')
    expect(validationModule).toContain(
      "$script:AzureDevTerminalFontFamily = 'MesloLGS Nerd Font Mono'",
    )
    expect(validationModule).toContain(
      'Powerlevel10k is rendered by the local terminal, not by the Azure VM.',
    )
    expect(validationModule).toContain(
      'brew install --cask font-meslo-lg-nerd-font',
    )
    expect(validationModule).toContain(
      'You must configure VS Code terminal.integrated.fontFamily as',
    )
  })

  it('installs and smoke-validates Lychee on the Azure VM', () => {
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const validationModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Validation.psm1',
    )

    expect(hostBootstrap).toContain('install_lychee()')
    expect(hostBootstrap).toContain('/usr/local/bin/lychee')
    expect(hostBootstrap).toContain('sha256sum --check --status')
    expect(validationModule).toContain('lychee --version >/dev/null 2>&1')
  })

  it('installs and smoke-validates btop on the Azure VM', () => {
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const validationModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Validation.psm1',
    )

    expect(hostBootstrap).toContain('    btop \\')
    expect(validationModule).toContain('btop --version >/dev/null 2>&1')
  })

  it('provisions writable standard directories for the remote user', () => {
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const validationModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Validation.psm1',
    )

    expect(hostBootstrap).toContain(
      'install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0750',
    )
    expect(hostBootstrap).toContain(
      'install -d -o "${VSCODE_USER}" -g "${VSCODE_USER}" -m 0700',
    )
    for (const directory of [
      '${VSCODE_HOME}/.cache',
      '${VSCODE_HOME}/.config',
      '${VSCODE_HOME}/.local/share',
      '${VSCODE_HOME}/.local/state',
    ]) {
      expect(hostBootstrap).toContain(`"${directory}"`)
    }
    expect(validationModule).toContain(
      'mktemp "${user_directory}/.krav-write-probe.XXXXXX"',
    )
    expect(validationModule).toContain(
      "printf 'User directory is not writable: %s\\n'",
    )
  })

  it('installs and smoke-validates both AI command-line tools', () => {
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const validationModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Validation.psm1',
    )

    expect(hostBootstrap).toContain('install_ai_tools()')
    expect(hostBootstrap).not.toContain('https://chatgpt.com/codex/install.sh')
    expect(hostBootstrap).toContain('CODEX_INSTALL_HOME="/usr/local/lib/codex"')
    expect(hostBootstrap).not.toMatch(/^CODEX_VERSION=/mu)
    expect(hostBootstrap).not.toMatch(/^COPILOT_VERSION=/mu)
    expect(hostBootstrap).not.toMatch(
      /releases\/download\/rust-v\d[^"'\s]*\/install\.sh/u,
    )
    expect(hostBootstrap).not.toMatch(/@github\/copilot@\d/u)
    expect(hostBootstrap).toContain(
      'https://api.github.com/repos/openai/codex/releases/latest',
    )
    expect(hostBootstrap).toContain(
      '"https://github.com/openai/codex/releases/download/${codex_release_tag}/install.sh"',
    )
    expect(hostBootstrap).toContain('.name == "install.sh"')
    expect(hostBootstrap).toContain('select(startswith("sha256:"))')
    expect(hostBootstrap).toContain('sha256sum --check --status')
    expect(hostBootstrap).toContain('CODEX_INSTALL_DIR=/usr/local/bin')
    expect(hostBootstrap).toContain('CODEX_NON_INTERACTIVE=1')
    expect(hostBootstrap).toContain('CODEX_RELEASE="${codex_version}"')
    expect(hostBootstrap).toContain(
      'npm install --global @github/copilot@latest',
    )
    expect(hostBootstrap).toContain('COPILOT_AUTO_UPDATE=false')
    expect(validationModule).toContain('codex --version >/dev/null 2>&1')
    expect(validationModule).toContain('copilot --version >/dev/null 2>&1')
  })

  it('provisions a working Codex sandbox and profile on the Azure VM', () => {
    const bootstrapModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Bootstrap.psm1',
    )
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const codexConfig = readWorkspaceFile(
      'scripts/azure-dev/templates/codex-config.toml',
    )
    const validationModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Validation.psm1',
    )
    const developmentGuide = readWorkspaceFile(
      'docs/development/azure-vm-remote-ssh-development.md',
    )

    expect(hostBootstrap).toContain('apparmor-profiles')
    expect(hostBootstrap).toContain('apparmor-utils')
    expect(hostBootstrap).toContain('bubblewrap')
    expect(hostBootstrap).toContain('configure_codex_sandbox')
    expect(hostBootstrap).toContain('bwrap-userns-restrict')
    expect(hostBootstrap).toContain('merge-codex-config.py')
    expect(bootstrapModule).toContain('Copy-AzureDevCodexConfigFiles')
    expect(bootstrapModule).toContain('AZURE_DEV_CODEX_CONFIG_SOURCE')
    expect(bootstrapModule).toContain('AZURE_DEV_CODEX_CONFIG_MERGER')
    expect(codexConfig).toContain(
      'default_permissions = "kravhantering-azure-dev"',
    )
    expect(codexConfig).toContain(
      '[permissions.kravhantering-azure-dev.filesystem.":workspace_roots"]',
    )
    expect(codexConfig).toContain('".git" = "write"')
    expect(codexConfig).toContain('"127.0.0.1" = "allow"')
    expect(validationModule).toContain('/usr/bin/bwrap')
    expect(validationModule).toContain(
      "config['default_permissions'] == 'kravhantering-azure-dev'",
    )
    expect(validationModule).toContain(
      "profile['filesystem'][':workspace_roots']",
    )
    expect(developmentGuide).toContain(
      '### Codex and GitHub Copilot CLIs in Remote SSH',
    )
    expect(developmentGuide).toContain('preserves existing personal settings')
  })

  it('prints a regular SSH command after Azure VM setup', () => {
    const entryScript = readWorkspaceFile('scripts/azure-dev.ps1')
    const developmentGuide = readWorkspaceFile(
      'docs/development/azure-vm-remote-ssh-development.md',
    )

    expect(entryScript).toContain(
      '$identityFile = $Context.Config.SshPrivateKeyPath',
    )
    expect(entryScript).toContain(
      '"ssh -i `"$identityFile`" -o IdentitiesOnly=yes " +',
    )
    expect(entryScript).toContain(
      '"-o SendEnv=GH_TOKEN -o SendEnv=COPILOT_GITHUB_TOKEN vscode@$hostName"',
    )
    expect(entryScript).not.toContain('Write-Host "SSH target:')
    const standardSshHeading = entryScript.indexOf(
      "Write-Host 'For administration tasks, connect using standard SSH:'",
    )
    const developmentEnvironmentHeading = entryScript.indexOf(
      "Write-Host 'Use this to start a development environment:'",
    )
    const extensionsHeading = entryScript.indexOf(
      "Write-Host 'VS Code extensions: choose one installation option:'",
    )
    expect(standardSshHeading).toBeGreaterThan(-1)
    expect(developmentEnvironmentHeading).toBeGreaterThan(standardSshHeading)
    expect(extensionsHeading).toBeGreaterThan(developmentEnvironmentHeading)
    expect(developmentGuide).toContain(
      '-o SendEnv=GH_TOKEN -o SendEnv=COPILOT_GITHUB_TOKEN',
    )
  })

  it('enables SSH agent forwarding in the managed host block', () => {
    const sshModule = readWorkspaceFile('scripts/azure-dev/AzureDev.Ssh.psm1')

    expect(sshModule).toContain("'    ForwardAgent yes'")
  })

  it('forwards separate GitHub tokens without persisting or exposing them', () => {
    const entryScript = readWorkspaceFile('scripts/azure-dev.ps1')
    const sshModule = readWorkspaceFile('scripts/azure-dev/AzureDev.Ssh.psm1')
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const validationModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Validation.psm1',
    )
    const developmentGuide = readWorkspaceFile(
      'docs/development/azure-vm-remote-ssh-development.md',
    )
    const internalsGuide = readWorkspaceFile(
      'docs/development/azure-vm-remote-ssh-internals.md',
    )
    const devcontainerGuide = readWorkspaceFile(
      'docs/development/devcontainer-developer-workflow.md',
    )
    const normalizedDevelopmentGuide = developmentGuide.replaceAll(/\s+/gu, ' ')
    const normalizedInternalsGuide = internalsGuide.replaceAll(/\s+/gu, ' ')
    const normalizedDevcontainerGuide = devcontainerGuide.replaceAll(
      /\s+/gu,
      ' ',
    )

    expect(sshModule).toContain("'    SendEnv GH_TOKEN'")
    expect(sshModule).toContain("'    SendEnv COPILOT_GITHUB_TOKEN'")
    expect(hostBootstrap).toContain("'AcceptEnv GH_TOKEN COPILOT_GITHUB_TOKEN'")
    expect(hostBootstrap).toContain('01-kravhantering-environment.conf')
    expect(validationModule).toContain('01-kravhantering-environment.conf')
    const safeGhTokenAcceptEnvCheck =
      "grep -E '^acceptenv (.* )?GH_TOKEN( |$)' >/dev/null"
    const safeCopilotTokenAcceptEnvCheck =
      "grep -E '^acceptenv (.* )?COPILOT_GITHUB_TOKEN( |$)' >/dev/null"
    expect(hostBootstrap).toContain(safeGhTokenAcceptEnvCheck)
    expect(hostBootstrap).toContain(safeCopilotTokenAcceptEnvCheck)
    expect(validationModule).toContain(safeGhTokenAcceptEnvCheck)
    expect(validationModule).toContain(safeCopilotTokenAcceptEnvCheck)
    expect(hostBootstrap).not.toContain("grep -Eq '^acceptenv")
    expect(validationModule).not.toContain("grep -Eq '^acceptenv")
    expect(entryScript).toContain(
      'GitHub authentication for the remote development environment:',
    )
    expect(entryScript).toContain('GH_TOKEN for Codex')
    expect(entryScript).toContain('COPILOT_GITHUB_TOKEN for GitHub Copilot CLI')
    expect(entryScript).toContain('For SAML SSO authorization instructions')
    expect(entryScript.replace(/'\s*\+\s*'/gu, '')).toContain(
      'Do not display the value of either token in terminal output or logs.',
    )
    expect(developmentGuide).toContain("workstation's secure credential store")
    expect(developmentGuide).toContain('GH_TOKEN` supplies the classic')
    expect(developmentGuide).toContain(
      '`COPILOT_GITHUB_TOKEN` supplies the personal-account fine-grained token',
    )
    expect(developmentGuide).toContain(
      '`AcceptEnv GH_TOKEN COPILOT_GITHUB_TOKEN`',
    )
    expect(normalizedDevelopmentGuide).toContain(
      "destination `vscode` user's Remote SSH process tree",
    )
    expect(normalizedDevelopmentGuide).toContain(
      'trusted VMs and workspaces, and use short-lived, least-privilege tokens',
    )
    expect(developmentGuide).toContain('SAML SSO')
    expect(internalsGuide).toContain('never written to the managed block')
    expect(normalizedInternalsGuide).toContain(
      "destination `vscode` user's Remote SSH process tree",
    )
    expect(devcontainerGuide).toContain(
      '`COPILOT_GITHUB_TOKEN` supplies the fine-grained personal access token',
    )
    expect(normalizedDevcontainerGuide).toContain(
      'including workspace tasks and remote extensions',
    )
    expect(normalizedDevcontainerGuide).toContain(
      'trusted devcontainers, workspaces, tasks, and extensions',
    )

    for (const relativePath of [
      '.devcontainer/devcontainer.json',
      '.devcontainer/elevated/devcontainer.json',
    ]) {
      const devcontainer = readWorkspaceFile(relativePath)
      expect(devcontainer).toContain(
        '"COPILOT_GITHUB_TOKEN": "${localEnv:COPILOT_GITHUB_TOKEN}"',
      )
      expect(devcontainer).toContain('"GH_TOKEN": "${localEnv:GH_TOKEN}"')
    }

    const powerShellTokenOutputs = [
      /^(?=[^\r\n]*\$(?:(?:env:)?GH_TOKEN\b|\{(?:env:)?GH_TOKEN\}))[^\r\n]*\b(?:Write-(?:Debug|Error|Host|Information|Output|Verbose|Warning)|Out-(?:Default|File|Host|String)|Tee-Object|echo)\b/imu,
      /^(?=[^\r\n]*\$(?:(?:env:)?COPILOT_GITHUB_TOKEN\b|\{(?:env:)?COPILOT_GITHUB_TOKEN\}))[^\r\n]*\b(?:Write-(?:Debug|Error|Host|Information|Output|Verbose|Warning)|Out-(?:Default|File|Host|String)|Tee-Object|echo)\b/imu,
    ]
    const shellTokenOutputs = [
      /^(?=[^\r\n]*\$(?:GH_TOKEN\b|\{GH_TOKEN\b))[^\r\n]*\b(?:echo|log|logger|printf)\b/imu,
      /^(?=[^\r\n]*\$(?:COPILOT_GITHUB_TOKEN\b|\{COPILOT_GITHUB_TOKEN\b))[^\r\n]*\b(?:echo|log|logger|printf)\b/imu,
    ]
    const shellPrintEnvTokens = [
      /\bprintenv(?:\s+--)?\s+GH_TOKEN\b/iu,
      /\bprintenv(?:\s+--)?\s+COPILOT_GITHUB_TOKEN\b/iu,
    ]

    for (const pattern of powerShellTokenOutputs) {
      expect(withoutSingleQuotedLiterals(entryScript)).not.toMatch(pattern)
      expect(withoutSingleQuotedLiterals(sshModule)).not.toMatch(pattern)
    }
    for (const pattern of [...shellTokenOutputs, ...shellPrintEnvTokens]) {
      expect(withoutSingleQuotedLiterals(hostBootstrap)).not.toMatch(pattern)
    }
  })

  it('offers explicit VS Code Remote SSH extension installation choices', () => {
    const entryScript = readWorkspaceFile('scripts/azure-dev.ps1')
    const extensions = readWorkspaceFile('.vscode/extensions.json')
    const developmentGuide = readWorkspaceFile(
      'docs/development/azure-vm-remote-ssh-development.md',
    )

    expect(extensions).toContain('"recommendations"')
    expect(entryScript).toContain(
      'VS Code extensions: choose one installation option:',
    )
    expect(entryScript).toContain('remote.SSH.defaultExtensions')
    expect(entryScript).toContain('in repository file:')
    expect(entryScript).toContain("Write-Host '     .vscode/extensions.json'")
    expect(entryScript).toContain(
      'Extensions: Install Workspace Recommended Extensions',
    )
    expect(developmentGuide).toContain('always-installed Remote SSH extensions')
    expect(developmentGuide.replaceAll(/\s+/g, ' ')).toContain(
      'does not change the application-wide VS Code setting',
    )
  })

  it('blocks direct root SSH and validates the effective policy', () => {
    const hostBootstrap = readWorkspaceFile(
      'scripts/azure-dev/templates/bootstrap-host.sh',
    )
    const validationModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Validation.psm1',
    )
    const internalsGuide = readWorkspaceFile(
      'docs/development/azure-vm-remote-ssh-internals.md',
    )

    expect(hostBootstrap).toContain('PermitRootLogin no')
    expect(hostBootstrap).toContain('/usr/sbin/sshd -t')
    expect(hostBootstrap).toContain(
      '-C user=root,host=localhost,addr=127.0.0.1',
    )
    expect(hostBootstrap).toContain('systemctl reload ssh.service')
    expect(validationModule).toContain(
      '-C user=root,host=localhost,addr=127.0.0.1',
    )
    expect(validationModule).toContain('test "${root_login_policy}" = "no"')
    const sshHardeningValidation = validationModule.slice(
      validationModule.indexOf(
        'sudo -n test -f /etc/ssh/sshd_config.d/00-kravhantering-root-login.conf',
      ),
      validationModule.indexOf('findmnt /mnt/krav-azure-dev-data'),
    )
    expect(sshHardeningValidation).toContain('dump_smoke_diagnostics')
    expect(sshHardeningValidation).toContain('exit 1')
    expect(hostBootstrap).not.toContain(
      'awk \'$1 == "permitrootlogin" { print $2; exit }\'',
    )
    expect(validationModule).not.toContain(
      'awk \'$1 == "permitrootlogin" { print $2; exit }\'',
    )

    const configureSshAccess = hostBootstrap.slice(
      hostBootstrap.indexOf('configure_ssh_access()'),
      hostBootstrap.indexOf('\nconfigure_repositories()'),
    )
    const configWriteIndex = configureSshAccess.indexOf("'PermitRootLogin no'")
    const syntaxValidationIndex =
      configureSshAccess.indexOf('/usr/sbin/sshd -t')
    const reloadIndex = configureSshAccess.indexOf(
      'systemctl reload ssh.service',
    )
    const effectiveValidationIndex = configureSshAccess.indexOf(
      'root_login_policy="$(',
    )

    expect(configWriteIndex).toBeGreaterThanOrEqual(0)
    expect(syntaxValidationIndex).toBeGreaterThan(configWriteIndex)
    expect(reloadIndex).toBeGreaterThan(syntaxValidationIndex)
    expect(effectiveValidationIndex).toBeGreaterThan(reloadIndex)
    expect(internalsGuide).toContain('PermitRootLogin no')
  })

  it('includes the SSH exit code when a remote command fails', () => {
    const bootstrapModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Bootstrap.psm1',
    )

    expect(bootstrapModule).toContain(
      'Remote command failed with exit code $($result.ExitCode)',
    )
  })

  it('quotes remote shell paths without passing literal quotes to scp', () => {
    const bootstrapModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Bootstrap.psm1',
    )

    expect(bootstrapModule).toContain('function ConvertTo-AzureDevShellLiteral')
    expect(bootstrapModule).toContain(
      'rm -rf -- $remotePathLiteral && mkdir -p -- $remotePathLiteral',
    )
    expect(bootstrapModule).toContain('mkdir -p -- $remoteDirectoryLiteral')
    expect(bootstrapModule).toContain(
      'rm -f -- $sqlServerRemotePathLiteral $keycloakRemotePathLiteral',
    )
    expect(bootstrapModule).toContain("$RemotePath.StartsWith('/')")
    expect(bootstrapModule).toContain(
      "$remoteDirectory = if ($lastSlash -eq 0) { '/' }",
    )
    expect(bootstrapModule).toContain(
      '"$($Context.Config.SshHostAlias):$RemotePath/"',
    )
    expect(bootstrapModule).toContain(
      '"$($Context.Config.SshHostAlias):$RemotePath"',
    )
    expect(bootstrapModule).not.toContain(
      '"$($Context.Config.SshHostAlias):$remoteUploadPathLiteral"',
    )
    expect(bootstrapModule).not.toContain(
      '"$($Context.Config.SshHostAlias):$remotePathLiteral"',
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
      'HSA_PERSON_LOOKUP_URL=http://kong:8000/hsa/person-records/lookup',
    )
  })

  it('documents the HSA lookup settings in the local env example', () => {
    const envExample = readWorkspaceFile('.env.example')

    expectEnvVars(envExample, hsaPersonLookupEnvVars)
  })

  it('ships HSA lookup settings in prod-like and release app envs', () => {
    const prodlikeEnv = readWorkspaceFile('.env.prodlike')
    const releaseAppEnv = readWorkspaceFile(
      'containers/production/env/app.env.template',
    )
    const containerAppExampleEnv = readWorkspaceFile(
      'containers/app/.env.app.example',
    )

    expect(prodlikeEnv).toContain('HSA_PERSON_LOOKUP_TIMEOUT_MS=5000')
    expect(prodlikeEnv).toContain(
      'HSA_PERSON_LOOKUP_URL=http://kong:8000/hsa/person-records/lookup',
    )
    expect(releaseAppEnv).toContain('HSA_PERSON_LOOKUP_TIMEOUT_MS=5000')
    expect(releaseAppEnv).toContain(
      'HSA_PERSON_LOOKUP_URL=https://kong.example.internal/hsa/person-records/lookup',
    )
    expect(containerAppExampleEnv).toContain(
      'HSA_PERSON_LOOKUP_TIMEOUT_MS=5000',
    )
    expect(containerAppExampleEnv).toContain(
      'HSA_PERSON_LOOKUP_URL=https://kong.example.internal/hsa/person-records/lookup',
    )

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
