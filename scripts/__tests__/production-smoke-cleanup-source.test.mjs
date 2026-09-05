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

describe('production smoke cleanup rollback source', () => {
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
