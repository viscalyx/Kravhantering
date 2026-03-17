export interface DiffSegment {
  text: string
  type: 'added' | 'removed' | 'unchanged'
}

export interface VersionSummaryData {
  acceptanceCriteria: string | null
  archivedAt: string | null
  category: { nameSv: string; nameEn: string } | null
  createdAt: string
  createdBy: string | null
  description: string | null
  editedAt: string | null
  publishedAt: string | null
  qualityCharacteristic: { nameSv: string; nameEn: string } | null
  references: { name: string; uri: string | null }[]
  requiresTesting: boolean
  scenarios: { nameSv: string; nameEn: string }[]
  status: { label: string; color: string | null }
  type: { nameSv: string; nameEn: string } | null
  verificationMethod: string | null
  versionNumber: number
}

export interface MetadataChange {
  field: string
  newValue: string | null
  oldValue: string | null
}

export interface TimelineEntryData {
  archivedAt: string | null
  createdAt: string
  createdBy: string | null
  descriptionExcerpt: string | null
  editedAt: string | null
  publishedAt: string | null
  status: { label: string; color: string | null }
  versionNumber: number
}

export type ReportSection =
  | {
      type: 'header'
      title: string
      subtitle?: string
      requirementId: string
      generatedAt: string
      status?: { label: string; color: string | null }
    }
  | { type: 'notice'; message: string; severity: 'info' | 'warning' }
  | {
      type: 'version-summary'
      version: VersionSummaryData
      label?: string
      isUnpublished?: boolean
    }
  | { type: 'diff'; fieldLabel: string; segments: DiffSegment[] }
  | { type: 'metadata-changes'; changes: MetadataChange[] }
  | { type: 'timeline-entry'; entry: TimelineEntryData }
  | { type: 'page-break' }
  | {
      type: 'requirement-table'
      columns: { key: string; label: string }[]
      rows: {
        cells: Record<string, string>
        statusColor?: string | null
      }[]
    }
  | {
      type: 'toc'
      groups: {
        heading: string
        items: { id: string; label: string; page: number }[]
      }[]
      title: string
    }

export interface ReportModel {
  sections: ReportSection[]
}
