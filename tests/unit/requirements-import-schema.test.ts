import { describe, expect, it } from 'vitest'
import {
  buildRequirementsImportJsonSchema,
  importExecuteBodySchema,
  REQUIREMENTS_IMPORT_SCHEMA_VERSION,
  requirementsImportPayloadSchema,
} from '@/lib/requirements/import-schema'

describe('requirements import schema', () => {
  it('accepts a minimal requirement import payload', () => {
    const result = requirementsImportPayloadSchema.safeParse({
      requirements: [{ description: 'Systemet ska logga viktiga händelser.' }],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })

    expect(result.success).toBe(true)
  })

  it('rejects destination fields and other unknown fields', () => {
    const result = requirementsImportPayloadSchema.safeParse({
      areaId: 1,
      requirements: [
        {
          description: 'Systemet ska logga viktiga händelser.',
          needsReferenceId: 2,
        },
      ],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const unknownKeys = result.error.issues.flatMap(issue =>
        issue.code === 'unrecognized_keys' ? issue.keys : [],
      )
      expect(unknownKeys).toEqual(
        expect.arrayContaining(['areaId', 'needsReferenceId']),
      )
    }
  })

  it('rejects duplicate proposed norm reference keys', () => {
    const proposal = {
      issuer: 'ISO',
      key: 'iso-25010',
      name: 'ISO/IEC 25010',
      reference: '25010',
      type: 'standard',
    }
    const result = requirementsImportPayloadSchema.safeParse({
      proposedNormReferences: [proposal, proposal],
      requirements: [{ description: 'Systemet ska vara tillgängligt.' }],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([
        'proposedNormReferences',
        1,
        'key',
      ])
    }
  })

  it('requires an area id for library import execution', () => {
    const row = {
      description: 'Systemet ska logga viktiga händelser.',
      reviewRowId: 'row-0',
      sourceIndex: 0,
    }

    expect(
      importExecuteBodySchema.safeParse({
        previewToken: 'token',
        rows: [row],
      }).success,
    ).toBe(false)
    expect(
      importExecuteBodySchema.safeParse({
        areaId: 1,
        previewToken: 'token',
        rows: [row],
      }).success,
    ).toBe(true)
  })

  it('emits a strict JSON Schema for the shared file format', () => {
    const schema = buildRequirementsImportJsonSchema('sv')

    expect(schema).toMatchObject({
      additionalProperties: false,
      required: ['schemaVersion', 'requirements'],
      title: 'Kravimport',
      type: 'object',
    })
    const properties = schema.properties as Record<string, unknown>
    expect(properties).not.toHaveProperty('areaId')
    expect(properties).not.toHaveProperty('specificationId')
    expect(properties.proposedNormReferences).toMatchObject({
      items: {
        additionalProperties: false,
        properties: {
          issuer: { minLength: 1 },
          key: { minLength: 1 },
          name: { minLength: 1 },
          normReferenceId: {},
          reference: { minLength: 1 },
          type: { minLength: 1 },
          uri: {},
          version: {},
        },
        required: ['key', 'name', 'type', 'reference', 'issuer'],
      },
    })
    expect(properties.schemaVersion).toMatchObject({
      const: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      description: 'Toppnivåfältet som versionerar hela kravimportfilen.',
    })
    const requirements = properties.requirements as {
      items: { properties: Record<string, unknown> }
    }
    expect(requirements.items.properties.requirementPackageIds).toMatchObject({
      description:
        'Kravpakets-ID:n används vid import till kravbiblioteket. Vid import till kravunderlagslokala krav ignoreras fältet.',
    })
  })
})
