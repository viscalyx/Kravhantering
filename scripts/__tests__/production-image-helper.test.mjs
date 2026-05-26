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
  return {
    image,
    imageId,
    manifestDigest,
    name,
    role: name,
    source: `https://example.test/${name}`,
    tag,
  }
}

function writeLockFile(dir) {
  const lockPath = path.join(dir, 'container-stack.lock.json')
  writeJson(lockPath, {
    schemaVersion: 2,
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
        'stable',
        'sha256:nginx-manifest',
        'sha256:nginx-image',
      ),
      service(
        'sqlserver',
        'registry.example/sqlserver',
        '2025-latest',
        'sha256:sql-manifest',
        'sha256:sql-image',
      ),
      service(
        'keycloak',
        'registry.example/keycloak',
        '26.6.1',
        'sha256:keycloak-manifest',
        'sha256:keycloak-image',
      ),
    ],
  })
  return lockPath
}

function writeEnvFile(dir, overrides = {}) {
  const values = {
    APP_RUNTIME_IMAGE_REF: 'registry.example/app-runtime:1.2.3',
    DB_JOB_IMAGE_REF: 'registry.example/db-job:1.2.3',
    KEYCLOAK_IMAGE_REF: 'registry.example/keycloak:26.6.1',
    NGINX_IMAGE_REF: 'registry.example/nginx:stable',
    SQLSERVER_IMAGE_REF: 'registry.example/sqlserver:2025-latest',
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
  if [[ "\${FAKE_NGINX_MISMATCH:-}" == "1" && "$ref" == *nginx* ]]; then
    printf '%s\\n' 'sha256:wrong-nginx'
    exit 0
  fi
  case "$ref" in
    *app-runtime*|sha256:app-image) printf '%s\\n' 'sha256:app-image' ;;
    *db-job*|sha256:db-image) printf '%s\\n' 'sha256:db-image' ;;
    *nginx*|sha256:nginx-image) printf '%s\\n' 'sha256:nginx-image' ;;
    *sqlserver*|sha256:sql-image) printf '%s\\n' 'sha256:sql-image' ;;
    *keycloak*|sha256:keycloak-image) printf '%s\\n' 'sha256:keycloak-image' ;;
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
  })

  it('exports local images, loads, tags, and verifies an offline image bundle', () => {
    const dir = makeTempDir()
    const lockFile = writeLockFile(dir)
    const envFile = writeEnvFile(dir)
    const bundle = path.join(dir, 'offline-images.tar.gz')

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

  it('rejects digest refs as production runtime refs', () => {
    const dir = makeTempDir()
    const lockFile = writeLockFile(dir)
    const exportEnvFile = writeEnvFile(dir)
    const bundle = path.join(dir, 'offline-images.tar.gz')

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
      APP_RUNTIME_IMAGE_REF: 'registry.example/app-runtime@sha256:app-manifest',
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

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'production runtime refs must use tag-style',
    )
  })
})
