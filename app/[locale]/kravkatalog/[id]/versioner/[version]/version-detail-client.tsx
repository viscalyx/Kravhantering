'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

interface VersionData {
  acceptanceCriteria: string | null
  category: { nameSv: string; nameEn: string } | null
  createdAt: string
  description: string | null
  id: number
  ownerName: string | null
  qualityCharacteristic: { nameSv: string; nameEn: string } | null
  requiresTesting: boolean
  type: { nameSv: string; nameEn: string } | null
  versionNumber: number
}

interface VersionDetailClientProps {
  requirementId: number | string
  versionNumber: number
}

export default function VersionDetailClient({
  requirementId,
  versionNumber,
}: VersionDetailClientProps) {
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const locale = useLocale()

  const localName = (
    obj: { nameSv: string; nameEn: string } | null | undefined,
  ) => (obj ? (locale === 'sv' ? obj.nameSv : obj.nameEn) : null)

  const [data, setData] = useState<{
    uniqueId: string
    version: VersionData
  } | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchVersion = useCallback(async () => {
    const res = await fetch(
      `/api/requirements/${requirementId}/versions/${versionNumber}`,
    )
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [requirementId, versionNumber])

  useEffect(() => {
    fetchVersion()
  }, [fetchVersion])

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

  if (!data) {
    return (
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom">
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('noResults')}
          </p>
        </div>
      </div>
    )
  }

  const v = data.version

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100 mb-1">
          {data.uniqueId} — v{v.versionNumber}
        </h1>
        <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-6">
          {t('versionCreated')}{' '}
          {new Date(v.createdAt).toLocaleDateString('sv-SE')}
        </p>

        <div className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-6 space-y-5">
          <div>
            <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
              {t('description')}
            </h3>
            <p className="whitespace-pre-wrap">{v.description ?? '—'}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-1">
              {t('acceptanceCriteria')}
            </h3>
            <p className="whitespace-pre-wrap">{v.acceptanceCriteria ?? '—'}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-secondary-600 dark:text-secondary-400">
                {t('category')}:
              </span>{' '}
              {localName(v.category) ?? '—'}
            </div>
            <div>
              <span className="text-secondary-600 dark:text-secondary-400">
                {t('type')}:
              </span>{' '}
              {localName(v.type) ?? '—'}
            </div>
            <div>
              <span className="text-secondary-600 dark:text-secondary-400">
                {t('qualityCharacteristic')}:
              </span>{' '}
              {localName(v.qualityCharacteristic) ?? '—'}
            </div>
            <div>
              <span className="text-secondary-600 dark:text-secondary-400">
                {t('requiresTesting')}:
              </span>{' '}
              {v.requiresTesting ? tc('yes') : tc('no')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
