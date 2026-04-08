'use client'

import { useParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { usePdfDownload } from '@/components/reports/pdf/usePdfDownload'
import {
  fetchRequirementForReport,
  fetchSuggestionsForReport,
} from '@/lib/reports/data/fetch-requirement'
import { buildSuggestionHistoryReport } from '@/lib/reports/templates/suggestion-history-template'
import type { ReportModel } from '@/lib/reports/types'

export default function PdfSuggestionHistoryReportPage() {
  const params = useParams<{ id: string }>()
  const locale = useLocale()
  const t = useTranslations('reports')
  const [model, setModel] = useState<ReportModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filename, setFilename] = useState(
    `suggestion-history-report-${params.id}.pdf`,
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
    try {
      const [requirement, suggestions] = await Promise.all([
        fetchRequirementForReport(params.id, locale),
        fetchSuggestionsForReport(params.id),
      ])
      const label = t('suggestionHistoryFilenameLabel')
      setFilename(`${label} ${requirement.uniqueId}.pdf`)
      setModel(buildSuggestionHistoryReport(requirement, suggestions, locale))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToLoadReport'))
    } finally {
      setLoading(false)
    }
  }, [params.id, locale, t])

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
          <h2>{t('errorTitle')}</h2>
          <p>{displayError}</p>
        </div>
      ) : loading ? (
        <p style={{ color: '#64748b' }}>{t('loadingData')}</p>
      ) : downloading ? (
        <p style={{ color: '#64748b' }}>{t('generatingPdf')}</p>
      ) : (
        <div>
          <p style={{ color: '#166534', marginBottom: '1rem' }}>
            {t('pdfDownloadStarted')}
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
            {t('downloadAgain')}
          </button>
        </div>
      )}
    </div>
  )
}
