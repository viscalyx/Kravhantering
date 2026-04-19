import { describe, expect, it, vi } from 'vitest'

import { main, readSeedSql, SEED_SQL_FILE } from '../db-admin.mjs'

describe('db-admin.mjs', () => {
  it('reads seed SQL from disk', () => {
    const readFileSyncImpl = vi.fn(() => 'SELECT 1;')

    const sqlText = readSeedSql('/workspace', readFileSyncImpl)

    expect(sqlText).toBe('SELECT 1;')
    expect(readFileSyncImpl).toHaveBeenCalledWith(
      '/workspace/drizzle/seed.sql',
      'utf8',
    )
  })

  it('reports a missing seed SQL file clearly', () => {
    const readFileSyncImpl = vi.fn(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    expect(() => readSeedSql('/workspace', readFileSyncImpl)).toThrow(
      `Failed to read ${SEED_SQL_FILE}: ENOENT: no such file or directory`,
    )
  })

  it('reports an unreadable seed SQL file clearly', () => {
    const readFileSyncImpl = vi.fn(() => {
      throw new Error('EACCES: permission denied')
    })

    expect(() => readSeedSql('/workspace', readFileSyncImpl)).toThrow(
      `Failed to read ${SEED_SQL_FILE}: EACCES: permission denied`,
    )
  })

  it('runs the seed command with SQL loaded from disk', async () => {
    const admin = {
      close: vi.fn(async () => {}),
      execScript: vi.fn(async () => {}),
    }
    const adminFactory = vi.fn(() => admin)
    const error = vi.fn()
    const log = vi.fn()
    const readSeedSql = vi.fn(() => 'SELECT 1;')

    const exitCode = await main(['seed'], {
      adminFactory,
      consoleObj: { error, log },
      cwd: '/workspace',
      env: { DATABASE_URL: 'file:./tmp/dev.sqlite' },
      readSeedSql,
      loadEnvironmentFilesImpl: vi.fn(),
    })

    expect(exitCode).toBe(0)
    expect(adminFactory).toHaveBeenCalledWith('file:./tmp/dev.sqlite')
    expect(readSeedSql).toHaveBeenCalledWith('/workspace')
    expect(admin.execScript).toHaveBeenCalledWith('SELECT 1;')
    expect(log).toHaveBeenCalledWith('Database seed completed.')
    expect(admin.close).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('prints usage for unsupported commands before requiring a database URL', async () => {
    const error = vi.fn()
    const loadEnvironmentFilesImpl = vi.fn()

    const exitCode = await main(['studio'], {
      consoleObj: { error, log: vi.fn() },
      env: {},
      loadEnvironmentFilesImpl,
    })

    expect(exitCode).toBe(1)
    expect(loadEnvironmentFilesImpl).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith(
      'Usage: node scripts/db-admin.mjs <wait|health|reset|migrate|seed|exec-file>',
    )
  })
})
