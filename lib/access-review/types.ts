export const ACCESS_REVIEW_EXPORT_SCHEMA_VERSION =
  'access-review-export.v1' as const

export type AccessReviewExportSchemaVersion =
  typeof ACCESS_REVIEW_EXPORT_SCHEMA_VERSION

export type AccessReviewDelivery = 'json' | 'pdf'

export type AccessReviewRunStatus =
  | 'cancelled'
  | 'completed'
  | 'draft'
  | 'in_review'

export type AccessReviewDecision =
  | 'approved'
  | 'changed'
  | 'not_applicable'
  | 'pending'
  | 'revoke_required'

export interface AccessReviewActor {
  displayName: string
  hsaId: string
}

export interface AccessReviewItem {
  canGenerateAi: boolean
  comment: string | null
  createdAt: string
  decidedAt: string | null
  decidedBy: AccessReviewActor | null
  decision: AccessReviewDecision
  id: number
  permissionType: string
  principal: AccessReviewActor
  scope: {
    key: string
    label: string
    type: string
  }
  sourceKey: string
  sourceTable: string
}

export interface AccessReviewRunSummary {
  approvedCount: number
  changedCount: number
  itemCount: number
  notApplicableCount: number
  pendingCount: number
  revokeRequiredCount: number
}

export interface AccessReviewRun {
  completedAt: string | null
  completedBy: AccessReviewActor | null
  createdAt: string
  createdBy: AccessReviewActor
  dueAt: string
  externalEvidenceReference: string | null
  id: number
  periodEnd: string
  periodStart: string
  reviewer: AccessReviewActor
  status: AccessReviewRunStatus
  summary: AccessReviewRunSummary
  updatedAt: string
}

export interface AccessReviewRunDetail {
  items: AccessReviewItem[]
  run: AccessReviewRun
}

export interface AccessReviewExportV1 extends AccessReviewRunDetail {
  generatedAt: string
  generatedBy: AccessReviewActor
  limitations: Array<{
    description: string
    key: string
  }>
  schemaVersion: AccessReviewExportSchemaVersion
}
