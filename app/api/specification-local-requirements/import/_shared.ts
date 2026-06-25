import type { z } from 'zod'
import { specificationIdOrSlugSchema } from '@/lib/http/validation'
import {
  importExecuteBodySchema,
  importPreviewBodySchema,
} from '@/lib/requirements/import-schema'

const specificationIdOrSlugBodyShape = {
  specificationIdOrSlug: specificationIdOrSlugSchema,
}

export const specificationImportPreviewBodySchema = importPreviewBodySchema
  .omit({ areaId: true })
  .extend(specificationIdOrSlugBodyShape)
  .strict()

export const specificationImportExecuteBodySchema = importExecuteBodySchema
  .omit({ areaId: true })
  .extend(specificationIdOrSlugBodyShape)
  .strict()

export type SpecificationImportPreviewBody = z.infer<
  typeof specificationImportPreviewBodySchema
>

export type SpecificationImportExecuteBody = z.infer<
  typeof specificationImportExecuteBodySchema
>

export function specificationActionTarget(specificationIdOrSlug: string) {
  return /^\d+$/.test(specificationIdOrSlug)
    ? { specificationId: Number(specificationIdOrSlug) }
    : { specificationSlug: specificationIdOrSlug }
}
