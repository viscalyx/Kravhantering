import { describe, expect, it } from 'vitest'
import {
  selectCleanupSourceMigrations,
  validateCleanupFixtureInputs,
} from '../containers/cleanup-source-schema.mjs'

const sha256 =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
function source() {
  return {
    schemaVersion: 'Source123',
    migrationFiles: [{ fileName: '0001_initial.mjs', sha256 }],
  }
}
const descriptors = [
  { fileName: '0001_initial.mjs', name: 'Source123' },
  { fileName: '0002_target.mjs', name: 'Target124' },
]
describe('cleanup compatibility schema fixtures', () => {
  it('selects only exact source migration bytes and the declared head', () => {
    expect(
      selectCleanupSourceMigrations(source(), descriptors, () => 'abc'),
    ).toEqual([descriptors[0]])
  })
  it.each([
    'missing-lock',
    'unsafe-path',
    'unknown-file',
    'changed-bytes',
    'wrong-head',
    'duplicate',
  ])('rejects %s instead of inferring source compatibility', reason => {
    const input = source()
    if (reason === 'missing-lock') input.migrationFiles = []
    if (reason === 'unsafe-path')
      input.migrationFiles[0].fileName = '../migration.mjs'
    if (reason === 'unknown-file')
      input.migrationFiles[0].fileName = '0099_unknown.mjs'
    if (reason === 'wrong-head') input.schemaVersion = 'Other125'
    if (reason === 'duplicate')
      input.migrationFiles.push(input.migrationFiles[0])
    expect(() =>
      selectCleanupSourceMigrations(input, descriptors, () =>
        reason === 'changed-bytes' ? 'changed' : 'abc',
      ),
    ).toThrow()
  })
  it('requires explicit isolation, a disposable database and exact migration dependency', () => {
    const input = { ...source(), runtimePermissionManifestSha256: sha256 }
    const env = { KRAVHANTERING_CLEANUP_FIXTURE: '1' }
    expect(() =>
      validateCleanupFixtureInputs(input, 'cleanup_compat_source', env, 'abc'),
    ).not.toThrow()
    expect(() =>
      validateCleanupFixtureInputs(input, 'production', env, 'abc'),
    ).toThrow('disposable')
    expect(() =>
      validateCleanupFixtureInputs(input, 'cleanup_compat_source', {}, 'abc'),
    ).toThrow('disposable')
    expect(() =>
      validateCleanupFixtureInputs(
        input,
        'cleanup_compat_source',
        env,
        'changed',
      ),
    ).toThrow('dependency identity')
  })
})
