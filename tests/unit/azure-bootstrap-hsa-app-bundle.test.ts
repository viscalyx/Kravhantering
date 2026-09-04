import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const bootstrap = readFileSync(
  path.join(process.cwd(), 'scripts/azure-dev/templates/bootstrap-host.sh'),
  'utf8',
)
const functionStart = bootstrap.indexOf(
  'normalize_hsa_app_bundle_host_ownership() {',
)
const functionEnd = bootstrap.indexOf(
  '\n}\n\nstop_managed_containers()',
  functionStart,
)

if (functionStart < 0 || functionEnd < 0) {
  throw new Error(
    'Could not locate normalize_hsa_app_bundle_host_ownership in bootstrap-host.sh',
  )
}

const normalizeHsaAppBundleHostOwnership = bootstrap.slice(
  functionStart,
  functionEnd + 2,
)
const configureStorageStart = bootstrap.indexOf('configure_podman_storage() {')
const configureStorageEnd = bootstrap.indexOf(
  '\n}\n\ninstall_service_environment_files()',
  configureStorageStart,
)

if (configureStorageStart < 0 || configureStorageEnd < 0) {
  throw new Error(
    'Could not locate configure_podman_storage in bootstrap-host.sh',
  )
}

const configurePodmanStorage = bootstrap.slice(
  configureStorageStart,
  configureStorageEnd + 2,
)
const temporaryDirectories: string[] = []

function createFixture(files: string[]) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'azure-hsa-app-bundle-'))
  temporaryDirectories.push(root)
  const bundleDirectory = path.join(root, '.hsa-mtls/app')
  mkdirSync(bundleDirectory, { recursive: true })
  for (const filename of files) {
    writeFileSync(path.join(bundleDirectory, filename), filename)
  }
  return {
    bundleDirectory,
    chownRecord: path.join(root, 'chown-record'),
    root,
  }
}

function runNormalization(fixture: ReturnType<typeof createFixture>) {
  const harness = [
    'set -euo pipefail',
    'WORKSPACE_DIR="$TEST_ROOT"',
    'VSCODE_USER=vscode',
    'chown() { printf "%s\\n" "$@" > "$CHOWN_RECORD"; }',
    'log() { printf "%s\\n" "$*"; }',
    normalizeHsaAppBundleHostOwnership,
    'normalize_hsa_app_bundle_host_ownership',
  ].join('\n')

  return spawnSync('bash', ['-c', harness], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CHOWN_RECORD: fixture.chownRecord,
      TEST_ROOT: fixture.root,
    },
  })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('Azure bootstrap HSA App bundle ownership', () => {
  it('leaves ownership inside the rootless Podman storage tree unchanged', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'azure-podman-storage-'))
    temporaryDirectories.push(root)
    const vscodeHome = path.join(root, 'home')
    const configurationDirectory = path.join(vscodeHome, '.config/containers')
    const podmanStorage = path.join(root, 'storage')
    mkdirSync(configurationDirectory, { recursive: true })
    mkdirSync(podmanStorage)
    const marker = path.join(podmanStorage, 'preserved-volume-owner')
    writeFileSync(marker, 'preserved')
    const harness = [
      'set -euo pipefail',
      'VSCODE_USER=vscode',
      'VSCODE_HOME="$TEST_VSCODE_HOME"',
      'PODMAN_STORAGE_DIR="$TEST_PODMAN_STORAGE"',
      'install() { :; }',
      'chown() {',
      '  for argument in "$@"; do',
      '    if [ "$argument" = "$PODMAN_STORAGE_DIR" ]; then return 97; fi',
      '  done',
      '}',
      configurePodmanStorage,
      'configure_podman_storage',
    ].join('\n')

    const result = spawnSync('bash', ['-c', harness], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TEST_PODMAN_STORAGE: podmanStorage,
        TEST_VSCODE_HOME: vscodeHome,
      },
    })

    expect(result.status).toBe(0)
    expect(readFileSync(marker, 'utf8')).toBe('preserved')
  })

  it('assigns only the complete App runtime bundle to the host development user', () => {
    const fixture = createFixture([
      'app-client.crt',
      'app-client.key',
      'kong-server-ca.crt',
    ])

    const result = runNormalization(fixture)

    expect(result.status).toBe(0)
    expect(
      readFileSync(fixture.chownRecord, 'utf8').trim().split('\n'),
    ).toEqual([
      'vscode:vscode',
      '--',
      fixture.bundleDirectory,
      path.join(fixture.bundleDirectory, 'app-client.crt'),
      path.join(fixture.bundleDirectory, 'app-client.key'),
      path.join(fixture.bundleDirectory, 'kong-server-ca.crt'),
    ])
  })

  it('fails before changing ownership when an App runtime file is missing', () => {
    const fixture = createFixture(['app-client.crt', 'kong-server-ca.crt'])

    const result = runNormalization(fixture)

    expect(result.status).toBe(1)
    expect(result.stdout).toContain(
      `HSA App runtime bundle file is missing: ${fixture.bundleDirectory}/app-client.key`,
    )
    expect(() => readFileSync(fixture.chownRecord, 'utf8')).toThrow()
  })
})
