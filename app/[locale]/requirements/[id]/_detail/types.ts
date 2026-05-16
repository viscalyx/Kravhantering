import type { DeviationStep } from '@/components/DeviationStepper'
import type { SuggestionStep } from '@/components/SuggestionStepper'

export {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'

export interface StatusInfo {
  color: string | null
  iconName?: string | null
  id: number
  nameEn: string
  nameSv: string
}

export interface TransitionTarget {
  iconName?: string | null
  id: number
  nameEn: string
  nameSv: string
}

export interface SpecificationItemDetailContext {
  needsReference: string | null
  needsReferenceId: number | null
  specificationItemId: number
  specificationItemStatusColor: string | null
  specificationItemStatusIconName: string | null
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
