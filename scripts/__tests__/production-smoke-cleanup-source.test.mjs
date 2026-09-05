import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const script = path.resolve('scripts/containers/production-smoke.sh')
const roots = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-cleanup-source-'))
  roots.push(root)
  const evidence = path.join(root, 'runner workspace', 'evidence')
  const bundle = path.join(evidence, 'published bundle')
  const serviceHome = path.join(root, 'service home')
  fs.mkdirSync(path.join(bundle, 'bin'), { recursive: true })
  fs.mkdirSync(path.join(serviceHome, 'cleanup-source-verification'), {
    recursive: true,
  })
  fs.writeFileSync(
    path.join(bundle, 'DEPLOYMENT-MANIFEST.json'),
    JSON.stringify({ version: '1.0.0' }),
  )
  fs.writeFileSync(path.join(bundle, 'container-stack.lock.json'), '{}\n')
  fs.writeFileSync(
    path.join(bundle, 'bin', 'kravhantering-quadlet.sh'),
    '#!/bin/bash\nprintf "source installer\\n"\n',
    { mode: 0o755 },
  )
  const archive = path.join(evidence, 'published archive.tar.gz')
  const packed = spawnSync('tar', [
    '-czf',
    archive,
    '-C',
    evidence,
    path.basename(bundle),
  ])
  expect(packed.status).toBe(0)
  fs.writeFileSync(
    path.join(evidence, 'cleanup-source-selection.json'),
    JSON.stringify({ archive, bundle }),
  )
  return { evidence, bundle, archive, serviceHome }
}

function stage(f) {
  return spawnSync(
    'bash',
    [
      '-c',
      String.raw`
        source "$1"
        SERVICE_HOME="$2"
        as_service() { (cd "$SERVICE_HOME" && "$@"); }
        sudo() {
          if [[ "$1" == chown ]]; then
            command chown -R "$(id -u):$(id -g)" "$4"
          else
            "$@"
          fi
        }
        staged="$(stage_cleanup_rollback_source)"
        printf '%s\n' "$staged"
      `,
      'bash',
      script,
      f.serviceHome,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PRODUCTION_SMOKE_EVIDENCE_DIR: f.evidence },
    },
  )
}

const digest = file =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex')

function rollback(f, imageId) {
  const config = path.join(f.evidence, 'config')
  const target = path.join(f.evidence, 'target')
  fs.mkdirSync(config)
  fs.mkdirSync(path.join(target, 'current/bin'), { recursive: true })
  fs.copyFileSync(
    path.join(f.bundle, 'bin/kravhantering-quadlet.sh'),
    path.join(target, 'current/bin/kravhantering-quadlet.sh'),
  )
  const manager = path.join(
    f.serviceHome,
    '.local/share/kravhantering/cleanup/current/manager.sh',
  )
  fs.mkdirSync(path.dirname(manager), { recursive: true })
  fs.writeFileSync(manager, '#!/bin/bash\nexit 0\n', { mode: 0o755 })
  fs.writeFileSync(path.join(config, 'app.env'), 'DB_NAME=target\n')
  fs.writeFileSync(path.join(config, 'cleanup.env'), 'DB_NAME=target\n')
  fs.writeFileSync(
    path.join(config, 'release.env'),
    'APP_RUNTIME_IMAGE_REF=target\n',
  )
  fs.writeFileSync(
    path.join(f.serviceHome, 'cleanup-source-verification/runtime.env'),
    'DB_NAME=cleanup_compat_source\n',
  )
  fs.writeFileSync(
    path.join(f.evidence, 'cleanup-source.json'),
    '{"release":"1.0.0"}',
  )
  const result = spawnSync(
    'bash',
    [
      '-c',
      String.raw`
        source "$1"
        SERVICE_HOME="$2"
        SERVICE_CONTEXT=0
        as_service() { (cd "$SERVICE_HOME" && SERVICE_CONTEXT=1 "$@"); }
        sudo() {
          if [[ "$1" != chown ]]; then "$@"; fi
        }
        # Model private service-owned paths even when tests run as one OS user.
        jq() {
          local arg
          for arg in "$@"; do
            if [[ "$arg" == "$SERVICE_HOME/"* && "$SERVICE_CONTEXT" != 1 ]]; then
              printf 'service-owned manifest requires service context\n' >&2
              return 1
            fi
          done
          command jq "$@"
        }
        podman() {
          if [[ "$1 $2" == 'image inspect' ]]; then printf '%s\n' "$IMAGE_ID"; fi
        }
        service_systemctl() { [[ "$1" != is-active ]]; }
        render_ci_overlay() { :; }
        database_job() { :; }
        sqlserver_query() { :; }
        assert_service_property() { :; }
        verify_cleanup_rollback_schedule
      `,
      'bash',
      script,
      f.serviceHome,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        IMAGE_ID: imageId,
        PRODUCTION_SMOKE_CONFIG_ROOT: config,
        PRODUCTION_SMOKE_INSTALL_ROOT: target,
        PRODUCTION_SMOKE_EVIDENCE_DIR: f.evidence,
      },
    },
  )
  return { result, config }
}

describe('production smoke cleanup rollback source', () => {
  it.each([true, false])(
    'checks the private source image identity before rollback (matching=%s)',
    matching => {
      const f = fixture()
      const imageId = `sha256:${'a'.repeat(64)}`
      const imageRef = 'registry.example/app:source'
      fs.writeFileSync(
        path.join(f.bundle, 'DEPLOYMENT-MANIFEST.json'),
        JSON.stringify({
          images: { appRuntime: imageRef },
          imageIds: { appRuntime: imageId },
        }),
      )
      const { result, config } = rollback(
        f,
        matching ? imageId : `sha256:${'b'.repeat(64)}`,
      )
      if (matching) {
        expect(result.status, result.stderr).toBe(0)
        expect(
          fs.readFileSync(
            path.join(f.serviceHome, 'cleanup-source-verification/release.env'),
            'utf8',
          ),
        ).toBe(`APP_RUNTIME_IMAGE_REF=${imageRef}\n`)
        expect(
          fs.readFileSync(
            path.join(f.evidence, 'cleanup-rollback-schedule.txt'),
            'utf8',
          ),
        ).toBe('source=1.0.0 timer-deletion-without-requests=passed\n')
        expect(fs.readFileSync(path.join(config, 'app.env'), 'utf8')).toBe(
          'DB_NAME=target\n',
        )
        expect(fs.readFileSync(path.join(config, 'cleanup.env'), 'utf8')).toBe(
          'DB_NAME=target\n',
        )
      } else {
        expect(result.status).toBe(1)
        expect(result.stderr).toContain(
          'rollback application image identity mismatch',
        )
        expect(fs.readFileSync(path.join(config, 'app.env'), 'utf8')).toBe(
          'DB_NAME=target\n',
        )
      }
    },
  )

  it('stages private service-local copies with authenticated bytes and executable units', () => {
    const f = fixture()
    const result = stage(f)
    expect(result.status, result.stderr).toBe(0)
    const staged = result.stdout.trim()
    expect(path.dirname(staged)).toBe(
      path.join(f.serviceHome, 'cleanup-source-verification'),
    )
    expect(fs.statSync(staged).mode & 0o777).toBe(0o700)
    expect(digest(path.join(staged, 'source.tar.gz'))).toBe(digest(f.archive))
    for (const name of [
      'DEPLOYMENT-MANIFEST.json',
      'container-stack.lock.json',
    ]) {
      expect(digest(path.join(staged, 'bundle', name))).toBe(
        digest(path.join(f.bundle, name)),
      )
    }
    // The retained copies must work independently of the runner workspace.
    fs.rmSync(f.evidence, { recursive: true })
    const installer = spawnSync(
      path.join(staged, 'bundle/bin/kravhantering-quadlet.sh'),
      [],
      { cwd: f.serviceHome, encoding: 'utf8' },
    )
    expect(installer.status, installer.stderr).toBe(0)
    expect(installer.stdout).toBe('source installer\n')
    expect(
      fs.readFileSync(path.join(staged, 'source.tar.gz')).length,
    ).toBeGreaterThan(0)
  })

  it('fails without returning a staged source when the authenticated archive is missing', () => {
    const f = fixture()
    fs.unlinkSync(f.archive)
    const result = stage(f)
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
  })
})
