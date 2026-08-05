import { describe, expect, it } from 'vitest'
import { requirementPackageName } from '@/lib/reports/package-name'

describe('requirement package name', () => {
  it('returns the name or an empty fallback', () => {
    expect(requirementPackageName({ name: 'Package' })).toBe('Package')
    expect(requirementPackageName(null)).toBe('')
  })
})
