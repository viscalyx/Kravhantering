// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Contract tests assert literal shell interpolation syntax.
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
