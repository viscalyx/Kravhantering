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
const temporaryDirectories = []

function createToolchainFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-ci-runtime-'))
  temporaryDirectories.push(root)
  const systemPrefix = path.join(root, 'usr')
  const localPrefix = path.join(root, 'usr-local')
  const binDir = path.join(systemPrefix, 'bin')
  const libexecDir = path.join(systemPrefix, 'libexec', 'podman')
  const userGeneratorDir = path.join(
    systemPrefix,
    'lib',
    'systemd',
    'user-generators',
  )
  const systemGeneratorDir = path.join(
    systemPrefix,
    'lib',
    'systemd',
    'system-generators',
  )
  const commandLog = path.join(root, 'podman-commands.log')
  const sudoLog = path.join(root, 'sudo-commands.log')
  fs.mkdirSync(binDir, { recursive: true })
  fs.mkdirSync(libexecDir, { recursive: true })
  fs.mkdirSync(userGeneratorDir, { recursive: true })
  fs.mkdirSync(systemGeneratorDir, { recursive: true })

  const podmanPath = path.join(binDir, 'podman')
  const conmonPath = path.join(binDir, 'conmon')
  const crunPath = path.join(binDir, 'crun')
  const generatorPath = path.join(libexecDir, 'quadlet')
  fs.writeFileSync(
    podmanPath,
    [
      '#!/usr/bin/env bash',
      'printf \'%s\\n\' "$*" >>"$CI_FAKE_PODMAN_LOG"',
      'case "$1" in',
      "  --version) printf 'podman version 4.9.3\\n' ;;",
      '  info) printf \'{"host":{"conmon":{"path":"%s"},"ociRuntime":{"path":"%s"}}}\\n\' "$CI_FAKE_CONMON_PATH" "$CI_FAKE_CRUN_PATH" ;;',
      `  run) exit "\${CI_FAKE_RUN_STATUS:-0}" ;;`,
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  for (const [filePath, output] of [
    [conmonPath, 'conmon version 2.1.10'],
    [crunPath, 'crun version 1.14.1'],
    [generatorPath, 'quadlet version 4.9.3'],
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
  const dpkgQueryPath = path.join(binDir, 'dpkg-query')
  fs.writeFileSync(
    dpkgQueryPath,
    [
      '#!/usr/bin/env bash',
      'case "$3" in',
      `  "${podmanPath}"|"${generatorPath}") printf 'podman: %s\\n' "$3" ;;`,
      `  "${conmonPath}") printf 'conmon: %s\\n' "$3" ;;`,
      `  "${crunPath}") printf 'crun: %s\\n' "$3" ;;`,
      '  *) exit 1 ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  const sudoPath = path.join(binDir, 'sudo')
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
    conmonPath,
    crunPath,
    dpkgQueryPath,
    env: {
      ...process.env,
      CI_FAKE_CONMON_PATH: conmonPath,
      CI_FAKE_CRUN_PATH: crunPath,
      CI_FAKE_PODMAN_LOG: commandLog,
      CI_FAKE_SUDO_LOG: sudoLog,
      CI_RUNTIME_DPKG_QUERY_BIN: dpkgQueryPath,
      CI_RUNTIME_GENERATOR_SEARCH_PATH: `${userGeneratorDir}:${systemGeneratorDir}`,
      CI_RUNTIME_LOCAL_PREFIX: localPrefix,
      CI_RUNTIME_SUDO_BIN: sudoPath,
      CI_RUNTIME_SYSTEM_PREFIX: systemPrefix,
      PATH: `${binDir}:${process.env.PATH}`,
    },
    localPrefix,
    root,
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

    const result = runRuntimeScript(['bootstrap', profile], fixture)

    expect(result.status).toBe(0)
    expect(fs.existsSync(preinstalledPath)).toBe(false)
    const commands = fs.readFileSync(fixture.sudoLog, 'utf8')
    expect(commands).toContain(
      'apt-get install -y --no-install-recommends --reinstall conmon crun jq libnss3-tools podman',
    )
    expect(commands.includes('skopeo')).toBe(usesSkopeo)
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
    fs.writeFileSync(path.join(evidenceDirectory, 'ordinary.txt'), 'healthy')
    const oversizedPath = path.join(evidenceDirectory, 'oversized.txt')
    fs.writeFileSync(oversizedPath, '')
    fs.truncateSync(oversizedPath, 5_000_001)
    fs.symlinkSync(
      path.join(evidenceDirectory, 'ordinary.txt'),
      path.join(evidenceDirectory, 'ignored-link'),
    )

    expect(readEvidenceDirectory(path.join(root, 'missing'))).toBe('')
    runRuntimeClassifier([
      '--evidence-dir',
      evidenceDirectory,
      '--output',
      outputPath,
      '--summary',
      summaryPath,
    ])

    expect(fs.readFileSync(outputPath, 'utf8')).toBe(
      'conmon_missing_journald\n',
    )
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
})
