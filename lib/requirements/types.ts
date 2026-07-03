export interface RequirementLocalizedEntity {
  id: number
  nameEn: string | null
  nameSv: string | null
}

export interface RequirementPackageSummary {
  id: number
  name: string | null
  ownerId?: number | null
  purposeAndScope?: string | null
}

export interface RequirementVersionRequirementPackage {
  requirementPackage: RequirementPackageSummary
}

export interface NormReferenceSummary {
  id: number
  issuer: string
  name: string
  normReferenceId: string
  reference: string
  type: string
  uri: string | null
  version: string | null
}

export interface RequirementVersionNormReference {
  normReference: NormReferenceSummary
}

export interface PriorityLevelSummary {
  color: string
  iconName?: string | null
  id: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

export interface RequirementVersionDetail {
  acceptanceCriteria: string | null
  archivedAt: string | null
  archiveInitiatedAt: string | null
  category: RequirementLocalizedEntity | null
  createdAt: string
  createdBy: string | null
  description: string | null
  editedAt: string | null
  id: number
  ownerName: string | null
  priorityLevel: PriorityLevelSummary | null
  publishedAt: string | null
  qualityCharacteristic: RequirementLocalizedEntity | null
  revisionToken: string
  status: number
  statusColor: string | null
  statusIconName?: string | null
  statusNameEn: string | null
  statusNameSv: string | null
  type: RequirementLocalizedEntity | null
  verifiable: boolean
  verificationMethod: string | null
  versionNormReferences: RequirementVersionNormReference[]
  versionNumber: number
  versionRequirementPackages: RequirementVersionRequirementPackage[]
}

export interface RequirementDetailArea {
  id: number
  name: string
  ownerHsaId: string
  prefix: string
}

export interface RequirementDetail {
  area: RequirementDetailArea | null
  createdAt: string
  id: number
  isArchived: boolean
  specificationCount: number
  uniqueId: string
  versions: RequirementVersionDetail[]
}

export interface RequirementDetailPermissions {
  allowedTransitionStatusIds: number[]
  canArchive: boolean
  canDeleteDraft: boolean
  canEdit: boolean
  canManageSuggestions: boolean
  canReactivate: boolean
  canRestore: boolean
  canViewHistory: boolean
}

export interface RequirementDetailAreaResponse extends RequirementDetailArea {
  ownerName: string
}

export interface RequirementDetailResponse
  extends Omit<RequirementDetail, 'area'> {
  area: RequirementDetailAreaResponse | null
  permissions: RequirementDetailPermissions
}

export interface RequirementVersionResponse {
  uniqueId: string
  version: RequirementVersionDetail
}

export type DeletedRequirementObject =
  | {
      type: 'draftRequirementVersion'
      requirementUniqueId: string
      versionNumber: number
    }
  | {
      type: 'requirement'
      requirementUniqueId: string
    }

export interface DeleteDraftResult {
  deleted: DeletedRequirementObject[]
}
