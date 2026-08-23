import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLinkedWorktreeFixture } from '@/tests/support/git-worktree-fixture'

const workspaceRoot = path.resolve(import.meta.dirname, '../..')
const worktreeStorage = path.join(
  workspaceRoot,
  'scripts/azure-dev/templates/worktree-storage.sh',
)
const fixtureRoots = new Set<string>()
const currentUser = userInfo().username
const currentGroup = execFileSync('id', ['-gn'], { encoding: 'utf8' }).trim()

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'worktree-storage-'))
  fixtureRoots.add(root)
  const dataMount = path.join(root, 'data')
  const workspace = path.join(root, 'workspace')
  const dataWorkspace = path.join(dataMount, 'workspace')
  const worktreeRoot = path.join(dataMount, '.worktrees')
  mkdirSync(dataWorkspace, { recursive: true })
  mkdirSync(workspace)

  return {
    dataMount,
    dataWorkspace,
    env: {
      ...process.env,
      KRAV_AZURE_DATA_MOUNT: dataMount,
      KRAV_AZURE_DATA_WORKSPACE: dataWorkspace,
      KRAV_AZURE_LEGACY_WORKTREE_PATH: path.join(workspace, '.worktrees'),
      KRAV_AZURE_WORKTREE_GROUP: currentGroup,
      KRAV_AZURE_WORKTREE_OWNER: currentUser,
      KRAV_AZURE_WORKTREE_ROOT: worktreeRoot,
    },
    root,
    workspace,
    worktreeRoot,
  }
}

function runContract(
  action: 'prepare' | 'validate',
  fixture: ReturnType<typeof createFixture>,
  env: NodeJS.ProcessEnv = fixture.env,
) {
  return spawnSync('bash', [worktreeStorage, action], {
    encoding: 'utf8',
    env,
  })
}

afterEach(() => {
  for (const root of fixtureRoots) {
    rmSync(root, { force: true, recursive: true })
  }
  fixtureRoots.clear()
})

describe('Azure worktree storage contract', () => {
  it('creates a real data-disk-root directory owned and writable by the developer', () => {
    const fixture = createFixture()

    const prepared = runContract('prepare', fixture)
    const validated = runContract('validate', fixture)

    expect(prepared.status).toBe(0)
    expect(validated.status).toBe(0)
    expect(lstatSync(fixture.worktreeRoot).isDirectory()).toBe(true)
    expect(statSync(fixture.worktreeRoot).mode & 0o777).toBe(0o750)
    expect(existsSync(path.join(fixture.workspace, '.worktrees'))).toBe(false)
  })

  it('preserves registered external worktrees and their contents on reruns', () => {
    const fixture = createFixture()
    expect(runContract('prepare', fixture).status).toBe(0)
    const linkedWorktree = createLinkedWorktreeFixture({
      workspace: fixture.workspace,
      worktreeRoot: fixture.worktreeRoot,
    })
    const marker = path.join(linkedWorktree, 'preserve-me.txt')
    writeFileSync(marker, 'uncommitted work\n')
    const registrationsBefore = execFileSync(
      'git',
      ['-C', fixture.workspace, 'worktree', 'list', '--porcelain'],
      { encoding: 'utf8' },
    )

    const rerun = runContract('prepare', fixture)
    const registrationsAfter = execFileSync(
      'git',
      ['-C', fixture.workspace, 'worktree', 'list', '--porcelain'],
      { encoding: 'utf8' },
    )

    expect(rerun.status).toBe(0)
    expect(registrationsAfter).toBe(registrationsBefore)
    expect(readFileSync(marker, 'utf8')).toBe('uncommitted work\n')
  })

  it('fails safely with rebuild guidance for repository-local worktrees', () => {
    const fixture = createFixture()
    mkdirSync(fixture.worktreeRoot)
    const externalMarker = path.join(fixture.worktreeRoot, 'preserve-me.txt')
    writeFileSync(externalMarker, 'external work\n')
    mkdirSync(path.join(fixture.workspace, '.worktrees'))
    writeFileSync(
      path.join(fixture.workspace, '.worktrees', 'legacy.txt'),
      'legacy work\n',
    )

    const result = runContract('prepare', fixture)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Rebuild this temporary Azure development environment',
    )
    expect(readFileSync(externalMarker, 'utf8')).toBe('external work\n')
    expect(
      readFileSync(
        path.join(fixture.workspace, '.worktrees', 'legacy.txt'),
        'utf8',
      ),
    ).toBe('legacy work\n')
  })

  it('rejects a legacy compatibility symlink during validation', () => {
    const fixture = createFixture()
    expect(runContract('prepare', fixture).status).toBe(0)
    symlinkSync(
      fixture.worktreeRoot,
      path.join(fixture.workspace, '.worktrees'),
    )

    const result = runContract('validate', fixture)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      `${path.join(fixture.workspace, '.worktrees')} must be absent`,
    )
  })

  it('rejects legacy worktrees in the data-backed workspace during validation', () => {
    const fixture = createFixture()
    expect(runContract('prepare', fixture).status).toBe(0)
    const backingLegacyPath = path.join(fixture.dataWorkspace, '.worktrees')
    mkdirSync(backingLegacyPath)

    const result = runContract('validate', fixture)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`${backingLegacyPath} must be absent`)
  })

  it('rejects a worktree root not owned by the configured developer', () => {
    const fixture = createFixture()
    expect(runContract('prepare', fixture).status).toBe(0)

    const result = runContract('validate', fixture, {
      ...fixture.env,
      KRAV_AZURE_WORKTREE_OWNER: '__unexpected_owner__',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Azure worktree root owner is')
  })

  it('rejects a worktree root not writable by the configured developer', () => {
    const fixture = createFixture()
    expect(runContract('prepare', fixture).status).toBe(0)
    chmodSync(fixture.worktreeRoot, 0o550)

    const result = runContract('validate', fixture)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Azure worktree root is not writable')
  })

  it('rejects a worktree root that is not on the managed data-disk device', () => {
    const fixture = createFixture()
    expect(runContract('prepare', fixture).status).toBe(0)
    const bin = path.join(fixture.root, 'bin')
    mkdirSync(bin)
    const fakeStat = path.join(bin, 'stat')
    writeFileSync(
      fakeStat,
      `#!/usr/bin/env bash
if [ "$1" = '-c' ] && [ "$2" = '%d' ] && [ "$3" = '${fixture.worktreeRoot}' ]; then
  printf '999999\\n'
else
  /usr/bin/stat "$@"
fi
`,
    )
    chmodSync(fakeStat, 0o755)

    const result = runContract('validate', fixture, {
      ...fixture.env,
      PATH: `${bin}:${process.env.PATH}`,
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Azure worktree root is not on the managed data disk',
    )
  })
})
