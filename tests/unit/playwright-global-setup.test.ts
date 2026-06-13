import { describe, expect, it } from 'vitest'
import { findMissingRoleFiles, ROLES } from '@/tests/integration/global-setup'

describe('findMissingRoleFiles', () => {
  it('keeps a dedicated admin-only storage state for permission-negative tests', () => {
    expect(ROLES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'admin',
          username: 'ada.admin',
          filePath: 'test-results/auth/admin.json',
        }),
        expect.objectContaining({
          role: 'admin-only',
          username: 'only.admin',
          filePath: 'test-results/auth/admin-only.json',
        }),
      ]),
    )
  })

  it('keeps storage states for authorization role-matrix users', () => {
    expect(ROLES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'area-owner',
          username: 'olle.areaowner',
        }),
        expect.objectContaining({
          role: 'area-coauthor',
          username: 'cora.coauthor',
        }),
        expect.objectContaining({
          role: 'specification-responsible',
          username: 'petra.specresp',
        }),
        expect.objectContaining({
          role: 'specification-coauthor',
          username: 'signe.speccoauthor',
        }),
        expect.objectContaining({
          role: 'package-lead',
          username: 'leo.pkglead',
        }),
        expect.objectContaining({
          role: 'package-coauthor',
          username: 'paul.pkgcoauthor',
        }),
        expect.objectContaining({
          role: 'no-roles',
          username: 'noah.noroles',
        }),
        expect.objectContaining({
          role: 'privacy-officer',
          username: 'disa.privacy',
        }),
      ]),
    )
  })

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
