import { z } from 'zod'
import {
  BUSINESS_TEXT_MAX_LENGTH,
  DB_STRING_MAX_LENGTH,
  positiveIntegerSchema,
  SQL_SERVER_INT_MAX,
} from '@/lib/http/validation'
import {
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
  type RequirementImportBudget,
  validateImportContentBudget,
} from '@/lib/requirements/import-budget'

export const REQUIREMENTS_IMPORT_SCHEMA_VERSION = 'requirement-import.v4'

const optionalImportTextSchema = z.string().max(BUSINESS_TEXT_MAX_LENGTH)
const optionalImportDbStringSchema = z.string().max(DB_STRING_MAX_LENGTH)
const optionalNullableImportTextSchema = optionalImportTextSchema
  .nullable()
  .optional()
const optionalNullableImportDbStringSchema = optionalImportDbStringSchema
  .nullable()
  .optional()
const nonEmptyArrayStringSchema = z
  .string()
  .trim()
  .min(1)
  .max(DB_STRING_MAX_LENGTH)

export const proposedNormReferenceSchema = z
  .object({
    issuer: z.string().trim().min(1).max(DB_STRING_MAX_LENGTH),
    key: z.string().trim().min(1).max(DB_STRING_MAX_LENGTH),
    name: z.string().trim().min(1).max(DB_STRING_MAX_LENGTH),
    normReferenceId: optionalNullableImportDbStringSchema,
    reference: z.string().trim().min(1).max(DB_STRING_MAX_LENGTH),
    type: z.string().trim().min(1).max(DB_STRING_MAX_LENGTH),
    uri: optionalNullableImportTextSchema,
    version: optionalNullableImportTextSchema,
  })
  .strict()

export const proposedNeedsReferenceSchema = z
  .object({
    description: optionalNullableImportTextSchema,
    key: z.string().trim().min(1).max(DB_STRING_MAX_LENGTH),
    text: z.string().trim().min(1).max(DB_STRING_MAX_LENGTH),
  })
  .strict()

export function buildImportRequirementSchema(budget: RequirementImportBudget) {
  const positiveIntegerArraySchema = z
    .array(positiveIntegerSchema)
    .max(budget.maxNestedItems)
  const boundedStringArraySchema = z
    .array(nonEmptyArrayStringSchema)
    .max(budget.maxNestedItems)
  return z
    .object({
      acceptanceCriteria: optionalNullableImportTextSchema,
      categoryId: positiveIntegerSchema.nullable().optional(),
      categoryName: optionalNullableImportDbStringSchema,
      description: z.string().trim().min(1).max(BUSINESS_TEXT_MAX_LENGTH),
      needsReferenceId: positiveIntegerSchema.nullable().optional(),
      needsReferenceKey: optionalNullableImportDbStringSchema,
      normReferenceIds: boundedStringArraySchema.optional(),
      proposedNormReferenceKeys: boundedStringArraySchema.optional(),
      qualityCharacteristicId: positiveIntegerSchema.nullable().optional(),
      qualityCharacteristicName: optionalNullableImportDbStringSchema,
      requirementPackageIds: positiveIntegerArraySchema.optional(),
      requirementPackageNames: boundedStringArraySchema.optional(),
      verifiable: z.boolean().nullable().optional(),
      priorityLevelCode: optionalNullableImportDbStringSchema,
      priorityLevelId: positiveIntegerSchema.nullable().optional(),
      priorityLevelName: optionalNullableImportDbStringSchema,
      typeId: positiveIntegerSchema.nullable().optional(),
      typeName: optionalNullableImportDbStringSchema,
      verificationMethod: optionalNullableImportTextSchema,
    })
    .strict()
}

export const importRequirementSchema = buildImportRequirementSchema(
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
)

export function buildRequirementsImportPayloadSchema(
  budget: RequirementImportBudget,
) {
  return z
    .object({
      proposedNeedsReferences: z
        .array(proposedNeedsReferenceSchema)
        .max(budget.maxProposedNeedsReferences)
        .optional(),
      proposedNormReferences: z
        .array(proposedNormReferenceSchema)
        .max(budget.maxProposedNormReferences)
        .optional(),
      requirements: z
        .array(buildImportRequirementSchema(budget))
        .min(1)
        .max(budget.maxRows),
      schemaVersion: z.literal(REQUIREMENTS_IMPORT_SCHEMA_VERSION),
    })
    .strict()
    .superRefine((payload, ctx) => {
      const keys = new Set<string>()
      for (const [index, proposal] of (
        payload.proposedNormReferences ?? []
      ).entries()) {
        if (keys.has(proposal.key)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Expected unique proposed norm reference keys',
            path: ['proposedNormReferences', index, 'key'],
          })
        }
        keys.add(proposal.key)
      }
      const needsReferenceKeys = new Set<string>()
      for (const [index, proposal] of (
        payload.proposedNeedsReferences ?? []
      ).entries()) {
        if (needsReferenceKeys.has(proposal.key)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Expected unique proposed needs reference keys',
            path: ['proposedNeedsReferences', index, 'key'],
          })
        }
        needsReferenceKeys.add(proposal.key)
      }
      for (const issue of validateImportContentBudget(payload, budget)) {
        if (issue.code !== 'import_json_depth_cap_exceeded') continue
        ctx.addIssue({
          code: 'custom',
          message: issue.code,
          path: [],
        })
      }
    })
}

export const requirementsImportPayloadSchema =
  buildRequirementsImportPayloadSchema(DEFAULT_REQUIREMENT_IMPORT_BUDGET)

export const importLocaleSchema = z.enum(['en', 'sv']).optional().default('en')

export function buildImportPreviewBodySchema(budget: RequirementImportBudget) {
  return z
    .object({
      areaId: positiveIntegerSchema.optional(),
      locale: importLocaleSchema,
      payload: buildRequirementsImportPayloadSchema(budget),
    })
    .strict()
}

export const importPreviewBodySchema = buildImportPreviewBodySchema(
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
)

export function buildImportReviewRowSchema(budget: RequirementImportBudget) {
  const positiveIntegerArraySchema = z
    .array(positiveIntegerSchema)
    .max(budget.maxNestedItems)
  return z
    .object({
      acceptanceCriteria: optionalNullableImportTextSchema,
      categoryId: positiveIntegerSchema.nullable().optional(),
      description: z.string().trim().min(1).max(BUSINESS_TEXT_MAX_LENGTH),
      needsReferenceId: positiveIntegerSchema.nullable().optional(),
      normReferenceIds: positiveIntegerArraySchema.optional().default([]),
      qualityCharacteristicId: positiveIntegerSchema.nullable().optional(),
      requirementPackageIds: positiveIntegerArraySchema.optional().default([]),
      verifiable: z.boolean().optional().default(false),
      reviewRowId: z.string().trim().min(1).max(DB_STRING_MAX_LENGTH),
      priorityLevelId: positiveIntegerSchema.nullable().optional(),
      sourceIndex: z.number().int().min(0).max(SQL_SERVER_INT_MAX),
      typeId: positiveIntegerSchema.nullable().optional(),
      verificationMethod: optionalNullableImportTextSchema,
    })
    .strict()
}

export const importReviewRowSchema = buildImportReviewRowSchema(
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
)

export function buildImportExecuteBodySchema(budget: RequirementImportBudget) {
  return z
    .object({
      areaId: positiveIntegerSchema,
      locale: importLocaleSchema,
      previewToken: z.string().trim().min(1).max(DB_STRING_MAX_LENGTH),
      rows: z
        .array(buildImportReviewRowSchema(budget))
        .min(1)
        .max(budget.maxRows),
    })
    .strict()
}

export const importExecuteBodySchema = buildImportExecuteBodySchema(
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
)

export type ImportRequirement = z.infer<typeof importRequirementSchema>
export type ImportRequirementsPayload = z.infer<
  typeof requirementsImportPayloadSchema
>
export type ImportPreviewBody = z.infer<typeof importPreviewBodySchema>
export type ImportReviewRowInput = z.infer<typeof importReviewRowSchema>
export type ImportExecuteBody = z.infer<typeof importExecuteBodySchema>

export type JsonSchema = Record<string, unknown>

const optionalStringSchema = (maxLength = BUSINESS_TEXT_MAX_LENGTH) => ({
  maxLength,
  type: 'string',
})

const requiredStringSchema = (maxLength = BUSINESS_TEXT_MAX_LENGTH) => ({
  maxLength,
  minLength: 1,
  type: 'string',
})

const nullableOptionalStringSchema = (
  maxLength = BUSINESS_TEXT_MAX_LENGTH,
) => ({
  anyOf: [optionalStringSchema(maxLength), { type: 'null' }],
})

const positiveIntegerJsonSchema = {
  maximum: SQL_SERVER_INT_MAX,
  minimum: 1,
  type: 'integer',
}

const stringArrayJsonSchema = {
  items: {
    maxLength: DB_STRING_MAX_LENGTH,
    minLength: 1,
    type: 'string',
  },
  type: 'array',
}

const positiveIntegerArrayJsonSchema = {
  items: positiveIntegerJsonSchema,
  type: 'array',
}

export function buildRequirementsImportJsonSchema(
  locale: 'en' | 'sv' = 'en',
  budget: RequirementImportBudget = DEFAULT_REQUIREMENT_IMPORT_BUDGET,
): JsonSchema {
  const isSv = locale === 'sv'
  const description = isSv
    ? 'Strikt JSON Schema för kravimport. Destination väljs utanför filen.'
    : 'Strict JSON Schema for requirement import. Destination is selected outside the file.'

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false,
    description,
    'x-requirement-import-budget': budget,
    'x-import-content-max-depth': budget.maxJsonDepth,
    properties: {
      proposedNormReferences: {
        items: {
          additionalProperties: false,
          properties: {
            issuer: requiredStringSchema(DB_STRING_MAX_LENGTH),
            key: requiredStringSchema(DB_STRING_MAX_LENGTH),
            name: requiredStringSchema(DB_STRING_MAX_LENGTH),
            normReferenceId: nullableOptionalStringSchema(DB_STRING_MAX_LENGTH),
            reference: requiredStringSchema(DB_STRING_MAX_LENGTH),
            type: requiredStringSchema(DB_STRING_MAX_LENGTH),
            uri: nullableOptionalStringSchema(),
            version: nullableOptionalStringSchema(),
          },
          required: ['key', 'name', 'type', 'reference', 'issuer'],
          type: 'object',
        },
        maxItems: budget.maxProposedNormReferences,
        type: 'array',
      },
      proposedNeedsReferences: {
        items: {
          additionalProperties: false,
          properties: {
            description: nullableOptionalStringSchema(),
            key: requiredStringSchema(DB_STRING_MAX_LENGTH),
            text: requiredStringSchema(DB_STRING_MAX_LENGTH),
          },
          required: ['key', 'text'],
          type: 'object',
        },
        maxItems: budget.maxProposedNeedsReferences,
        type: 'array',
      },
      requirements: {
        items: {
          additionalProperties: false,
          properties: {
            acceptanceCriteria: nullableOptionalStringSchema(),
            categoryId: {
              anyOf: [positiveIntegerJsonSchema, { type: 'null' }],
            },
            categoryName: nullableOptionalStringSchema(DB_STRING_MAX_LENGTH),
            description: {
              maxLength: BUSINESS_TEXT_MAX_LENGTH,
              minLength: 1,
              type: 'string',
            },
            needsReferenceId: {
              anyOf: [positiveIntegerJsonSchema, { type: 'null' }],
              description: isSv
                ? 'Behovsreferens-ID används vid import till kravunderlag. Vid import till kravbiblioteket ignoreras fältet.'
                : 'Needs reference ID is used when importing to a requirements specification. When importing to the requirements library, this field is ignored.',
            },
            needsReferenceKey: {
              ...nullableOptionalStringSchema(DB_STRING_MAX_LENGTH),
              description: isSv
                ? 'Nyckel till proposedNeedsReferences. Används vid import till kravunderlag när en föreslagen behovsreferens ska lösas i granskningen. Vid import till kravbiblioteket ignoreras fältet.'
                : 'Key into proposedNeedsReferences. Used when importing to a requirements specification and a proposed needs reference must be resolved in review. When importing to the requirements library, this field is ignored.',
            },
            normReferenceIds: {
              ...stringArrayJsonSchema,
              maxItems: budget.maxNestedItems,
            },
            proposedNormReferenceKeys: {
              ...stringArrayJsonSchema,
              maxItems: budget.maxNestedItems,
            },
            qualityCharacteristicId: {
              anyOf: [positiveIntegerJsonSchema, { type: 'null' }],
            },
            qualityCharacteristicName:
              nullableOptionalStringSchema(DB_STRING_MAX_LENGTH),
            requirementPackageIds: {
              ...positiveIntegerArrayJsonSchema,
              maxItems: budget.maxNestedItems,
              description: isSv
                ? 'Kravpakets-ID:n används vid import till kravbiblioteket. Vid import till kravunderlagslokala krav ignoreras fältet.'
                : 'Requirement package IDs are used when importing to the requirements library. When importing specification-local requirements, this field is ignored.',
            },
            requirementPackageNames: {
              ...stringArrayJsonSchema,
              maxItems: budget.maxNestedItems,
              description: isSv
                ? 'Namn på kravpaket används som reserv när ID saknas. Namn måste matcha exakt och unikt. Vid import till kravunderlagslokala krav ignoreras fältet.'
                : 'Requirement package names are a fallback when IDs are unavailable. Names must match exactly and uniquely. When importing specification-local requirements, this field is ignored.',
            },
            verifiable: {
              anyOf: [{ type: 'boolean' }, { type: 'null' }],
            },
            priorityLevelId: {
              anyOf: [positiveIntegerJsonSchema, { type: 'null' }],
            },
            priorityLevelCode:
              nullableOptionalStringSchema(DB_STRING_MAX_LENGTH),
            priorityLevelName:
              nullableOptionalStringSchema(DB_STRING_MAX_LENGTH),
            typeId: {
              anyOf: [positiveIntegerJsonSchema, { type: 'null' }],
            },
            typeName: nullableOptionalStringSchema(DB_STRING_MAX_LENGTH),
            verificationMethod: nullableOptionalStringSchema(),
          },
          required: ['description'],
          type: 'object',
        },
        maxItems: budget.maxRows,
        minItems: 1,
        type: 'array',
      },
      schemaVersion: {
        const: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
        description: isSv
          ? 'Toppnivåfältet som versionerar hela kravimportfilen.'
          : 'Top-level field that versions the whole requirement import file.',
        type: 'string',
      },
    },
    required: ['schemaVersion', 'requirements'],
    title: isSv ? 'Kravimport' : 'Requirements import',
    type: 'object',
  }
}
