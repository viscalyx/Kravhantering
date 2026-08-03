import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'
import { requirementPackageName } from '@/lib/reports/package-name'
import { createReportPriorityIdentity } from '@/lib/reports/priority'
import type { VersionSummaryData } from '@/lib/reports/types'

export function createReportVersionSummary(
  version: RequirementReportData['versions'][number],
  statusLabel: string,
): VersionSummaryData {
  return {
    versionNumber: version.versionNumber,
    description: version.description,
    acceptanceCriteria: version.acceptanceCriteria,
    verifiable: version.verifiable,
    verificationMethod: version.verificationMethod,
    category: version.category
      ? {
          nameSv: version.category.nameSv,
          nameEn: version.category.nameEn,
        }
      : null,
    type: version.type
      ? { nameSv: version.type.nameSv, nameEn: version.type.nameEn }
      : null,
    qualityCharacteristic: version.qualityCharacteristic
      ? {
          nameSv: version.qualityCharacteristic.nameSv,
          nameEn: version.qualityCharacteristic.nameEn,
        }
      : null,
    priorityLevel: version.priorityLevel
      ? createReportPriorityIdentity(version.priorityLevel)
      : null,
    status: {
      label: statusLabel,
      color: version.statusColor,
      iconName: version.statusIconName,
    },
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    editedAt: version.editedAt,
    publishedAt: version.publishedAt,
    archivedAt: version.archivedAt,
    normReferences: version.versionNormReferences
      .filter(vnr => vnr.normReference)
      .map(vnr => ({
        name: vnr.normReference.name,
        reference: vnr.normReference.reference,
        uri: vnr.normReference.uri,
      })),
    requirementPackages: version.versionRequirementPackages.flatMap(
      ({ requirementPackage }) => {
        const name = requirementPackageName(requirementPackage).trim()
        return name ? [{ name }] : []
      },
    ),
  }
}
