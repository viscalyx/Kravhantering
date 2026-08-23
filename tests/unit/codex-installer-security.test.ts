import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
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

function fixture(
  options: {
    digest?: string | null
    draft?: boolean
    duplicateInstaller?: boolean
    prerelease?: boolean
    simulatesUpstreamLock?: boolean
  } = {},
) {
  const root = mkdtempSync(path.join(tmpdir(), 'codex-installer-test-'))
  temporaryDirectories.push(root)
  const fakeBin = path.join(root, 'bin')
  const releaseJson = path.join(root, 'release.json')
  const upstreamInstaller = path.join(root, 'upstream-install.sh')
  const capturePath = path.join(root, 'installed-version.txt')
  const codexHome = path.join(root, 'codex-home')
  const installDir = path.join(root, 'install-bin')
  const privateTemp = path.join(root, 'private-temp')
  const curlCapturePath = path.join(root, 'curl-arguments.txt')
  const curlAuthenticationCapturePath = path.join(
    root,
    'curl-authentication.txt',
  )
  mkdirSync(fakeBin)
  mkdirSync(privateTemp, { mode: 0o700 })

  writeFileSync(
    upstreamInstaller,
    [
      '#!/bin/sh',
      'set -eu',
      ...(options.simulatesUpstreamLock
        ? [
            'mkdir -p "$CODEX_HOME/packages/standalone"',
            'exec 9>"$CODEX_HOME/packages/standalone/install.lock"',
            'flock 9',
          ]
        : []),
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
        ...(options.duplicateInstaller ? [{ digest, name: 'install.sh' }] : []),
      ],
      draft: options.draft ?? false,
      prerelease: options.prerelease ?? false,
      tag_name: 'rust-v1.2.3',
    })}\n`,
  )
  writeFileSync(
    path.join(fakeBin, 'curl'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'printf \'%s\\n\' "$@" >> "$FAKE_CURL_CAPTURE"',
      'if [[ " $* " == *" --header @- "* ]]; then',
      '  read -r authorization_header',
      '  if [[ "$authorization_header" == "Authorization: Bearer $GH_TOKEN" ]]; then',
      '    printf \'authenticated\\n\' >> "$FAKE_CURL_AUTHENTICATION_CAPTURE"',
      '  fi',
      'fi',
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
    CODEX_HOME: codexHome,
    CODEX_INSTALL_DIR: installDir,
    CODEX_NON_INTERACTIVE: '1',
    CODEX_RELEASE: undefined,
    FAKE_CODEX_CAPTURE: capturePath,
    FAKE_CODEX_INSTALLER: upstreamInstaller,
    FAKE_CURL_CAPTURE: curlCapturePath,
    FAKE_CURL_AUTHENTICATION_CAPTURE: curlAuthenticationCapturePath,
    FAKE_RELEASE_JSON: releaseJson,
    GH_TOKEN: undefined,
    HTTPS_PROXY: undefined,
    HTTP_PROXY: undefined,
    NO_PROXY: undefined,
    PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
    TMPDIR: privateTemp,
    all_proxy: undefined,
    http_proxy: undefined,
    https_proxy: undefined,
    no_proxy: undefined,
  }

  return {
    capturePath,
    codexHome,
    curlAuthenticationCapturePath,
    curlCapturePath,
    env,
    installDir,
    privateTemp,
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
    expect(result.stdout).toBe('{"schemaVersion":1,"targetVersion":"1.2.3"}\n')
    expect(readFileSync(testFixture.capturePath, 'utf8')).toBe('1.2.3\n')
    const curlArguments = readFileSync(testFixture.curlCapturePath, 'utf8')
    expect(curlArguments).toContain('--connect-timeout\n10')
    expect(curlArguments).toContain('--max-time\n120')
    expect(curlArguments).toContain('--retry\n3')
    expect(curlArguments).not.toContain('Authorization: Bearer')
    expect(curlArguments).toContain(
      `${testFixture.privateTemp}/krav-codex-installer.`,
    )
    expect(curlArguments).toContain(
      'https://github.com/openai/codex/releases/download/rust-v1.2.3/install.sh',
    )
  })

  it('authenticates GitHub requests when a controlled token is present', () => {
    const testFixture = fixture()
    testFixture.env.GH_TOKEN = 'fixture-github-token'

    const result = spawnSync('bash', [installerPath], {
      encoding: 'utf8',
      env: testFixture.env,
    })

    expect(result.status).toBe(0)
    expect(
      readFileSync(testFixture.curlAuthenticationCapturePath, 'utf8'),
    ).toBe('authenticated\nauthenticated\n')
    expect(readFileSync(testFixture.curlCapturePath, 'utf8')).not.toContain(
      'fixture-github-token',
    )
    expect(result.stdout).not.toContain('fixture-github-token')
    expect(result.stderr).not.toContain('fixture-github-token')
  })

  it('retains private managed-directory modes for user-managed invocation', () => {
    const testFixture = fixture()
    testFixture.env.CODEX_MANAGED_DIRECTORY_MODE = '0700'

    const result = spawnSync('bash', [installerPath], {
      encoding: 'utf8',
      env: testFixture.env,
    })

    expect(result.status).toBe(0)
    expect(statSync(testFixture.codexHome).mode & 0o777).toBe(0o700)
    expect(statSync(testFixture.installDir).mode & 0o777).toBe(0o700)
  })

  it('hands an inherited upstream lock through the verified installer boundary', () => {
    const testFixture = fixture({ simulatesUpstreamLock: true })
    const lockFile = path.join(
      testFixture.codexHome,
      'packages',
      'standalone',
      'install.lock',
    )
    mkdirSync(path.dirname(lockFile), { recursive: true })
    const result = spawnSync(
      'bash',
      [
        '-c',
        'exec 8>"$1"; /usr/bin/flock 8; export CODEX_INSTALL_LOCK_FD=8; exec /bin/bash "$2"',
        'bash',
        lockFile,
        installerPath,
      ],
      {
        encoding: 'utf8',
        env: testFixture.env,
        timeout: 2_000,
      },
    )

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(readFileSync(testFixture.capturePath, 'utf8')).toBe('1.2.3\n')
  })

  it('rejects an inherited descriptor that does not hold the upstream lock', () => {
    const testFixture = fixture({ simulatesUpstreamLock: true })
    testFixture.env.CODEX_INSTALL_LOCK_FD = '8'

    const result = spawnSync('bash', [installerPath], {
      encoding: 'utf8',
      env: testFixture.env,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'Inherited Codex install lock is invalid or not held',
    )
    expect(existsSync(testFixture.capturePath)).toBe(false)
  })

  it('rejects a forwarded token containing a header-injection newline', () => {
    const testFixture = fixture()
    testFixture.env.GH_TOKEN = 'fixture-token\nInjected: value'

    const result = spawnSync('bash', [installerPath], {
      encoding: 'utf8',
      env: testFixture.env,
    })

    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('GitHub token contains invalid characters')
    expect(result.stderr).not.toContain('fixture-token')
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

  it.each([
    ['draft', { draft: true }],
    ['prerelease', { prerelease: true }],
    ['ambiguous installer', { duplicateInstaller: true }],
  ])('fails closed for %s release metadata', (_name, options) => {
    const testFixture = fixture(options)

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
