export interface SpecificationLocalRequirementDetail {
  acceptanceCriteria: string | null
  createdAt: string
  description: string
  id: number
  itemRef: string
  needsReference: string | null
  needsReferenceId: number | null
  normReferences: {
    id: number
    name: string
    normReferenceId: string
    uri: string | null
  }[]
  priorityLevel: {
    code: string
    color: string
    iconName: string | null
    id: number
    nameEn: string
    nameSv: string
    sortOrder: number
  } | null
  qualityCharacteristic: { id: number; nameEn: string; nameSv: string } | null
  requirementArea: null
  requirementCategory: { id: number; nameEn: string; nameSv: string } | null
  requirementPackages: {
    id: number
    name: string | null
    purposeAndScope: string | null
  }[]
  requirementType: { id: number; nameEn: string; nameSv: string } | null
  specificationId: number
  specificationItemStatusColor: string | null
  specificationItemStatusIconName: string | null
  specificationItemStatusId: number | null
  specificationItemStatusNameEn: string | null
  specificationItemStatusNameSv: string | null
  uniqueId: string
  updatedAt: string
  verifiable: boolean
  verificationMethod: string | null
}

export interface SpecificationLocalRequirementKey {
  localRequirementId: number
  specificationId: number
}
