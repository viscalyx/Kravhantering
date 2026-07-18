import { z } from 'zod'
import {
  optionalQueryArraySchema,
  optionalSearchStringSchema,
  positiveIntegerStringSchema,
  queryBooleanStringSchema,
} from '@/lib/http/validation'
import { REQUIREMENT_SORT_FIELDS } from '@/lib/requirements/list-view'

export const specificationItemQueryStateSchema = z
  .object({
    areaIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    categoryIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    descriptionSearch: optionalSearchStringSchema,
    locale: z.enum(['en', 'sv']).optional().default('en'),
    needsReferenceIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    normReferenceIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    priorityLevelIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    qualityCharacteristicIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    requirementPackageIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    sortBy: z.enum(REQUIREMENT_SORT_FIELDS).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    specificationItemStatusIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    statuses: optionalQueryArraySchema(positiveIntegerStringSchema),
    typeIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    uniqueIdSearch: optionalSearchStringSchema,
    verifiable: optionalQueryArraySchema(queryBooleanStringSchema),
  })
  .strict()

export const specificationItemPageQuerySchema =
  specificationItemQueryStateSchema.extend({
    cursor: z.string().min(1).max(512).optional(),
    limit: positiveIntegerStringSchema
      .refine(value => value <= 100, {
        message: 'Expected a page size no greater than 100',
      })
      .optional(),
  })

export interface SpecificationItemQueryState {
  areaIds?: number[]
  categoryIds?: number[]
  descriptionSearch?: string
  locale: 'en' | 'sv'
  needsReferenceIds?: number[]
  normReferenceIds?: number[]
  priorityLevelIds?: number[]
  qualityCharacteristicIds?: number[]
  requirementPackageIds?: number[]
  sortBy?: (typeof REQUIREMENT_SORT_FIELDS)[number]
  sortDirection?: 'asc' | 'desc'
  specificationItemStatusIds?: number[]
  statuses?: number[]
  typeIds?: number[]
  uniqueIdSearch?: string
  verifiable?: string[]
}

export function toSpecificationItemPageInput(
  specificationId: number,
  query: SpecificationItemQueryState,
) {
  return {
    filters: {
      areaIds: query.areaIds,
      categoryIds: query.categoryIds,
      descriptionSearch: query.descriptionSearch,
      needsReferenceIds: query.needsReferenceIds,
      normReferenceIds: query.normReferenceIds,
      priorityLevelIds: query.priorityLevelIds,
      qualityCharacteristicIds: query.qualityCharacteristicIds,
      requirementPackageIds: query.requirementPackageIds,
      specificationItemStatusIds: query.specificationItemStatusIds,
      statuses: query.statuses,
      typeIds: query.typeIds,
      uniqueIdSearch: query.uniqueIdSearch,
      verifiable: query.verifiable,
    },
    locale: query.locale,
    sort: {
      by: query.sortBy ?? 'uniqueId',
      direction: query.sortDirection ?? 'asc',
    },
    specificationId,
  } as const
}
