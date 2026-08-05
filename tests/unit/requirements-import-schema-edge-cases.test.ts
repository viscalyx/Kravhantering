import { describe, expect, it } from 'vitest'
import {
  buildRequirementsImportJsonSchema,
  requirementsImportPayloadSchema,
} from '@/lib/requirements/import-schema'

const normProposal = {
  issuer: 'ISO',
  key: 'iso-27001',
  name: 'Information security',
  reference: 'ISO/IEC 27001',
  type: 'standard',
}

describe('requirements import schema', () => {
  it('rejects duplicate proposed norm-reference keys at the duplicate item', () => {
    const result = requirementsImportPayloadSchema.safeParse({
      proposedNormReferences: [normProposal, normProposal],
      requirements: [{ description: 'Requirement' }],
      schemaVersion: 'requirement-import.v3',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['proposedNormReferences', 1, 'key'],
        }),
      )
    }
  })

  it('rejects duplicate proposed needs-reference keys independently', () => {
    const proposal = { key: 'business-need', text: 'Business need' }
    const result = requirementsImportPayloadSchema.safeParse({
      proposedNeedsReferences: [proposal, proposal],
      requirements: [{ description: 'Requirement' }],
      schemaVersion: 'requirement-import.v3',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['proposedNeedsReferences', 1, 'key'],
        }),
      )
    }
  })

  it('builds complete default-English and Swedish JSON schemas', () => {
    const english = buildRequirementsImportJsonSchema()
    const swedish = buildRequirementsImportJsonSchema('sv')

    expect(english).toMatchObject({
      description: expect.stringContaining('Strict JSON Schema'),
      properties: {
        proposedNeedsReferences: expect.any(Object),
        proposedNormReferences: expect.any(Object),
        requirements: expect.any(Object),
      },
    })
    expect(swedish).toMatchObject({
      description: expect.stringContaining('Strikt JSON Schema'),
    })
  })
})
