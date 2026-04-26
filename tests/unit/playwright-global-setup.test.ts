import { describe, expect, it } from 'vitest'
import { findMissingRoleFiles, ROLES } from '@/tests/integration/global-setup'

describe('findMissingRoleFiles', () => {
  it('returns an empty array when every role storageState exists', () => {
    const result = findMissingRoleFiles(ROLES, () => true)
    expect(result).toEqual([])
  })

  it('returns the file paths of any missing role storageStates', () => {
    const present = new Set<string>([ROLES[0].filePath])
    const result = findMissingRoleFiles(ROLES, p => present.has(p))
    expect(result).toEqual(ROLES.slice(1).map(r => r.filePath))
  })

  it('returns every role file path when none exist', () => {
    const result = findMissingRoleFiles(ROLES, () => false)
    expect(result).toEqual(ROLES.map(r => r.filePath))
  })
})
