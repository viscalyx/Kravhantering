'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { usePdfDownload } from '@/components/reports/pdf/usePdfDownload'
import { fetchDeviationForReport } from '@/lib/reports/data/fetch-deviation'
import { buildDeviationReviewReport } from '@/lib/reports/templates/deviation-review-template'
import type { ReportModel } from '@/lib/reports/types'

export default function PdfDeviationReviewReportPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const locale = useLocale()
  const [model, setModel] = useState<ReportModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filename, setFilename] = useState(
    `deviation-review-report-${params.id}.pdf`,
  )

  const {
    download,
    downloading,
    error: pdfError,
  } = usePdfDownload({
    model,
    locale,
    filename,
  })

  const loadReport = useCallback(async () => {
    const pkg = searchParams.get('pkg')
    const item = searchParams.get('item')
    if (!pkg || !item) {
      setError('Missing package slug or item ID in URL')
      setLoading(false)
      return
    }
    try {
      const data = await fetchDeviationForReport(params.id, item, locale)
      const label =
        locale === 'sv'
          ? 'Granskningsrapport avvikelse'
          : 'Deviation Review Report'
      setFilename(`${label} ${data.requirementUniqueId}.pdf`)
      setModel(buildDeviationReviewReport(data, locale))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [params.id, searchParams, locale])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  useEffect(() => {
    if (model) {
      download()
    }
  }, [model, download])

  const displayError = error || pdfError

  return (
    <div
      style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}
    >
      {displayError ? (
        <div style={{ color: '#991b1b' }}>
          <h2>Error</h2>
          <p>{displayError}</p>
        </div>
      ) : loading ? (
        <p style={{ color: '#64748b' }}>Loading report data...</p>
      ) : downloading ? (
        <p style={{ color: '#64748b' }}>Generating PDF...</p>
      ) : (
        <div>
          <p style={{ color: '#166534', marginBottom: '1rem' }}>
            PDF download started.
          </p>
          <button
            onClick={download}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#4338ca',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
            type="button"
          >
            Download Again
          </button>
        </div>
      )}
    </div>
  )
}
