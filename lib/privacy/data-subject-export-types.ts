export const DATA_SUBJECT_EXPORT_SCHEMA_VERSION =
  'privacy-data-subject-export.v1' as const

export type DataSubjectExportSchemaVersion =
  typeof DATA_SUBJECT_EXPORT_SCHEMA_VERSION

export type DataSubjectExportDelivery = 'json' | 'pdf'

export type DataSubjectExportValue =
  | boolean
  | null
  | number
  | readonly string[]
  | string

export interface DataSubjectExportActor {
  displayName: string
  hsaId: string
  roles?: string[]
  source: string
  sub?: string
}

export interface DataSubjectExportSessionClaims {
  email?: string
  expiresAt: number
  familyName: string
  givenName: string
  hsaId: string
  name: string
  roles: string[]
  sub: string
}

export interface DataSubjectExportRelatedObject {
  key: string
  label?: string
  type: string
}

export interface DataSubjectExportItem {
  fieldName: string
  relatedObject?: DataSubjectExportRelatedObject
  relationToSubject: string
  sourceKey: string
  table: string
  timestamp?: string
  value: DataSubjectExportValue
}

export interface DataSubjectExportSource {
  fieldKey: string
  items: DataSubjectExportItem[]
  key: string
  objectKey: string
  relationToSubject: string
  table: string
}

export interface DataSubjectExportLimitation {
  description: string
  key: string
}

export interface DataSubjectExportV1 {
  generatedAt: string
  generatedBy: DataSubjectExportActor
  limitations: DataSubjectExportLimitation[]
  schemaVersion: DataSubjectExportSchemaVersion
  sources: DataSubjectExportSource[]
  subject: {
    hsaId: string
    targetFingerprint: string
  }
  summary: {
    itemCount: number
    limitationCount: number
    sourceCount: number
  }
}
