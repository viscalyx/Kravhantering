// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Contract tests assert literal shell interpolation syntax.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const bootstrapPath = path.join(
  process.cwd(),
  'scripts/azure-dev/templates/bootstrap-host.sh',
)
const bootstrap = readFileSync(bootstrapPath, 'utf8')
const functionStart = bootstrap.indexOf('configure_codex_app_server() {')
const functionEnd = bootstrap.indexOf('\nrun_user_podman() {', functionStart)

if (functionStart < 0 || functionEnd < 0) {
  throw new Error(
    'Could not locate configure_codex_app_server in bootstrap-host.sh',
  )
}

const configureCodexAppServer = bootstrap.slice(functionStart, functionEnd)
const temporaryDirectories: string[] = []
const expectedVersion = '1.2.3'
const expectedSocket =
  '/home/vscode/.codex/app-server-control/app-server-control.sock'
const validVersionResult = {
  appServerVersion: expectedVersion,
  backend: 'pid',
  cliVersion: expectedVersion,
  managedCodexPath: '/home/vscode/.codex/packages/standalone/current/bin/codex',
  managedCodexVersion: expectedVersion,
  socketPath: expectedSocket,
  status: 'running',
}

interface FixtureOptions {
  failCommand?: 'enable' | 'restart' | 'version'
  versionResult?: Record<string, unknown>
}

function runFixture(options: FixtureOptions = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'azure-codex-daemon-'))
  temporaryDirectories.push(root)
  const unitDirectory = path.join(root, 'systemd', 'user')
  const unitPath = path.join(unitDirectory, 'krav-codex-app-server.service')
  const systemctlCapture = path.join(root, 'systemctl.txt')
  const harness = [
    'set -euo pipefail',
    `VSCODE_USER=${userInfo().username}`,
    'VSCODE_HOME=/home/vscode',
    'VSCODE_TEMP_DIR=/var/tmp/krav-vscode',
    'CODEX_HOME_DIR=/home/vscode/.codex',
    'CODEX_MANAGED_LAUNCHER=/home/vscode/.local/bin/codex',
    'CODEX_MANAGED_PATH=/home/vscode/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    'CODEX_APP_SERVER_UNIT_NAME=krav-codex-app-server.service',
    'CODEX_APP_SERVER_UNIT_DIR="$UNIT_DIRECTORY"',
    'CODEX_APP_SERVER_UNIT_PATH="$UNIT_PATH"',
    `codex_target_version=${expectedVersion}`,
    'log() { printf "%s\\n" "$*" >&2; }',
    'run_user_systemctl() {',
    '  [ "${FAIL_COMMAND:-}" != "$2" ] || return 42',
    '  printf "%s\\n" "$*" >> "$SYSTEMCTL_CAPTURE"',
    '}',
    'run_user_systemctl_or_diagnose() {',
    '  local uid="$1"',
    '  shift 2',
    '  run_user_systemctl "$uid" "$@"',
    '}',
    'run_codex_as_vscode() {',
    '  [ "$4" = version ] || return 43',
    '  [ "${FAIL_COMMAND:-}" != version ] || return 44',
    '  printf "%s\\n" "$VERSION_RESULT"',
    '}',
    configureCodexAppServer,
    'configure_codex_app_server',
  ].join('\n')

  const result = spawnSync('bash', ['-c', harness], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FAIL_COMMAND: options.failCommand ?? '',
      SYSTEMCTL_CAPTURE: systemctlCapture,
      UNIT_DIRECTORY: unitDirectory,
      UNIT_PATH: unitPath,
      VERSION_RESULT: JSON.stringify(
        options.versionResult ?? validVersionResult,
      ),
    },
  })

  return { result, systemctlCapture, unitPath }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('Azure Codex app-server bootstrap', () => {
  it('installs a boot service and accepts matching CLI and server versions', () => {
    const target = runFixture()

    expect(target.result.status, target.result.stderr).toBe(0)
    expect(readFileSync(target.unitPath, 'utf8')).toContain(
      'ExecStart=/home/vscode/.local/bin/codex app-server daemon bootstrap',
    )
    expect(readFileSync(target.unitPath, 'utf8')).toContain(
      'WantedBy=default.target',
    )
    expect(readFileSync(target.systemctlCapture, 'utf8')).toContain(
      'enable krav-codex-app-server.service',
    )
    expect(readFileSync(target.systemctlCapture, 'utf8')).toContain(
      'restart krav-codex-app-server.service',
    )
    expect(target.result.stderr).toContain(
      'shared Codex app-server daemon bootstrapped and ready',
    )
  })

  it('rejects an unexpected daemon backend', () => {
    const target = runFixture({
      versionResult: { ...validVersionResult, backend: 'systemd' },
    })

    expect(target.result.status).toBe(1)
    expect(target.result.stderr).toContain(
      'shared Codex app-server daemon failed readiness validation',
    )
  })

  it('rejects a running daemon whose app-server version drifted', () => {
    const target = runFixture({
      versionResult: { ...validVersionResult, appServerVersion: '9.9.9' },
    })

    expect(target.result.status).toBe(1)
    expect(target.result.stderr).toContain(
      'shared Codex app-server daemon failed readiness validation',
    )
  })

  it.each(['enable', 'restart', 'version'] as const)(
    'reports a failed %s command',
    failCommand => {
      const target = runFixture({ failCommand })

      expect(target.result.status).toBeGreaterThan(0)
      if (failCommand === 'version') {
        expect(target.result.stderr).toContain(
          'shared Codex app-server daemon did not become reachable',
        )
      }
    },
  )
})
