import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  classifyRuntimeEvidence,
  formatRuntimeClassification,
  parseRuntimeClassifierArguments,
  readEvidenceDirectory,
  runRuntimeClassifier,
} from '../containers/classify-ci-runtime-evidence.mjs'

const SCRIPT_PATH = path.resolve(
  process.cwd(),
  'scripts/containers/ci-container-runtime.sh',
)
const CLASSIFIER_PATH = path.resolve(
  process.cwd(),
  'scripts/containers/classify-ci-runtime-evidence.mjs',
)
const temporaryDirectories = []

function createRuntimeToolchain({ prefix, profile }) {
  const versions =
    profile === 'static'
      ? {
          conmon: '2.2.1',
          crun: '1.28',
          podman: '5.8.4',
        }
      : {
          conmon: '2.1.10',
          crun: '1.14.1',
          podman: '4.9.3',
        }
  const binDir = path.join(prefix, 'bin')
  const libexecDir = path.join(prefix, 'libexec', 'podman')
  const userGeneratorDir = path.join(
    prefix,
    'lib',
    'systemd',
    'user-generators',
  )
  const systemGeneratorDir = path.join(
    prefix,
    'lib',
    'systemd',
    'system-generators',
  )
  const conmonPath =
    profile === 'static'
      ? path.join(prefix, 'lib', 'podman', 'conmon')
      : path.join(binDir, 'conmon')
  fs.mkdirSync(binDir, { recursive: true })
  fs.mkdirSync(libexecDir, { recursive: true })
  fs.mkdirSync(path.dirname(conmonPath), { recursive: true })
  fs.mkdirSync(userGeneratorDir, { recursive: true })
  fs.mkdirSync(systemGeneratorDir, { recursive: true })

  const podmanPath = path.join(binDir, 'podman')
  const crunPath = path.join(binDir, 'crun')
  const generatorPath = path.join(libexecDir, 'quadlet')
  fs.writeFileSync(
    podmanPath,
    [
      '#!/usr/bin/env bash',
      'printf \'%s\\n\' "$*" >>"$CI_FAKE_PODMAN_LOG"',
      '[[ "$1" == "--log-level=debug" ]] && shift',
      'case "$1" in',
      `  --version) printf 'podman version ${versions.podman}\\n' ;;`,
      '  info)',
      `    sleep "\${CI_FAKE_INFO_DELAY_SECONDS:-0}"`,
      `    printf '{"host":{"conmon":{"path":"%s"},"ociRuntime":{"path":"%s"}}}\\n' "\${CI_FAKE_CONMON_PATH:-${conmonPath}}" "\${CI_FAKE_CRUN_PATH:-${crunPath}}"`,
      '    ;;',
      `  run) exit "\${CI_FAKE_RUN_STATUS:-0}" ;;`,
      `  system) [[ "$2 $3" == "reset --force" ]] && exit "\${CI_FAKE_RESET_STATUS:-0}" ;;`,
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  for (const [filePath, output] of [
    [conmonPath, `conmon version ${versions.conmon}`],
    [crunPath, `crun version ${versions.crun}`],
    [generatorPath, `quadlet version ${versions.podman}`],
  ]) {
    fs.writeFileSync(
      filePath,
      `#!/usr/bin/env bash\nprintf '%s\\n' '${output}'\n`,
      { mode: 0o755 },
    )
  }
  fs.symlinkSync(
    generatorPath,
    path.join(userGeneratorDir, 'podman-user-generator'),
  )
  fs.symlinkSync(
    generatorPath,
    path.join(systemGeneratorDir, 'podman-system-generator'),
  )

  return {
    binDir,
    conmonPath,
    crunPath,
    generatorPath,
    podmanPath,
    systemGeneratorDir,
    userGeneratorDir,
  }
}

function createToolchainFixture({ toolchain = 'package' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-ci-runtime-'))
  temporaryDirectories.push(root)
  const systemPrefix = path.join(root, 'usr')
  const localPrefix = path.join(root, 'usr-local')
  const commandLog = path.join(root, 'podman-commands.log')
  const githubPathFile = path.join(root, 'github-path')
  const sudoLog = path.join(root, 'sudo-commands.log')
  const containersConfigPath = path.join(root, 'etc', 'containers.conf')
  const runtimeDropInPath = path.join(
    root,
    'etc',
    'containers.conf.d',
    '00-fix-runtime.conf',
  )
  const packageToolchain = createRuntimeToolchain({
    prefix: systemPrefix,
    profile: 'package',
  })
  const staticToolchain =
    toolchain === 'static'
      ? createRuntimeToolchain({
          prefix: localPrefix,
          profile: 'static',
        })
      : null
  const selectedToolchain = staticToolchain ?? packageToolchain
  const fakeBinDir = path.join(root, 'fake-bin')
  fs.mkdirSync(fakeBinDir, { recursive: true })
  const dpkgQueryPath = path.join(fakeBinDir, 'dpkg-query')
  fs.writeFileSync(
    dpkgQueryPath,
    [
      '#!/usr/bin/env bash',
      'case "$3" in',
      `  "${packageToolchain.podmanPath}"|"${packageToolchain.generatorPath}") printf 'podman: %s\\n' "$3" ;;`,
      `  "${packageToolchain.conmonPath}") printf 'conmon: %s\\n' "$3" ;;`,
      `  "${packageToolchain.crunPath}") printf 'crun: %s\\n' "$3" ;;`,
      '  *) exit 1 ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  const sudoPath = path.join(fakeBinDir, 'sudo')
  fs.writeFileSync(
    sudoPath,
    [
      '#!/usr/bin/env bash',
      'printf \'%s\\n\' "$*" >>"$CI_FAKE_SUDO_LOG"',
      'if [[ "$1" == rm ]]; then "$@"; fi',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )

  return {
    commandLog,
    conmonPath: selectedToolchain.conmonPath,
    crunPath: selectedToolchain.crunPath,
    dpkgQueryPath,
    env: {
      ...process.env,
      GH_TOKEN: '',
      GITHUB_ACTIONS: 'true',
      GITHUB_PATH: githubPathFile,
      GITHUB_REPOSITORY: '',
      GITHUB_RUN_ID: '',
      CI_FAKE_PODMAN_LOG: commandLog,
      CI_FAKE_SUDO_LOG: sudoLog,
      CI_RUNTIME_DPKG_QUERY_BIN: dpkgQueryPath,
      CI_RUNTIME_GENERATOR_SEARCH_PATH: [
        staticToolchain?.userGeneratorDir,
        staticToolchain?.systemGeneratorDir,
        packageToolchain.userGeneratorDir,
        packageToolchain.systemGeneratorDir,
      ]
        .filter(Boolean)
        .join(':'),
      CI_RUNTIME_LOCAL_PREFIX: localPrefix,
      CI_RUNTIME_COMMAND_TIMEOUT_SECONDS: '5',
      CI_RUNTIME_CONTAINERS_CONF: containersConfigPath,
      CI_RUNTIME_RUNNER_RUNTIME_DROP_IN: runtimeDropInPath,
      CI_RUNTIME_SUDO_BIN: sudoPath,
      CI_RUNTIME_SYSTEM_PREFIX: systemPrefix,
      PATH: [
        fakeBinDir,
        selectedToolchain.binDir,
        packageToolchain.binDir,
        process.env.PATH,
      ].join(':'),
    },
    githubPathFile,
    localPrefix,
    containersConfigPath,
    root,
    runtimeDropInPath,
    systemPrefix,
    sudoLog,
  }
}

function runRuntimeScript(args, fixture, env = {}) {
  return childProcess.spawnSync('bash', [SCRIPT_PATH, ...args], {
    encoding: 'utf8',
    env: { ...fixture.env, ...env },
  })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true })
  }
})

describe('CI container runtime', () => {
  it('accepts one package-owned Podman, conmon, crun, and Quadlet toolchain', () => {
    const fixture = createToolchainFixture()

    const result = runRuntimeScript(['verify'], fixture)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('coherent package toolchain: verified')
  })

  it('rejects Podman selecting conmon from another toolchain source', () => {
    const fixture = createToolchainFixture()
    const foreignConmon = path.join(
      fixture.localPrefix,
      'lib',
      'podman',
      'conmon',
    )

    const result = runRuntimeScript(['verify'], fixture, {
      CI_FAKE_CONMON_PATH: foreignConmon,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      `Podman selected unexpected conmon: ${foreignConmon}`,
    )
  })

  it.each([
    ['pr', false],
    ['release', true],
  ])('bootstraps the coherent %s package profile', (profile, usesSkopeo) => {
    const fixture = createToolchainFixture()
    const preinstalledPath = path.join(
      fixture.localPrefix,
      'lib',
      'podman',
      'conmon',
    )
    fs.mkdirSync(path.dirname(preinstalledPath), { recursive: true })
    fs.writeFileSync(preinstalledPath, 'foreign toolchain')
    fs.mkdirSync(path.dirname(fixture.containersConfigPath), {
      recursive: true,
    })
    fs.writeFileSync(
      fixture.containersConfigPath,
      [
        '# static runner Podman configuration',
        '[engine]',
        'cgroup_manager = "cgroupfs"',
        'events_logger="file"',
        '',
      ].join('\n'),
    )
    fs.mkdirSync(path.dirname(fixture.runtimeDropInPath), { recursive: true })
    fs.writeFileSync(
      fixture.runtimeDropInPath,
      '[engine.runtimes]\ncrun = ["/usr/local/bin/crun"]\n',
    )

    const result = runRuntimeScript(['bootstrap', profile], fixture)

    expect(result.status).toBe(0)
    expect(fs.existsSync(preinstalledPath)).toBe(false)
    expect(fs.existsSync(fixture.containersConfigPath)).toBe(false)
    expect(fs.existsSync(fixture.runtimeDropInPath)).toBe(false)
    expect(fs.readFileSync(fixture.commandLog, 'utf8')).toContain(
      'system reset --force',
    )
    expect(result.stdout).toContain(
      'existing rootless Podman runtime state: reset',
    )
    const commands = fs.readFileSync(fixture.sudoLog, 'utf8')
    expect(commands).toContain(
      'apt-get install -y --no-install-recommends --reinstall conmon crun jq libnss3-tools podman',
    )
    expect(commands.includes('skopeo')).toBe(usesSkopeo)
  })

  it.each([
    ['pr', false],
    ['release', true],
  ])(
    'replaces a coherent static runner toolchain for the %s profile',
    (profile, usesSkopeo) => {
      const fixture = createToolchainFixture({ toolchain: 'static' })
      fs.mkdirSync(path.dirname(fixture.containersConfigPath), {
        recursive: true,
      })
      fs.writeFileSync(
        fixture.containersConfigPath,
        '[engine]\ncgroup_manager="cgroupfs"\nevents_logger="file"\n',
      )
      fs.mkdirSync(path.dirname(fixture.runtimeDropInPath), {
        recursive: true,
      })
      fs.writeFileSync(
        fixture.runtimeDropInPath,
        '[engine.runtimes]\ncrun=["/usr/local/bin/crun"]\n',
      )

      const result = runRuntimeScript(['bootstrap', profile], fixture)

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('coherent package toolchain: verified')
      const podmanCommands = fs.readFileSync(fixture.commandLog, 'utf8')
      expect(podmanCommands).toContain('--log-level=debug info --format json')
      expect(podmanCommands).toContain('system reset --force')
      const sudoCommands = fs.readFileSync(fixture.sudoLog, 'utf8')
      expect(sudoCommands).toContain(
        'apt-get install -y --no-install-recommends --reinstall conmon crun jq libnss3-tools podman',
      )
      expect(sudoCommands.includes('skopeo')).toBe(usesSkopeo)
      expect(
        fs.existsSync(path.join(fixture.localPrefix, 'bin', 'podman')),
      ).toBe(false)
      expect(
        fs.existsSync(path.join(fixture.localPrefix, 'lib', 'podman')),
      ).toBe(false)
      expect(fs.existsSync(fixture.containersConfigPath)).toBe(false)
      expect(fs.existsSync(fixture.runtimeDropInPath)).toBe(false)
      expect(fs.readFileSync(fixture.githubPathFile, 'utf8')).toBe(
        `${fixture.systemPrefix}/bin\n`,
      )
    },
  )

  it('aborts bootstrap before replacing binaries when Podman reset fails', () => {
    const fixture = createToolchainFixture({ toolchain: 'static' })
    const preinstalledPath = path.join(
      fixture.localPrefix,
      'lib',
      'podman',
      'conmon',
    )

    const result = runRuntimeScript(['bootstrap', 'pr'], fixture, {
      CI_FAKE_RESET_STATUS: '42',
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'cannot reset the existing rootless Podman runtime state (exit 42)',
    )
    expect(fs.existsSync(preinstalledPath)).toBe(true)
    expect(
      fs.existsSync(fixture.sudoLog)
        ? fs.readFileSync(fixture.sudoLog, 'utf8')
        : '',
    ).not.toContain('apt-get')
  })

  it('refuses to reset Podman state outside an ephemeral GitHub Actions runner', () => {
    const fixture = createToolchainFixture()

    const result = runRuntimeScript(['bootstrap', 'pr'], fixture, {
      GITHUB_ACTIONS: '',
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'refusing to reset rootless Podman state outside GitHub Actions',
    )
    expect(
      fs.existsSync(fixture.commandLog)
        ? fs.readFileSync(fixture.commandLog, 'utf8')
        : '',
    ).not.toContain('system reset')
    expect(
      fs.existsSync(fixture.sudoLog)
        ? fs.readFileSync(fixture.sudoLog, 'utf8')
        : '',
    ).not.toContain('apt-get')
  })

  it('bounds Podman inspection so a runtime lock cannot consume the job timeout', () => {
    const fixture = createToolchainFixture()

    const result = runRuntimeScript(['verify'], fixture, {
      CI_FAKE_INFO_DELAY_SECONDS: '2',
      CI_RUNTIME_COMMAND_TIMEOUT_SECONDS: '1',
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'cannot inspect the selected Podman runtime toolchain (exit 124)',
    )
    expect(fs.readFileSync(fixture.commandLog, 'utf8')).toContain(
      '--log-level=debug info --format json',
    )
  })

  it('cleans its pinned journald preflight resources after failure', () => {
    const fixture = createToolchainFixture()

    const result = runRuntimeScript(['preflight'], fixture, {
      CI_FAKE_RUN_STATUS: '126',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_RUN_ID: '123',
    })

    expect(result.status).not.toBe(0)
    const commands = fs.readFileSync(fixture.commandLog, 'utf8')
    expect(commands).toContain(
      'run --pull=always --name kravhantering-runtime-preflight-123-2 --log-driver=journald',
    )
    expect(commands).toContain(
      'rm --force kravhantering-runtime-preflight-123-2',
    )
    expect(
      commands
        .split('\n')
        .filter(
          command =>
            command === 'rm --force kravhantering-runtime-preflight-123-2',
        ),
    ).toHaveLength(2)
    expect(commands).toContain('image rm --force')
  })

  it('collects the safe runtime evidence contract without environment values', () => {
    const fixture = createToolchainFixture()
    const evidenceDirectory = path.join(fixture.root, 'evidence')
    const secret = 'must-not-appear-in-runtime-evidence'

    const result = runRuntimeScript(['collect'], fixture, {
      CI_RUNTIME_EVIDENCE_DIR: evidenceDirectory,
      ImageOS: 'ubuntu24',
      ImageVersion: '20260810.271.1',
      UNRELATED_SECRET: secret,
    })

    expect(result.status).toBe(0)
    expect(fs.readdirSync(evidenceDirectory)).toEqual(
      expect.arrayContaining([
        'classification.txt',
        'free.txt',
        'kernel-oom.txt',
        'meminfo.txt',
        'podman-info.json',
        'runner.json',
        'runner-platform.txt',
        'runtime-components.txt',
        'service-cgroups.txt',
        'top-process-rss.txt',
      ]),
    )
    expect(
      fs.readFileSync(path.join(evidenceDirectory, 'runner.json'), 'utf8'),
    ).toContain('20260810.271.1')
    const completeEvidence = fs
      .readdirSync(evidenceDirectory)
      .filter(file => fs.statSync(path.join(evidenceDirectory, file)).isFile())
      .map(file => fs.readFileSync(path.join(evidenceDirectory, file), 'utf8'))
      .join('\n')
    expect(completeEvidence).not.toContain(secret)
  })

  it('bounds Podman inspection while collecting runtime evidence', () => {
    const fixture = createToolchainFixture()
    const evidenceDirectory = path.join(fixture.root, 'evidence')

    const result = runRuntimeScript(['collect'], fixture, {
      CI_FAKE_INFO_DELAY_SECONDS: '2',
      CI_RUNTIME_COMMAND_TIMEOUT_SECONDS: '1',
      CI_RUNTIME_EVIDENCE_DIR: evidenceDirectory,
    })

    expect(result.status).toBe(0)
    expect(
      fs.readFileSync(path.join(evidenceDirectory, 'podman-info.json'), 'utf8'),
    ).not.toContain('ociRuntime')
    expect(
      fs.readFileSync(
        path.join(evidenceDirectory, 'classification.txt'),
        'utf8',
      ),
    ).toContain('unknown')
  })

  it('defers current-job runner metadata until the job has completed', () => {
    const fixture = createToolchainFixture()
    const evidenceDirectory = path.join(fixture.root, 'evidence')
    const ghCallLog = path.join(fixture.root, 'gh-calls.log')
    const ghPath = path.join(fixture.root, 'usr', 'bin', 'gh')
    fs.writeFileSync(
      ghPath,
      [
        '#!/usr/bin/env bash',
        'printf \'%s\\n\' "$*" >>"$CI_FAKE_GH_CALL_LOG"',
        'exit 99',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )

    const result = runRuntimeScript(['collect'], fixture, {
      CI_FAKE_GH_CALL_LOG: ghCallLog,
      CI_RUNTIME_EVIDENCE_DIR: evidenceDirectory,
      GH_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'viscalyx/Kravhantering',
      GITHUB_RUN_ID: '12345',
    })

    expect(result.status).toBe(0)
    expect(fs.existsSync(ghCallLog)).toBe(false)
    expect(
      fs.existsSync(path.join(evidenceDirectory, 'github-runner-metadata.txt')),
    ).toBe(false)
  })

  it('records provenance for runtime paths selected outside the package toolchain', () => {
    const fixture = createToolchainFixture()
    const evidenceDirectory = path.join(fixture.root, 'evidence')
    const foreignConmon = path.join(
      fixture.localPrefix,
      'lib',
      'podman',
      'conmon',
    )
    fs.mkdirSync(path.dirname(foreignConmon), { recursive: true })
    fs.writeFileSync(
      foreignConmon,
      "#!/usr/bin/env bash\nprintf '%s\\n' 'foreign conmon 9.9.9'\n",
      { mode: 0o755 },
    )

    const result = runRuntimeScript(['collect'], fixture, {
      CI_FAKE_CONMON_PATH: foreignConmon,
      CI_RUNTIME_EVIDENCE_DIR: evidenceDirectory,
    })

    expect(result.status).toBe(0)
    const components = fs.readFileSync(
      path.join(evidenceDirectory, 'runtime-components.txt'),
      'utf8',
    )
    expect(components).toContain(`resolved=${foreignConmon}`)
    expect(components).toContain('foreign conmon 9.9.9')
    expect(components).toContain(
      childProcess.execFileSync('sha256sum', [foreignConmon], {
        encoding: 'utf8',
      }),
    )
  })

  it('extracts secret-safe runner metadata from job logs with escape sequences', () => {
    const fixture = createToolchainFixture()
    const evidenceDirectory = path.join(fixture.root, 'runner-evidence')
    const ghPath = path.join(fixture.root, 'usr', 'bin', 'gh')
    fs.writeFileSync(
      ghPath,
      [
        '#!/usr/bin/env bash',
        'if [[ "$*" == "api --help" ]]; then',
        "  printf '%s\\n' '      --allow-escape-sequences   Allow printing terminal escape sequences'",
        'elif [[ "$*" == *"/jobs?filter=latest"* ]]; then',
        '  printf \'%s\\n\' \'{"jobs":[{"id":123,"name":"Build and Smoke Test Container Stack","status":"completed"}]}\'',
        'elif [[ "$*" != *"--allow-escape-sequences"* ]]; then',
        "  printf '%s\\n' 'the response contains terminal escape sequences' >&2",
        '  exit 1',
        'else',
        "  printf '\\033[36;1m%s\\033[0m\\n' 'colored job command'",
        "  printf '%s\\n' 'Current runner version: 2.999.0'",
        "  printf '%s\\n' 'Runner Image Provisioner'",
        "  printf '%s\\n' 'Hosted Compute Agent'",
        "  printf '%s\\n' 'Version: 20260810.271'",
        "  printf '%s\\n' 'Commit: 0123456789abcdef0123456789abcdef01234567'",
        "  printf '%s\\n' 'Build Date: 2026-08-10T10:11:12Z'",
        "  printf '%s\\n' 'Runner Image'",
        "  printf '%s\\n' 'Image: ubuntu-24.04'",
        "  printf '%s\\n' 'Version: 20260810.271.1'",
        "  printf '%s\\n' 'UNRELATED_SECRET=2.0.999.1'",
        'fi',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )

    const result = runRuntimeScript(['collect-runner-metadata'], fixture, {
      CI_RUNTIME_EVIDENCE_DIR: evidenceDirectory,
      CI_RUNTIME_TARGET_JOB: 'Build and Smoke Test Container Stack',
      GH_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'viscalyx/Kravhantering',
      GITHUB_RUN_ID: '12345',
    })

    expect(result.status).toBe(0)
    const metadata = fs.readFileSync(
      path.join(evidenceDirectory, 'github-runner-metadata.txt'),
      'utf8',
    )
    expect(metadata).toContain('Hosted Compute Agent')
    expect(metadata).toContain('Version: 20260810.271')
    expect(metadata).toContain('Image: ubuntu-24.04')
    expect(metadata).not.toContain('UNRELATED_SECRET')
  })

  it('collects runner metadata with GitHub CLI versions before escape filtering', () => {
    const fixture = createToolchainFixture()
    const evidenceDirectory = path.join(fixture.root, 'runner-evidence')
    const ghPath = path.join(fixture.root, 'usr', 'bin', 'gh')
    fs.writeFileSync(
      ghPath,
      [
        '#!/usr/bin/env bash',
        'if [[ "$*" == "api --help" ]]; then',
        '  exit 0',
        'elif [[ "$*" == *"/jobs?filter=latest"* ]]; then',
        '  printf \'%s\\n\' \'{"jobs":[{"id":123,"name":"Build and Smoke Test Container Stack","status":"completed"}]}\'',
        'elif [[ "$*" == *"--allow-escape-sequences"* ]]; then',
        "  printf '%s\\n' 'unknown flag: --allow-escape-sequences' >&2",
        '  exit 1',
        'else',
        "  printf '%s\\n' 'Runner Image Provisioner'",
        "  printf '%s\\n' 'Hosted Compute Agent'",
        "  printf '%s\\n' 'Version: 20260707.563'",
        "  printf '%s\\n' 'Runner Image'",
        "  printf '%s\\n' 'Image: ubuntu-24.04'",
        'fi',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )

    const result = runRuntimeScript(['collect-runner-metadata'], fixture, {
      CI_RUNTIME_EVIDENCE_DIR: evidenceDirectory,
      CI_RUNTIME_TARGET_JOB: 'Build and Smoke Test Container Stack',
      GH_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'viscalyx/Kravhantering',
      GITHUB_RUN_ID: '12345',
    })

    expect(result.status).toBe(0)
    expect(
      fs.readFileSync(
        path.join(evidenceDirectory, 'github-runner-metadata.txt'),
        'utf8',
      ),
    ).toContain('Version: 20260707.563')
  })

  it('reports bounded safe diagnostics when the job log request fails', () => {
    const fixture = createToolchainFixture()
    const evidenceDirectory = path.join(fixture.root, 'runner-evidence')
    const ghPath = path.join(fixture.root, 'usr', 'bin', 'gh')
    fs.writeFileSync(
      ghPath,
      [
        '#!/usr/bin/env bash',
        'if [[ "$*" == "--version" ]]; then',
        "  printf '%s\\n' 'gh version 2.97.0 (fixture)'",
        'elif [[ "$*" == "api --help" ]]; then',
        "  printf '%s\\n' '      --allow-escape-sequences'",
        'elif [[ "$*" == *"/jobs?filter=latest"* ]]; then',
        '  printf \'%s\\n\' \'{"jobs":[{"id":456,"name":"Build and Smoke Test Container Stack","status":"completed"}]}\'',
        'else',
        "  printf '\\033[31m%s\\033[0m\\n' 'simulated job log API failure' >&2",
        '  exit 1',
        'fi',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )

    const result = runRuntimeScript(['collect-runner-metadata'], fixture, {
      CI_RUNTIME_EVIDENCE_DIR: evidenceDirectory,
      CI_RUNTIME_TARGET_JOB: 'Build and Smoke Test Container Stack',
      GH_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'viscalyx/Kravhantering',
      GITHUB_RUN_ID: '12345',
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'GitHub target job log request failed for job 456',
    )
    expect(result.stderr).toContain('gh version 2.97.0 (fixture)')
    expect(result.stderr).toContain('simulated job log API failure')
    expect(result.stderr).not.toContain('\u001b')
    expect(
      fs.readFileSync(
        path.join(evidenceDirectory, 'github-runner-metadata.txt'),
        'utf8',
      ),
    ).toContain('simulated job log API failure')
  })

  it('rejects completed runner metadata without image and provisioner identities', () => {
    const fixture = createToolchainFixture()
    const evidenceDirectory = path.join(fixture.root, 'runner-evidence')
    const ghPath = path.join(fixture.root, 'usr', 'bin', 'gh')
    fs.writeFileSync(
      ghPath,
      [
        '#!/usr/bin/env bash',
        'if [[ "$*" == *"/jobs?filter=latest"* ]]; then',
        '  printf \'%s\\n\' \'{"jobs":[{"id":123,"name":"Build and Smoke Test Container Stack","status":"completed"}]}\'',
        'else',
        "  printf '%s\\n' 'Current runner version: 2.999.0'",
        'fi',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )

    const result = runRuntimeScript(['collect-runner-metadata'], fixture, {
      CI_RUNTIME_EVIDENCE_DIR: evidenceDirectory,
      CI_RUNTIME_TARGET_JOB: 'Build and Smoke Test Container Stack',
      GH_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'viscalyx/Kravhantering',
      GITHUB_RUN_ID: '12345',
    })

    expect(result.status).not.toBe(0)
    expect(
      fs.readFileSync(
        path.join(evidenceDirectory, 'github-runner-metadata.txt'),
        'utf8',
      ),
    ).toContain('incomplete')
  })
})

describe('CI runtime failure classification', () => {
  it('classifies every known infrastructure signature independently', () => {
    const evidence = [
      'Include journald in compilation path to log to systemd journal',
      'memory.events\noom_kill 2',
      'kernel: Out of memory: Killed process 123 (node)',
      'write failed: No space left on device',
      'Job for kravhantering-sqlserver.service timed out',
    ].join('\n')

    expect(classifyRuntimeEvidence(evidence)).toEqual([
      'conmon_missing_journald',
      'cgroup_oom',
      'host_oom',
      'disk_exhausted',
      'service_timeout',
    ])
  })

  it('reports unknown when no known infrastructure signature is present', () => {
    expect(classifyRuntimeEvidence('application assertion failed')).toEqual([
      'unknown',
    ])
    expect(formatRuntimeClassification(['unknown'])).toBe(
      'Container runtime classification: `unknown`',
    )
  })

  it('reads bounded nested evidence and writes the artifact and summary', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-classifier-'))
    temporaryDirectories.push(root)
    const evidenceDirectory = path.join(root, 'evidence')
    const nestedDirectory = path.join(evidenceDirectory, 'nested')
    const outputPath = path.join(root, 'classification.txt')
    const summaryPath = path.join(root, 'summary.md')
    fs.mkdirSync(nestedDirectory, { recursive: true })
    fs.writeFileSync(
      path.join(nestedDirectory, 'journal.txt'),
      'Include journald in compilation path',
    )
    const symlinkTarget = path.join(root, 'ordinary.txt')
    fs.writeFileSync(symlinkTarget, 'memory.events\noom_kill 2')
    const oversizedPath = path.join(evidenceDirectory, 'oversized.txt')
    fs.writeFileSync(oversizedPath, 'No space left on device')
    fs.truncateSync(oversizedPath, 5_000_001)
    fs.symlinkSync(symlinkTarget, path.join(evidenceDirectory, 'ignored-link'))

    expect(readEvidenceDirectory(path.join(root, 'missing'))).toBe('')
    runRuntimeClassifier([
      '--evidence-dir',
      evidenceDirectory,
      '--output',
      outputPath,
      '--summary',
      summaryPath,
    ])

    const classification = fs.readFileSync(outputPath, 'utf8')
    expect(classification).toBe('conmon_missing_journald\n')
    expect(classification).not.toContain('cgroup_oom')
    expect(classification).not.toContain('disk_exhausted')
    expect(fs.readFileSync(summaryPath, 'utf8')).toBe(
      'Container runtime classification: `conmon_missing_journald`\n',
    )
  })

  it('validates classifier command options', () => {
    expect(
      parseRuntimeClassifierArguments([
        '--evidence-dir',
        '/evidence',
        '--output',
        '/classification.txt',
      ]),
    ).toEqual({
      evidenceDirectories: ['/evidence'],
      output: '/classification.txt',
    })
    expect(() => parseRuntimeClassifierArguments(['--output'])).toThrow(
      'Missing value',
    )
    expect(() =>
      parseRuntimeClassifierArguments(['--unknown', 'value']),
    ).toThrow('Unsupported option')
    expect(() =>
      parseRuntimeClassifierArguments(['--output', '/classification.txt']),
    ).toThrow('at least one --evidence-dir')
    expect(() =>
      parseRuntimeClassifierArguments(['--evidence-dir', '/evidence']),
    ).toThrow('at least one --evidence-dir')
  })

  it('runs the classifier CLI through a symbolic link', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-classifier-link-'))
    temporaryDirectories.push(root)
    const evidenceDirectory = path.join(root, 'evidence')
    const outputPath = path.join(root, 'classification.txt')
    const symlinkPath = path.join(root, 'classify-runtime-evidence.mjs')
    fs.mkdirSync(evidenceDirectory)
    fs.writeFileSync(
      path.join(evidenceDirectory, 'disk.txt'),
      'No space left on device',
    )
    fs.symlinkSync(CLASSIFIER_PATH, symlinkPath)

    const result = childProcess.spawnSync(
      process.execPath,
      [
        symlinkPath,
        '--evidence-dir',
        evidenceDirectory,
        '--output',
        outputPath,
      ],
      { encoding: 'utf8' },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      'Container runtime classification: `disk_exhausted`',
    )
    expect(fs.readFileSync(outputPath, 'utf8')).toBe('disk_exhausted\n')
  })
})
