// biome-ignore-all lint/suspicious/noTemplateCurlyInString: The harness exercises literal shell variables.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const bootstrap = readFileSync(
  'scripts/azure-dev/templates/bootstrap-host.sh',
  'utf8',
)
const configureStart = bootstrap.indexOf('configure_codex_podman() {')
const configureEnd = bootstrap.indexOf(
  '\nconfigure_codex_app_server() {',
  configureStart,
)
const validation = readFileSync(
  'scripts/azure-dev/AzureDev.Validation.psm1',
  'utf8',
)
const probeStart = validation.indexOf(
  'systemctl --user is-enabled --quiet podman.socket',
)
const probeEnd = validation.indexOf('\nnode --version', probeStart)

if (configureStart < 0 || configureEnd < 0 || probeStart < 0 || probeEnd < 0) {
  throw new Error('Could not locate Codex Podman setup and validation')
}

function runBootstrap(failure = '') {
  return spawnSync(
    'bash',
    [
      '-c',
      [
        'set -euo pipefail',
        'VSCODE_USER=vscode',
        'VSCODE_HOME=/home/vscode',
        'PODMAN_CLIENT_SOURCE=/tooling/podman-client.sh',
        'WORKSPACE_DIR=/workspace',
        'install() { printf "install: %s\\n" "$*"; [ "$FAILURE" != install ]; }',
        'id() { printf "2042\\n"; }',
        'log() { printf "%s\\n" "$*"; }',
        'run_user_systemctl() {',
        '  printf "systemctl: %s\\n" "$*"',
        '  [ "$FAILURE" != socket ]',
        '}',
        'run_codex_as_vscode() {',
        '  printf "codex: %s\\n" "$*"',
        '  [ "$FAILURE" != client ]',
        '}',
        bootstrap.slice(configureStart, configureEnd),
        'configure_codex_podman',
      ].join('\n'),
    ],
    { encoding: 'utf8', env: { ...process.env, FAILURE: failure } },
  )
}

function runProbe(failure = '') {
  return spawnSync(
    'bash',
    [
      '-c',
      [
        'set -euo pipefail',
        'XDG_RUNTIME_DIR=/run/user/2042',
        'systemctl() { printf "systemctl: %s\\n" "$*"; }',
        'codex() {',
        '  [ "$1 $2 $3 $4 $5 $6" = "sandbox -P kravhantering-development -C /workspace --" ]',
        '  shift 6',
        '  "$@"',
        '}',
        'podman() {',
        '  [ "$CONTAINER_HOST" = unix:///run/user/2042/podman/podman.sock ] || return 51',
        '  [ "$FAILURE" != "$1" ] || return 52',
        '  printf "podman: %s\\n" "$*" >&2',
        '  if [ "$1" = info ]; then',
        '    printf "%s\\n" "$GRAPH_ROOT"',
        '  fi',
        '}',
        'export -f podman',
        validation.slice(probeStart, probeEnd),
      ].join('\n'),
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        FAILURE: failure,
        GRAPH_ROOT:
          failure === 'storage'
            ? '/wrong/storage'
            : '/home/vscode/.local/share/containers/storage',
      },
    },
  )
}

describe('Azure Codex Podman connection', () => {
  it('enables the rootless socket before testing the sandbox client for the actual UID', () => {
    const result = runBootstrap()

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.split('\n')).toEqual([
      'install: -o vscode -g vscode -m 0755 /tooling/podman-client.sh /home/vscode/.local/bin/podman',
      'systemctl: 2042 enable --now podman.socket',
      'codex: 2042 sandbox -P kravhantering-development -C /workspace -- env CONTAINER_HOST=unix:///run/user/2042/podman/podman.sock podman info --format {{.Store.GraphRoot}}',
      'Codex rootless Podman API connection configured and validated',
      '',
    ])
  })

  it.each(['install', 'socket', 'client'])(
    'fails provisioning when the %s fails',
    failure => {
      const result = runBootstrap(failure)

      expect(result.status).toBe(1)
      expect(result.stdout.trim().split('\n')).toHaveLength(
        ['install', 'socket', 'client'].indexOf(failure) + 1,
      )
    },
  )

  it('tests the existing store and an automatically removed container through the sandbox connection', () => {
    const result = runProbe()

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(
      'systemctl: --user is-enabled --quiet podman.socket',
    )
    expect(result.stdout).toContain(
      'systemctl: --user is-active --quiet podman.socket',
    )
    expect(result.stderr).toContain(
      'podman: info --format {{.Store.GraphRoot}}',
    )
    expect(result.stderr).toContain('podman: ps --format {{.Names}}')
    expect(result.stderr).toContain(
      'podman: run --rm --pull=never --network none --read-only --cap-drop=all --security-opt=no-new-privileges --entrypoint node localhost/kravhantering/hsa-directory-mock:local',
    )
  })

  it.each(['info', 'ps', 'run', 'storage'])(
    'fails smoke validation on a %s failure',
    failure => {
      const result = runProbe(failure)

      expect(result.status).toBeGreaterThan(0)
    },
  )
})
