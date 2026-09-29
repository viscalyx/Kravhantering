import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const hookPath = '.claude/worktree-create.sh'
const temporaryDirectories: string[] = []

function createTemporaryDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

function commitFile(repository: string, fileName: string, message: string) {
  writeFileSync(join(repository, fileName), `${message}\n`)
  git(repository, 'add', '.')
  git(repository, 'commit', '-qm', message)
}

function createRepositoryOnIntegrationBranch() {
  const repository = createTemporaryDirectory('krav-worktree-hook-repo-')
  git(repository, 'init', '-q', '-b', 'main')
  git(repository, 'config', 'user.email', 'test@example.com')
  git(repository, 'config', 'user.name', 'Test')
  commitFile(repository, 'base.txt', 'base')
  git(repository, 'switch', '-qc', 'f/issue-1')
  commitFile(repository, 'integrated.txt', 'integrated')
  return repository
}

function runHook(cwd: string, name: string, worktreeRoot: string) {
  return spawnSync('bash', [hookPath], {
    encoding: 'utf8',
    env: { ...process.env, KRAV_WORKTREE_ROOT: worktreeRoot },
    input: JSON.stringify({
      cwd,
      hook_event_name: 'WorktreeCreate',
      name,
      session_id: 'test-session',
    }),
  })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Claude Code WorktreeCreate hook', () => {
  it('creates the worktree under the root from the current HEAD and prints only its path', () => {
    const repository = createRepositoryOnIntegrationBranch()
    const worktreeRoot = createTemporaryDirectory('krav-worktree-hook-root-')

    const result = runHook(repository, 'agent-abc', worktreeRoot)

    const expectedPath = join(worktreeRoot, 'agent-abc')
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(`${expectedPath}\n`)
    expect(git(expectedPath, 'branch', '--show-current')).toBe('wt/agent-abc')
    expect(git(expectedPath, 'rev-parse', 'HEAD')).toBe(
      git(repository, 'rev-parse', 'f/issue-1'),
    )
  })

  it('branches each worktree from the HEAD at creation time', () => {
    const repository = createRepositoryOnIntegrationBranch()
    const worktreeRoot = createTemporaryDirectory('krav-worktree-hook-root-')
    runHook(repository, 'agent-first', worktreeRoot)
    commitFile(repository, 'picked.txt', 'cherry-picked')

    const result = runHook(repository, 'agent-second', worktreeRoot)

    expect(result.status).toBe(0)
    expect(git(join(worktreeRoot, 'agent-second'), 'rev-parse', 'HEAD')).toBe(
      git(repository, 'rev-parse', 'HEAD'),
    )
  })

  it('returns the existing worktree for a repeated name', () => {
    const repository = createRepositoryOnIntegrationBranch()
    const worktreeRoot = createTemporaryDirectory('krav-worktree-hook-root-')
    runHook(repository, 'resumed', worktreeRoot)

    const result = runHook(repository, 'resumed', worktreeRoot)

    expect(result.status).toBe(0)
    expect(result.stdout).toBe(`${join(worktreeRoot, 'resumed')}\n`)
  })

  it('fails without printing a path outside a Git repository', () => {
    const directory = createTemporaryDirectory('krav-worktree-hook-plain-')
    const worktreeRoot = createTemporaryDirectory('krav-worktree-hook-root-')

    const result = runHook(directory, 'agent-abc', worktreeRoot)

    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
  })
})
