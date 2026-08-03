import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installRepositoryNpm,
  packageManagerVersion,
} from '../install-repository-npm.mjs'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true })
  }
  vi.restoreAllMocks()
})

describe('repository npm bootstrap', () => {
  it('accepts only an exact npm packageManager declaration', () => {
    expect(packageManagerVersion({ packageManager: 'npm@12.0.2' })).toBe(
      '12.0.2',
    )
    expect(() =>
      packageManagerVersion({ packageManager: 'npm@latest' }),
    ).toThrow('exact npm version')
    expect(() =>
      packageManagerVersion({ packageManager: 'pnpm@10.0.0' }),
    ).toThrow('exact npm version')
  })

  it('installs and verifies the canonical npm version', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'install-repository-npm-test-'),
    )
    temporaryDirectories.push(root)
    fs.writeFileSync(
      path.join(root, 'package.json'),
      '{"packageManager":"npm@12.0.2"}\n',
    )
    const execFileSync = vi
      .fn()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('12.0.2\n')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(installRepositoryNpm(root, execFileSync)).toBe('12.0.2')
    expect(execFileSync).toHaveBeenNthCalledWith(
      1,
      'npm',
      ['install', '--global', 'npm@12.0.2'],
      {
        cwd: expect.stringContaining('repository-npm-bootstrap-'),
        stdio: 'inherit',
      },
    )
    expect(execFileSync).toHaveBeenNthCalledWith(2, 'npm', ['--version'], {
      cwd: expect.stringContaining('repository-npm-bootstrap-'),
      encoding: 'utf8',
    })
    expect(execFileSync.mock.calls[0][2].cwd).toBe(
      execFileSync.mock.calls[1][2].cwd,
    )
  })

  it('fails if the activated npm version differs', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'install-repository-npm-test-'),
    )
    temporaryDirectories.push(root)
    fs.writeFileSync(
      path.join(root, 'package.json'),
      '{"packageManager":"npm@12.0.2"}\n',
    )
    const execFileSync = vi
      .fn()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('11.0.0\n')

    expect(() => installRepositoryNpm(root, execFileSync)).toThrow(
      'Expected npm 12.0.2',
    )
  })
})
