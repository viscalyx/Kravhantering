import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
  REQUIREMENT_IMPORT_CONTENT_MAX_BYTES,
} from '@/lib/requirements/import-budget'
import {
  assertRequirementImportTextSize,
  parseRequirementImportBudgetFromJsonSchema,
  RequirementImportClientBudgetError,
  readRequirementImportBudgetFromJsonSchema,
  readRequirementImportFile,
} from '@/lib/requirements/import-client'

describe('browser requirement import content guard', () => {
  it('accepts an exact 8 MiB selected file', async () => {
    const text = vi.fn(async () => 'content')

    await expect(
      readRequirementImportFile({
        size: REQUIREMENT_IMPORT_CONTENT_MAX_BYTES,
        text,
      }),
    ).resolves.toBe('content')
    expect(text).toHaveBeenCalledOnce()
  })

  it('rejects an 8 MiB plus one-byte file before reading it', async () => {
    const text = vi.fn(async () => 'must not be read')

    await expect(
      readRequirementImportFile({
        size: REQUIREMENT_IMPORT_CONTENT_MAX_BYTES + 1,
        text,
      }),
    ).rejects.toBeInstanceOf(RequirementImportClientBudgetError)
    expect(text).not.toHaveBeenCalled()
  })

  it('measures pasted content as UTF-8 bytes', () => {
    const exact = 'a'.repeat(REQUIREMENT_IMPORT_CONTENT_MAX_BYTES)
    expect(() => assertRequirementImportTextSize(exact)).not.toThrow()
    expect(() => assertRequirementImportTextSize(`${exact}å`)).toThrow(
      RequirementImportClientBudgetError,
    )
  })

  it('reads the effective budget advertised by the runtime schema', () => {
    expect(
      readRequirementImportBudgetFromJsonSchema({
        'x-requirement-import-budget': {
          maxJsonDepth: 6,
          maxNestedItems: 40,
          maxProposedNeedsReferences: 20,
          maxProposedNormReferences: 30,
          maxRows: 50,
        },
      }),
    ).toEqual({
      maxJsonDepth: 6,
      maxNestedItems: 40,
      maxProposedNeedsReferences: 20,
      maxProposedNormReferences: 30,
      maxRows: 50,
    })
  })

  it('falls back to the safe defaults for malformed schema metadata', () => {
    expect(
      readRequirementImportBudgetFromJsonSchema({
        'x-requirement-import-budget': { maxRows: '500' },
      }),
    ).toEqual(DEFAULT_REQUIREMENT_IMPORT_BUDGET)
    expect(
      parseRequirementImportBudgetFromJsonSchema({
        'x-requirement-import-budget': { maxRows: '500' },
      }),
    ).toBeNull()
  })

  it('rejects absent, non-object, and negative schema budget metadata', () => {
    expect(parseRequirementImportBudgetFromJsonSchema(null)).toBeNull()
    expect(parseRequirementImportBudgetFromJsonSchema({})).toBeNull()
    expect(
      parseRequirementImportBudgetFromJsonSchema({
        'x-requirement-import-budget': null,
      }),
    ).toBeNull()
    expect(
      parseRequirementImportBudgetFromJsonSchema({
        'x-requirement-import-budget': {
          maxJsonDepth: 6,
          maxNestedItems: 40,
          maxProposedNeedsReferences: 20,
          maxProposedNormReferences: 30,
          maxRows: -1,
        },
      }),
    ).toBeNull()
  })
})
