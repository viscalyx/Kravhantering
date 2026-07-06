import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertStackLockSchema,
  checkVendorLocks,
  createStackLockFromCliOptions,
  formatStackLockJson,
  main,
  readVendorLocks,
} from '../containers/generate-stack-lock.mjs'

const tempDirs = []

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function vendorLock(name, role, image, tag, manifestDigest, imageId) {
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

function projectService(name, role, manifestDigest, imageId) {
  return {
    name,
    role,
    image: `localhost/kravhantering/${name}`,
    tag: 'pr-1-run-deadbeef',
    manifestDigest,
    imageId,
    source: 'local-build',
  }
}

function validVendorLocks() {
  return [
    vendorLock(
      'nginx',
      'tls-proxy',
      'docker.io/library/nginx',
      '1.31.1-alpine',
      'sha256:nginx-manifest',
      'sha256:nginx-image',
    ),
    vendorLock(
      'sqlserver',
      'database',
      'mcr.microsoft.com/mssql/server',
      '2025-CU6-ubuntu-24.04',
      'sha256:sqlserver-manifest',
      'sha256:sqlserver-image',
    ),
    vendorLock(
      'keycloak',
      'identity-provider',
      'quay.io/keycloak/keycloak',
      '26.6.4-1',
      'sha256:keycloak-manifest',
      'sha256:keycloak-image',
    ),
  ]
}

function validStackLock(services = validVendorLocks()) {
  return {
    schemaVersion: 2,
    releaseVersion: '0.1.0-test',
    commitSha: 'deadbeef',
    generatedAt: '2026-05-22T10:00:00.000Z',
    generatedBy: 'scripts/containers/generate-stack-lock.mjs',
    services: [
      projectService(
        'app-runtime',
        'application',
        'sha256:app-runtime-manifest',
        'sha256:app-runtime-image',
      ),
      projectService(
        'db-job',
        'database-job',
        'sha256:db-job-manifest',
        'sha256:db-job-image',
      ),
      ...services,
    ],
  }
}

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-lock-'))
  tempDirs.push(dir)
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ version: '0.1.0' })}\n`,
  )
  writeJson(
    path.join(dir, 'containers/nginx/image.lock.json'),
    vendorLock(
      'nginx',
      'tls-proxy',
      'docker.io/library/nginx',
      '1.31.1-alpine',
      'sha256:nginx-manifest',
      'sha256:nginx-image',
    ),
  )
  writeJson(
    path.join(dir, 'containers/sqlserver/image.lock.json'),
    vendorLock(
      'sqlserver',
      'database',
      'mcr.microsoft.com/mssql/server',
      '2025-CU6-ubuntu-24.04',
      'sha256:sqlserver-manifest',
      'sha256:sqlserver-image',
    ),
  )
  writeJson(
    path.join(dir, 'containers/keycloak/image.lock.json'),
    vendorLock(
      'keycloak',
      'identity-provider',
      'quay.io/keycloak/keycloak',
      '26.6.4-1',
      'sha256:keycloak-manifest',
      'sha256:keycloak-image',
    ),
  )
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

describe('container stack lock generation', () => {
  it('copies vendor locks exactly and records project image metadata', () => {
    const cwd = makeProject()

    const stackLock = createStackLockFromCliOptions({
      cwd,
      env: {},
      cliOptions: {
        'app-runtime-image-id': 'sha256:app-image',
        'app-runtime-image': 'localhost/kravhantering/app-runtime',
        'app-runtime-manifest-digest': 'sha256:app-manifest',
        'app-runtime-tag': 'pr-1-run-deadbeef',
        'db-job-image-id': 'sha256:dbjob-image',
        'db-job-image': 'localhost/kravhantering/db-job',
        'db-job-manifest-digest': 'sha256:dbjob-manifest',
        'db-job-tag': 'pr-1-run-deadbeef',
        'generated-at': '2026-05-22T10:00:00.000Z',
        'release-version': '0.1.0-pr.1',
      },
      execFileSync: () => 'deadbeef\n',
    })

    expect(stackLock).toMatchObject({
      schemaVersion: 2,
      releaseVersion: '0.1.0-pr.1',
      commitSha: 'deadbeef',
      generatedAt: '2026-05-22T10:00:00.000Z',
      generatedBy: 'scripts/containers/generate-stack-lock.mjs',
    })
    expect(stackLock.services).toEqual([
      {
        name: 'app-runtime',
        role: 'application',
        image: 'localhost/kravhantering/app-runtime',
        tag: 'pr-1-run-deadbeef',
        manifestDigest: 'sha256:app-manifest',
        imageId: 'sha256:app-image',
        source: 'local-build',
      },
      {
        name: 'db-job',
        role: 'database-job',
        image: 'localhost/kravhantering/db-job',
        tag: 'pr-1-run-deadbeef',
        manifestDigest: 'sha256:dbjob-manifest',
        imageId: 'sha256:dbjob-image',
        source: 'local-build',
      },
      ...readVendorLocks({ cwd }),
    ])
    expect(stackLock).not.toHaveProperty('$schema')
    expect(assertStackLockSchema(stackLock)).toBe(true)
    expect(formatStackLockJson(stackLock)).toMatch(/\n$/u)
  })

  it('validates stack locks against the standalone JSON Schema', () => {
    expect(() =>
      assertStackLockSchema({ schemaVersion: 1, services: [] }),
    ).toThrow('must use schemaVersion 2')
    expect(() =>
      assertStackLockSchema({ ...validStackLock(), extra: true }),
    ).toThrow('must not include unknown field "extra"')
    expect(() =>
      assertStackLockSchema({
        ...validStackLock(),
        services: [
          {
            ...validStackLock().services[0],
            extra: true,
          },
          ...validStackLock().services.slice(1),
        ],
      }),
    ).toThrow('must not include unknown field "extra"')
    expect(() =>
      assertStackLockSchema({
        ...validStackLock(),
        services: [
          {
            ...validStackLock().services[0],
            manifestDigest: 'app-runtime-manifest',
          },
          ...validStackLock().services.slice(1),
        ],
      }),
    ).toThrow('/services/0/manifestDigest must match ^sha256:.+')
    expect(() =>
      assertStackLockSchema({
        ...validStackLock(),
        services: validStackLock().services.slice(0, 4),
      }),
    ).toThrow(
      'does not match containers/compose/container-stack-lock.schema.json',
    )
  })

  it('keeps vendor exact-match validation after schema validation', () => {
    const vendorLocks = validVendorLocks()

    expect(checkVendorLocks(validStackLock(vendorLocks), vendorLocks)).toBe(
      true,
    )
    expect(() =>
      checkVendorLocks(
        {
          ...validStackLock(vendorLocks),
          services: [
            ...validStackLock(vendorLocks).services.slice(0, 2),
            {
              ...vendorLocks[0],
              manifestDigest: 'sha256:different',
            },
            ...validStackLock(vendorLocks).services.slice(3),
          ],
        },
        vendorLocks,
      ),
    ).toThrow('differs from image.lock.json at "manifestDigest"')
  })

  it('writes and checks a stack lock through the CLI wrapper', async () => {
    const cwd = makeProject()
    const messages = []

    const generateExitCode = await main(
      [
        'generate',
        '--app-manifest-digest',
        'sha256:app-manifest',
        '--app-image-id',
        'sha256:app-image',
        '--db-job-manifest-digest',
        'sha256:dbjob-manifest',
        '--db-job-image-id',
        'sha256:dbjob-image',
        '--generated-at',
        '2026-05-22T11:00:00.000Z',
      ],
      {
        consoleObj: {
          error: message => messages.push(`error:${message}`),
          log: message => messages.push(`log:${message}`),
        },
        cwd,
        env: {},
        execFileSync: () => 'cafef00d\n',
      },
    )
    const checkExitCode = await main(['check'], {
      consoleObj: {
        error: message => messages.push(`error:${message}`),
        log: message => messages.push(`log:${message}`),
      },
      cwd,
    })

    expect(generateExitCode).toBe(0)
    expect(checkExitCode).toBe(0)
    expect(
      JSON.parse(
        fs.readFileSync(path.join(cwd, 'container-stack.lock.json'), 'utf8'),
      ),
    ).toMatchObject({
      commitSha: 'cafef00d',
    })
    expect(messages).toContain('log:Wrote container-stack.lock.json')
    expect(messages).toContain('log:Checked container-stack.lock.json')
  })
})
