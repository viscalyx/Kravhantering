export interface RequirementReportVersion {
  acceptanceCriteria: string | null
  archivedAt: string | null
  archiveInitiatedAt: string | null
  category: { id: number; nameEn: string; nameSv: string } | null
  createdAt: string
  createdBy: string | null
  description: string | null
  editedAt: string | null
  id: number
  publishedAt: string | null
  qualityCharacteristic: {
    id: number
    nameEn: string
    nameSv: string
  } | null
  references: { id: number; name: string; uri: string | null }[]
  requiresTesting: boolean
  status: number
  statusColor: string | null
  statusNameEn: string | null
  statusNameSv: string | null
  type: { id: number; nameEn: string; nameSv: string } | null
  verificationMethod: string | null
  versionNumber: number
  versionScenarios: {
    scenario: {
      id: number
      nameEn: string | null
      nameSv: string | null
    }
  }[]
}

export interface RequirementReportData {
  area: {
    id: number
    name: string
    ownerName: string | null
  } | null
  createdAt: string
  id: number
  isArchived: boolean
  uniqueId: string
  versions: RequirementReportVersion[]
}

export async function fetchRequirementForReport(
  id: number | string,
  locale: string,
): Promise<RequirementReportData> {
  const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000'
  const response = await fetch(
    `${baseUrl}/api/requirements/${id}?locale=${locale}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch requirement ${id}: ${response.status}`)
  }
  return response.json()
}

export async function fetchMultipleRequirements(
  ids: (number | string)[],
  locale: string,
): Promise<RequirementReportData[]> {
  return Promise.all(ids.map(id => fetchRequirementForReport(id, locale)))
}
