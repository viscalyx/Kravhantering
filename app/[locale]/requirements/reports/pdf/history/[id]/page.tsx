'use client'

import { useParams } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { usePdfDownload } from '@/components/reports/pdf/usePdfDownload'
import { fetchRequirementForReport } from '@/lib/reports/data/fetch-requirement'
import { buildHistoryReport } from '@/lib/reports/templates/history-template'
import type { ReportModel } from '@/lib/reports/types'

export default function PdfHistoryReportPage() {
  const params = useParams<{ id: string }>()
  const locale = useLocale()
  const [model, setModel] = useState<ReportModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filename, setFilename] = useState(`history-report-${params.id}.pdf`)

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
    try {
      const requirement = await fetchRequirementForReport(params.id, locale)
      const label = locale === 'sv' ? 'Historikrapport' : 'History Report'
      setFilename(`${label} ${requirement.uniqueId}.pdf`)
      setModel(buildHistoryReport(requirement, locale))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [params.id, locale])

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
