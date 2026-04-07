'use client'

import { AlertTriangle, Ban } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import RequirementForm from '@/components/RequirementForm'
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

  const STATUS_REVIEW = 2
  const STATUS_PUBLISHED = 3
  const STATUS_ARCHIVED = 4

  const [initialData, setInitialData] = useState<Record<
    string,
    string | boolean
  > | null>(null)
  const [initialNormReferenceIds, setInitialNormReferenceIds] = useState<
    number[]
  >([])
  const [initialScenarioIds, setInitialScenarioIds] = useState<number[]>([])
  const [uniqueId, setUniqueId] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setFetchError(null)
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
      const latest = data.versions[0]
      if (!latest) {
        setFetchError(tc('noResults'))
        setLoading(false)
        return
      }
      if (
        latest.status === STATUS_REVIEW ||
        latest.status === STATUS_ARCHIVED
      ) {
        setFetchError(
          latest.status === STATUS_REVIEW
            ? t('editNotAllowedStatusReview')
            : t('editNotAllowedStatusArchived'),
        )
        setLoading(false)
        return
      }
      setIsPublished(latest.status === STATUS_PUBLISHED)
      setInitialData({
        areaId: data.area?.id != null ? String(data.area.id) : '',
        categoryId:
          latest.category?.id != null ? String(latest.category.id) : '',
        typeId: latest.type?.id != null ? String(latest.type.id) : '',
        qualityCharacteristicId:
          latest.qualityCharacteristic?.id != null
            ? String(latest.qualityCharacteristic.id)
            : '',
        riskLevelId:
          latest.riskLevel?.id != null ? String(latest.riskLevel.id) : '',
        description: String(latest.description ?? ''),
        acceptanceCriteria: String(latest.acceptanceCriteria ?? ''),
        requiresTesting: Boolean(latest.requiresTesting ?? false),
        verificationMethod: String(latest.verificationMethod ?? ''),
        ownerId: String(latest.createdBy ?? ''),
      })
      setInitialNormReferenceIds(
        latest.versionNormReferences
          .map(vnr => vnr.normReference.id)
          .filter((id): id is number => id != null),
      )
      setInitialScenarioIds(
        latest.versionScenarios
          .map(vs => vs.scenario.id)
          .filter((id): id is number => id != null),
      )
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
            initialData={initialData ?? undefined}
            initialNormReferenceIds={initialNormReferenceIds}
            initialScenarioIds={initialScenarioIds}
            mode="edit"
            requirementId={requirementId}
          />
        </div>
      </div>
    </div>
  )
}
