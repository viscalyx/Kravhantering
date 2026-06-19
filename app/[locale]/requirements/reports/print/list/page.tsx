'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import PrintReportRenderer from '@/components/reports/print/PrintReportRenderer'
import { fetchMultipleRequirements } from '@/lib/reports/data/fetch-requirement'
import { buildListReport } from '@/lib/reports/templates/list-template'
import type { ReportModel } from '@/lib/reports/types'

export default function PrintListReportPage() {
  const searchParams = useSearchParams()
  const locale = useLocale()
  const t = useTranslations('reports')
  const [model, setModel] = useState<ReportModel | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ids = searchParams.get('ids')

  const loadReport = useCallback(async () => {
    if (!ids) {
      setError(t('noRequirementIds'))
      return
    }
    try {
      const idList = ids.split(',').filter(Boolean)
      if (idList.length === 0) {
        setError(t('noRequirementIds'))
        return
      }
      const requirements = await fetchMultipleRequirements(idList, locale)
      setModel(buildListReport(requirements, locale))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToLoadReport'))
    }
  }, [ids, locale, t])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  useEffect(() => {
    if (model) {
      const timer = setTimeout(() => globalThis.print(), 500)
      return () => clearTimeout(timer)
    }
  }, [model])

  if (error) {
    return (
      <div style={{ padding: '2rem', color: '#991b1b' }}>
        <h1>{t('errorTitle')}</h1>
        <p>{error}</p>
      </div>
    )
  }

  if (!model) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        {t('loading')}
      </div>
    )
  }

  return <PrintReportRenderer locale={locale} model={model} />
}
