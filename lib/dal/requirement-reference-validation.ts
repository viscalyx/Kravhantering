import { validationError } from '@/lib/requirements/errors'

export interface RequirementReferenceExecutor {
  query: (sql: string, parameters?: unknown[]) => Promise<unknown>
}

export interface RequirementTaxonomyReferenceInput {
  normReferenceIds?: number[] | null
  priorityLevelId?: number | null
  qualityCharacteristicId?: number | null
  requirementAreaId?: number | null
  requirementCategoryId?: number | null
  requirementPackageIds?: number[] | null
  requirementTypeId?: number | null
}

export interface NormalizedRequirementTaxonomyReferences {
  normReferenceIds: number[]
  priorityLevelId: number | null
  qualityCharacteristicId: number | null
  requirementAreaId: number | null
  requirementCategoryId: number | null
  requirementPackageIds: number[]
  requirementTypeId: number | null
}

type ScalarReferenceField =
  | 'qualityCharacteristicId'
  | 'requirementAreaId'
  | 'requirementCategoryId'
  | 'requirementTypeId'
  | 'priorityLevelId'

type ArrayReferenceField = 'normReferenceIds' | 'requirementPackageIds'

interface ReferenceDescriptor<TField extends string> {
  field: TField
  label: string
  table: string
}

const SCALAR_REFERENCES: Array<ReferenceDescriptor<ScalarReferenceField>> = [
  {
    field: 'requirementAreaId',
    label: 'requirement area',
    table: 'requirement_areas',
  },
  {
    field: 'requirementCategoryId',
    label: 'requirement category',
    table: 'requirement_categories',
  },
  {
    field: 'requirementTypeId',
    label: 'requirement type',
    table: 'requirement_types',
  },
  {
    field: 'qualityCharacteristicId',
    label: 'quality characteristic',
    table: 'quality_characteristics',
  },
  {
    field: 'priorityLevelId',
    label: 'priority level',
    table: 'priority_levels',
  },
]

const ARRAY_REFERENCES: Array<ReferenceDescriptor<ArrayReferenceField>> = [
  {
    field: 'normReferenceIds',
    label: 'norm reference',
    table: 'norm_references',
  },
  {
    field: 'requirementPackageIds',
    label: 'requirement package',
    table: 'requirement_packages',
  },
]

function normalizeOptionalId(
  field: string,
  value: number | null | undefined,
): number | null {
  if (value == null) {
    return null
  }

  if (!Number.isInteger(value) || value < 1) {
    throw validationError(`${field} must be a positive integer`)
  }

  return value
}

function normalizeIdArray(
  field: string,
  values: number[] | null | undefined,
): number[] {
  if (values == null) {
    return []
  }

  if (!Array.isArray(values)) {
    throw validationError(`${field} must contain positive integer IDs`)
  }

  const normalized: number[] = []
  const seen = new Set<number>()
  for (const value of values) {
    if (!Number.isInteger(value) || value < 1) {
      throw validationError(`${field} must contain positive integer IDs`)
    }
    if (!seen.has(value)) {
      seen.add(value)
      normalized.push(value)
    }
  }
  return normalized
}

function unknownReferenceError(
  field: string,
  label: string,
  id: number,
): ReturnType<typeof validationError> {
  return validationError(`${field} references unknown ${label} id ${id}`)
}

async function getExistingIds(
  executor: RequirementReferenceExecutor,
  table: string,
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) {
    return new Set()
  }

  const placeholders = ids.map((_, index) => `@${index}`).join(', ')
  const rows = (await executor.query(
    `
      SELECT id
      FROM ${table}
      WHERE id IN (${placeholders})
    `,
    ids,
  )) as Array<{ id: unknown }>

  return new Set(
    rows
      .map(row => Number(row.id))
      .filter(id => Number.isInteger(id) && id > 0),
  )
}

export async function validateRequirementTaxonomyReferences(
  executor: RequirementReferenceExecutor,
  input: RequirementTaxonomyReferenceInput,
): Promise<NormalizedRequirementTaxonomyReferences> {
  const normalized: NormalizedRequirementTaxonomyReferences = {
    normReferenceIds: normalizeIdArray(
      'normReferenceIds',
      input.normReferenceIds,
    ),
    qualityCharacteristicId: normalizeOptionalId(
      'qualityCharacteristicId',
      input.qualityCharacteristicId,
    ),
    requirementAreaId: normalizeOptionalId(
      'requirementAreaId',
      input.requirementAreaId,
    ),
    requirementCategoryId: normalizeOptionalId(
      'requirementCategoryId',
      input.requirementCategoryId,
    ),
    requirementPackageIds: normalizeIdArray(
      'requirementPackageIds',
      input.requirementPackageIds,
    ),
    requirementTypeId: normalizeOptionalId(
      'requirementTypeId',
      input.requirementTypeId,
    ),
    priorityLevelId: normalizeOptionalId(
      'priorityLevelId',
      input.priorityLevelId,
    ),
  }

  const scalarLookups = SCALAR_REFERENCES.map(async reference => {
    const id = normalized[reference.field]
    return {
      ...reference,
      existingIds:
        id == null
          ? new Set<number>()
          : await getExistingIds(executor, reference.table, [id]),
      ids: id == null ? [] : [id],
    }
  })
  const arrayLookups = ARRAY_REFERENCES.map(async reference => {
    const ids = normalized[reference.field]
    return {
      ...reference,
      existingIds: await getExistingIds(executor, reference.table, ids),
      ids,
    }
  })

  const lookups = await Promise.all([...scalarLookups, ...arrayLookups])
  const lookupByField = new Map(lookups.map(lookup => [lookup.field, lookup]))

  for (const reference of SCALAR_REFERENCES) {
    const lookup = lookupByField.get(reference.field)
    const id = lookup?.ids[0]
    if (id != null && !lookup?.existingIds.has(id)) {
      throw unknownReferenceError(reference.field, reference.label, id)
    }
  }

  for (const reference of ARRAY_REFERENCES) {
    const lookup = lookupByField.get(reference.field)
    for (const id of lookup?.ids ?? []) {
      if (!lookup?.existingIds.has(id)) {
        throw unknownReferenceError(reference.field, reference.label, id)
      }
    }
  }

  return normalized
}
