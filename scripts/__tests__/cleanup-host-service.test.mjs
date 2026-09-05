import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const roots = []
const script = path.resolve(
  'containers/production/bin/kravhantering-cleanup.sh',
)
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-host-'))
  roots.push(root)
  const bundle = path.join(root, 'bundle')
  fs.mkdirSync(path.join(bundle, 'bin'), { recursive: true })
  fs.copyFileSync(script, path.join(bundle, 'bin/kravhantering-cleanup.sh'))
  for (const name of ['kravhantering-images.sh', 'kravhantering-quadlet.sh']) {
    fs.writeFileSync(
      path.join(bundle, 'bin', name),
      `#!/bin/bash\nexit "\${VERIFY_EXIT:-0}"\n`,
      { mode: 0o755 },
    )
  }
  fs.writeFileSync(path.join(root, 'podman'), '#!/bin/bash\nexit 0\n', {
    mode: 0o755,
  })
  const imageId = `sha256:${'a'.repeat(64)}`
  const manifestDigest = `sha256:${'b'.repeat(64)}`
  fs.writeFileSync(
    path.join(bundle, 'container-stack.lock.json'),
    JSON.stringify({ services: [{ name: 'db-job', imageId, manifestDigest }] }),
  )
  fs.writeFileSync(
    path.join(bundle, 'cleanup-compatibility.json'),
    JSON.stringify({
      schemaVersion: 1,
      imageId,
      manifestDigest,
      target: { release: 'v2', schemaVersion: 'Schema123' },
      sources: [],
      verification: [
        {
          schemaVersion: 'Schema123',
          schemaFingerprint: 'e'.repeat(64),
          imageId,
          outcome: 'success',
          targets: [],
        },
      ],
    }),
  )
  fs.writeFileSync(
    path.join(root, 'systemctl'),
    `#!/bin/bash\nprintf "%s\\n" "$*" >> "$SYSTEMCTL_LOG"\nexit "\${SYSTEMCTL_EXIT:-0}"\n`,
    { mode: 0o755 },
  )
  const envFile = path.join(root, 'cleanup-release.env')
  fs.writeFileSync(
    envFile,
    'TRANSIENT_CLEANUP_IMAGE_REF=registry.example/cleanup:v2\n',
  )
  return { root, bundle, envFile }
}
function run(f, args, env = {}, helper = script) {
  return spawnSync('bash', [helper, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${f.root}:${process.env.PATH}`,
      SYSTEMCTL_LOG: path.join(f.root, 'systemctl.log'),
      KRAVHANTERING_CLEANUP_STATE_DIR: path.join(f.root, 'state'),
      KRAVHANTERING_QUADLET_DIR: path.join(f.root, 'quadlet'),
      KRAVHANTERING_SYSTEMD_USER_DIR: path.join(f.root, 'systemd'),
      ...env,
    },
  })
}
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('release-independent cleanup host service', () => {
  it.each(['resume', 'retry'])(
    '%s starts fresh services and resets only failed services',
    command => {
      const f = fixture()
      expect(
        run(f, [
          'install',
          '--topology',
          'app-node-tls',
          '--env-file',
          f.envFile,
          '--bundle',
          f.bundle,
        ]).status,
      ).toBe(0)
      fs.writeFileSync(
        path.join(f.root, 'systemctl'),
        `#!/bin/bash
printf '%s\\n' "$*" >> "$SYSTEMCTL_LOG"
case "$2" in
  is-failed) [[ "$SERVICE_STATE" == failed ]] ;;
  reset-failed)
    [[ "$SERVICE_STATE" == failed ]] || exit 1
    exit "\${RESET_EXIT:-0}"
    ;;
  start) exit "\${START_EXIT:-0}" ;;
  show) printf 'success\\n' ;;
esac
`,
        { mode: 0o755 },
      )
      const logFile = path.join(f.root, 'systemctl.log')
      const manager = path.join(f.root, 'state/current/manager.sh')
      for (const state of ['unloaded', 'failed']) {
        fs.writeFileSync(logFile, '')
        const result = run(f, [command], { SERVICE_STATE: state }, manager)
        expect(result.status, result.stderr).toBe(0)
        const log = fs.readFileSync(logFile, 'utf8').split('\n')
        const reset = '--user reset-failed kravhantering-host-cleanup.service'
        const start = '--user start kravhantering-host-cleanup.service'
        expect(log.includes(reset)).toBe(state === 'failed')
        expect(log).toContain(start)
        if (state === 'failed')
          expect(log.indexOf(reset)).toBeLessThan(log.indexOf(start))
      }
      for (const failure of [
        { SERVICE_STATE: 'failed', RESET_EXIT: '1' },
        { SERVICE_STATE: 'unloaded', START_EXIT: '1' },
      ]) {
        fs.writeFileSync(logFile, '')
        expect(run(f, [command], failure, manager).status).toBe(1)
        expect(fs.readFileSync(logFile, 'utf8')).not.toContain(
          '--user enable --now kravhantering-host-cleanup.timer',
        )
      }
    },
  )
  it.each(['app-node-tls', 'app-node-http', 'single-node'])(
    'collects payload-safe release evidence with the verified image for %s',
    topology => {
      const f = fixture()
      const collector = path.resolve(
        'containers/production/bin/kravhantering-cleanup-evidence.sh',
      )
      fs.writeFileSync(
        path.join(f.root, 'podman'),
        `#!/bin/bash
echo 'private database diagnostic' >&2
printf '%s\\n' '{"event":"transient_cleanup.schema.verified","schemaVersion":"Schema123","schemaFingerprint":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","outcome":"success","targets":[{"kind":"requirement_import_validation_sessions","outcome":"success"}]}'
exit "\${COLLECT_EXIT:-0}"
`,
        { mode: 0o755 },
      )
      const output = path.join(f.root, 'evidence.json')
      const args = [
        f.bundle,
        f.envFile,
        path.join(f.root, 'runtime.env'),
        topology,
        output,
      ]
      const result = run(f, args, {}, collector)
      expect(result.status, result.stderr).toBe(0)
      expect(result.stderr).not.toContain('private database')
      expect(JSON.parse(fs.readFileSync(output, 'utf8'))).toEqual({
        schemaVersion: 'Schema123',
        schemaFingerprint: 'e'.repeat(64),
        imageId: `sha256:${'a'.repeat(64)}`,
        outcome: 'success',
        targets: [
          {
            kind: 'requirement_import_validation_sessions',
            outcome: 'success',
          },
        ],
      })
      const failed = run(f, args, { COLLECT_EXIT: '1' }, collector)
      expect(failed.status).toBe(1)
      expect(failed.stderr).toBe('cleanup schema verification failed\n')
    },
  )
  it('checks exact source archive and image-lock identities before a transition', () => {
    const f = fixture()
    const sourceBundle = path.join(f.root, 'source')
    const sourceArchive = path.join(f.root, 'source.tar.gz')
    fs.mkdirSync(sourceBundle)
    fs.writeFileSync(sourceArchive, 'authenticated source archive')
    fs.writeFileSync(
      path.join(sourceBundle, 'container-stack.lock.json'),
      'authenticated source lock',
    )
    fs.writeFileSync(
      path.join(sourceBundle, 'DEPLOYMENT-MANIFEST.json'),
      JSON.stringify({
        version: 'v1',
        database: { expectedSchemaVersion: 'Schema122' },
      }),
    )
    const contractFile = path.join(f.bundle, 'cleanup-compatibility.json')
    const contract = JSON.parse(fs.readFileSync(contractFile, 'utf8'))
    contract.sources = [
      {
        release: 'v1',
        schemaVersion: 'Schema122',
        archiveSha256: createHash('sha256')
          .update('authenticated source archive')
          .digest('hex'),
        stackLockSha256: createHash('sha256')
          .update('authenticated source lock')
          .digest('hex'),
      },
    ]
    fs.writeFileSync(contractFile, JSON.stringify(contract))
    expect(
      run(f, [
        'install',
        '--topology',
        'app-node-tls',
        '--env-file',
        f.envFile,
        '--bundle',
        f.bundle,
      ]).status,
    ).toBe(0)
    const args = [
      'verify-transition',
      '--source-bundle',
      sourceBundle,
      '--source-archive',
      sourceArchive,
    ]
    expect(run(f, args).status).toBe(0)
    fs.appendFileSync(sourceArchive, 'changed')
    expect(run(f, args).status).toBe(1)
  })

  it('pauses older application-owned cleanup as part of database quiescence', () => {
    const f = fixture()
    fs.writeFileSync(
      path.join(f.root, 'systemctl'),
      '#!/bin/bash\nprintf "%s\\n" "$*" >> "$SYSTEMCTL_LOG"\nif [[ "$*" == *"--property=LoadState --value"* ]]; then printf "loaded\\n"; fi\n',
      { mode: 0o755 },
    )
    expect(run(f, ['pause']).status).toBe(0)
    const log = fs.readFileSync(path.join(f.root, 'systemctl.log'), 'utf8')
    expect(log).toContain(
      '--user disable --now kravhantering-transient-cleanup.timer',
    )
    expect(log).toContain('--user stop kravhantering-transient-cleanup.service')
    expect(log).toContain(
      '--user disable --now kravhantering-host-cleanup.timer',
    )
    expect(log).toContain('--user stop kravhantering-host-cleanup.service')
  })
  it('installs a pinned generation and requires an explicit update to replace it', () => {
    const f = fixture()
    const args = [
      '--topology',
      'app-node-tls',
      '--env-file',
      f.envFile,
      '--bundle',
      f.bundle,
    ]
    const first = run(f, ['install', ...args])
    expect(first.status, first.stderr).toBe(0)
    const current = path.join(f.root, 'state/current')
    const generation = fs.realpathSync(current)
    const unitFile = path.join(
      f.root,
      'quadlet/kravhantering-host-cleanup.container',
    )
    const unit = fs.readFileSync(unitFile, 'utf8')
    expect(unit).toContain(`Image=sha256:${'a'.repeat(64)}`)
    expect(unit).toContain(`Volume=${generation}/cleanup-compatibility.json:`)
    fs.writeFileSync(
      f.envFile,
      'TRANSIENT_CLEANUP_IMAGE_REF=registry.example/cleanup:v3\n',
    )
    expect(run(f, ['install', ...args]).status).toBe(0)
    expect(fs.realpathSync(current)).toBe(generation)
    expect(run(f, ['update', ...args], { VERIFY_EXIT: '1' }).status).toBe(1)
    expect(fs.readFileSync(unitFile, 'utf8')).toBe(unit)
    expect(run(f, ['update', ...args]).status).toBe(0)
    expect(fs.realpathSync(current)).not.toBe(generation)
    expect(fs.existsSync(generation)).toBe(true)
  })
  it.each(['app-node-tls', 'app-node-http', 'single-node'])(
    'preserves cleanup through application removal and supports explicit recovery and uninstall for %s',
    topology => {
      const f = fixture()
      expect(
        run(f, [
          'install',
          '--topology',
          topology,
          '--env-file',
          f.envFile,
          '--bundle',
          f.bundle,
        ]).status,
      ).toBe(0)
      const current = path.join(f.root, 'state/current')
      const generation = fs.realpathSync(current)
      const timer = path.join(
        f.root,
        'systemd/kravhantering-host-cleanup.timer',
      )
      const unit = path.join(
        f.root,
        'quadlet/kravhantering-host-cleanup.container',
      )
      const bytes = fs.readFileSync(unit, 'utf8')
      expect(
        run(
          f,
          ['remove', '--topology', topology],
          {},
          path.resolve('containers/production/bin/kravhantering-quadlet.sh'),
        ).status,
      ).toBe(0)
      expect(fs.readFileSync(unit, 'utf8')).toBe(bytes)
      expect(fs.existsSync(timer)).toBe(true)
      expect(fs.realpathSync(current)).toBe(generation)
      fs.writeFileSync(
        path.join(f.root, 'systemctl'),
        `#!/bin/bash\nprintf "%s\\n" "$*" >> "$SYSTEMCTL_LOG"\nif [[ "$*" == *"--property=Result --value"* ]]; then printf "%s\\n" "\${SERVICE_RESULT:-success}"; fi\n`,
        { mode: 0o755 },
      )
      const manager = path.join(generation, 'manager.sh')
      expect(run(f, ['pause'], {}, manager).status).toBe(0)
      expect(
        run(f, ['resume'], { SERVICE_RESULT: 'exit-code' }, manager).status,
      ).toBe(1)
      const beforeResume = fs.readFileSync(
        path.join(f.root, 'systemctl.log'),
        'utf8',
      )
      expect(beforeResume).not.toContain(
        'enable --now kravhantering-host-cleanup.timer',
      )
      expect(run(f, ['resume'], {}, manager).status).toBe(0)
      expect(run(f, ['status'], {}, manager).status).toBe(0)
      expect(run(f, ['retry'], {}, manager).status).toBe(0)
      expect(run(f, ['uninstall'], {}, manager).status).toBe(0)
      expect(fs.existsSync(unit)).toBe(false)
      expect(fs.existsSync(timer)).toBe(false)
      expect(fs.existsSync(current)).toBe(false)
    },
  )
  it.each(['app-node-tls', 'app-node-http', 'single-node'])(
    'renders an independent bounded schedule for %s',
    topology => {
      const f = fixture()
      const out = path.join(f.root, 'rendered')
      const result = run(f, [
        'render',
        '--topology',
        topology,
        '--env-file',
        f.envFile,
        '--output-dir',
        out,
      ])
      expect(result.status, result.stderr).toBe(0)
      const unit = fs.readFileSync(
        path.join(out, 'kravhantering-host-cleanup.container'),
        'utf8',
      )
      const timer = fs.readFileSync(
        path.join(out, 'kravhantering-host-cleanup.timer'),
        'utf8',
      )
      expect(unit).toContain('Image=registry.example/cleanup:v2')
      expect(unit).toContain('Pull=never')
      expect(unit).toContain('TimeoutStartSec=300')
      expect(unit).toContain('EnvironmentFile=/etc/kravhantering/cleanup.env')
      expect(unit).not.toMatch(/PartOf=|BindsTo=|DB_JOB_IMAGE_REF|\/current\//)
      expect(timer).toContain('OnCalendar=*:0/5')
      expect(timer).toContain('WantedBy=timers.target')
      expect(timer).not.toContain('PartOf=')
      expect(unit).toContain(
        topology === 'single-node'
          ? 'Network=kravhantering-single-node_database'
          : 'Network=kravhantering-app-node_egress',
      )
    },
  )
})
