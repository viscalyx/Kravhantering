'use client'

import { useParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import PrintReportRenderer from '@/components/reports/print/PrintReportRenderer'
import {
  fetchRequirementForReport,
  fetchSuggestionsForReport,
} from '@/lib/reports/data/fetch-requirement'
import { buildSuggestionHistoryReport } from '@/lib/reports/templates/suggestion-history-template'
import type { ReportModel } from '@/lib/reports/types'

export default function PrintSuggestionHistoryReportPage() {
  const params = useParams<{ id: string }>()
  const locale = useLocale()
  const t = useTranslations('reports')
  const [model, setModel] = useState<ReportModel | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadReport = useCallback(async () => {
    try {
      const [requirement, suggestions] = await Promise.all([
        fetchRequirementForReport(params.id, locale),
        fetchSuggestionsForReport(params.id),
      ])
      setModel(buildSuggestionHistoryReport(requirement, suggestions, locale))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToLoadReport'))
    }
  }, [params.id, locale, t])

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
