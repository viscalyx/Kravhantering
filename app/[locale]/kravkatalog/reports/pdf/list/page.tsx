'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { usePdfDownload } from '@/components/reports/pdf/usePdfDownload'
import { fetchMultipleRequirements } from '@/lib/reports/data/fetch-requirement'
import { buildListReport } from '@/lib/reports/templates/list-template'
import type { ReportModel } from '@/lib/reports/types'

export default function PdfListReportPage() {
  const searchParams = useSearchParams()
  const locale = useLocale()
  const [model, setModel] = useState<ReportModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const ids = searchParams.get('ids')
  const [filename, setFilename] = useState('list-report.pdf')

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
    if (!ids) {
      setError('No requirement IDs provided')
      setLoading(false)
      return
    }
    try {
      const idList = ids.split(',').filter(Boolean)
      if (idList.length === 0) {
        setError('No requirement IDs provided')
        return
      }
      const requirements = await fetchMultipleRequirements(idList, locale)
      const label = locale === 'sv' ? 'Kravlista' : 'Requirements List'
      const now = new Date()
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`
      setFilename(`${label} ${stamp}.pdf`)
      setModel(buildListReport(requirements, locale))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [ids, locale])

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
