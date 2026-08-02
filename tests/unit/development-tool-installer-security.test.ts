import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const templatesDirectory = path.join(
  process.cwd(),
  'scripts/azure-dev/templates',
)
const gitEnvironment: NodeJS.ProcessEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.toUpperCase().startsWith('GIT_'),
    ),
  ),
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  NODE_ENV: process.env.NODE_ENV,
}

function temporaryDirectory(prefix: string) {
  const directory = mkdtempSync(path.join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

function writeExecutable(filePath: string, source: string) {
  writeFileSync(filePath, source, { mode: 0o755 })
}

function dotenvLinterFixture(options: { digest?: string | null } = {}) {
  const root = temporaryDirectory('dotenv-linter-installer-test-')
  const fakeBin = path.join(root, 'bin')
  const archiveRoot = path.join(root, 'archive')
  const installDirectory = path.join(root, 'installed')
  const releaseJson = path.join(root, 'release.json')
  const archive = path.join(root, 'dotenv-linter.tar.gz')
  mkdirSync(fakeBin)
  mkdirSync(archiveRoot)
  writeExecutable(
    path.join(archiveRoot, 'dotenv-linter'),
    '#!/bin/sh\nprintf "dotenv-linter 4.0.0\\n"\n',
  )
  execFileSync('tar', ['-czf', archive, '-C', archiveRoot, 'dotenv-linter'])
  const actualDigest = createHash('sha256')
    .update(readFileSync(archive))
    .digest('hex')
  const digest =
    options.digest === undefined ? `sha256:${actualDigest}` : options.digest
  const assetName = `dotenv-linter-linux-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}.tar.gz`
  writeFileSync(
    releaseJson,
    `${JSON.stringify({
      assets: [
        {
          ...(digest === null ? {} : { digest }),
          name: assetName,
        },
      ],
      tag_name: 'v4.0.0',
    })}\n`,
  )
  writeExecutable(
    path.join(fakeBin, 'curl'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'case "$3" in',
      '  */releases/latest) cp "$FAKE_RELEASE_JSON" "$2" ;;',
      '  */dotenv-linter-linux-*.tar.gz) cp "$FAKE_ARCHIVE" "$2" ;;',
      '  *) exit 64 ;;',
      'esac',
      '',
    ].join('\n'),
  )

  return {
    env: {
      ...process.env,
      DOTENV_LINTER_INSTALL_DIR: installDirectory,
      FAKE_ARCHIVE: archive,
      FAKE_RELEASE_JSON: releaseJson,
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
    },
    installedBinary: path.join(installDirectory, 'dotenv-linter'),
  }
}

function aptKeyFixture(fingerprint: string) {
  const root = temporaryDirectory('apt-key-verifier-test-')
  const fakeBin = path.join(root, 'bin')
  const downloadedKey = path.join(root, 'upstream-key.gpg')
  const destination = path.join(root, 'keyrings', 'verified.gpg')
  mkdirSync(fakeBin)
  writeFileSync(downloadedKey, 'reviewed signing key\n')
  writeExecutable(
    path.join(fakeBin, 'curl'),
    '#!/bin/sh\nset -eu\ncp "$FAKE_APT_KEY" "$2"\n',
  )
  writeExecutable(
    path.join(fakeBin, 'gpg'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if [[ " $* " == *" --show-keys "* ]]; then',
      "  printf 'pub:-:2048:1:TEST::::::scESC::::::23::0:\\n'",
      '  if [ -n "$FAKE_APT_FINGERPRINT" ]; then',
      '    printf \'fpr:::::::::%s:\\n\' "$FAKE_APT_FINGERPRINT"',
      '  fi',
      '  exit 0',
      'fi',
      'output=""',
      'previous=""',
      'for argument in "$@"; do',
      '  if [ "$previous" = "--output" ]; then output="$argument"; fi',
      '  previous="$argument"',
      'done',
      'cp "$' + '{!#}" "$output"',
      '',
    ].join('\n'),
  )

  return {
    destination,
    env: {
      ...process.env,
      FAKE_APT_FINGERPRINT: fingerprint,
      FAKE_APT_KEY: downloadedKey,
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
    },
  }
}

function gitRepositoryFixture() {
  const root = temporaryDirectory('rolling-git-source-test-')
  const source = path.join(root, 'source')
  const remote = path.join(root, 'remote.git')
  mkdirSync(source)
  execFileSync('git', ['init', '--initial-branch=master'], {
    cwd: source,
    env: gitEnvironment,
  })
  execFileSync('git', ['config', 'user.name', 'Installer Test'], {
    cwd: source,
    env: gitEnvironment,
  })
  execFileSync('git', ['config', 'user.email', 'installer@example.test'], {
    cwd: source,
    env: gitEnvironment,
  })
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], {
    cwd: source,
    env: gitEnvironment,
  })
  writeFileSync(path.join(source, 'version.txt'), 'first\n')
  execFileSync('git', ['add', 'version.txt'], {
    cwd: source,
    env: gitEnvironment,
  })
  execFileSync('git', ['commit', '-m', 'first'], {
    cwd: source,
    env: gitEnvironment,
  })
  execFileSync('git', ['clone', '--bare', source, remote], {
    env: gitEnvironment,
  })
  const remoteUrl = pathToFileURL(remote).href

  return {
    addCommit(value: string) {
      writeFileSync(path.join(source, 'version.txt'), `${value}\n`)
      execFileSync('git', ['add', 'version.txt'], {
        cwd: source,
        env: gitEnvironment,
      })
      execFileSync('git', ['commit', '-m', value], {
        cwd: source,
        env: gitEnvironment,
      })
      execFileSync('git', ['push', remoteUrl, 'master'], {
        cwd: source,
        env: gitEnvironment,
      })
    },
    remoteUrl,
    root,
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('rolling dotenv-linter installer integrity', () => {
  const installer = path.join(templatesDirectory, 'install-dotenv-linter.sh')

  it('installs and executes an asset only after its release digest matches', () => {
    const fixture = dotenvLinterFixture()
    const result = spawnSync('bash', [installer], {
      encoding: 'utf8',
      env: fixture.env,
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('dotenv-linter 4.0.0\n')
    expect(existsSync(fixture.installedBinary)).toBe(true)
  })

  it('fails closed when the release digest mismatches', () => {
    const fixture = dotenvLinterFixture({
      digest: `sha256:${'0'.repeat(64)}`,
    })
    const result = spawnSync('bash', [installer], {
      encoding: 'utf8',
      env: fixture.env,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('archive checksum validation failed')
    expect(existsSync(fixture.installedBinary)).toBe(false)
  })

  it('fails closed when the release omits asset integrity evidence', () => {
    const fixture = dotenvLinterFixture({ digest: null })
    const result = spawnSync('bash', [installer], {
      encoding: 'utf8',
      env: fixture.env,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('release asset and digest')
    expect(existsSync(fixture.installedBinary)).toBe(false)
  })
})

describe('APT trust-root verifier', () => {
  const verifier = path.join(templatesDirectory, 'verify-apt-key.sh')
  const reviewedFingerprint = 'A'.repeat(40)

  it('installs a signing key only when its reviewed fingerprint matches', () => {
    const fixture = aptKeyFixture(reviewedFingerprint)
    const result = spawnSync(
      'bash',
      [
        verifier,
        'Test repository',
        'https://example.test/key.gpg',
        fixture.destination,
        reviewedFingerprint,
      ],
      { encoding: 'utf8', env: fixture.env },
    )

    expect(result.status).toBe(0)
    expect(readFileSync(fixture.destination, 'utf8')).toBe(
      'reviewed signing key\n',
    )
  })

  it('fails before installing an unreviewed signing key', () => {
    const fixture = aptKeyFixture('B'.repeat(40))
    const result = spawnSync(
      'bash',
      [
        verifier,
        'Test repository',
        'https://example.test/key.gpg',
        fixture.destination,
        reviewedFingerprint,
      ],
      { encoding: 'utf8', env: fixture.env },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('fingerprint validation failed')
    expect(existsSync(fixture.destination)).toBe(false)
  })

  it('fails before installing a key without primary-fingerprint evidence', () => {
    const fixture = aptKeyFixture('')
    const result = spawnSync(
      'bash',
      [
        verifier,
        'Test repository',
        'https://example.test/key.gpg',
        fixture.destination,
        reviewedFingerprint,
      ],
      { encoding: 'utf8', env: fixture.env },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('fingerprint validation failed')
    expect(existsSync(fixture.destination)).toBe(false)
  })
})

describe('rolling Git source installer', () => {
  const installer = path.join(
    templatesDirectory,
    'install-rolling-git-source.sh',
  )

  it('resolves the current branch for every new installation without a pin', () => {
    const fixture = gitRepositoryFixture()
    const firstDestination = path.join(fixture.root, 'installed-first')
    const secondDestination = path.join(fixture.root, 'installed-second')
    const env = { ...process.env, ROLLING_GIT_ALLOW_FILE_URL: '1' }

    const first = spawnSync(
      'bash',
      [installer, fixture.remoteUrl, 'master', firstDestination],
      { encoding: 'utf8', env },
    )
    fixture.addCommit('second')
    const second = spawnSync(
      'bash',
      [installer, fixture.remoteUrl, 'master', secondDestination],
      { encoding: 'utf8', env },
    )

    expect(first.status).toBe(0)
    expect(second.status).toBe(0)
    expect(
      readFileSync(path.join(firstDestination, 'version.txt'), 'utf8'),
    ).toBe('first\n')
    expect(
      readFileSync(path.join(secondDestination, 'version.txt'), 'utf8'),
    ).toBe('second\n')
  })

  it('fails closed when the requested rolling branch cannot be resolved', () => {
    const fixture = gitRepositoryFixture()
    const destination = path.join(fixture.root, 'not-installed')
    const result = spawnSync(
      'bash',
      [installer, fixture.remoteUrl, 'missing', destination],
      {
        encoding: 'utf8',
        env: { ...process.env, ROLLING_GIT_ALLOW_FILE_URL: '1' },
      },
    )

    expect(result.status).not.toBe(0)
    expect(existsSync(destination)).toBe(false)
  })
})
