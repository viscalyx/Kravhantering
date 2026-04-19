import { describe, expect, it } from 'vitest'

import {
  createStudioConfig,
  DEVCONTAINER_DB_DIR,
  DEVCONTAINER_DB_FILE,
  getNpxCommand,
  resolveInspectableDatabase,
  resolveSqliteFilePath,
} from '../db-tools.mjs'

describe('db-tools.mjs', () => {
  it('prefers the mounted devcontainer database for proxy URLs', () => {
    const target = resolveInspectableDatabase({
      env: { DATABASE_URL: 'http://db:9000' },
      fileExists: path =>
        path === DEVCONTAINER_DB_DIR || path === DEVCONTAINER_DB_FILE,
    })

    expect(target).toEqual({
      kind: 'file',
      path: DEVCONTAINER_DB_FILE,
      source: 'devcontainer-volume',
    })
  })

  it('resolves local file DATABASE_URL values', () => {
    const filePath = resolveSqliteFilePath('file:./tmp/dev.sqlite')
    const target = resolveInspectableDatabase({
      env: { DATABASE_URL: 'file:./tmp/dev.sqlite' },
      fileExists: path => path === filePath,
    })

    expect(target).toEqual({
      kind: 'file',
      path: filePath,
      source: 'DATABASE_URL',
    })
  })

  it('reports missing local file databases clearly', () => {
    const target = resolveInspectableDatabase({
      env: { DATABASE_URL: 'file:./tmp/dev.sqlite' },
      fileExists: () => false,
    })

    expect(target.kind).toBe('missing')
    expect(target.message).toContain('npm run db:setup')
  })

  it('explains when the proxy database file is not mounted locally', () => {
    const target = resolveInspectableDatabase({
      env: { DATABASE_URL: 'http://127.0.0.1:9000' },
      fileExists: () => false,
    })

    expect(target).toEqual({
      kind: 'unavailable',
      message:
        'DATABASE_URL points to an HTTP SQLite proxy (http://127.0.0.1:9000), but this environment does not have the database file mounted locally. Run this command from the devcontainer, inspect the Docker volume directly, or set DATABASE_URL to a local SQLite file and rerun `npm run db:setup`.',
    })
  })

  it('creates a studio config that points at the resolved file', () => {
    expect(createStudioConfig('/tmp/dev.sqlite')).toContain(
      'dbCredentials: { url: "/tmp/dev.sqlite" }',
    )
  })

  it('uses npx.cmd on Windows and npx elsewhere', () => {
    expect(getNpxCommand('win32')).toBe('npx.cmd')
    expect(getNpxCommand('linux')).toBe('npx')
  })
})
