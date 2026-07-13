import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const tempDirs = []
const helperPath = path.join(
  process.cwd(),
  'containers/production/bin/kravhantering-images.sh',
)

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-images-'))
  tempDirs.push(dir)
  return dir
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function service(name, image, tag, manifestDigest, imageId) {
  const roles = {
    'app-runtime': 'application',
    'db-job': 'database-job',
    keycloak: 'identity-provider',
    nginx: 'tls-proxy',
    sqlserver: 'database',
  }

  return {
    image,
    imageId,
    manifestDigest,
    name,
    role: roles[name] ?? name,
    source: `https://example.test/${name}`,
    tag,
  }
}

function writeLockFile(dir) {
  const lockPath = path.join(dir, 'container-stack.lock.json')
  writeJson(lockPath, {
    schemaVersion: 2,
    releaseVersion: '1.2.3',
    commitSha: 'deadbeef',
    generatedAt: '2026-05-22T10:00:00.000Z',
    generatedBy: 'scripts/containers/generate-stack-lock.mjs',
    services: [
      service(
        'app-runtime',
        'registry.example/app-runtime',
        '1.2.3',
        'sha256:app-manifest',
        'sha256:app-image',
      ),
      service(
        'db-job',
        'registry.example/db-job',
        '1.2.3',
        'sha256:db-manifest',
        'sha256:db-image',
      ),
      service(
        'nginx',
        'registry.example/nginx',
        '1.31.2-alpine',
        'sha256:nginx-manifest',
        'sha256:nginx-image',
      ),
      service(
        'sqlserver',
        'registry.example/sqlserver',
        '2025-CU6-ubuntu-24.04',
        'sha256:sql-manifest',
        'sha256:sql-image',
      ),
      service(
        'keycloak',
        'registry.example/keycloak',
        '26.7.0-0',
        'sha256:keycloak-manifest',
        'sha256:keycloak-image',
      ),
    ],
  })
  return lockPath
}

function writeTestLockFile(dir) {
  const lockPath = path.join(dir, 'container-test-support.lock.json')
  writeJson(lockPath, {
    schemaVersion: 1,
    services: [
      service(
        'hsa-directory-mock',
        'registry.example/hsa-directory-mock',
        '1.2.3',
        'sha256:hsa-manifest',
        'sha256:hsa-image',
      ),
    ],
  })
  return lockPath
}

function writeHsaIntegrationLockFile(dir) {
  const lockPath = path.join(dir, 'container-hsa-integration-support.lock.json')
  writeJson(lockPath, {
    schemaVersion: 1,
    services: [
      service(
        'kong',
        'registry.example/kong',
        '3.15.0.0-20260702-ubuntu',
        'sha256:kong-manifest',
        'sha256:kong-image',
      ),
      service(
        'hsa-person-lookup-adapter',
        'registry.example/hsa-person-lookup-adapter',
        '1.2.3',
        'sha256:hsa-adapter-manifest',
        'sha256:hsa-adapter-image',
      ),
    ],
  })
  return lockPath
}

function writeEnvFile(dir, overrides = {}) {
  const values = {
    APP_RUNTIME_IMAGE_REF: 'registry.example/app-runtime:1.2.3',
    DB_JOB_IMAGE_REF: 'registry.example/db-job:1.2.3',
    HSA_DIRECTORY_MOCK_IMAGE_REF: 'registry.example/hsa-directory-mock:1.2.3',
    HSA_PERSON_LOOKUP_ADAPTER_IMAGE_REF:
      'registry.example/hsa-person-lookup-adapter:1.2.3',
    KEYCLOAK_IMAGE_REF: 'registry.example/keycloak:26.7.0-0',
    KONG_IMAGE_REF: 'registry.example/kong:3.15.0.0-20260702-ubuntu',
    NGINX_IMAGE_REF: 'registry.example/nginx:1.31.2-alpine',
    SQLSERVER_IMAGE_REF: 'registry.example/sqlserver:2025-CU6-ubuntu-24.04',
    ...overrides,
  }
  const envPath = path.join(dir, 'release.env')
  fs.writeFileSync(
    envPath,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
  )
  return envPath
}

function writeFakePodman(dir) {
  const binDir = path.join(dir, 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  const podmanPath = path.join(binDir, 'podman')
  fs.writeFileSync(
    podmanPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$PODMAN_LOG"
if [[ "$1 $2" == "image inspect" ]]; then
  ref="$3"
  format="\${5:-}"
  if [[ "\${FAKE_NGINX_MISMATCH:-}" == "1" && "$ref" == *nginx* ]]; then
    printf '%s\\n' 'sha256:wrong-nginx'
    exit 0
  fi
  if [[ "$format" == "{{.Digest}}" || "$format" == "{{index .RepoDigests 0}}" ]]; then
    case "$ref" in
      *app-runtime*) printf '%s\\n' 'registry.example/app-runtime@sha256:app-manifest' ;;
      *db-job*) printf '%s\\n' 'registry.example/db-job@sha256:db-manifest' ;;
      *nginx*) printf '%s\\n' 'registry.example/nginx@sha256:nginx-manifest' ;;
      *sqlserver*) printf '%s\\n' 'registry.example/sqlserver@sha256:sql-manifest' ;;
      *keycloak*) printf '%s\\n' 'registry.example/keycloak@sha256:keycloak-manifest' ;;
      *kong*) printf '%s\\n' 'registry.example/kong@sha256:kong-manifest' ;;
      *hsa-person-lookup-adapter*) printf '%s\\n' 'registry.example/hsa-person-lookup-adapter@sha256:hsa-adapter-manifest' ;;
      *hsa-directory-mock*) printf '%s\\n' 'registry.example/hsa-directory-mock@sha256:hsa-manifest' ;;
      *) printf '%s\\n' '<none>' ;;
    esac
    exit 0
  fi
  case "$ref" in
    *app-runtime*|sha256:app-image) printf '%s\\n' 'sha256:app-image' ;;
    *db-job*|sha256:db-image) printf '%s\\n' 'sha256:db-image' ;;
    *nginx*|sha256:nginx-image) printf '%s\\n' 'sha256:nginx-image' ;;
    *sqlserver*|sha256:sql-image) printf '%s\\n' 'sha256:sql-image' ;;
    *keycloak*|sha256:keycloak-image) printf '%s\\n' 'sha256:keycloak-image' ;;
    *kong*|sha256:kong-image) printf '%s\\n' 'sha256:kong-image' ;;
    *hsa-person-lookup-adapter*|sha256:hsa-adapter-image) printf '%s\\n' 'sha256:hsa-adapter-image' ;;
    *hsa-directory-mock*|sha256:hsa-image) printf '%s\\n' 'sha256:hsa-image' ;;
    *) printf '%s\\n' 'sha256:unknown' ;;
  esac
  exit 0
fi
if [[ "$1" == "save" ]]; then
  output=""
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--output" ]]; then
      output="$2"
      shift 2
      continue
    fi
    shift
  done
  printf 'archive\\n' > "$output"
  exit 0
fi
exit 0
`,
  )
  fs.chmodSync(podmanPath, 0o755)
  return binDir
}

function runHelper(dir, args, options = {}) {
  const logPath = path.join(dir, 'podman.log')
  const binDir = writeFakePodman(dir)
  const env = {
    ...process.env,
    FAKE_NGINX_MISMATCH: options.nginxMismatch ? '1' : '',
    PATH: `${binDir}:${process.env.PATH}`,
    PODMAN_LOG: logPath,
  }
  try {
    const stdout = childProcess.execFileSync('bash', [helperPath, ...args], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return {
      log: fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '',
      status: 0,
      stdout,
    }
  } catch (error) {
    return {
      log: fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '',
      status: error.status,
      stderr: String(error.stderr),
      stdout: String(error.stdout),
    }
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

describe('production image helper', () => {
  it('verifies only app-node images for the selected topology', () => {
    const dir = makeTempDir()
    const lockFile = writeLockFile(dir)
    const envFile = writeEnvFile(dir)

    const result = runHelper(dir, [
      '--topology',
      'app-node',
      '--lock-file',
      lockFile,
      '--env-file',
      envFile,
      'verify',
    ])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Verified app-runtime')
    expect(result.stdout).toContain('Verified db-job')
    expect(result.stdout).toContain('Verified nginx')
    expect(result.stdout).not.toContain('Verified sqlserver')
    expect(result.log).toContain(
      'image inspect registry.example/app-runtime:1.2.3 --format {{.Id}}',
    )
    expect(result.log).not.toContain('registry.example/sqlserver')
  })

  it('verifies production and test support locks for single-node-demo', () => {
    const dir = makeTempDir()
    const lockFile = writeLockFile(dir)
    const testLockFile = writeTestLockFile(dir)
    const hsaIntegrationLockFile = writeHsaIntegrationLockFile(dir)
    const envFile = writeEnvFile(dir)

    const result = runHelper(dir, [
      '--topology',
      'single-node-demo',
      '--lock-file',
      lockFile,
      '--test-lock-file',
      testLockFile,
      '--hsa-integration-lock-file',
      hsaIntegrationLockFile,
      '--env-file',
      envFile,
      'verify',
    ])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Verified app-runtime')
    expect(result.stdout).toContain('Verified keycloak')
    expect(result.stdout).toContain('Verified kong')
    expect(result.stdout).toContain('Verified hsa-person-lookup-adapter')
    expect(result.stdout).toContain('Verified hsa-directory-mock')
    expect(result.log).toContain(
      'image inspect registry.example/kong:3.15.0.0-20260702-ubuntu --format {{.Id}}',
    )
    expect(result.log).toContain(
      'image inspect registry.example/hsa-directory-mock:1.2.3 --format {{.Id}}',
    )
    expect(result.log).toContain(
      'image inspect registry.example/hsa-person-lookup-adapter:1.2.3 --format {{.Id}}',
    )
  })

  it('fails verification when a local image ID differs from the lock', () => {
    const dir = makeTempDir()
    const lockFile = writeLockFile(dir)
    const envFile = writeEnvFile(dir)

    const result = runHelper(
      dir,
      [
        '--topology',
        'app-node',
        '--lock-file',
        lockFile,
        '--env-file',
        envFile,
        'verify',
      ],
      { nginxMismatch: true },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'nginx image ID sha256:wrong-nginx does not match locked sha256:nginx-image',
    )
    expect(result.stderr).toContain(
      'pull the locked manifest registry.example/nginx:1.31.2-alpine@sha256:nginx-manifest',
    )
    expect(result.stderr).toContain('set NGINX_IMAGE_REF to a site mirror tag')
  })

  it('accepts tag and digest refs when they match the lock', () => {
    const dir = makeTempDir()
    const lockFile = writeLockFile(dir)
    const envFile = writeEnvFile(dir, {
      APP_RUNTIME_IMAGE_REF:
        'registry.example/app-runtime:1.2.3@sha256:app-manifest',
      DB_JOB_IMAGE_REF: 'registry.example/db-job:1.2.3@sha256:db-manifest',
    })

    const result = runHelper(dir, [
      '--topology',
      'app-node',
      '--lock-file',
      lockFile,
      '--env-file',
      envFile,
      'verify',
    ])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      'Verified app-runtime (registry.example/app-runtime:1.2.3@sha256:app-manifest)',
    )
    expect(result.log).toContain(
      'image inspect registry.example/app-runtime:1.2.3@sha256:app-manifest --format {{.Digest}}',
    )
    expect(result.log).toContain(
      'image inspect registry.example/app-runtime:1.2.3@sha256:app-manifest --format {{.Id}}',
    )
  })

  it('fails verification when a ref digest differs from the lock', () => {
    const dir = makeTempDir()
    const lockFile = writeLockFile(dir)
    const envFile = writeEnvFile(dir, {
      APP_RUNTIME_IMAGE_REF:
        'registry.example/app-runtime:1.2.3@sha256:wrong-manifest',
    })

    const result = runHelper(dir, [
      '--topology',
      'app-node',
      '--lock-file',
      lockFile,
      '--env-file',
      envFile,
      'verify',
    ])

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'app-runtime manifest digest sha256:wrong-manifest does not match locked sha256:app-manifest',
    )
    expect(result.stderr).toContain(
      'registry.example/app-runtime:1.2.3@sha256:app-manifest',
    )
  })

  it('exports local images, loads, tags, and verifies a disconnected image bundle', () => {
    const dir = makeTempDir()
    const lockFile = writeLockFile(dir)
    const envFile = writeEnvFile(dir)
    const bundle = path.join(dir, 'disconnected-images.tar.gz')

    const exported = runHelper(dir, [
      '--topology',
      'app-node',
      '--lock-file',
      lockFile,
      '--env-file',
      envFile,
      'export',
      '--output',
      bundle,
    ])
    expect(exported.status).toBe(0)
    expect(exported.log).not.toContain('pull ')
    expect(fs.existsSync(bundle)).toBe(true)
    const loaded = runHelper(dir, [
      '--topology',
      'app-node',
      '--lock-file',
      lockFile,
      '--env-file',
      envFile,
      'load',
      '--bundle',
      bundle,
    ])

    expect(loaded.status).toBe(0)
    expect(loaded.log).toContain('load --input')
    expect(loaded.log).toContain(
      'tag sha256:app-image registry.example/app-runtime:1.2.3',
    )
    expect(loaded.stdout).toContain('Verified app-runtime')
  })

  it('loads digest refs by tagging the loaded image to the tag portion', () => {
    const dir = makeTempDir()
    const lockFile = writeLockFile(dir)
    const exportEnvFile = writeEnvFile(dir)
    const bundle = path.join(dir, 'disconnected-images.tar.gz')

    expect(
      runHelper(dir, [
        '--topology',
        'app-node',
        '--lock-file',
        lockFile,
        '--env-file',
        exportEnvFile,
        'export',
        '--output',
        bundle,
      ]).status,
    ).toBe(0)

    const envFile = writeEnvFile(dir, {
      APP_RUNTIME_IMAGE_REF:
        'registry.example/app-runtime:1.2.3@sha256:app-manifest',
    })

    const result = runHelper(dir, [
      '--topology',
      'app-node',
      '--lock-file',
      lockFile,
      '--env-file',
      envFile,
      'load',
      '--bundle',
      bundle,
    ])

    expect(result.status).toBe(0)
    expect(result.log).toContain(
      'tag sha256:app-image registry.example/app-runtime:1.2.3',
    )
    expect(result.log).not.toContain(
      'tag sha256:app-image registry.example/app-runtime:1.2.3@sha256:app-manifest',
    )
    expect(result.stdout).toContain('Verified app-runtime')
  })
})
