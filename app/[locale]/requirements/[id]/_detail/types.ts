import type { DeviationStep } from '@/components/DeviationStepper'
import type { SuggestionStep } from '@/components/SuggestionStepper'

export const STATUS_DRAFT = 1
export const STATUS_REVIEW = 2
export const STATUS_PUBLISHED = 3
export const STATUS_ARCHIVED = 4

export interface StatusInfo {
  color: string | null
  id: number
  nameEn: string
  nameSv: string
}

export interface TransitionTarget {
  id: number
  nameEn: string
  nameSv: string
}

export interface PackageItemDetailContext {
  needsReference: string | null
  needsReferenceId: number | null
  specificationItemId: number
  specificationItemStatusColor: string | null
  specificationItemStatusId: number | null
  specificationItemStatusNameEn: string | null
  specificationItemStatusNameSv: string | null
}

export interface DeviationData {
  createdAt: string
  createdBy: string | null
  decidedAt: string | null
  decidedBy: string | null
  decision: number | null
  decisionMotivation: string | null
  id: number
  isReviewRequested: number
  motivation: string
}

export interface SuggestionData {
  content: string
  createdAt: string
  createdBy: string | null
  id: number
  isReviewRequested: number
  requirementVersionId: number | null
  resolution: number | null
  resolutionMotivation: string | null
  resolvedAt: string | null
  resolvedBy: string | null
}

export type AddToSpecificationNeedsRefMode = 'existing' | 'new' | 'none'

export type { DeviationStep, SuggestionStep }
