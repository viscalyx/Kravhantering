'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import PrintReportRenderer from '@/components/reports/print/PrintReportRenderer'
import { fetchDeviationForReport } from '@/lib/reports/data/fetch-deviation'
import { buildDeviationReviewReport } from '@/lib/reports/templates/deviation-review-template'
import type { ReportModel } from '@/lib/reports/types'

export default function PrintDeviationReviewReportPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const locale = useLocale()
  const [model, setModel] = useState<ReportModel | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadReport = useCallback(async () => {
    const item = searchParams.get('item')
    if (!item) {
      setError('Missing item ID in URL')
      return
    }
    try {
      const data = await fetchDeviationForReport(params.id, item, locale)
      setModel(buildDeviationReviewReport(data, locale))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report')
    }
  }, [params.id, searchParams, locale])

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
        <h1>Error</h1>
        <p>{error}</p>
      </div>
    )
  }

  if (!model) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        Loading report...
      </div>
    )
  }

  return <PrintReportRenderer locale={locale} model={model} />
}
