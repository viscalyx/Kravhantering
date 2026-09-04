import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
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
    | 'unsafe-post-activation'
    | 'unsafe-scratch'
    | 'version-mismatch'
  fakeOwner?: boolean
  incompleteTarget?: boolean
  installedVersion?: string
  previousVersion?: string
  result?: string
  targetVersion?: string
  timeoutSeconds?: string
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
    mkdirSync(path.join(release, 'codex-resources'), { recursive: true })
    writeFileSync(path.join(release, 'codex-package.json'), '{}\n')
    executable(path.join(release, 'bin', 'codex'), version)
    executable(path.join(release, 'bin', 'codex-code-mode-host'), version)
    executable(path.join(release, 'codex-path', 'rg'), version)
    executable(path.join(release, 'codex-resources', 'bwrap'), version)
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
  const fixtureUid = options.fakeOwner
    ? '4242'
    : spawnSync('/usr/bin/id', ['-u'], { encoding: 'utf8' }).stdout.trim()
  const fixtureGid = options.fakeOwner
    ? '4242'
    : spawnSync('/usr/bin/id', ['-g'], { encoding: 'utf8' }).stdout.trim()
  writeFileSync(
    path.join(fakeBin, 'id'),
    [
      '#!/usr/bin/env bash',
      'case "$1:$2" in',
      `  -u:vscode) printf '${fixtureUid}\\n' ;;`,
      `  -g:vscode) printf '${fixtureGid}\\n' ;;`,
      '  *) exec /usr/bin/id "$@" ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  writeFileSync(
    path.join(fakeBin, 'chown'),
    [
      '#!/usr/bin/env bash',
      'if [ "$1" = vscode:vscode ]; then',
      '  shift',
      `  exec /usr/bin/chown '${fixtureUid}:${fixtureGid}' "$@"`,
      'fi',
      'exec /usr/bin/chown "$@"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )

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
      `printf 'HOME=%s\\nCODEX_HOME=%s\\nCODEX_INSTALL_DIR=%s\\nCODEX_NON_INTERACTIVE=%s\\nCODEX_MANAGED_DIRECTORY_MODE=%s\\nPATH=%s\\nTMPDIR=%s\\nTMP=%s\\nTEMP=%s\\nUSER=%s\\nEFFECTIVE_UID=%s\\nEFFECTIVE_GID=%s\\nTOKEN_PRESENT=%s\\n' "$HOME" "$CODEX_HOME" "$CODEX_INSTALL_DIR" "$CODEX_NON_INTERACTIVE" "$CODEX_MANAGED_DIRECTORY_MODE" "$PATH" "$TMPDIR" "$TMP" "$TEMP" "$USER" "$(/usr/bin/id -u)" "$(/usr/bin/id -g)" "\${GH_TOKEN:+yes}" > ${shellLiteral(environmentCapture)}`,
      `release="$CODEX_HOME/packages/standalone/releases/${targetVersion}-${targetTriple}"`,
      failureAction,
      'if [ ! -f "$release/codex-package.json" ] || [ ! -x "$release/bin/codex" ] || [ ! -x "$release/codex-resources/bwrap" ]; then',
      `  printf 'download\\n' >> ${shellLiteral(downloadCapture)}`,
      '  rm -rf "$release"',
      '  mkdir -p "$release/bin" "$release/codex-path" "$release/codex-resources"',
      '  printf \'{}\\n\' > "$release/codex-package.json"',
      `  printf '#!/usr/bin/env bash\\nprintf "codex-cli ${mismatchVersion}\\\\n"\\n' > "$release/bin/codex"`,
      '  cp "$release/bin/codex" "$release/bin/codex-code-mode-host"',
      '  cp "$release/bin/codex" "$release/codex-path/rg"',
      '  cp "$release/bin/codex" "$release/codex-resources/bwrap"',
      '  chmod 0755 "$release/bin/codex" "$release/bin/codex-code-mode-host" "$release/codex-path/rg" "$release/codex-resources/bwrap"',
      '  ln -s bin/codex "$release/codex"',
      'fi',
      'ln -sfn "$release" "$CODEX_HOME/packages/standalone/current"',
      'ln -sfn "$CODEX_HOME/packages/standalone/current/bin/codex" "$CODEX_INSTALL_DIR/codex"',
      options.failure === 'post-activation' ? 'exit 46' : ':',
      options.failure === 'unsafe-post-activation'
        ? 'rm "$CODEX_INSTALL_DIR/codex"; printf \'unsafe\\n\' > "$CODEX_INSTALL_DIR/codex"; exit 47'
        : ':',
      options.failure === 'unsafe-scratch'
        ? 'rm -rf "$TMPDIR"; ln -s "$CODEX_HOME" "$TMPDIR"'
        : ':',
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
      options.timeoutSeconds ?? (options.failure === 'timeout' ? '1' : '900'),
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
    fakeBin,
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

async function waitForFile(pathname: string) {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    if (existsSync(pathname)) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${pathname}`)
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('Azure Codex installation orchestration', () => {
  it('retains the explicit system-managed boundary for the devcontainer', () => {
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
      env: {
        ...process.env,
        AZURE_DEV_CODEX_INSTALLER: installer,
        AZURE_DEV_CODEX_MODE: 'system-managed',
      },
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
    const effectiveUid = spawnSync('/usr/bin/id', ['-u'], {
      encoding: 'utf8',
    }).stdout.trim()
    const effectiveGid = spawnSync('/usr/bin/id', ['-g'], {
      encoding: 'utf8',
    }).stdout.trim()
    expect(environment).toContain(`HOME=${fixture.userHome}\n`)
    expect(environment).toContain(`CODEX_HOME=${fixture.codexHome}\n`)
    expect(environment).toContain(`CODEX_INSTALL_DIR=${fixture.installDir}\n`)
    expect(environment).toContain('CODEX_NON_INTERACTIVE=1\n')
    expect(environment).toContain('CODEX_MANAGED_DIRECTORY_MODE=0700\n')
    expect(environment).toContain(
      `PATH=${fixture.installDir}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n`,
    )
    expect(environment).toMatch(
      new RegExp(`TMPDIR=${fixture.scratchRoot}/run\\.[^\\n]+\\n`),
    )
    expect(environment).toContain('USER=vscode\n')
    expect(environment).toContain(`EFFECTIVE_UID=${effectiveUid}\n`)
    expect(environment).toContain(`EFFECTIVE_GID=${effectiveGid}\n`)
    expect(environment).toContain('TOKEN_PRESENT=yes\n')
    expect(result.stderr).toContain('previousState=missing action=install')
  })

  it('validates lock ownership against the descriptor target', () => {
    const fixture = userFixture()
    const fixtureUid = spawnSync('/usr/bin/id', ['-u'], {
      encoding: 'utf8',
    }).stdout.trim()
    const fixtureGid = spawnSync('/usr/bin/id', ['-g'], {
      encoding: 'utf8',
    }).stdout.trim()
    const mismatchedUid = fixtureUid === '0' ? '1' : '0'
    const mismatchedGid = fixtureGid === '0' ? '1' : '0'
    writeFileSync(
      path.join(fixture.fakeBin, 'stat'),
      [
        '#!/usr/bin/env bash',
        'if [ "$#" -eq 4 ] && [ "$1" = -Lc ] && [ "$2" = %u:%g ] && [ "$3" = -- ]; then',
        '  case "$4" in',
        `    /proc/self/fd/*) printf '${mismatchedUid}:${mismatchedGid}\\n'; exit 0 ;;`,
        '  esac',
        'fi',
        'exec /usr/bin/stat "$@"',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )

    const result = runFixture(fixture)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Codex install lock changed during validation',
    )
  })

  it.each([
    ['current', '1.2.3', 'revalidate'],
    ['older', '1.1.0', 'upgrade'],
    ['newer stable', '2.0.0', 'downgrade'],
    ['newer prerelease', '2.0.0-beta.1', 'downgrade'],
  ])(
    'converges a complete %s installation to the exact stable target',
    (_name, version, action) => {
      const fixture = userFixture({ previousVersion: version })

      const result = runFixture(fixture)

      expect(result.status).toBe(0)
      expect(readlinkSync(fixture.currentLink)).toBe(fixture.targetRelease)
      expect(readFileSync(fixture.environmentCapture, 'utf8')).toContain(
        'TOKEN_PRESENT=yes',
      )
      expect(result.stderr).toContain('targetVersion=1.2.3')
      expect(result.stderr).toContain('finalVersion=1.2.3')
      expect(result.stderr).toContain(`previousState=${version}`)
      expect(result.stderr).toContain(`action=${action}`)
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
    expect(result.stderr).toContain('previousState=missing action=repair')
  })

  it('reinstalls an incomplete target release', () => {
    const fixture = userFixture({ incompleteTarget: true })

    const result = runFixture(fixture)

    expect(result.status).toBe(0)
    expect(readFileSync(fixture.downloadCapture, 'utf8')).toBe('download\n')
    expect(existsSync(path.join(fixture.targetRelease, 'partial'))).toBe(false)
  })

  it('reinstalls a current package that is missing a required executable', () => {
    const fixture = userFixture({ installedVersion: '1.2.3' })
    rmSync(path.join(fixture.targetRelease, 'codex-resources', 'bwrap'))

    const result = runFixture(fixture)

    expect(result.status).toBe(0)
    expect(readFileSync(fixture.downloadCapture, 'utf8')).toBe('download\n')
    expect(
      lstatSync(path.join(fixture.targetRelease, 'codex-resources', 'bwrap'))
        .mode & 0o777,
    ).toBe(0o755)
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
    expect(result.stderr).toContain('action=repair')
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

  it('restores the previous release when the orchestration wrapper receives TERM', async () => {
    const fixture = userFixture({
      failure: 'timeout',
      previousVersion: '1.1.0',
      timeoutSeconds: '30',
    })
    const previousTarget = readlinkSync(fixture.currentLink)
    const transaction = path.join(
      fixture.standaloneRoot,
      '.krav-azure-transaction.json',
    )
    const child = spawn('bash', [orchestrationPath], {
      env: fixture.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      stderr += chunk
    })

    await waitForFile(transaction)
    const contenderMarker = path.join(fixture.root, 'contender-acquired')
    const contender = spawn(
      'bash',
      [
        '-c',
        'exec 9>"$1"; /usr/bin/flock 9; printf acquired >"$2"',
        'bash',
        path.join(fixture.standaloneRoot, 'install.lock'),
        contenderMarker,
      ],
      { stdio: 'ignore' },
    )
    const contenderCompletion = new Promise<void>(resolve =>
      contender.once('exit', () => resolve()),
    )
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(existsSync(contenderMarker)).toBe(false)
    expect(child.kill('SIGTERM')).toBe(true)
    const completion = await new Promise<{
      code: number | null
      signal: NodeJS.Signals | null
    }>(resolve => {
      child.once('exit', (code, signal) => resolve({ code, signal }))
    })
    await contenderCompletion

    expect(completion).toEqual({ code: 143, signal: null })
    expect(readFileSync(contenderMarker, 'utf8')).toBe('acquired')
    expect(stderr).toContain('rollback=signal TERM')
    expect(readlinkSync(fixture.currentLink)).toBe(previousTarget)
    expect(readlinkSync(fixture.launcher)).toBe(
      `${fixture.currentLink}/bin/codex`,
    )
    expect(existsSync(transaction)).toBe(false)
  }, 10_000)

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

  it('retains interrupted recovery evidence if link restoration fails', () => {
    const fixture = userFixture({ previousVersion: '1.1.0' })
    const interruptedScratch = path.join(fixture.scratchRoot, 'run.interrupted')
    const transaction = path.join(
      fixture.standaloneRoot,
      '.krav-azure-transaction.json',
    )
    mkdirSync(interruptedScratch)
    writeFileSync(path.join(interruptedScratch, 'installer.tmp'), 'private\n')
    writeFileSync(
      transaction,
      `${JSON.stringify({
        previousCurrentTarget: readlinkSync(fixture.currentLink),
        previousLauncherTarget: `${fixture.currentLink}/bin/codex`,
        schemaVersion: 1,
        scratchPath: interruptedScratch,
      })}\n`,
      { mode: 0o600 },
    )
    writeFileSync(
      path.join(fixture.fakeBin, 'mv'),
      [
        '#!/usr/bin/env bash',
        `if [ "\${!#}" = ${shellLiteral(fixture.currentLink)} ]; then`,
        '  exit 73',
        'fi',
        'exec /usr/bin/mv "$@"',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(existsSync(transaction)).toBe(true)
    expect(existsSync(interruptedScratch)).toBe(true)
  })

  it('bounds live-lock waiting without removing the upstream lock', async () => {
    const fixture = userFixture({
      previousVersion: '1.1.0',
      timeoutSeconds: '1',
    })
    const lock = path.join(fixture.standaloneRoot, 'install.lock')
    const marker = path.join(fixture.root, 'lock-held')
    const holder = spawn(
      'bash',
      [
        '-c',
        'exec 9>"$1"; /usr/bin/flock 9; printf live-lock >&9; printf held >"$2"; sleep 2',
        'bash',
        lock,
        marker,
      ],
      { stdio: 'ignore' },
    )
    await waitForFile(marker)

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'Timed out waiting for the Codex install lock',
    )
    expect(holder.exitCode).toBeNull()
    expect(existsSync(lock)).toBe(true)
    expect(readFileSync(lock, 'utf8')).toBe('live-lock')
    await new Promise<void>(resolve => holder.once('exit', () => resolve()))
  }, 4_000)

  it('snapshots a concurrent completed update only after acquiring the upstream lock', async () => {
    const fixture = userFixture({
      failure: 'before-activation',
      previousVersion: '1.1.0',
      timeoutSeconds: '3',
    })
    const concurrentTarget = fixture.createCompleteRelease('2.0.0')
    const lock = path.join(fixture.standaloneRoot, 'install.lock')
    const marker = path.join(fixture.root, 'lock-held')
    const holder = spawn(
      'bash',
      [
        '-c',
        'exec 9>"$1"; /usr/bin/flock 9; printf held >"$2"; sleep 0.2; ln -sfn "$3" "$4"',
        'bash',
        lock,
        marker,
        concurrentTarget,
        fixture.currentLink,
      ],
      { stdio: 'ignore' },
    )
    await waitForFile(marker)

    const result = runFixture(fixture)
    await new Promise<void>(resolve => holder.once('exit', () => resolve()))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('previousState=2.0.0 action=resolve')
    expect(readlinkSync(fixture.currentLink)).toBe(concurrentTarget)
    expect(readlinkSync(fixture.launcher)).toBe(
      `${fixture.currentLink}/bin/codex`,
    )
  })

  it('rejects an invocation bound longer than 15 minutes', () => {
    const fixture = userFixture({ timeoutSeconds: '901' })

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('at most 900 seconds')
    expect(existsSync(fixture.environmentCapture)).toBe(false)
  })

  it.each([
    ['symbolic parent', 'symlink'],
    ['non-directory parent', 'file'],
    ['world-writable parent', 'writable'],
  ])('rejects an unsafe scratch %s', (_name, scenario) => {
    const fixture = userFixture()
    const scratchParent = path.join(fixture.root, 'scratch-parent')
    const actualParent = path.join(fixture.root, 'actual-scratch-parent')
    mkdirSync(actualParent)
    if (scenario === 'symlink') {
      symlinkSync(actualParent, scratchParent)
    } else if (scenario === 'file') {
      writeFileSync(scratchParent, 'not a directory\n')
    } else {
      mkdirSync(scratchParent)
      chmodSync(scratchParent, 0o777)
    }
    fixture.env.AZURE_DEV_CODEX_TEMP_ROOT = path.join(scratchParent, 'codex')

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Unsafe Codex managed object')
    expect(result.stderr).toContain('parent')
    expect(existsSync(fixture.environmentCapture)).toBe(false)
  })

  it('retains recovery evidence if an unexpected object blocks rollback', () => {
    const fixture = userFixture({
      failure: 'unsafe-post-activation',
      previousVersion: '1.1.0',
    })

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('recovery record retained')
    expect(
      existsSync(
        path.join(fixture.standaloneRoot, '.krav-azure-transaction.json'),
      ),
    ).toBe(true)
  })

  it('rolls back activation if private scratch cleanup becomes unsafe', () => {
    const fixture = userFixture({
      failure: 'unsafe-scratch',
      previousVersion: '1.1.0',
    })
    const previousTarget = readlinkSync(fixture.currentLink)

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'Refusing unsafe Azure Codex scratch cleanup',
    )
    expect(readlinkSync(fixture.currentLink)).toBe(previousTarget)
  })

  it('removes only recognized owner-controlled stale scratch directories', () => {
    const fixture = userFixture()
    const staleScratch = path.join(fixture.scratchRoot, 'run.Abc123')
    const unrelatedScratch = path.join(fixture.scratchRoot, 'operator-note')
    mkdirSync(staleScratch)
    writeFileSync(path.join(staleScratch, 'partial'), 'stale\n')
    writeFileSync(unrelatedScratch, 'preserve\n')

    const result = runFixture(fixture)

    expect(result.status).toBe(0)
    expect(existsSync(staleScratch)).toBe(false)
    expect(readFileSync(unrelatedScratch, 'utf8')).toBe('preserve\n')
  })

  it.each([
    ['symlink', 'symlink'],
    ['regular file', 'file'],
    ['unexpected owner', 'owner'],
  ])('rejects recognized stale scratch with unsafe %s', (_name, scenario) => {
    const fixture = userFixture()
    const sentinel = path.join(fixture.root, 'sentinel')
    const staleScratch = path.join(fixture.scratchRoot, 'run.Unsafe1')
    writeFileSync(sentinel, 'preserve\n')
    if (scenario === 'symlink') {
      symlinkSync(fixture.root, staleScratch)
    } else if (scenario === 'file') {
      writeFileSync(staleScratch, 'unsafe object\n')
    } else {
      mkdirSync(staleScratch)
      writeFileSync(
        path.join(fixture.fakeBin, 'stat'),
        [
          '#!/usr/bin/env bash',
          `if [ "\${*: -1}" = ${shellLiteral(staleScratch)} ] && [ "\${1-}" = -c ] && [ "\${2-}" = %u:%g ]; then`,
          "  printf '4242:4242\\n'",
          '  exit 0',
          'fi',
          'exec /usr/bin/stat "$@"',
          '',
        ].join('\n'),
        { mode: 0o755 },
      )
    }

    const result = runFixture(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Refusing unsafe stale Azure Codex scratch')
    expect(readFileSync(sentinel, 'utf8')).toBe('preserve\n')
    expect(existsSync(staleScratch)).toBe(true)
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

  it('accepts only the recognized staging envelope without changing its contents', () => {
    const fixture = userFixture()
    const staging = path.join(
      fixture.releasesDir,
      '.staging.1.2.3-beta.1-x86_64-unknown-linux-musl.123',
    )
    mkdirSync(staging)
    writeFileSync(path.join(staging, 'partial'), 'recognized staging\n')

    const result = runFixture(fixture)

    expect(result.status).toBe(0)
    expect(readFileSync(path.join(staging, 'partial'), 'utf8')).toBe(
      'recognized staging\n',
    )
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
      fixture.targetRelease,
      path.join(fixture.targetRelease, 'bin'),
    ]) {
      expect(lstatSync(directory).mode & 0o777).toBe(0o700)
    }
    expect(lstatSync(config).mode & 0o777).toBe(0o600)
    expect(
      lstatSync(path.join(fixture.standaloneRoot, 'install.lock')).mode & 0o777,
    ).toBe(0o600)
    expect(
      lstatSync(path.join(fixture.targetRelease, 'bin', 'codex')).mode & 0o777,
    ).toBe(0o755)
  })

  it.each([
    ['managed-root symlink', 'symlink'],
    ['unexpected managed-root object', 'unexpected'],
    ['unsafe parent ownership', 'owner'],
    ['malformed staging entry', 'invalid-staging'],
    ['unrecognized release symlink', 'release-symlink'],
  ])('fails with remediation for %s', (_name, scenario) => {
    const fixture = userFixture({ fakeOwner: scenario === 'owner' })
    if (scenario === 'symlink') {
      rmSync(fixture.standaloneRoot, { recursive: true })
      symlinkSync(fixture.root, fixture.standaloneRoot)
    } else if (scenario === 'unexpected') {
      writeFileSync(path.join(fixture.standaloneRoot, 'mystery'), 'unsafe\n')
    } else if (scenario === 'invalid-staging') {
      mkdirSync(
        path.join(
          fixture.releasesDir,
          '.staging.1.2.3-x86_64-unknown-linux-musl.not-a-pid',
        ),
      )
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
