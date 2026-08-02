import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const installerPath = path.join(
  process.cwd(),
  'scripts/azure-dev/templates/install-codex.sh',
)

function fixture(options: { digest?: string | null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'codex-installer-test-'))
  temporaryDirectories.push(root)
  const fakeBin = path.join(root, 'bin')
  const releaseJson = path.join(root, 'release.json')
  const upstreamInstaller = path.join(root, 'upstream-install.sh')
  const capturePath = path.join(root, 'installed-version.txt')
  mkdirSync(fakeBin)

  writeFileSync(
    upstreamInstaller,
    [
      '#!/bin/sh',
      'set -eu',
      "printf '%s\\n' \"$" + '{CODEX_RELEASE}" > "$' + '{FAKE_CODEX_CAPTURE}"',
      '',
    ].join('\n'),
  )
  const actualDigest = createHash('sha256')
    .update(readFileSync(upstreamInstaller))
    .digest('hex')
  const digest =
    options.digest === undefined ? `sha256:${actualDigest}` : options.digest
  writeFileSync(
    releaseJson,
    `${JSON.stringify({
      assets: [
        {
          ...(digest === null ? {} : { digest }),
          name: 'install.sh',
        },
      ],
      tag_name: 'rust-v1.2.3',
    })}\n`,
  )
  writeFileSync(
    path.join(fakeBin, 'curl'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'case "$3" in',
      '  */releases/latest) cp "$' + '{FAKE_RELEASE_JSON}" "$2" ;;',
      '  */install.sh) cp "$' + '{FAKE_CODEX_INSTALLER}" "$2" ;;',
      '  *) exit 64 ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )

  return {
    capturePath,
    env: {
      ...process.env,
      CODEX_HOME: path.join(root, 'codex-home'),
      CODEX_INSTALL_DIR: path.join(root, 'install-bin'),
      FAKE_CODEX_CAPTURE: capturePath,
      FAKE_CODEX_INSTALLER: upstreamInstaller,
      FAKE_RELEASE_JSON: releaseJson,
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
    },
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('Codex installer integrity contract', () => {
  it('executes the rolling installer only after its upstream digest matches', () => {
    const testFixture = fixture()

    const result = spawnSync('bash', [installerPath], {
      encoding: 'utf8',
      env: testFixture.env,
    })

    expect(result.status).toBe(0)
    expect(readFileSync(testFixture.capturePath, 'utf8')).toBe('1.2.3\n')
  })

  it('fails closed without executing an installer whose digest mismatches', () => {
    const testFixture = fixture({ digest: `sha256:${'0'.repeat(64)}` })

    const result = spawnSync('bash', [installerPath], {
      encoding: 'utf8',
      env: testFixture.env,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('installer checksum validation failed')
    expect(existsSync(testFixture.capturePath)).toBe(false)
  })

  it('fails closed when the release omits installer integrity evidence', () => {
    const testFixture = fixture({ digest: null })

    const result = spawnSync('bash', [installerPath], {
      encoding: 'utf8',
      env: testFixture.env,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'Could not resolve the latest Codex installer and digest',
    )
    expect(existsSync(testFixture.capturePath)).toBe(false)
  })
})
