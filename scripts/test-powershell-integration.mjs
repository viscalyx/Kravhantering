import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PESTER_VERSION = '6.0.1'
export const POWERSHELL_IMAGE = 'mcr.microsoft.com/powershell:7.4-ubuntu-22.04'
export const DOCKER_PHASE_TIMEOUT_MS = 30 * 60 * 1000

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..')

function bindMount(source, target, readOnly = false) {
  if (source.includes(',')) {
    throw new Error(`Docker bind-mount paths cannot contain commas: ${source}`)
  }
  return [
    '--mount',
    `type=bind,source=${source},target=${target}${readOnly ? ',readonly' : ''}`,
  ]
}

function containerUserArgs() {
  if (
    typeof process.getuid !== 'function' ||
    typeof process.getgid !== 'function'
  ) {
    return []
  }
  return ['--user', `${process.getuid()}:${process.getgid()}`]
}

export function createPesterInstallArgs({ moduleCache }) {
  const installCommand = [
    "$ErrorActionPreference = 'Stop'",
    `Save-Module -Name Pester -RequiredVersion ${PESTER_VERSION} ` +
      '-Repository PSGallery -Path /pester-modules -Force',
  ].join('; ')

  return [
    'run',
    '--rm',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,size=256m',
    ...containerUserArgs(),
    ...bindMount(moduleCache, '/pester-modules'),
    '--env',
    'HOME=/tmp/pester-home',
    '--env',
    'POWERSHELL_TELEMETRY_OPTOUT=1',
    POWERSHELL_IMAGE,
    'pwsh',
    '-NoLogo',
    '-NoProfile',
    '-Command',
    installCommand,
  ]
}

export function createPesterTestArgs({
  moduleCache,
  passwdFile,
  repositoryRoot,
  resultDir,
}) {
  const testCommand = [
    "$ErrorActionPreference = 'Stop'",
    `Import-Module Pester -RequiredVersion ${PESTER_VERSION} -Force`,
    '$configuration = New-PesterConfiguration',
    "$configuration.Run.Path = @('tests/powershell/Unit', 'tests/powershell/Integration')",
    '$configuration.Run.Exit = $true',
    "$configuration.Output.Verbosity = 'Detailed'",
    "$configuration.Output.StackTraceVerbosity = 'Full'",
    '$configuration.Should.DisableV5 = $true',
    "$configuration.TestResult.OutputFormat = 'NUnitXml'",
    "$configuration.TestResult.OutputPath = 'test-results/pester/NUnitXml.xml'",
    'Invoke-Pester -Configuration $configuration',
  ].join('; ')

  return [
    'run',
    '--rm',
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--pids-limit=256',
    '--tmpfs',
    '/tmp:rw,exec,nosuid,nodev,size=512m',
    ...containerUserArgs(),
    ...bindMount(repositoryRoot, '/workspace', true),
    ...bindMount(moduleCache, '/pester-modules', true),
    ...bindMount(resultDir, '/workspace/test-results/pester'),
    ...(passwdFile ? bindMount(passwdFile, '/etc/passwd', true) : []),
    '--workdir',
    '/workspace',
    '--env',
    'HOME=/tmp/pester-home',
    '--env',
    'PSModulePath=/pester-modules',
    '--env',
    'POWERSHELL_TELEMETRY_OPTOUT=1',
    '--env',
    'KRAVHANTERING_PESTER_INTEGRATION=1',
    POWERSHELL_IMAGE,
    'pwsh',
    '-NoLogo',
    '-NoProfile',
    '-Command',
    testCommand,
  ]
}

export function runDocker(args, phase, spawn = spawnSync) {
  const result = spawn('docker', args, {
    stdio: 'inherit',
    timeout: DOCKER_PHASE_TIMEOUT_MS,
  })
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`${phase} timed out after ${DOCKER_PHASE_TIMEOUT_MS} ms.`)
  }
  if (result.error) {
    throw new Error(`${phase} could not start Docker: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`${phase} failed with exit code ${result.status}`)
  }
}

export function runPowerShellIntegrationTests({
  repositoryRoot = REPOSITORY_ROOT,
} = {}) {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kravhantering-pester-'),
  )

  try {
    const resolvedRepositoryRoot = fs.realpathSync(repositoryRoot)
    const moduleCache = path.join(temporaryRoot, 'modules')
    const passwdFile = path.join(temporaryRoot, 'passwd')
    const resultDir = path.join(
      resolvedRepositoryRoot,
      'test-results',
      'pester',
    )
    fs.mkdirSync(moduleCache, { recursive: true })
    fs.mkdirSync(resultDir, { recursive: true })
    if (
      typeof process.getuid === 'function' &&
      typeof process.getgid === 'function'
    ) {
      fs.writeFileSync(
        passwdFile,
        `pester:x:${process.getuid()}:${process.getgid()}:Pester:/tmp/pester-home:/bin/sh\n`,
        { mode: 0o600 },
      )
    }
    const resolvedResultDir = fs.realpathSync(resultDir)
    const relativeResultDir = path.relative(
      resolvedRepositoryRoot,
      resolvedResultDir,
    )
    if (
      relativeResultDir.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeResultDir)
    ) {
      throw new Error('Pester result directory resolves outside the repository')
    }
    fs.rmSync(path.join(resolvedResultDir, 'NUnitXml.xml'), { force: true })

    runDocker(
      createPesterInstallArgs({ moduleCache }),
      'Pester installation container',
    )
    runDocker(
      createPesterTestArgs({
        moduleCache,
        passwdFile: fs.existsSync(passwdFile) ? passwdFile : undefined,
        repositoryRoot: resolvedRepositoryRoot,
        resultDir: resolvedResultDir,
      }),
      'Isolated Pester integration-test container',
    )
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    runPowerShellIntegrationTests()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
