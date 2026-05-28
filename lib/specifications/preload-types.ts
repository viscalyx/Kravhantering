import type {
  AreaOption,
  FilterOption,
  RequirementRow,
  SpecificationItemStatusOption,
} from '@/lib/requirements/list-view'

export interface SpecificationPreloadError {
  key: string
  message: string
}

export interface SpecificationTaxonomyItem {
  id: number
  nameEn: string
  nameSv: string
}

export interface SpecificationMeta {
  businessNeedsReference: string | null
  canResponsibleGenerateAi: boolean
  id: number
  implementationType: SpecificationTaxonomyItem | null
  lifecycleStatus: SpecificationTaxonomyItem | null
  name: string
  responsibilityArea: SpecificationTaxonomyItem | null
  responsibleDisplayName: string | null
  responsibleHsaId: string | null
  specificationImplementationTypeId: number | null
  specificationLifecycleStatusId: number | null
  specificationResponsibilityAreaId: number | null
  uniqueId: string
}

export interface SpecificationListItem extends RequirementRow {
  needsReference?: string | null
}

export interface SpecificationNeedsReference {
  createdAt?: string
  description: string | null
  id: number
  libraryItemCount?: number
  linkedItemCount?: number
  specificationLocalRequirementCount?: number
  text: string
  updatedAt?: string
}

export interface NormReferenceOption {
  id: number
  name: string
  normReferenceId: string
}

export interface AvailableRequirementsData {
  hasMore: boolean
  rows: RequirementRow[]
}

export interface RequirementsSpecificationDetailInitialData {
  areas: AreaOption[]
  availableNeedsRefs: SpecificationNeedsReference[]
  availableRequirements: AvailableRequirementsData
  errors: SpecificationPreloadError[]
  leftNormReferenceOptions: NormReferenceOption[]
  requirementPackages: FilterOption[]
  rightNormReferenceOptions: NormReferenceOption[]
  spec: SpecificationMeta | null
  specificationImplementationTypes: SpecificationTaxonomyItem[]
  specificationItemStatuses: SpecificationItemStatusOption[]
  specificationItems: SpecificationListItem[]
  specificationLifecycleStatuses: SpecificationTaxonomyItem[]
  specificationResponsibilityAreas: SpecificationTaxonomyItem[]
}

export interface SpecificationRequirementArea {
  id: number
  name: string
}

export interface Specification {
  businessNeedsReference: string | null
  canResponsibleGenerateAi: boolean
  id: number
  implementationType: SpecificationTaxonomyItem | null
  itemCount: number
  lifecycleStatus: SpecificationTaxonomyItem | null
  name: string
  requirementAreas: SpecificationRequirementArea[]
  responsibilityArea: SpecificationTaxonomyItem | null
  responsibleDisplayName: string | null
  responsibleHsaId: string | null
  specificationImplementationTypeId: number | null
  specificationLifecycleStatusId: number | null
  specificationResponsibilityAreaId: number | null
  uniqueId: string
}

export interface RequirementsSpecificationsInitialData {
  errors: SpecificationPreloadError[]
  implementationTypes: SpecificationTaxonomyItem[]
  lifecycleStatuses: SpecificationTaxonomyItem[]
  responsibilityAreas: SpecificationTaxonomyItem[]
  specifications: Specification[]
}
