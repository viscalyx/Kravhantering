import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const orchestrationPath = path.join(
  process.cwd(),
  'scripts/azure-dev/templates/install-azure-codex.sh',
)
const targetTriple = 'x86_64-unknown-linux-musl'

function shellLiteral(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function executable(pathname: string, version: string) {
  mkdirSync(path.dirname(pathname), { recursive: true })
  writeFileSync(
    pathname,
    `#!/usr/bin/env bash\nprintf 'codex-cli ${version}\\n'\n`,
    { mode: 0o755 },
  )
}

interface FixtureOptions {
  failure?:
    | 'before-activation'
    | 'package-digest'
    | 'package-download'
    | 'package-extraction'
    | 'post-activation'
    | 'signal-int'
    | 'signal-term'
    | 'timeout'
    | 'version-mismatch'
  fakeOwner?: boolean
  incompleteTarget?: boolean
  installedVersion?: string
  previousVersion?: string
  result?: string
  targetVersion?: string
}

function userFixture(options: FixtureOptions = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'azure-codex-user-'))
  temporaryDirectories.push(root)
  const userHome = path.join(root, 'home', 'vscode')
  const codexHome = path.join(userHome, '.codex')
  const installDir = path.join(userHome, '.local', 'bin')
  const standaloneRoot = path.join(codexHome, 'packages', 'standalone')
  const releasesDir = path.join(standaloneRoot, 'releases')
  const currentLink = path.join(standaloneRoot, 'current')
  const launcher = path.join(installDir, 'codex')
  const scratchRoot = path.join(root, 'scratch')
  const legacyLauncher = path.join(root, 'usr-local-bin-codex')
  const installerPath = path.join(root, 'install-codex.sh')
  const fakeBin = path.join(root, 'fake-bin')
  const runnerCapture = path.join(root, 'runner.txt')
  const environmentCapture = path.join(root, 'environment.txt')
  const downloadCapture = path.join(root, 'downloads.txt')
  const targetVersion = options.targetVersion ?? '1.2.3'
  const targetRelease = path.join(
    releasesDir,
    `${targetVersion}-${targetTriple}`,
  )

  mkdirSync(userHome, { recursive: true, mode: 0o750 })
  mkdirSync(releasesDir, { recursive: true, mode: 0o700 })
  mkdirSync(installDir, { recursive: true, mode: 0o700 })
  mkdirSync(scratchRoot, { mode: 0o700 })
  mkdirSync(fakeBin)

  function createCompleteRelease(version: string) {
    const release = path.join(releasesDir, `${version}-${targetTriple}`)
    mkdirSync(path.join(release, 'bin'), { recursive: true })
    mkdirSync(path.join(release, 'codex-path'), { recursive: true })
    writeFileSync(path.join(release, 'codex-package.json'), '{}\n')
    executable(path.join(release, 'bin', 'codex'), version)
    executable(path.join(release, 'bin', 'codex-code-mode-host'), version)
    executable(path.join(release, 'codex-path', 'rg'), version)
    symlinkSync('bin/codex', path.join(release, 'codex'))
    return release
  }

  if (options.installedVersion) {
    createCompleteRelease(options.installedVersion)
  }
  if (options.incompleteTarget) {
    mkdirSync(targetRelease, { recursive: true })
    writeFileSync(path.join(targetRelease, 'partial'), 'interrupted\n')
  }
  if (options.previousVersion) {
    const previousRelease = createCompleteRelease(options.previousVersion)
    symlinkSync(previousRelease, currentLink)
    symlinkSync(`${currentLink}/bin/codex`, launcher)
  }

  writeFileSync(
    path.join(fakeBin, 'runuser'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `printf 'RUN\\n%s\\n' "$@" >> ${shellLiteral(runnerCapture)}`,
      'shift 3',
      'exec "$@"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  if (options.fakeOwner) {
    writeFileSync(
      path.join(fakeBin, 'id'),
      [
        '#!/usr/bin/env bash',
        'case "$1" in',
        "  -u) printf '4242\\n' ;;",
        "  -g) printf '4242\\n' ;;",
        '  *) exec /usr/bin/id "$@" ;;',
        'esac',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )
  }

  const mismatchVersion =
    options.failure === 'version-mismatch' ? '9.9.9' : targetVersion
  const result =
    options.result ?? `{"schemaVersion":1,"targetVersion":"${targetVersion}"}\n`
  const failureAction = (() => {
    switch (options.failure) {
      case 'before-activation':
        return 'mkdir -p "$release"; printf \'partial\\n\' > "$release/partial"; exit 42'
      case 'package-download':
        return 'exit 43'
      case 'package-digest':
        return 'exit 44'
      case 'package-extraction':
        return 'exit 45'
      case 'signal-int':
        return 'kill -INT $$'
      case 'signal-term':
        return 'kill -TERM $$'
      case 'timeout':
        return 'sleep 5'
      default:
        return ':'
    }
  })()

  writeFileSync(
    installerPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `printf 'HOME=%s\\nCODEX_HOME=%s\\nCODEX_INSTALL_DIR=%s\\nCODEX_NON_INTERACTIVE=%s\\nPATH=%s\\nTMPDIR=%s\\nTMP=%s\\nTEMP=%s\\nUSER=%s\\nTOKEN_PRESENT=%s\\n' "$HOME" "$CODEX_HOME" "$CODEX_INSTALL_DIR" "$CODEX_NON_INTERACTIVE" "$PATH" "$TMPDIR" "$TMP" "$TEMP" "$USER" "\${GH_TOKEN:+yes}" > ${shellLiteral(environmentCapture)}`,
      `release="$CODEX_HOME/packages/standalone/releases/${targetVersion}-${targetTriple}"`,
      failureAction,
      'if [ ! -f "$release/codex-package.json" ] || [ ! -x "$release/bin/codex" ]; then',
      `  printf 'download\\n' >> ${shellLiteral(downloadCapture)}`,
      '  rm -rf "$release"',
      '  mkdir -p "$release/bin" "$release/codex-path"',
      '  printf \'{}\\n\' > "$release/codex-package.json"',
      `  printf '#!/usr/bin/env bash\\nprintf "codex-cli ${mismatchVersion}\\\\n"\\n' > "$release/bin/codex"`,
      '  cp "$release/bin/codex" "$release/bin/codex-code-mode-host"',
      '  cp "$release/bin/codex" "$release/codex-path/rg"',
      '  chmod 0755 "$release/bin/codex" "$release/bin/codex-code-mode-host" "$release/codex-path/rg"',
      '  ln -s bin/codex "$release/codex"',
      'fi',
      'ln -sfn "$release" "$CODEX_HOME/packages/standalone/current"',
      'ln -sfn "$CODEX_HOME/packages/standalone/current/bin/codex" "$CODEX_INSTALL_DIR/codex"',
      options.failure === 'post-activation' ? 'exit 46' : ':',
      `printf '%s' ${shellLiteral(result)}`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  )

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AZURE_DEV_CODEX_INSTALLER: installerPath,
    AZURE_DEV_CODEX_LEGACY_LAUNCHER: legacyLauncher,
    AZURE_DEV_CODEX_MODE: 'user-managed',
    AZURE_DEV_CODEX_TEMP_ROOT: scratchRoot,
    AZURE_DEV_CODEX_TIMEOUT_SECONDS:
      options.failure === 'timeout' ? '1' : '900',
    AZURE_DEV_CODEX_USER: 'vscode',
    AZURE_DEV_CODEX_USER_HOME: userHome,
    CODEX_HOME: codexHome,
    CODEX_INSTALL_DIR: installDir,
    GH_TOKEN: 'fixture-forwarded-token',
    PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
  }

  return {
    codexHome,
    createCompleteRelease,
    currentLink,
    downloadCapture,
    env,
    environmentCapture,
    installDir,
    launcher,
    legacyLauncher,
    releasesDir,
    root,
    runnerCapture,
    scratchRoot,
    standaloneRoot,
    targetRelease,
    userHome,
  }
}

function runFixture(fixture: ReturnType<typeof userFixture>) {
  return spawnSync('bash', [orchestrationPath], {
    encoding: 'utf8',
    env: fixture.env,
  })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('Azure Codex installation orchestration', () => {
  it('keeps ordinary Azure setup on the system-managed mode', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'azure-codex-system-'))
    temporaryDirectories.push(root)
    const installer = path.join(root, 'installer.sh')
    const capture = path.join(root, 'capture.txt')
    writeFileSync(
      installer,
      `#!/usr/bin/env bash\nprintf 'system\\n' > ${shellLiteral(capture)}\nprintf '{"schemaVersion":1,"targetVersion":"1.2.3"}\\n'\n`,
      { mode: 0o755 },
    )

    const result = spawnSync('bash', [orchestrationPath], {
      encoding: 'utf8',
      env: { ...process.env, AZURE_DEV_CODEX_INSTALLER: installer },
    })

    expect(result.status).toBe(0)
    expect(readFileSync(capture, 'utf8')).toBe('system\n')
    expect(result.stdout).toBe(
      'KRAV_AZURE_CODEX_RESULT={"schemaVersion":1,"targetVersion":"1.2.3"}\n',
    )
  })

  it('installs a missing release as vscode with the explicit private environment', () => {
    const fixture = userFixture()

    const result = runFixture(fixture)

    expect(result.status).toBe(0)
    const runner = readFileSync(fixture.runnerCapture, 'utf8')
    expect(runner).toContain('RUN\n-u\nRUN\nvscode\nRUN\n--\n')
    expect(runner).toContain('RUN\n/bin/bash\nRUN\n-c\n')
    const environment = readFileSync(fixture.environmentCapture, 'utf8')
    expect(environment).toContain(`HOME=${fixture.userHome}\n`)
    expect(environment).toContain(`CODEX_HOME=${fixture.codexHome}\n`)
    expect(environment).toContain(`CODEX_INSTALL_DIR=${fixture.installDir}\n`)
    expect(environment).toContain('CODEX_NON_INTERACTIVE=1\n')
    expect(environment).toContain(
      `PATH=${fixture.installDir}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n`,
    )
    expect(environment).toMatch(
      new RegExp(`TMPDIR=${fixture.scratchRoot}/run\\.[^\\n]+\\n`),
    )
    expect(environment).toContain('USER=vscode\nTOKEN_PRESENT=yes\n')
  })

  it.each([
    ['current', '1.2.3'],
    ['older', '1.1.0'],
    ['newer stable', '2.0.0'],
    ['newer prerelease', '2.0.0-beta.1'],
  ])(
    'converges a complete %s installation to the exact stable target',
    (_name, version) => {
      const fixture = userFixture({ previousVersion: version })

      const result = runFixture(fixture)

      expect(result.status).toBe(0)
      expect(readlinkSync(fixture.currentLink)).toBe(fixture.targetRelease)
      expect(readFileSync(fixture.environmentCapture, 'utf8')).toContain(
        'TOKEN_PRESENT=yes',
      )
      expect(result.stderr).toContain('targetVersion=1.2.3')
      expect(result.stderr).toContain('finalVersion=1.2.3')
    },
  )

  it('revalidates a complete current package and repairs links without redownloading it', () => {
    const fixture = userFixture({ installedVersion: '1.2.3' })

    const result = runFixture(fixture)

    expect(result.status).toBe(0)
    expect(existsSync(fixture.downloadCapture)).toBe(false)
    expect(readlinkSync(fixture.currentLink)).toBe(fixture.targetRelease)
    expect(readlinkSync(fixture.launcher)).toBe(
      `${fixture.currentLink}/bin/codex`,
    )
  })

  it('reinstalls an incomplete target release', () => {
    const fixture = userFixture({ incompleteTarget: true })

    const result = runFixture(fixture)

    expect(result.status).toBe(0)
    expect(readFileSync(fixture.downloadCapture, 'utf8')).toBe('download\n')
    expect(existsSync(path.join(fixture.targetRelease, 'partial'))).toBe(false)
  })

  it('deactivates an incomplete managed target before attempting repair', () => {
    const fixture = userFixture({
      failure: 'before-activation',
      incompleteTarget: true,
    })
    symlinkSync(fixture.targetRelease, fixture.currentLink)
    symlinkSync(`${fixture.currentLink}/bin/codex`, fixture.launcher)

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(existsSync(fixture.currentLink)).toBe(false)
    expect(existsSync(fixture.launcher)).toBe(false)
    expect(result.stderr).toContain('previousState=incomplete')
  })

  it.each([
    ['ordinary error', 'before-activation' as const],
    ['package download failure', 'package-download' as const],
    ['package digest failure', 'package-digest' as const],
    ['package extraction failure', 'package-extraction' as const],
    ['INT', 'signal-int' as const],
    ['TERM', 'signal-term' as const],
    ['timeout', 'timeout' as const],
    ['post-activation failure', 'post-activation' as const],
    ['final-version mismatch', 'version-mismatch' as const],
  ])('restores the previous complete release after %s', (_name, failure) => {
    const fixture = userFixture({ failure, previousVersion: '1.1.0' })
    const previousTarget = readlinkSync(fixture.currentLink)

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(readlinkSync(fixture.currentLink)).toBe(previousTarget)
    expect(readlinkSync(fixture.launcher)).toBe(
      `${fixture.currentLink}/bin/codex`,
    )
    expect(result.stderr).toContain('rollback=')
  })

  it('removes links created by a failed first installation', () => {
    const fixture = userFixture({ failure: 'post-activation' })

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(existsSync(fixture.currentLink)).toBe(false)
    expect(existsSync(fixture.launcher)).toBe(false)
  })

  it('recovers an interrupted transaction before converging again', () => {
    const fixture = userFixture({ previousVersion: '1.1.0' })
    const previousTarget = readlinkSync(fixture.currentLink)
    rmSync(fixture.currentLink)
    rmSync(fixture.launcher)
    mkdirSync(fixture.targetRelease, { recursive: true })
    symlinkSync(fixture.targetRelease, fixture.currentLink)
    symlinkSync(`${fixture.currentLink}/bin/codex`, fixture.launcher)
    const interruptedScratch = path.join(fixture.scratchRoot, 'run.interrupted')
    mkdirSync(interruptedScratch)
    writeFileSync(path.join(interruptedScratch, 'installer.tmp'), 'private\n')
    writeFileSync(
      path.join(fixture.standaloneRoot, '.krav-azure-transaction.json'),
      `${JSON.stringify({
        previousCurrentTarget: previousTarget,
        previousLauncherTarget: `${fixture.currentLink}/bin/codex`,
        schemaVersion: 1,
        scratchPath: interruptedScratch,
      })}\n`,
      { mode: 0o600 },
    )

    const result = runFixture(fixture)

    expect(result.status).toBe(0)
    expect(result.stderr).toContain(
      'rollback=recovering interrupted prior installation',
    )
    expect(readlinkSync(fixture.currentLink)).toBe(fixture.targetRelease)
    expect(
      existsSync(path.join(fixture.targetRelease, 'codex-package.json')),
    ).toBe(true)
    expect(existsSync(interruptedScratch)).toBe(false)
  })

  it('bounds live-lock waiting without removing the upstream lock', () => {
    const fixture = userFixture({
      failure: 'timeout',
      previousVersion: '1.1.0',
    })
    const lock = path.join(fixture.standaloneRoot, 'install.lock')
    writeFileSync(lock, 'live-lock-sentinel\n')

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(readFileSync(lock, 'utf8')).toBe('live-lock-sentinel\n')
  })

  it('preserves unrelated user state and scratch content', () => {
    const fixture = userFixture({ previousVersion: '1.1.0' })
    const sentinels = [
      'auth.json',
      'sessions/thread.jsonl',
      'plugins/plugin.txt',
      'skills/skill.md',
      'sqlite/codex.db',
      'history.jsonl',
      'attachments/file.bin',
      'cache/data',
      'unrelated.toml',
    ]
    for (const sentinel of sentinels) {
      const pathname = path.join(fixture.codexHome, sentinel)
      mkdirSync(path.dirname(pathname), { recursive: true })
      writeFileSync(pathname, `preserve:${sentinel}\n`)
    }
    const unrelatedScratch = path.join(fixture.scratchRoot, 'operator-note')
    writeFileSync(unrelatedScratch, 'preserve scratch\n')

    const result = runFixture(fixture)

    expect(result.status).toBe(0)
    for (const sentinel of sentinels) {
      expect(readFileSync(path.join(fixture.codexHome, sentinel), 'utf8')).toBe(
        `preserve:${sentinel}\n`,
      )
    }
    expect(readFileSync(unrelatedScratch, 'utf8')).toBe('preserve scratch\n')
  })

  it('applies private managed modes while retaining package execution modes', () => {
    const fixture = userFixture()
    const config = path.join(fixture.codexHome, 'config.toml')
    writeFileSync(config, 'model = "fixture"\n', { mode: 0o644 })

    const result = runFixture(fixture)

    expect(result.status).toBe(0)
    for (const directory of [
      path.join(fixture.userHome, '.local'),
      fixture.installDir,
      fixture.codexHome,
      path.join(fixture.codexHome, 'packages'),
      fixture.standaloneRoot,
      fixture.releasesDir,
      fixture.scratchRoot,
    ]) {
      expect(lstatSync(directory).mode & 0o777).toBe(0o700)
    }
    expect(lstatSync(config).mode & 0o777).toBe(0o600)
    expect(
      lstatSync(path.join(fixture.targetRelease, 'bin', 'codex')).mode & 0o777,
    ).toBe(0o755)
  })

  it.each([
    ['managed-root symlink', 'symlink'],
    ['unexpected managed-root object', 'unexpected'],
    ['unsafe parent ownership', 'owner'],
    ['unrecognized release symlink', 'release-symlink'],
  ])('fails with remediation for %s', (_name, scenario) => {
    const fixture = userFixture({ fakeOwner: scenario === 'owner' })
    if (scenario === 'symlink') {
      rmSync(fixture.standaloneRoot, { recursive: true })
      symlinkSync(fixture.root, fixture.standaloneRoot)
    } else if (scenario === 'unexpected') {
      writeFileSync(path.join(fixture.standaloneRoot, 'mystery'), 'unsafe\n')
    } else if (scenario === 'release-symlink') {
      symlinkSync(
        fixture.root,
        path.join(fixture.releasesDir, '1.0.0-x86_64-unknown-linux-musl'),
      )
    }

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Unsafe Codex managed object')
    expect(result.stderr).toContain('before rerunning setup')
  })

  it('rejects every legacy global launcher object with replacement-only guidance', () => {
    const fixture = userFixture()
    writeFileSync(fixture.legacyLauncher, 'legacy\n')

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('In-place migration is unsupported')
    expect(result.stderr).toContain('run remove, then setup -Yes')
  })

  it.each([
    ['missing', ''],
    ['malformed', '{"targetVersion":'],
    [
      'ambiguous',
      '{"schemaVersion":1,"targetVersion":"1.2.3"}\n' +
        '{"schemaVersion":1,"targetVersion":"1.2.3"}\n',
    ],
    ['unstable', '{"schemaVersion":1,"targetVersion":"1.2.3-beta.1"}\n'],
  ])('rolls back for a %s installer result', (_name, output) => {
    const fixture = userFixture({ previousVersion: '1.1.0', result: output })
    const previousTarget = readlinkSync(fixture.currentLink)

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Codex installer result is invalid')
    expect(readlinkSync(fixture.currentLink)).toBe(previousTarget)
  })

  it('keeps credentials out of arguments, output, and persistent state', () => {
    const fixture = userFixture()

    const result = runFixture(fixture)

    expect(result.status).toBe(0)
    const observable = [
      result.stdout,
      result.stderr,
      readFileSync(fixture.runnerCapture, 'utf8'),
      readFileSync(fixture.environmentCapture, 'utf8'),
    ].join('\n')
    expect(observable).not.toContain('fixture-forwarded-token')
    expect(
      existsSync(
        path.join(fixture.standaloneRoot, '.krav-azure-transaction.json'),
      ),
    ).toBe(false)
  })
})
