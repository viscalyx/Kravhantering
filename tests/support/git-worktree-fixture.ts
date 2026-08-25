import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

interface GitWorktreeFixtureOptions {
  workspace: string
  worktreeRoot: string
}

export function createLinkedWorktreeFixture({
  workspace,
  worktreeRoot,
}: GitWorktreeFixtureOptions) {
  execFileSync('git', ['init', '-q', workspace])
  execFileSync('git', ['-C', workspace, 'config', 'user.name', 'Test'])
  execFileSync('git', [
    '-C',
    workspace,
    'config',
    'user.email',
    'test@example.invalid',
  ])
  execFileSync('git', ['-C', workspace, 'config', 'commit.gpgsign', 'false'])
  writeFileSync(path.join(workspace, 'README.md'), 'primary\n')
  execFileSync('git', ['-C', workspace, 'add', 'README.md'])
  execFileSync('git', ['-C', workspace, 'commit', '-qm', 'initial'])

  const linkedWorktree = path.join(worktreeRoot, 'issue-1032')
  execFileSync('git', [
    '-C',
    workspace,
    'worktree',
    'add',
    '-qb',
    'test/issue-1032',
    linkedWorktree,
  ])
  return linkedWorktree
}
