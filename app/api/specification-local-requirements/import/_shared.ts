import type { z } from 'zod'
import { positiveIntegerSchema } from '@/lib/http/validation'
import type { RequirementImportBudget } from '@/lib/requirements/import-budget'
import {
  buildImportExecuteBodySchema,
  buildImportPreviewBodySchema,
  importExecuteBodySchema,
  importPreviewBodySchema,
} from '@/lib/requirements/import-schema'

const specificationIdBodyShape = {
  specificationId: positiveIntegerSchema,
}

export const specificationImportPreviewBodySchema = importPreviewBodySchema
  .omit({ areaId: true })
  .extend(specificationIdBodyShape)
  .strict()

export const specificationImportExecuteBodySchema = importExecuteBodySchema
  .omit({ areaId: true })
  .extend(specificationIdBodyShape)
  .strict()

export function buildSpecificationImportPreviewBodySchema(
  budget: RequirementImportBudget,
) {
  return buildImportPreviewBodySchema(budget)
    .omit({ areaId: true })
    .extend(specificationIdBodyShape)
    .strict()
}

export function buildSpecificationImportExecuteBodySchema(
  budget: RequirementImportBudget,
) {
  return buildImportExecuteBodySchema(budget)
    .omit({ areaId: true })
    .extend(specificationIdBodyShape)
    .strict()
}

export type SpecificationImportPreviewBody = z.infer<
  typeof specificationImportPreviewBodySchema
>

export type SpecificationImportExecuteBody = z.infer<
  typeof specificationImportExecuteBodySchema
>
