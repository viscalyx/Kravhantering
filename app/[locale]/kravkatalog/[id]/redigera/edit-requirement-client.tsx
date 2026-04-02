'use client'

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

  const [initialData, setInitialData] = useState<Record<
    string,
    string | boolean
  > | null>(null)
  const [initialScenarioIds, setInitialScenarioIds] = useState<number[]>([])
  const [uniqueId, setUniqueId] = useState('')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
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
      setInitialData({
        areaId: data.area?.id != null ? String(data.area.id) : '',
        categoryId:
          latest.category?.id != null ? String(latest.category.id) : '',
        typeId: latest.type?.id != null ? String(latest.type.id) : '',
        qualityCharacteristicId:
          latest.qualityCharacteristic?.id != null
            ? String(latest.qualityCharacteristic.id)
            : '',
        description: String(latest.description ?? ''),
        acceptanceCriteria: String(latest.acceptanceCriteria ?? ''),
        requiresTesting: Boolean(latest.requiresTesting ?? false),
        verificationMethod: String(latest.verificationMethod ?? ''),
        ownerId: String(latest.createdBy ?? ''),
      })
      setInitialScenarioIds(
        latest.versionScenarios
          .map(vs => vs.scenario.id)
          .filter((id): id is number => id != null),
      )
    } catch {
      setFetchError(tc('error'))
    }
    setLoading(false)
  }, [requirementId, tc])

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
          <p className="text-red-600 dark:text-red-400" role="alert">
            {fetchError}
          </p>
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
        <div className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-6">
          <RequirementForm
            initialData={initialData ?? undefined}
            initialScenarioIds={initialScenarioIds}
            mode="edit"
            requirementId={requirementId}
          />
        </div>
      </div>
    </div>
  )
}
