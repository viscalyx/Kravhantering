import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readWorkspaceFile(path: string) {
  return readFileSync(path, 'utf8')
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
    expect(azureModule).toContain('return $existingImage')
    expect(azureModule).toContain(
      'return Get-AzureDevUbuntuImage -Config $Config',
    )
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

  it('keeps Azure VM support-service passwords in untracked configuration', () => {
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
    expect(configModule).toContain(
      'KeycloakAdminPassword = $values.KEYCLOAK_ADMIN_PASSWORD',
    )
    expect(configModule).toContain(
      'SqlServerSaPassword = $values.MSSQL_SA_PASSWORD',
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

    expect(gitignore).toContain(
      '/scripts/azure-dev/templates/zshrc.template',
    )
    expect(bootstrapModule).toContain(
      "$customPath = Join-Path $templatesPath 'zshrc.template'",
    )
    expect(bootstrapModule).toContain(
      "$examplePath = Join-Path $templatesPath 'zshrc.template.example'",
    )
    expect(bootstrapModule).toContain(
      'AZURE_DEV_ZSHRC_SOURCE=$remoteZshrcPath',
    )
    expect(hostBootstrap).toContain('custom/themes/powerlevel10k')
    expect(hostBootstrap).toContain('"${ZSHRC_SOURCE}"')
    expect(hostBootstrap).toContain('"${VSCODE_HOME}/.zshrc"')
    expect(zshExample).toContain(
      'ZSH_THEME="powerlevel10k/powerlevel10k"',
    )
    expect(zshExample).toContain('POWERLEVEL9K_MODE=nerdfont-v3')
    expect(zshExample).toContain('POWERLEVEL9K_TRANSIENT_PROMPT=always')
    expect(zshExample).toContain('zsh-autosuggestions')
    expect(zshExample).toContain('zsh-syntax-highlighting')
    expect(zshExample).not.toContain('OP_SERVICE_ACCOUNT_TOKEN')
    expect(zshExample).not.toContain('/Users/')
    expect(entryScript).toContain('Assert-AzureDevTerminalFontInstalled')
    expect(entryScript).toContain(
      'p10k configure to customize the prompt.',
    )
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

  it('prints a regular SSH command after Azure VM setup', () => {
    const entryScript = readWorkspaceFile('scripts/azure-dev.ps1')
    const developmentGuide = readWorkspaceFile(
      'docs/development/azure-vm-remote-ssh-development.md',
    )

    expect(entryScript).toContain(
      '$identityFile = $Context.Config.SshPrivateKeyPath',
    )
    expect(entryScript).toContain(
      'Write-Host "ssh -i `"$identityFile`" -o IdentitiesOnly=yes ' +
        'vscode@$hostName"',
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
      'ssh -i "<private-key-path>" -o IdentitiesOnly=yes',
    )
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
    expect(developmentGuide).toContain(
      'always-installed Remote SSH extensions',
    )
    expect(developmentGuide).toContain(
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
    expect(validationModule).toContain(
      'test "${root_login_policy}" = "no"',
    )
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
    const configWriteIndex = configureSshAccess.indexOf(
      "'PermitRootLogin no'",
    )
    const syntaxValidationIndex = configureSshAccess.indexOf(
      '/usr/sbin/sshd -t',
    )
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

  it('quotes Azure bootstrap upload paths as remote shell literals', () => {
    const bootstrapModule = readWorkspaceFile(
      'scripts/azure-dev/AzureDev.Bootstrap.psm1',
    )

    expect(bootstrapModule).toContain(
      'function ConvertTo-AzureDevShellLiteral',
    )
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
