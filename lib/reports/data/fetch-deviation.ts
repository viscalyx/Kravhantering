export interface DeviationReportDeviation {
  createdAt: string
  createdBy: string | null
  motivation: string
}

export interface DeviationReportVersion {
  acceptanceCriteria: string | null
  category: { nameEn: string; nameSv: string } | null
  createdBy: string | null
  description: string | null
  normReferences: { name: string; reference: string; uri: string | null }[]
  qualityCharacteristic: { nameEn: string; nameSv: string } | null
  requirementPackages: { nameEn: string | null; nameSv: string | null }[]
  requiresTesting: boolean
  riskLevel: { nameEn: string; nameSv: string } | null
  status: { color: string | null; label: string }
  type: { nameEn: string; nameSv: string } | null
  verificationMethod: string | null
  versionNumber: number
}

export interface DeviationReportData {
  deviation: DeviationReportDeviation
  requirementUniqueId: string
  specificationName: string | null
  specificationUniqueId: string | null
  version: DeviationReportVersion
}

export async function fetchDeviationForReport(
  requirementId: number | string,
  specificationItemId: number | string,
  locale: string,
): Promise<DeviationReportData> {
  const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000'

  const [reqRes, devRes] = await Promise.all([
    fetch(`${baseUrl}/api/requirements/${requirementId}?locale=${locale}`),
    fetch(
      `${baseUrl}/api/specification-item-deviations/${specificationItemId}`,
    ),
  ])

  if (!reqRes.ok) {
    throw new Error(
      `Failed to fetch requirement ${requirementId}: ${reqRes.status}`,
    )
  }
  if (!devRes.ok) {
    throw new Error(
      `Failed to fetch deviations for item ${specificationItemId}: ${devRes.status}`,
    )
  }

  const requirement = (await reqRes.json()) as {
    uniqueId: string
    versions: {
      acceptanceCriteria: string | null
      category: { id: number; nameEn: string; nameSv: string } | null
      createdBy: string | null
      description: string | null
      id: number
      qualityCharacteristic: {
        id: number
        nameEn: string
        nameSv: string
      } | null
      requiresTesting: boolean
      riskLevel: { id: number; nameEn: string; nameSv: string } | null
      status: number
      statusColor: string | null
      statusNameEn: string | null
      statusNameSv: string | null
      type: { id: number; nameEn: string; nameSv: string } | null
      verificationMethod: string | null
      versionNormReferences: {
        normReference: {
          name: string
          reference: string
          uri: string | null
        }
      }[]
      versionNumber: number
      versionRequirementPackages: {
        requirementPackage: { nameEn: string | null; nameSv: string | null }
      }[]
    }[]
  }

  const { deviations } = (await devRes.json()) as {
    deviations: {
      createdAt: string
      createdBy: string | null
      decision: number | null
      id: number
      isReviewRequested: number
      motivation: string
      specificationName: string | null
      specificationUniqueId: string | null
      requirementVersionId: number
    }[]
  }

  // Find the deviation in review (isReviewRequested=1 and no decision)
  const inReview = deviations.find(
    d => d.isReviewRequested === 1 && d.decision === null,
  )
  if (!inReview) {
    throw new Error('No deviation in review found')
  }

  // Find the specific version connected to the specification item
  const version =
    requirement.versions.find(v => v.id === inReview.requirementVersionId) ??
    requirement.versions[requirement.versions.length - 1]

  if (!version) {
    throw new Error('No requirement version found')
  }

  const statusLabel =
    locale === 'sv' ? version.statusNameSv : version.statusNameEn

  return {
    requirementUniqueId: requirement.uniqueId,
    specificationName: inReview.specificationName,
    specificationUniqueId: inReview.specificationUniqueId,
    deviation: {
      motivation: inReview.motivation,
      createdBy: inReview.createdBy,
      createdAt: inReview.createdAt,
    },
    version: {
      versionNumber: version.versionNumber,
      description: version.description,
      acceptanceCriteria: version.acceptanceCriteria,
      requiresTesting: version.requiresTesting,
      verificationMethod: version.verificationMethod,
      category: version.category
        ? { nameEn: version.category.nameEn, nameSv: version.category.nameSv }
        : null,
      type: version.type
        ? { nameEn: version.type.nameEn, nameSv: version.type.nameSv }
        : null,
      qualityCharacteristic: version.qualityCharacteristic
        ? {
            nameEn: version.qualityCharacteristic.nameEn,
            nameSv: version.qualityCharacteristic.nameSv,
          }
        : null,
      riskLevel: version.riskLevel
        ? {
            nameEn: version.riskLevel.nameEn,
            nameSv: version.riskLevel.nameSv,
          }
        : null,
      status: {
        label: statusLabel ?? 'Unknown',
        color: version.statusColor,
      },
      createdBy: version.createdBy,
      normReferences: version.versionNormReferences
        .filter(vnr => vnr.normReference)
        .map(vnr => ({
          name: vnr.normReference.name,
          reference: vnr.normReference.reference,
          uri: vnr.normReference.uri,
        })),
      requirementPackages: version.versionRequirementPackages
        .filter(vs => vs.requirementPackage)
        .map(vs => ({
          nameEn: vs.requirementPackage.nameEn,
          nameSv: vs.requirementPackage.nameSv,
        })),
    },
  }
}
