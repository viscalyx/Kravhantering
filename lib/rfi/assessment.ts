export interface RfiAssessment {
  createdAt: string
  createdByDisplayName: string | null
  createdByHsaId: string | null
  documentReference: string | null
  documentUrl: string | null
  id: number
  questionCode: string
  questionId: number
  questionText: string
  reason: string | null
  relevance: 'relevant' | 'not_relevant' | null
  versionId: number
  versionNumber: number
}

export interface RfiListItemUpdate {
  assessedVersionId?: number
  documentReference?: string | null
  documentUrl?: string | null
  expectedLockRevision?: number
  isIncluded?: boolean
  reason?: string | null
  relevance?: 'relevant' | 'not_relevant' | null
}

import { z } from 'zod'

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional()

export const rfiAssessmentUpdateSchema = z
  .object({
    isIncluded: z.boolean().optional(),
    relevance: z.enum(['relevant', 'not_relevant']).nullable().optional(),
    assessedVersionId: z.number().int().positive().optional(),
    expectedLockRevision: z.number().int().nonnegative().optional(),
    reason: optionalText(10000),
    documentReference: optionalText(2000),
    documentUrl: optionalText(2000).refine(value => {
      if (!value) return true
      try {
        const url = new URL(value)
        return (
          ['https:', 'http:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        )
      } catch {
        return false
      }
    }, 'Expected an HTTP or HTTPS URL without credentials'),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.relevance === undefined) {
      if (
        data.isIncluded === undefined ||
        Object.keys(data).some(key => key !== 'isIncluded')
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Save a complete assessment or an inclusion decision',
        })
      }
    } else if (
      data.isIncluded !== undefined ||
      data.assessedVersionId === undefined ||
      data.expectedLockRevision === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Assessment requires the displayed version and lock revision, without scope changes',
      })
    } else if (
      data.relevance === null &&
      (data.reason || data.documentReference || data.documentUrl)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Evidence requires a relevance outcome',
      })
    }
  })
