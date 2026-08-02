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
  const curlCapturePath = path.join(root, 'curl-arguments.txt')
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
      'printf \'%s\\n\' "$@" >> "$FAKE_CURL_CAPTURE"',
      'output=""',
      'url=""',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      '    --output) output="$2"; shift 2 ;;',
      '    https://*) url="$1"; shift ;;',
      '    *) shift ;;',
      '  esac',
      'done',
      'case "$url" in',
      '  */releases/latest) cp "$' + '{FAKE_RELEASE_JSON}" "$output" ;;',
      '  */install.sh) cp "$' + '{FAKE_CODEX_INSTALLER}" "$output" ;;',
      '  *) exit 64 ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ALL_PROXY: undefined,
    CODEX_HOME: path.join(root, 'codex-home'),
    CODEX_INSTALL_DIR: path.join(root, 'install-bin'),
    CODEX_NON_INTERACTIVE: '1',
    CODEX_RELEASE: undefined,
    FAKE_CODEX_CAPTURE: capturePath,
    FAKE_CODEX_INSTALLER: upstreamInstaller,
    FAKE_CURL_CAPTURE: curlCapturePath,
    FAKE_RELEASE_JSON: releaseJson,
    GH_TOKEN: undefined,
    HTTPS_PROXY: undefined,
    HTTP_PROXY: undefined,
    NO_PROXY: undefined,
    PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
    all_proxy: undefined,
    http_proxy: undefined,
    https_proxy: undefined,
    no_proxy: undefined,
  }

  return {
    capturePath,
    curlCapturePath,
    env,
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
    const curlArguments = readFileSync(testFixture.curlCapturePath, 'utf8')
    expect(curlArguments).toContain('--connect-timeout\n10')
    expect(curlArguments).toContain('--max-time\n120')
    expect(curlArguments).toContain('--retry\n3')
    expect(curlArguments).not.toContain('Authorization: Bearer')
  })

  it('authenticates GitHub requests when a controlled token is present', () => {
    const testFixture = fixture()
    testFixture.env.GH_TOKEN = 'fixture-github-token'

    const result = spawnSync('bash', [installerPath], {
      encoding: 'utf8',
      env: testFixture.env,
    })

    expect(result.status).toBe(0)
    expect(readFileSync(testFixture.curlCapturePath, 'utf8')).toContain(
      'Authorization: Bearer fixture-github-token',
    )
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
