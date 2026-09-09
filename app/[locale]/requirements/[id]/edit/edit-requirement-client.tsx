'use client'

import { AlertTriangle, Ban } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import RequirementForm from '@/components/RequirementForm'
import { requirementEditSnapshot } from '@/components/requirement-edit-reconciliation'
import type { RequirementDetailResponse } from '@/lib/requirements/types'

const EDIT_REQUIREMENT_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'editRequirement.versioning.body',
      headingKey: 'editRequirement.versioning.heading',
    },
    {
      kind: 'text',
      bodyKey: 'editRequirement.form.body',
      headingKey: 'editRequirement.form.heading',
    },
    {
      kind: 'text',
      bodyKey: 'editRequirement.reconciliation.body',
      headingKey: 'editRequirement.reconciliation.heading',
    },
    {
      kind: 'text',
      bodyKey: 'editRequirement.referenceData.body',
      headingKey: 'editRequirement.referenceData.heading',
    },
  ],
  titleKey: 'editRequirement.title',
}

interface EditRequirementClientProps {
  requirementId: number | string
}

export default function EditRequirementClient({
  requirementId,
}: EditRequirementClientProps) {
  useHelpContent(EDIT_REQUIREMENT_HELP)
  const t = useTranslations('requirement')
  const tc = useTranslations('common')

  const [initialData, setInitialData] = useState<Record<
    string,
    string | boolean
  > | null>(null)
  const [initialNormReferenceIds, setInitialNormReferenceIds] = useState<
    number[]
  >([])
  const [initialRequirementPackageIds, setInitialRequirementPackageIds] =
    useState<number[]>([])
  const [baseRevisionToken, setBaseRevisionToken] = useState<string | null>(
    null,
  )
  const [baseVersionId, setBaseVersionId] = useState<number | null>(null)
  const [uniqueId, setUniqueId] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setFetchError(null)
    setBaseRevisionToken(null)
    setBaseVersionId(null)
    setIsPublished(false)
    setLoading(true)

    try {
      const res = await fetch(`/api/requirements/${requirementId}`)
      if (!res.ok) {
        setFetchError(tc('error'))
        setLoading(false)
        return
      }
      const data = (await res.json()) as RequirementDetailResponse
      setUniqueId(data.uniqueId)
      const snapshot = requirementEditSnapshot(data)
      if (!snapshot) {
        setFetchError(tc('noResults'))
        setLoading(false)
        return
      }
      if (snapshot.restriction) {
        setFetchError(
          snapshot.restriction === 'review'
            ? t('editNotAllowedStatusReview')
            : snapshot.restriction === 'archived'
              ? t('editNotAllowedStatusArchived')
              : t('reconciliation.restricted'),
        )
        setLoading(false)
        return
      }
      setIsPublished(snapshot.isPublished)
      setBaseRevisionToken(snapshot.baseRevisionToken)
      setBaseVersionId(snapshot.baseVersionId)
      const { normReferenceIds, requirementPackageIds, ...values } =
        snapshot.values
      setInitialData(values)
      setInitialNormReferenceIds(normReferenceIds)
      setInitialRequirementPackageIds(requirementPackageIds)
    } catch {
      setFetchError(tc('error'))
    }
    setLoading(false)
  }, [requirementId, t, tc])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom">
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('loading')}
          </p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom">
          <div
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-800/70 dark:bg-red-950/40 dark:text-red-300"
            role="alert"
          >
            <Ban
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
            />
            <span>{fetchError}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100 mb-6">
          {t('editRequirement')} — {uniqueId}
        </h1>
        {isPublished && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
            />
            <span>{t('editPublishedVersionNotice')}</span>
          </div>
        )}
        <div className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-6">
          <RequirementForm
            baseRevisionToken={baseRevisionToken}
            baseVersionId={baseVersionId}
            initialData={initialData ?? undefined}
            initialNormReferenceIds={initialNormReferenceIds}
            initialRequirementPackageIds={initialRequirementPackageIds}
            mode="edit"
            onRefreshLatest={async () => {
              const res = await fetch(`/api/requirements/${requirementId}`, {
                cache: 'no-store',
              })
              if (!res.ok)
                throw new Error(
                  res.status === 403
                    ? t('reconciliation.restricted')
                    : tc('error'),
                )
              const snapshot = requirementEditSnapshot(
                (await res.json()) as RequirementDetailResponse,
              )
              if (!snapshot) throw new Error(tc('noResults'))
              setIsPublished(snapshot.isPublished)
              return snapshot
            }}
            requirementId={requirementId}
          />
        </div>
      </div>
    </div>
  )
}
