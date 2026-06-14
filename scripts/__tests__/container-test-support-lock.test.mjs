import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkTestSupportVendorLocks,
  createTestSupportLockFromCliOptions,
  formatTestSupportLockJson,
  main,
} from '../containers/generate-test-support-lock.mjs'

const tempDirs = []

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

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

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-support-lock-'))
  tempDirs.push(dir)
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ version: '0.1.0' })}\n`,
  )
  writeJson(
    path.join(dir, 'containers/kong/image.lock.json'),
    service(
      'kong',
      'api-management',
      'docker.io/kong/kong-gateway',
      '3.10.0.8-20260210-ubuntu',
      'sha256:kong-manifest',
      'sha256:kong-image',
    ),
  )
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

describe('container test support lock generation', () => {
  it('records only HSA mock release metadata', () => {
    const cwd = makeProject()

    const lock = createTestSupportLockFromCliOptions({
      cwd,
      env: {},
      cliOptions: {
        'generated-at': '2026-06-12T10:00:00.000Z',
        'hsa-directory-mock-image':
          'ghcr.io/viscalyx/kravhantering-hsa-directory-mock',
        'hsa-directory-mock-image-id': 'sha256:hsa-image',
        'hsa-directory-mock-manifest-digest': 'sha256:hsa-manifest',
        'hsa-directory-mock-tag': '1.2.3',
        'release-version': '1.2.3',
      },
      execFileSync: () => 'deadbeef\n',
    })

    expect(lock).toMatchObject({
      schemaVersion: 1,
      releaseVersion: '1.2.3',
      commitSha: 'deadbeef',
      generatedAt: '2026-06-12T10:00:00.000Z',
      generatedBy: 'scripts/containers/generate-test-support-lock.mjs',
    })
    expect(lock.services).toEqual([
      {
        name: 'hsa-directory-mock',
        role: 'hsa-directory-test-support',
        image: 'ghcr.io/viscalyx/kravhantering-hsa-directory-mock',
        tag: '1.2.3',
        manifestDigest: 'sha256:hsa-manifest',
        imageId: 'sha256:hsa-image',
        source: 'local-build',
      },
    ])
    expect(formatTestSupportLockJson(lock)).toMatch(/\n$/u)
  })

  it('fails check mode when HSA mock is missing', () => {
    expect(() =>
      checkTestSupportVendorLocks({ schemaVersion: 2, services: [] }, []),
    ).toThrow('must use schemaVersion 1')
    expect(() =>
      checkTestSupportVendorLocks({ schemaVersion: 1, services: [] }, []),
    ).toThrow('missing "hsa-directory-mock"')
  })

  it('writes and checks the lock through the CLI wrapper', async () => {
    const cwd = makeProject()
    const messages = []

    const generateExitCode = await main(
      [
        'generate',
        '--hsa-directory-mock-manifest-digest',
        'sha256:hsa-manifest',
        '--hsa-directory-mock-image-id',
        'sha256:hsa-image',
        '--generated-at',
        '2026-06-12T11:00:00.000Z',
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
        fs.readFileSync(
          path.join(cwd, 'container-test-support.lock.json'),
          'utf8',
        ),
      ),
    ).toMatchObject({
      commitSha: 'cafef00d',
    })
    expect(messages).toContain('log:Wrote container-test-support.lock.json')
    expect(messages).toContain('log:Checked container-test-support.lock.json')
  })
})
