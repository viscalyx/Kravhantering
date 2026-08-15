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

describe('production smoke output', () => {
  it('renders the CI-only HSA route with verified HTTPS', () => {
    const { appEnv, configRoot, kongUnit, result } =
      renderHsaSmokeConfiguration()

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
      'Environment=KONG_SSL_CERT=/run/kong-tls/server.crt',
    )
    expect(kongUnit).toContain(
      `Volume=${configRoot}/kong-tls/kong.crt:/run/kong-tls/server.crt:ro`,
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
