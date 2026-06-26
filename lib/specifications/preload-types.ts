import type { AiRequirementGenerationAvailability } from '@/lib/ai/generation-availability'
import type {
  AreaOption,
  RequirementPackageOption,
  RequirementRow,
  SpecificationItemStatusOption,
} from '@/lib/requirements/list-view'
import type { SpecificationPermissions } from '@/lib/specifications/permissions'

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
  governanceObjectType: SpecificationTaxonomyItem | null
  id: number
  implementationType: SpecificationTaxonomyItem | null
  lifecycleStatus: SpecificationTaxonomyItem | null
  name: string
  permissions?: SpecificationPermissions
  responsibleDisplayName: string | null
  responsibleHsaId: string
  specificationGovernanceObjectTypeId: number | null
  specificationImplementationTypeId: number | null
  specificationLifecycleStatusId: number | null
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
  selectionFilter?: {
    applied: boolean
    hasCurrentAnswers: boolean
    hasRequirementSelection: boolean
    hasNoRequirementSelection: boolean
    requirementIds: number[]
  }
}

export interface RequirementsSpecificationDetailInitialData {
  aiGenerationAvailability: AiRequirementGenerationAvailability
  areas: AreaOption[]
  availableNeedsRefs: SpecificationNeedsReference[]
  availableRequirements: AvailableRequirementsData
  errors: SpecificationPreloadError[]
  forbidden?: {
    responsible: {
      displayName: string | null
      email: string | null
      hsaId: string
    }
    specification: {
      name: string
      uniqueId: string
    }
  }
  leftNormReferenceOptions: NormReferenceOption[]
  notFound?: boolean
  requirementPackages: RequirementPackageOption[]
  rightNormReferenceOptions: NormReferenceOption[]
  spec: SpecificationMeta | null
  specificationGovernanceObjectTypes: SpecificationTaxonomyItem[]
  specificationImplementationTypes: SpecificationTaxonomyItem[]
  specificationItemStatuses: SpecificationItemStatusOption[]
  specificationItems: SpecificationListItem[]
  specificationLifecycleStatuses: SpecificationTaxonomyItem[]
}

export interface SpecificationRequirementArea {
  id: number
  name: string
}

export interface Specification {
  businessNeedsReference: string | null
  governanceObjectType: SpecificationTaxonomyItem | null
  id: number
  implementationType: SpecificationTaxonomyItem | null
  itemCount: number
  lifecycleStatus: SpecificationTaxonomyItem | null
  name: string
  permissions?: SpecificationPermissions
  requirementAreas: SpecificationRequirementArea[]
  responsibleDisplayName: string | null
  responsibleHsaId: string
  specificationGovernanceObjectTypeId: number | null
  specificationImplementationTypeId: number | null
  specificationLifecycleStatusId: number | null
  uniqueId: string
}

export interface RequirementsSpecificationsInitialData {
  collectionPermissions?: {
    canCreateSpecification: boolean
  }
  errors: SpecificationPreloadError[]
  governanceObjectTypes: SpecificationTaxonomyItem[]
  implementationTypes: SpecificationTaxonomyItem[]
  lifecycleStatuses: SpecificationTaxonomyItem[]
  specifications: Specification[]
}
