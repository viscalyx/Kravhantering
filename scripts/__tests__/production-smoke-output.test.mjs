import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const PRODUCTION_SMOKE_PATH = path.resolve(
  process.cwd(),
  'scripts/containers/production-smoke.sh',
)
const TRUST_CONTAINER_CA_PATH = path.resolve(
  process.cwd(),
  '.devcontainer/trust-container-ca.sh',
)
const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true })
  }
})

function runReadinessProbe(failures) {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kh-production-smoke-output-'),
  )
  temporaryDirectories.push(temporaryDirectory)
  const countPath = path.join(temporaryDirectory, 'probe-count')
  fs.writeFileSync(countPath, '0')

  const shell = String.raw`
    source "$1"
    cleanup_config_temp() { :; }
    service_systemctl() { printf '%s\n' active; }
    sleep() { :; }
    curl() {
      local count
      count="$(($(<"$PROBE_COUNT_PATH") + 1))"
      printf '%s' "$count" >"$PROBE_COUNT_PATH"
      if (( count > PROBE_FAILURES )); then
        printf '%s' 200
        return 0
      fi
      if (( count % 2 == 0 )); then
        printf '%s' 000
        return 7
      fi
      printf '%s' 503
      return 22
    }
    wait_for_url \
      'https://kravhantering.test/api/ready' \
      'application readiness after SQL Server restart'
  `
  const result = childProcess.spawnSync(
    'bash',
    ['-c', shell, 'bash', PRODUCTION_SMOKE_PATH],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PROBE_COUNT_PATH: countPath,
        PROBE_FAILURES: String(failures),
      },
    },
  )
  return { countPath, result }
}

function runKeycloakRecoveryProbe(failures, maxAttempts = 60) {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kh-keycloak-recovery-output-'),
  )
  temporaryDirectories.push(temporaryDirectory)
  const countPath = path.join(temporaryDirectory, 'probe-count')
  fs.writeFileSync(countPath, '0')

  const shell = String.raw`
    source "$1"
    cleanup_config_temp() { :; }
    sleep() { :; }
    collect_keycloak_recovery_failure_evidence() {
      printf '%s\n' collected >"$EVIDENCE_DIR/keycloak-recovery-failure-collected.txt"
    }
    as_service() {
      local count
      count="$(($(<"$PROBE_COUNT_PATH") + 1))"
      printf '%s' "$count" >"$PROBE_COUNT_PATH"
      if (( count > PROBE_FAILURES )); then
        printf '%s\n' '{"issuer":"https://kravhantering.test/auth/realms/kravhantering-production"}'
        return 0
      fi
      if (( count % 2 == 0 )); then
        printf '%s\n' 'wget: server returned error: HTTP/1.1 503 Service Unavailable' >&2
      else
        printf '%s\n' "wget: can't connect to remote host (10.89.1.25): Connection refused" >&2
      fi
      return 1
    }
    wait_for_keycloak_recovery \
      'http://keycloak-recovery:8080/realms/kravhantering-production/.well-known/openid-configuration' \
      'isolated Keycloak backup recovery discovery' \
      "$MAX_ATTEMPTS"
  `
  const result = childProcess.spawnSync(
    'bash',
    ['-c', shell, 'bash', PRODUCTION_SMOKE_PATH],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        MAX_ATTEMPTS: String(maxAttempts),
        PROBE_COUNT_PATH: countPath,
        PROBE_FAILURES: String(failures),
        PRODUCTION_SMOKE_EVIDENCE_DIR: temporaryDirectory,
      },
    },
  )
  return { countPath, result, temporaryDirectory }
}

function runCaTrust(updateStatus) {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kh-ca-trust-output-'),
  )
  temporaryDirectories.push(temporaryDirectory)
  const binDirectory = path.join(temporaryDirectory, 'bin')
  const caPath = path.join(temporaryDirectory, 'ca.crt')
  const homeDirectory = path.join(temporaryDirectory, 'home')
  fs.mkdirSync(binDirectory)
  fs.mkdirSync(homeDirectory)
  fs.writeFileSync(caPath, 'test certificate')
  fs.writeFileSync(
    path.join(binDirectory, 'sudo'),
    [
      '#!/usr/bin/env bash',
      'if [[ "$1" == -n && "$2" == true ]]; then exit 0; fi',
      'if [[ "$1" == cp ]]; then exit 0; fi',
      'exec "$@"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  fs.writeFileSync(
    path.join(binDirectory, 'certutil'),
    '#!/usr/bin/env bash\nexit 0\n',
    { mode: 0o755 },
  )
  fs.writeFileSync(
    path.join(binDirectory, 'update-ca-certificates'),
    [
      '#!/usr/bin/env bash',
      "printf '%s\\n' 'rehash: warning: skipping ca-certificates.crt' >&2",
      "if (( CA_UPDATE_STATUS != 0 )); then printf '%s\\n' 'certificate update failed' >&2; fi",
      'exit "$CA_UPDATE_STATUS"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )

  return childProcess.spawnSync('bash', [TRUST_CONTAINER_CA_PATH, caPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CA_UPDATE_STATUS: String(updateStatus),
      HOME: homeDirectory,
      PATH: `${binDirectory}:${process.env.PATH}`,
    },
  })
}

function renderHsaSmokeConfiguration() {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kh-hsa-smoke-config-'),
  )
  temporaryDirectories.push(temporaryDirectory)
  const appEnvPath = path.join(temporaryDirectory, 'app.env')
  const serviceHome = path.join(temporaryDirectory, 'service-home')
  const configRoot = path.join(temporaryDirectory, 'config')
  fs.writeFileSync(
    appEnvPath,
    [
      'AUTH_OIDC_ISSUER_URL=https://kravhantering.test/auth/realms/kravhantering-test',
      'AUTH_OIDC_CLIENT_SECRET=',
      'AUTH_SESSION_COOKIE_PASSWORD=',
      'HSA_PERSON_LOOKUP_URL=http://localhost:8000/hsa/person-records/lookup',
      'DB_TRUST_SERVER_CERTIFICATE=true',
      '',
    ].join('\n'),
  )

  const shell = `
    source "$1"
    SERVICE_HOME="$2"
    CONFIG_ROOT="$3"
    INSTALL_ROOT=/opt/kravhantering
    HSA_DIRECTORY_MOCK_IMAGE_REF=test/hsa-directory-mock:latest
    HSA_MTLS_PROVISIONER_IMAGE_REF=test/hsa-mtls-provisioner:latest
    HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF=test/hsa-person-lookup-adapter:latest
    KONG_IMAGE_REF=test/kong:latest
    configure_smoke_app_env \
      "$4" smoke-test-client-secret smoke-test-cookie-password
    as_service() { "$@"; }
    render_ci_overlay
  `
  const result = childProcess.spawnSync(
    'bash',
    [
      '-c',
      shell,
      'bash',
      PRODUCTION_SMOKE_PATH,
      serviceHome,
      configRoot,
      appEnvPath,
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  )
  const kongUnitPath = path.join(
    serviceHome,
    '.config/containers/systemd/kravhantering-ci-kong.container',
  )
  return {
    appEnv: fs.readFileSync(appEnvPath, 'utf8'),
    configRoot,
    kongUnit: fs.existsSync(kongUnitPath)
      ? fs.readFileSync(kongUnitPath, 'utf8')
      : '',
    result,
  }
}

function runHsaRotationEvidenceHarness({
  finalizeMode = 'success',
  selectionMode = 'valid',
} = {}) {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kh-hsa-rotation-evidence-'),
  )
  temporaryDirectories.push(temporaryDirectory)
  const shell = String.raw`
    set -euo pipefail
    source "$1"
    EVIDENCE_DIR="$2"
    current=initial-generation
    previous=null
    rotation=0
    finalize_attempt=0
    HSA_MTLS_FORCE_VERIFY_FAILURE=0
    mkdir -p "$EVIDENCE_DIR"
    as_service() { "$@"; }
    capture_hsa_stale_probe() { mkdir -p "$2"; }
    stop_hsa_mtls_endpoints() { printf '%s\n' stop >>"$EVIDENCE_DIR/order.txt"; }
    start_hsa_mtls_endpoints() { printf '%s\n' start >>"$EVIDENCE_DIR/order.txt"; }
    wait_for_url() { :; }
    verify_hsa_stale_rejection() { return 0; }
    verify_hsa_correlated_lookup() {
      [[ "$HSA_MTLS_FORCE_VERIFY_FAILURE" != 1 ]] || return 1
      printf '%s\n' \
        'correlation-id=10000000-0000-4000-8000-000000000001' \
        'app-correlation=passed' \
        'kong-correlation=passed' \
        'adapter-correlation=passed' \
        'mock-exactly-once=passed' \
        >>"$EVIDENCE_DIR/hsa-mtls-correlation.txt"
    }
    run_hsa_mtls_provisioner() {
      local command="$1" domain='' before
      [[ $# -lt 2 ]] || domain="$2"
      case "$command" in
        inspect)
          if [[ "$finalize_attempt" -gt 0 && "$HSA_TEST_SELECTION_MODE" != valid ]]; then
            case "$HSA_TEST_SELECTION_MODE" in
              missing-previous)
                jq -n --arg current "$current" '{result:{selection:{current:$current}}}'
                ;;
              false-previous)
                jq -n --arg current "$current" '{result:{selection:{current:$current,previous:false}}}'
                ;;
              empty-previous)
                jq -n --arg current "$current" '{result:{selection:{current:$current,previous:""}}}'
                ;;
              number-previous)
                jq -n --arg current "$current" '{result:{selection:{current:$current,previous:42}}}'
                ;;
              object-previous)
                jq -n --arg current "$current" '{result:{selection:{current:$current,previous:{}}}}'
                ;;
              array-previous)
                jq -n --arg current "$current" '{result:{selection:{current:$current,previous:[]}}}'
                ;;
              missing-current)
                jq -n --arg previous "$previous" '{result:{selection:{previous:$previous}}}'
                ;;
              false-current)
                jq -n --arg previous "$previous" '{result:{selection:{current:false,previous:$previous}}}'
                ;;
              empty-current)
                jq -n --arg previous "$previous" '{result:{selection:{current:"",previous:$previous}}}'
                ;;
              number-current)
                jq -n --arg previous "$previous" '{result:{selection:{current:42,previous:$previous}}}'
                ;;
              object-current)
                jq -n --arg previous "$previous" '{result:{selection:{current:{},previous:$previous}}}'
                ;;
              array-current)
                jq -n --arg previous "$previous" '{result:{selection:{current:[],previous:$previous}}}'
                ;;
              *) return 2 ;;
            esac
            return
          fi
          jq -n \
            --arg current "$current" \
            --argjson previous "$( [[ "$previous" == null ]] && printf null || jq -Rn --arg value "$previous" '$value' )" \
            --arg digest "$current" \
            '{result:{selection:{current:$current,previous:$previous},current:{trustDomains:{"app-to-kong":{ca:{digestSha256:$digest,subjectRfc2253:"ca"},client:{digestSha256:$digest,subjectRfc2253:"client"},server:{digestSha256:$digest,subjectRfc2253:"server"}},"kong-to-adapter":{ca:{digestSha256:$digest,subjectRfc2253:"ca"},client:{digestSha256:$digest,subjectRfc2253:"client"},server:{digestSha256:$digest,subjectRfc2253:"server"}},"adapter-to-hsa":{ca:{digestSha256:$digest,subjectRfc2253:"ca"},client:{digestSha256:$digest,subjectRfc2253:"client"},server:{digestSha256:$digest,subjectRfc2253:"server"}}}}}}'
          ;;
        rotate)
          before="$current"
          rotation=$((rotation + 1))
          finalize_attempt=0
          current="$domain-generation-$rotation"
          previous="$before"
          ;;
        finalize)
          finalize_attempt=$((finalize_attempt + 1))
          [[ "$HSA_TEST_FINALIZE_MODE" != mismatch ]] || current=concurrent-generation
          printf 'expected=%s current=%s\n' "$domain" "$current" \
            >>"$EVIDENCE_DIR/finalize.txt"
          [[ "$domain" == "$current" ]] || return 1
          case "$HSA_TEST_FINALIZE_MODE" in
            success) previous=null; return 0 ;;
            ambiguous-complete) previous=null; return 1 ;;
            retry-success)
              if [[ "$finalize_attempt" -eq 1 ]]; then return 1; fi
              previous=null
              return 0
              ;;
            persistent-failure) return 1 ;;
            *) return 2 ;;
          esac
          ;;
        rollback)
          before="$current"
          current="$previous"
          previous=null
          printf 'deleted=%s\n' "$before" >>"$EVIDENCE_DIR/rollback.txt"
          ;;
        deploy) : ;;
      esac
    }
    verify_hsa_mtls_rotation_and_rollback
  `
  const result = childProcess.spawnSync(
    'bash',
    ['-c', shell, 'bash', PRODUCTION_SMOKE_PATH, temporaryDirectory],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        HSA_TEST_FINALIZE_MODE: finalizeMode,
        HSA_TEST_SELECTION_MODE: selectionMode,
      },
    },
  )
  return { result, temporaryDirectory }
}

function runHsaEndpointRestartHarness() {
  const shell = String.raw`
    set -euo pipefail
    source "$1"
    service_systemctl() { printf '%s\n' "$*"; }
    restart_hsa_mtls_endpoints
  `
  return childProcess.spawnSync(
    'bash',
    ['-c', shell, 'bash', PRODUCTION_SMOKE_PATH],
    { encoding: 'utf8' },
  )
}

function runHsaCorrelationEvidenceHarness() {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kh-hsa-correlation-evidence-'),
  )
  temporaryDirectories.push(temporaryDirectory)
  const correlationId = '10000000-0000-4000-8000-000000000001'
  const shell = String.raw`
    set -euo pipefail
    source "$1"
    EVIDENCE_DIR="$2"
    HSA_TEST_CORRELATION_ID="$3"
    mkdir -p "$EVIDENCE_DIR"
    date() { printf '%s\n' '2026-08-24T10:17:41+00:00'; }
    npm() { :; }
    as_service() {
      local last_arg
      printf '%s\n' "$*" >>"$EVIDENCE_DIR/log-sources.txt"
      if [[ "$1" == podman && "$2" == logs ]]; then
        for last_arg in "$@"; do :; done
        case "$last_arg" in
          kravhantering-ci-kong)
            printf '%s\n' "$HSA_TEST_CORRELATION_ID"
            ;;
          kravhantering-ci-hsa-person-lookup-adapter)
            printf '{"correlation_id":"%s","event":"hsa_adapter_lookup_forwarded"}\n' "$HSA_TEST_CORRELATION_ID"
            ;;
          kravhantering-ci-hsa-directory-mock)
            printf '{"correlation_id":"%s","event":"hsa_mock_lookup_handled","handling_count":1}\n' "$HSA_TEST_CORRELATION_ID"
            ;;
          *) return 2 ;;
        esac
        return
      fi
      for last_arg in "$@"; do :; done
      case "$last_arg" in
        kravhantering-app-runtime.service)
          printf '{"correlation_id":"%s","event":"hsa_app_lookup_started"}\n' "$HSA_TEST_CORRELATION_ID"
          ;;
        kravhantering-ci-kong.service)
          printf '%s\n' 'detached-container-id-without-correlation-evidence'
          ;;
        kravhantering-ci-hsa-person-lookup-adapter.service)
          printf '%s\n' 'detached-adapter-container-id-without-correlation-evidence'
          ;;
        kravhantering-ci-hsa-directory-mock.service)
          printf '%s\n' 'detached-mock-container-id-without-correlation-evidence'
          ;;
        *) return 2 ;;
      esac
    }
    verify_hsa_correlated_lookup
  `
  const result = childProcess.spawnSync(
    'bash',
    [
      '-c',
      shell,
      'bash',
      PRODUCTION_SMOKE_PATH,
      temporaryDirectory,
      correlationId,
    ],
    { encoding: 'utf8' },
  )
  return { result, temporaryDirectory }
}

function runHsaStaleProbeHarness() {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kh-hsa-stale-probe-'),
  )
  temporaryDirectories.push(temporaryDirectory)
  const argumentsPath = path.join(temporaryDirectory, 'podman-arguments.txt')
  const shell = String.raw`
    set -euo pipefail
    source "$1"
    INSTALL_ROOT=/opt/kravhantering
    APP_RUNTIME_IMAGE_REF=test/app-runtime:latest
    HSA_TEST_ARGUMENTS_PATH="$3"
    as_service() {
      local argument previous=''
      if [[ "$1" == "$INSTALL_ROOT/current/bin/kravhantering-quadlet.sh" ]]; then
        printf '%s\n' kravhantering-egress
        return
      fi
      printf '%s\n' "$*" >"$HSA_TEST_ARGUMENTS_PATH"
      for argument in "$@"; do
        if [[ "$previous" == --user && "$argument" == 0 ]]; then
          return
        fi
        previous="$argument"
      done
      printf '%s\n' 'EACCES: permission denied, open /runtime/stale/ca.crt' >&2
      return 13
    }
    verify_hsa_stale_rejection app-to-kong "$2"
  `
  const result = childProcess.spawnSync(
    'bash',
    [
      '-c',
      shell,
      'bash',
      PRODUCTION_SMOKE_PATH,
      temporaryDirectory,
      argumentsPath,
    ],
    { encoding: 'utf8' },
  )
  return { argumentsPath, result }
}

function runHsaPkiLifecycle(operation, exitStatus) {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kh-hsa-pki-cleanup-'),
  )
  temporaryDirectories.push(temporaryDirectory)
  const pkiDirectory = path.join(temporaryDirectory, 'config/secrets/hsa-mtls')
  fs.mkdirSync(path.join(pkiDirectory, '.staging'), { recursive: true })
  fs.writeFileSync(path.join(pkiDirectory, 'app-client.crt'), 'certificate')
  fs.writeFileSync(path.join(pkiDirectory, 'app-client.key'), 'private key')
  fs.writeFileSync(path.join(pkiDirectory, '.staging/pending'), 'staged')

  const shell = `
    source "$1"
    sudo() { "$@"; }
    case "$2" in
      up|verify) cleanup_config_temp ;;
      down) down ;;
    esac
    exit "$3"
  `
  const result = childProcess.spawnSync(
    'bash',
    ['-c', shell, 'bash', PRODUCTION_SMOKE_PATH, operation, String(exitStatus)],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PRODUCTION_SMOKE_CONFIG_ROOT: path.join(temporaryDirectory, 'config'),
        PRODUCTION_SMOKE_SERVICE_USER: 'hsa-cleanup-user-does-not-exist',
      },
    },
  )
  return { pkiDirectory, result, temporaryDirectory }
}

describe('production smoke output', () => {
  it('reconciles HSA support services in dependency order after a topology transition', () => {
    const result = runHsaEndpointRestartHarness()

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.trim().split('\n')).toEqual([
      'stop kravhantering-app-runtime.service',
      'stop kravhantering-ci-kong.service',
      'stop kravhantering-ci-hsa-person-lookup-adapter.service',
      'stop kravhantering-ci-hsa-directory-mock.service',
      'start kravhantering-ci-hsa-directory-mock.service',
      'start kravhantering-ci-hsa-person-lookup-adapter.service',
      'start kravhantering-ci-kong.service',
      'start kravhantering-app-runtime.service',
      'start kravhantering-single-node.target',
    ])
  })

  it('reads HSA sidecar correlation evidence from detached container logs', () => {
    const { result, temporaryDirectory } = runHsaCorrelationEvidenceHarness()

    expect(result.status, result.stderr).toBe(0)
    expect(
      fs.readFileSync(
        path.join(temporaryDirectory, 'hsa-mtls-correlation.txt'),
        'utf8',
      ),
    ).toContain('kong-correlation=passed')
    expect(
      fs.readFileSync(path.join(temporaryDirectory, 'log-sources.txt'), 'utf8'),
    ).toContain(
      'podman logs --since 2026-08-24T10:17:41+00:00 kravhantering-ci-kong',
    )
    expect(
      fs.readFileSync(path.join(temporaryDirectory, 'log-sources.txt'), 'utf8'),
    ).toContain(
      'podman logs --since 2026-08-24T10:17:41+00:00 kravhantering-ci-hsa-person-lookup-adapter',
    )
    expect(
      fs.readFileSync(path.join(temporaryDirectory, 'log-sources.txt'), 'utf8'),
    ).toContain(
      'podman logs --since 2026-08-24T10:17:41+00:00 kravhantering-ci-hsa-directory-mock',
    )
  })

  it('reads service-owned stale HSA material as root in the rootless probe', () => {
    const { argumentsPath, result } = runHsaStaleProbeHarness()

    expect(result.status, result.stderr).toBe(0)
    expect(fs.readFileSync(argumentsPath, 'utf8')).toContain(
      'podman run --rm --pull=never --network kravhantering-egress --user 0',
    )
  })

  it.each(['up', 'verify'])(
    'preserves host-mounted App PKI after successful release-smoke %s cleanup',
    command => {
      const { pkiDirectory, result, temporaryDirectory } = runHsaPkiLifecycle(
        command,
        0,
      )

      try {
        expect(result.status).toBe(0)
        expect(fs.existsSync(pkiDirectory)).toBe(true)
        expect(fs.existsSync(path.join(pkiDirectory, 'app-client.key'))).toBe(
          true,
        )
        expect(fs.existsSync(path.join(pkiDirectory, '.staging'))).toBe(true)
      } finally {
        fs.rmSync(temporaryDirectory, { force: true, recursive: true })
      }
    },
  )

  it.each([
    { exitStatus: 0, lifecycle: 'success' },
    { exitStatus: 23, lifecycle: 'failure' },
  ])(
    'removes host-mounted ephemeral App PKI from down on $lifecycle',
    ({ exitStatus }) => {
      const { pkiDirectory, result, temporaryDirectory } = runHsaPkiLifecycle(
        'down',
        exitStatus,
      )

      try {
        expect(result.status).toBe(exitStatus)
        expect(fs.existsSync(pkiDirectory)).toBe(false)
        expect(fs.existsSync(path.join(pkiDirectory, 'app-client.key'))).toBe(
          false,
        )
        expect(fs.existsSync(path.join(pkiDirectory, '.staging'))).toBe(false)
      } finally {
        fs.rmSync(temporaryDirectory, { force: true, recursive: true })
      }
    },
  )

  it('emits mandatory evidence after successful rotations and recovered failures', () => {
    const { result, temporaryDirectory } = runHsaRotationEvidenceHarness()

    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toBe('')
    const rotationEvidence = fs.readFileSync(
      path.join(temporaryDirectory, 'hsa-mtls-rotation.txt'),
      'utf8',
    )
    expect(
      rotationEvidence.match(/authenticated-lookup-after-rotation=passed/gu),
    ).toHaveLength(3)
    expect(
      rotationEvidence.match(/ca-and-both-leaves-changed=passed/gu),
    ).toHaveLength(3)
    expect(
      rotationEvidence.match(/stale-material-rejected=passed/gu),
    ).toHaveLength(3)
    expect(
      rotationEvidence.match(/injected-failure-rollback=passed/gu),
    ).toHaveLength(3)
    expect(
      rotationEvidence.match(/authenticated-lookup-after-rollback=passed/gu),
    ).toHaveLength(3)
    expect(
      fs
        .readFileSync(
          path.join(temporaryDirectory, 'hsa-mtls-correlation.txt'),
          'utf8',
        )
        .match(/mock-exactly-once=passed/gu),
    ).toHaveLength(6)
    expect(
      fs.readFileSync(path.join(temporaryDirectory, 'rollback.txt'), 'utf8'),
    ).toContain('deleted=')
    const finalizationEvidence = fs.readFileSync(
      path.join(temporaryDirectory, 'finalize.txt'),
      'utf8',
    )
    expect(finalizationEvidence.match(/expected=.* current=.*/gu)).toHaveLength(
      3,
    )
    for (const line of finalizationEvidence.trim().split('\n')) {
      const match = /^expected=(\S+) current=(\S+)$/u.exec(line)
      expect(match?.[1]).toBe(match?.[2])
    }
  })

  it('rejects release-smoke finalization after the selected generation changes', () => {
    const { result, temporaryDirectory } = runHsaRotationEvidenceHarness({
      finalizeMode: 'mismatch',
    })

    expect(result.status).not.toBe(0)
    expect(
      fs.readFileSync(path.join(temporaryDirectory, 'finalize.txt'), 'utf8'),
    ).toContain('current=concurrent-generation')
  })

  it('accepts release-smoke cleanup completed behind a failed finalize command', () => {
    const { result, temporaryDirectory } = runHsaRotationEvidenceHarness({
      finalizeMode: 'ambiguous-complete',
    })

    expect(result.status, result.stderr).toBe(0)
    expect(
      fs
        .readFileSync(path.join(temporaryDirectory, 'finalize.txt'), 'utf8')
        .trim()
        .split('\n'),
    ).toHaveLength(3)
  })

  it('retries release-smoke pending cleanup and accepts a completed retry', () => {
    const { result, temporaryDirectory } = runHsaRotationEvidenceHarness({
      finalizeMode: 'retry-success',
    })

    expect(result.status, result.stderr).toBe(0)
    expect(
      fs
        .readFileSync(path.join(temporaryDirectory, 'finalize.txt'), 'utf8')
        .trim()
        .split('\n'),
    ).toHaveLength(6)
  })

  it('fails release smoke after one retry leaves prior cleanup pending', () => {
    const { result, temporaryDirectory } = runHsaRotationEvidenceHarness({
      finalizeMode: 'persistent-failure',
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('remains pending after finalization retry')
    expect(
      fs
        .readFileSync(path.join(temporaryDirectory, 'finalize.txt'), 'utf8')
        .trim()
        .split('\n'),
    ).toHaveLength(2)
  })

  it.each([
    'missing-previous',
    'false-previous',
    'empty-previous',
    'number-previous',
    'object-previous',
    'array-previous',
    'missing-current',
    'false-current',
    'empty-current',
    'number-current',
    'object-current',
    'array-current',
  ])('fails release smoke for malformed %s selection state', selectionMode => {
    const { result } = runHsaRotationEvidenceHarness({ selectionMode })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('invalid HSA mTLS selection')
  })

  it('renders the CI-only HSA route with verified HTTPS', () => {
    const { appEnv, kongUnit, result } = renderHsaSmokeConfiguration()

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(appEnv).toContain(
      'HSA_PERSON_LOOKUP_URL=https://kong:8443/hsa/person-records/lookup',
    )
    expect(appEnv).toContain('AUTH_OIDC_CLIENT_SECRET=smoke-test-client-secret')
    expect(appEnv).toContain(
      'AUTH_SESSION_COOKIE_PASSWORD=smoke-test-cookie-password',
    )
    expect(kongUnit).toContain(
      'Environment="KONG_PROXY_LISTEN=0.0.0.0:8443 ssl"',
    )
    expect(kongUnit).toContain(
      'Environment=KONG_SSL_CERT=/run/kravhantering/hsa-mtls/kong-server.crt',
    )
    expect(kongUnit).toContain(
      'Volume=kravhantering-ci-hsa-mtls-kong.volume:/run/kravhantering/hsa-mtls:ro,Z',
    )
    expect(appEnv).toContain(
      `HSA_PERSON_LOOKUP_CA_PATH=/run/secrets/kravhantering/hsa-mtls/kong-server-ca.crt`,
    )
    expect(kongUnit).toContain('Environment=KONG_PREFIX=/tmp/kong')
    expect(kongUnit).toContain('PodmanArgs=--group-add=keep-groups')
    expect(kongUnit).toContain(
      'Tmpfs=/tmp:rw,size=64M,mode=1777,U,nosuid,nodev,noexec',
    )
    expect(kongUnit).not.toContain('@@CONFIG_ROOT@@')
  })

  it('summarizes expected readiness retries with lifecycle context', () => {
    const { countPath, result } = runReadinessProbe(12)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain(
      'Lifecycle transition: application readiness after SQL Server restart.',
    )
    expect(result.stdout).toContain('failed curl probes')
    expect(result.stdout).toContain('are expected until startup completes')
    expect(result.stdout).toContain('last probe: HTTP 503; attempt 1/90')
    expect(result.stdout).toContain(
      'last probe: connection unavailable; attempt 10/90',
    )
    expect(result.stdout).toContain(
      'Ready: application readiness after SQL Server restart',
    )
    expect(result.stdout.match(/Still waiting/gu)).toHaveLength(2)
    expect(fs.readFileSync(countPath, 'utf8')).toBe('13')
  })

  it('summarizes isolated Keycloak recovery retries without raw wget errors', () => {
    const { countPath, result, temporaryDirectory } =
      runKeycloakRecoveryProbe(12)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain(
      'Lifecycle transition: isolated Keycloak backup recovery discovery.',
    )
    expect(result.stdout).toContain(
      'last probe: connection unavailable; attempt 1/60',
    )
    expect(result.stdout).toContain('last probe: HTTP 503; attempt 10/60')
    expect(result.stdout).toContain(
      'Ready: isolated Keycloak backup recovery discovery',
    )
    expect(result.stdout.match(/Still waiting/gu)).toHaveLength(2)
    expect(result.stdout).not.toContain('wget:')
    expect(fs.readFileSync(countPath, 'utf8')).toBe('13')
    expect(
      fs.readFileSync(
        path.join(temporaryDirectory, 'keycloak-recovery-openid.json'),
        'utf8',
      ),
    ).toContain('kravhantering-production')
    expect(
      fs.existsSync(
        path.join(temporaryDirectory, 'keycloak-recovery-probe-error.txt'),
      ),
    ).toBe(false)
  })

  it('retains bounded diagnostics when isolated Keycloak recovery times out', () => {
    const { result, temporaryDirectory } = runKeycloakRecoveryProbe(3, 3)

    expect(result.status).not.toBe(0)
    expect(result.stdout.match(/Still waiting/gu)).toHaveLength(1)
    expect(result.stdout).not.toContain('wget:')
    expect(result.stderr).toContain('last probe: connection unavailable')
    expect(
      fs.readFileSync(
        path.join(temporaryDirectory, 'keycloak-recovery-probe-error.txt'),
        'utf8',
      ),
    ).toContain('Connection refused')
    expect(
      fs.readFileSync(
        path.join(
          temporaryDirectory,
          'keycloak-recovery-failure-collected.txt',
        ),
        'utf8',
      ),
    ).toBe('collected\n')
  })

  it('suppresses successful system CA refresh warnings', () => {
    const result = runCaTrust(0)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Trusted')
    expect(result.stderr).toBe('')
  })

  it('preserves system CA refresh failures and their diagnostics', () => {
    const result = runCaTrust(23)

    expect(result.status).toBe(23)
    expect(result.stderr).toContain('certificate update failed')
  })
})
