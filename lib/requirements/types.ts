export interface RequirementLocalizedEntity {
  id: number
  nameEn: string | null
  nameSv: string | null
}

export interface RequirementReference {
  id: number
  name: string
  owner?: string | null
  uri: string | null
}

export interface RequirementScenarioSummary extends RequirementLocalizedEntity {
  descriptionEn: string | null
  descriptionSv: string | null
  ownerId: number | null
}

export interface RequirementVersionScenario {
  scenario: RequirementScenarioSummary
}

export interface NormReferenceSummary {
  id: number
  issuer: string
  name: string
  normReferenceId: string
  reference: string
  type: string
  version: string | null
}

export interface RequirementVersionNormReference {
  normReference: NormReferenceSummary
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
  publishedAt: string | null
  qualityCharacteristic: RequirementLocalizedEntity | null
  references: RequirementReference[]
  requiresTesting: boolean
  status: number
  statusColor: string | null
  statusNameEn: string | null
  statusNameSv: string | null
  type: RequirementLocalizedEntity | null
  verificationMethod: string | null
  versionNormReferences: RequirementVersionNormReference[]
  versionNumber: number
  versionScenarios: RequirementVersionScenario[]
}

export interface RequirementDetailArea {
  id: number
  name: string
  ownerId: number | null
  prefix: string
}

export interface RequirementDetail {
  area: RequirementDetailArea | null
  createdAt: string
  id: number
  isArchived: boolean
  uniqueId: string
  versions: RequirementVersionDetail[]
}

export interface RequirementDetailAreaResponse extends RequirementDetailArea {
  ownerName: string | null
}

export interface RequirementDetailResponse
  extends Omit<RequirementDetail, 'area'> {
  area: RequirementDetailAreaResponse | null
}

export interface RequirementVersionResponse {
  uniqueId: string
  version: RequirementVersionDetail
}
