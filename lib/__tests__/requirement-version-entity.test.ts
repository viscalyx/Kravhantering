import { describe, expect, it } from 'vitest'
import { requirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'

describe('requirement-version TypeORM metadata', () => {
  it('uses SQL Server to generate a unique revision token', () => {
    const revisionToken = requirementVersionEntity.options.columns
      ?.revisionToken as { default?: unknown; type?: unknown } | undefined

    expect(revisionToken?.type).toBe('uniqueidentifier')
    expect(revisionToken?.default).toBeTypeOf('function')
    const generateDefault = revisionToken?.default as () => string
    expect(generateDefault()).toBe('NEWID()')
  })
})
