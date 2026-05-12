'use client'

import { createElement, useCallback, useState } from 'react'
import { downloadBlob } from '@/lib/browser-download'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { dataSubjectExportFilename } from '@/lib/privacy/data-subject-export-filenames'
import type {
  DataSubjectExportDelivery,
  DataSubjectExportV1,
} from '@/lib/privacy/data-subject-export-types'

interface UseDataSubjectExportDownloadOptions {
  locale: string
  targetHsaId?: string
}

interface DownloadOptions {
  delivery: DataSubjectExportDelivery
}

interface UseDataSubjectExportDownloadResult {
  download: (options: DownloadOptions) => Promise<void>
  downloading: DataSubjectExportDelivery | null
  error: string | null
}

export function useDataSubjectExportDownload({
  locale,
  targetHsaId,
}: UseDataSubjectExportDownloadOptions): UseDataSubjectExportDownloadResult {
  const [downloading, setDownloading] =
    useState<DataSubjectExportDelivery | null>(null)
  const [error, setError] = useState<string | null>(null)

  const download = useCallback(
    async ({ delivery }: DownloadOptions) => {
      setDownloading(delivery)
      setError(null)

      try {
        const response = await apiFetch('/api/privacy/data-subject-export', {
          body: JSON.stringify({
            delivery,
            ...(targetHsaId ? { target: { hsaId: targetHsaId } } : {}),
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        })

        if (!response.ok) {
          setError((await readResponseMessage(response)) ?? 'Export failed')
          return
        }

        const exportData = (await response.json()) as DataSubjectExportV1
        const filename = dataSubjectExportFilename(exportData, delivery)

        if (delivery === 'json') {
          downloadBlob(
            new Blob([JSON.stringify(exportData, null, 2)], {
              type: 'application/json;charset=utf-8',
            }),
            filename,
          )
          return
        }

        const { pdf } = await import('@react-pdf/renderer')
        const { default: DataSubjectExportPdfRenderer } = await import(
          './DataSubjectExportPdfRenderer'
        )
        const element = createElement(DataSubjectExportPdfRenderer, {
          exportData,
          locale,
        })
        const blob = await pdf(
          element as unknown as React.ReactElement<
            import('@react-pdf/renderer').DocumentProps
          >,
        ).toBlob()
        downloadBlob(blob, filename)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed')
      } finally {
        setDownloading(null)
      }
    },
    [locale, targetHsaId],
  )

  return { download, downloading, error }
}
