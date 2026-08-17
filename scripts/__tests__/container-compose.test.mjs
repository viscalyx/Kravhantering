import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  buildComposeValues,
  DEFAULT_INTERNAL_NETWORK_NAME,
  DEFAULT_TEMPLATE_PATH,
  generateCompose,
  imageReference,
  main,
  parseArgs,
  renderTemplate,
} from '../containers/generate-compose.mjs'

function service(name, role, image, tag, manifestDigest, imageId) {
  return {
    name,
    role,
    image,
    tag,
    manifestDigest,
    imageId,
    source: `https://example.test/${name}`,
  }
}

function stackLock() {
  return {
    schemaVersion: 2,
    releaseVersion: '0.1.0-test',
    commitSha: 'deadbeef',
    generatedAt: '2026-05-22T10:00:00.000Z',
    generatedBy: 'scripts/containers/generate-stack-lock.mjs',
    services: [
      service(
        'app-runtime',
        'application',
        'localhost/kravhantering/app-runtime',
        'pr-12-99-deadbeef',
        'sha256:app-manifest',
        'sha256:app-image',
      ),
      service(
        'db-job',
        'database-job',
        'localhost/kravhantering/db-job',
        'pr-12-99-deadbeef',
        'sha256:dbjob-manifest',
        'sha256:dbjob-image',
      ),
      service(
        'nginx',
        'tls-proxy',
        'docker.io/library/nginx',
        '1.31.3-alpine',
        'sha256:nginx-manifest',
        'sha256:nginx-image',
      ),
      service(
        'sqlserver',
        'database',
        'mcr.microsoft.com/mssql/server',
        '2025-CU7-ubuntu-24.04',
        'sha256:sqlserver-manifest',
        'sha256:sqlserver-image',
      ),
      service(
        'keycloak',
        'identity-provider',
        'quay.io/keycloak/keycloak',
        '26.7.1-0',
        'sha256:keycloak-manifest',
        'sha256:keycloak-image',
      ),
    ],
  }
}

describe('local test Compose generation', () => {
  it('uses local tags for project images and manifest digests for vendors', () => {
    const values = buildComposeValues(stackLock())

    expect(values.appRuntimeImage).toBe(
      'localhost/kravhantering/app-runtime:pr-12-99-deadbeef',
    )
    expect(values.dbJobImage).toBe(
      'localhost/kravhantering/db-job:pr-12-99-deadbeef',
    )
    expect(values.demoSeedImage).toBe(
      'localhost/kravhantering/db-job:pr-12-99-deadbeef',
    )
    expect(values.nginxImage).toBe(
      'docker.io/library/nginx@sha256:nginx-manifest',
    )
    expect(values.sqlServerImage).toBe(
      'mcr.microsoft.com/mssql/server@sha256:sqlserver-manifest',
    )
    expect(values.keycloakImage).toBe(
      'quay.io/keycloak/keycloak@sha256:keycloak-manifest',
    )
    expect(values.networkName).toBe(DEFAULT_INTERNAL_NETWORK_NAME)
  })

  it('renders the source-controlled template without leaking env values', () => {
    const template = fs.readFileSync(
      path.join(process.cwd(), DEFAULT_TEMPLATE_PATH),
      'utf8',
    )
    const compose = generateCompose(template, stackLock(), {
      mode: 'test',
      projectName: 'kravhantering-test-run',
      sqlServerHostPort: '127.0.0.1:15433',
      sqlServerVolumeName: 'kravhantering-test-sqlserver-data',
      tlsDir: './tmp/test-tls',
    })

    expect(compose).toContain('name: "kravhantering-test-run"')
    expect(compose).toContain(
      'image: "localhost/kravhantering/app-runtime:pr-12-99-deadbeef"',
    )
    expect(compose).toContain(
      'image: "localhost/kravhantering/db-job:pr-12-99-deadbeef"',
    )
    expect(compose).toContain(
      'image: "docker.io/library/nginx@sha256:nginx-manifest"',
    )
    expect(compose).toContain('- ./containers/app/.env.app.local')
    expect(compose).toContain('- ./containers/sqlserver/.env.sqlserver.local')
    expect(compose).toContain('"127.0.0.1:15433:1433"')
    expect(compose).toContain('./tmp/test-tls/ca.crt')
    expect(compose).toContain(
      './containers/production/nginx/templates/api-docs-security-headers.conf:/etc/nginx/snippets/api-docs-security-headers.conf:ro',
    )
    expect(compose).toContain(
      './public/api-docs:/usr/share/nginx/html/api-docs:ro',
    )
    expect(compose).toContain('name: "kravhantering-internal"')
    expect(compose).toContain('name: "kravhantering-test-sqlserver-data"')
    expect(compose).toContain('db-bootstrap:')
    expect(compose).toContain('command: ["bootstrap"]')
    expect(compose).not.toContain('./typeorm/seed.mjs')
    expect(compose).not.toContain('{{')
    expect(compose).not.toContain('AUTH_SESSION_COOKIE_PASSWORD=')
    expect(compose).not.toContain('MSSQL_SA_PASSWORD=')
  })

  it('allows the generated internal network name to be overridden', () => {
    const template = fs.readFileSync(
      path.join(process.cwd(), DEFAULT_TEMPLATE_PATH),
      'utf8',
    )
    const compose = generateCompose(template, stackLock(), {
      mode: 'test',
      networkName: 'kravhantering-custom-internal',
    })

    expect(compose).toContain('name: "kravhantering-custom-internal"')
  })

  it('rejects unknown modes, options and placeholders', () => {
    expect(() =>
      generateCompose('{{appRuntimeImage}}', stackLock(), { mode: 'unknown' }),
    ).toThrow('Unsupported Compose generation mode')
    expect(() => parseArgs(['--demo-seed-image', 'ignored'])).toThrow(
      'Unsupported Compose option: --demo-seed-image',
    )
    expect(() => parseArgs(['mode', 'test'])).toThrow('Unexpected argument')
    expect(() => parseArgs(['--mode'])).toThrow('Missing value for --mode')
    expect(() =>
      imageReference({ image: 'registry.example/other', name: 'other' }),
    ).toThrow('Unsupported service in Compose generation')
    expect(() => renderTemplate('{{missing}}', {})).toThrow('has no value')
    expect(() => renderTemplate('{{value}}', { value: '{{nested}}' })).toThrow(
      'Template has unresolved placeholders',
    )
  })

  it('writes a generated Compose file through the CLI seam', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-cli-'))
    const lockFile = path.join(root, 'lock.json')
    const templateFile = path.join(root, 'template.yml')
    const outputFile = path.join(root, 'generated', 'compose.yml')
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    try {
      fs.writeFileSync(lockFile, JSON.stringify(stackLock()))
      fs.writeFileSync(
        templateFile,
        [
          '{{appRuntimeImage}}',
          '{{networkName}}',
          '{{projectName}}',
          '{{sqlServerHostPort}}',
          '{{sqlServerVolumeName}}',
          '{{tlsDir}}',
        ].join('\n'),
      )

      await expect(
        main(
          [
            '--lock-file',
            lockFile,
            '--mode',
            'test',
            '--network-name',
            'custom-network',
            '--output',
            outputFile,
            '--project-name',
            'custom-project',
            '--sqlserver-host-port',
            '127.0.0.1:15433',
            '--sqlserver-volume-name',
            'custom-volume',
            '--template',
            templateFile,
            '--tls-dir',
            './custom-tls',
          ],
          { consoleObj, cwd: root },
        ),
      ).resolves.toBe(0)
      expect(fs.readFileSync(outputFile, 'utf8')).toContain(
        [
          'localhost/kravhantering/app-runtime:pr-12-99-deadbeef',
          'custom-network',
          'custom-project',
          '127.0.0.1:15433',
          'custom-volume',
          './custom-tls',
        ].join('\n'),
      )
      expect(consoleObj.log).toHaveBeenCalledWith('Wrote generated/compose.yml')
      expect(consoleObj.error).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(root, { force: true, recursive: true })
    }
  })

  it('reports CLI validation errors with usage', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }

    await expect(
      main(['--demo-seed-image', 'ignored'], { consoleObj }),
    ).resolves.toBe(1)
    expect(consoleObj.error).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported Compose option'),
    )
    expect(consoleObj.error).toHaveBeenCalledWith(
      expect.stringContaining('Usage:'),
    )

    const readFailureConsole = { error: vi.fn(), log: vi.fn() }
    await expect(
      main([], {
        consoleObj: readFailureConsole,
        fsImpl: {
          readFileSync: () => {
            throw 'lock read failed'
          },
        },
      }),
    ).resolves.toBe(1)
    expect(readFailureConsole.error).toHaveBeenCalledWith('lock read failed')
  })
})
