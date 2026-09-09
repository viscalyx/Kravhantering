import type { RequirementFormFieldValues } from '@/components/RequirementFormFields'
import type { TaxonomyOptions } from '@/hooks/useTaxonomyOptions'
import {
  STATUS_ARCHIVED,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'
import type { RequirementDetailResponse } from '@/lib/requirements/types'

export interface RequirementEditSnapshot {
  baseRevisionToken: string
  baseVersionId: number
  isPublished: boolean
  restriction: 'review' | 'archived' | 'permission' | null
  values: RequirementFormFieldValues
}

export function requirementEditSnapshot(
  data: RequirementDetailResponse,
): RequirementEditSnapshot | null {
  const latest = data.versions[0]
  if (!latest) return null
  return {
    baseRevisionToken: latest.revisionToken,
    baseVersionId: latest.id,
    isPublished: latest.status === STATUS_PUBLISHED,
    restriction:
      latest.status === STATUS_REVIEW
        ? 'review'
        : data.isArchived || latest.status === STATUS_ARCHIVED
          ? 'archived'
          : data.permissions?.canEdit === false
            ? 'permission'
            : null,
    values: {
      areaId: data.area?.id != null ? String(data.area.id) : '',
      categoryId: latest.category?.id != null ? String(latest.category.id) : '',
      typeId: latest.type?.id != null ? String(latest.type.id) : '',
      qualityCharacteristicId:
        latest.qualityCharacteristic?.id != null
          ? String(latest.qualityCharacteristic.id)
          : '',
      priorityLevelId:
        latest.priorityLevel?.id != null ? String(latest.priorityLevel.id) : '',
      description: latest.description ?? '',
      acceptanceCriteria: latest.acceptanceCriteria ?? '',
      verifiable: Boolean(latest.verifiable),
      verificationMethod: latest.verificationMethod ?? '',
      normReferenceIds: latest.versionNormReferences
        .map(item => item.normReference.id)
        .filter((id): id is number => id != null),
      requirementPackageIds: latest.versionRequirementPackages
        .map(item => item.requirementPackage.id)
        .filter((id): id is number => id != null),
    },
  }
}

type Field = keyof RequirementFormFieldValues

// Resolve dependent values together so a merge cannot silently drop a method
// or attach a quality characteristic to the other author's requirement type.
export const REQUIREMENT_EDIT_GROUPS = [
  ['description'],
  ['acceptanceCriteria'],
  ['verifiable', 'verificationMethod'],
  ['areaId'],
  ['categoryId'],
  ['typeId', 'qualityCharacteristicId'],
  ['priorityLevelId'],
  ['normReferenceIds'],
  ['requirementPackageIds'],
] as const satisfies readonly (readonly Field[])[]

function equalValue(
  left: RequirementFormFieldValues[Field],
  right: RequirementFormFieldValues[Field],
) {
  if (Array.isArray(left) && Array.isArray(right)) {
    const leftSet = new Set(left)
    const rightSet = new Set(right)
    return (
      leftSet.size === rightSet.size &&
      [...leftSet].every(id => rightSet.has(id))
    )
  }
  return left === right
}

export function compareRequirementEdits(
  starting: RequirementFormFieldValues,
  local: RequirementFormFieldValues,
  server: RequirementFormFieldValues,
) {
  return REQUIREMENT_EDIT_GROUPS.map(fields => {
    const equal = (
      a: RequirementFormFieldValues,
      b: RequirementFormFieldValues,
    ) => fields.every(field => equalValue(a[field], b[field]))
    const localChanged = !equal(starting, local)
    const serverChanged = !equal(starting, server)
    return {
      fields,
      changed: localChanged || serverChanged,
      conflict: localChanged && serverChanged && !equal(local, server),
      proposed: localChanged ? local : server,
    }
  })
}

export function formatRequirementEditValue(
  values: RequirementFormFieldValues,
  field: keyof RequirementFormFieldValues,
  taxonomyOptions: TaxonomyOptions,
  locale: string,
  text: { yes: string; no: string; empty: string },
): string {
  const value = values[field]
  if (typeof value === 'boolean') return value ? text.yes : text.no
  if (value === '' || (Array.isArray(value) && value.length === 0))
    return text.empty
  const catalogs = {
    areaId: taxonomyOptions.areas,
    categoryId: taxonomyOptions.categories,
    typeId: taxonomyOptions.types,
    qualityCharacteristicId: taxonomyOptions.qualityCharacteristics,
    priorityLevelId: taxonomyOptions.priorityLevels,
    normReferenceIds: taxonomyOptions.normReferences,
    requirementPackageIds: taxonomyOptions.requirementPackages,
  }
  if (!(field in catalogs)) return String(value)
  const catalog = catalogs[field as keyof typeof catalogs]
  return (Array.isArray(value) ? value : [Number(value)])
    .map(id => {
      const option = catalog.find(item => item.id === id)
      if (!option) return `#${id}`
      const name =
        'name' in option
          ? option.name
          : locale === 'sv'
            ? option.nameSv
            : option.nameEn
      return `${name} (#${id})`
    })
    .join(', ')
}
