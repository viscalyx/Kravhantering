import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildComposeValues,
  DEFAULT_INTERNAL_NETWORK_NAME,
  DEFAULT_TEMPLATE_PATH,
  generateCompose,
  imageReference,
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
        '1.31.1-alpine',
        'sha256:nginx-manifest',
        'sha256:nginx-image',
      ),
      service(
        'sqlserver',
        'database',
        'mcr.microsoft.com/mssql/server',
        '2025-latest',
        'sha256:sqlserver-manifest',
        'sha256:sqlserver-image',
      ),
      service(
        'keycloak',
        'identity-provider',
        'quay.io/keycloak/keycloak',
        '26.6.2-2',
        'sha256:keycloak-manifest',
        'sha256:keycloak-image',
      ),
    ],
  }
}

describe('container Compose generation', () => {
  it('uses local tags for project images in PR mode and manifest digests for vendors', () => {
    const values = buildComposeValues(stackLock(), { mode: 'pr' })

    expect(values.appRuntimeImage).toBe(
      'localhost/kravhantering/app-runtime:pr-12-99-deadbeef',
    )
    expect(values.dbJobImage).toBe(
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

  it('uses manifest digest references for project images in release mode', () => {
    const values = buildComposeValues(stackLock(), { mode: 'release' })

    expect(values.appRuntimeImage).toBe(
      'localhost/kravhantering/app-runtime@sha256:app-manifest',
    )
    expect(values.dbJobImage).toBe(
      'localhost/kravhantering/db-job@sha256:dbjob-manifest',
    )
  })

  it('renders the source-controlled template without leaking env values', () => {
    const template = fs.readFileSync(
      path.join(process.cwd(), DEFAULT_TEMPLATE_PATH),
      'utf8',
    )
    const compose = generateCompose(template, stackLock(), {
      mode: 'release',
      projectName: 'kravhantering-test-run',
      sqlServerHostPort: '127.0.0.1:15433',
      sqlServerVolumeName: 'kravhantering-test-sqlserver-data',
      tlsDir: './tmp/test-tls',
    })

    expect(compose).toContain('name: "kravhantering-test-run"')
    expect(compose).toContain(
      'image: "localhost/kravhantering/app-runtime@sha256:app-manifest"',
    )
    expect(compose).toContain(
      'image: "localhost/kravhantering/db-job@sha256:dbjob-manifest"',
    )
    expect(compose).toContain(
      'image: "docker.io/library/nginx@sha256:nginx-manifest"',
    )
    expect(compose).toContain('- ./containers/app/.env.app.local')
    expect(compose).toContain('- ./containers/sqlserver/.env.sqlserver.local')
    expect(compose).toContain('"127.0.0.1:15433:1433"')
    expect(compose).toContain('./tmp/test-tls/ca.crt')
    expect(compose).toContain('name: "kravhantering-internal"')
    expect(compose).toContain('name: "kravhantering-test-sqlserver-data"')
    expect(compose).toContain('db-bootstrap:')
    expect(compose).toContain('command: ["bootstrap"]')
    expect(compose).toContain(
      './typeorm/seed.mjs:/workspace/typeorm/seed.mjs:ro',
    )
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
      mode: 'release',
      networkName: 'kravhantering-custom-internal',
    })

    expect(compose).toContain('name: "kravhantering-custom-internal"')
  })

  it('rejects unknown modes and placeholders', () => {
    expect(() => imageReference(stackLock().services[0], 'unknown')).toThrow(
      'Unsupported Compose generation mode',
    )
    expect(() => renderTemplate('{{missing}}', {})).toThrow('has no value')
  })
})
