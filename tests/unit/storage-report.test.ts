import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const workspaceRoot = path.resolve(import.meta.dirname, '../..')
const storageReport = path.join(
  workspaceRoot,
  'scripts/azure-dev/templates/storage-report.sh',
)
const fixtureRoots = new Set<string>()

function fakeCommandPath() {
  const root = mkdtempSync(path.join(tmpdir(), 'storage-report-'))
  fixtureRoots.add(root)
  const bin = path.join(root, 'bin')
  mkdirSync(bin)
  const data = path.join(root, 'data')
  mkdirSync(data)
  const fakeDf = path.join(bin, 'df')
  writeFileSync(
    fakeDf,
    `#!/bin/sh
human=false
path_value=''
for argument in "$@"; do
  if [ "$argument" = '-hP' ]; then
    human=true
  elif [ "\${argument#-}" = "$argument" ]; then
    path_value="$argument"
  fi
done
if [ "$path_value" != '/' ]; then
  used_percent="\${FAKE_DATA_USED_PERCENT:-50}"
  device='/dev/fake-data'
  mount='/fake-data'
else
  used_percent="\${FAKE_ROOT_USED_PERCENT:-50}"
  device='/dev/fake-root'
  mount='/'
fi
available_percent=$((100 - used_percent))
if [ "$human" = true ]; then
  printf 'Filesystem Size Used Avail Use%% Mounted on\\n'
  printf '%s 100G %sG %sG %s%%%% %s\\n' \
    "$device" "$used_percent" "$available_percent" "$used_percent" "$mount"
else
  printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\n'
  printf '%s 100 %s %s %s%%%% %s\\n' \
    "$device" "$used_percent" "$available_percent" "$used_percent" "$mount"
fi
`,
  )
  chmodSync(fakeDf, 0o755)
  return { bin, data }
}

function runCheck(rootUsed: number, dataUsed: number) {
  const { bin, data } = fakeCommandPath()
  return spawnSync('bash', [storageReport, '--check'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FAKE_DATA_USED_PERCENT: String(dataUsed),
      FAKE_ROOT_USED_PERCENT: String(rootUsed),
      KRAV_STORAGE_DATA_MOUNT: data,
      PATH: `${bin}:${process.env.PATH}`,
    },
  })
}

afterEach(() => {
  for (const root of fixtureRoots) {
    rmSync(root, { force: true, recursive: true })
  }
  fixtureRoots.clear()
})

describe('storage-report', () => {
  it('stays silent while both filesystems are below the warning threshold', () => {
    const result = runCheck(79, 79)

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
  })

  it('warns at 80 percent and points to the read-only report', () => {
    const result = runCheck(80, 79)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      'Storage warning: root filesystem is 80% used with 20G available.',
    )
    expect(result.stdout).toContain(
      'Run this command in the terminal for read-only diagnostics and cleanup suggestions:',
    )
    expect(result.stdout).toContain('\n  storage-report\n')
  })

  it('uses an urgent warning at 90 percent without failing the shell', () => {
    const result = runCheck(79, 90)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      'Urgent storage warning: Azure data disk is 90% used with 10G available.',
    )
  })

  it('rejects unsupported arguments without changing storage', () => {
    const result = spawnSync('bash', [storageReport, '--clean'], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Usage: storage-report [--check]')
  })
})
