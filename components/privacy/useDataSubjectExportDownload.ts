'use client'

import { type ReactNode, useCallback, useState } from 'react'
import { useServerPdfDownload } from '@/components/reports/pdf/useServerPdfDownload'
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
  dialog: ReactNode
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
  const pdfDownload = useServerPdfDownload()

  const download = useCallback(
    async ({ delivery }: DownloadOptions) => {
      setDownloading(delivery)
      setError(null)

      try {
        const requestBody = {
          delivery,
          ...(targetHsaId ? { target: { hsaId: targetHsaId } } : {}),
        }

        if (delivery === 'pdf') {
          await pdfDownload.download({
            fallbackFilename: 'data-subject-export.pdf',
            init: {
              body: JSON.stringify({ ...requestBody, locale }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST',
            },
            url: '/api/privacy/data-subject-export',
          })
          return
        }

        const response = await apiFetch('/api/privacy/data-subject-export', {
          body: JSON.stringify(requestBody),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        })

        if (!response.ok) {
          setError((await readResponseMessage(response)) ?? 'Export failed')
          return
        }

        const exportData = (await response.json()) as DataSubjectExportV1
        const filename = dataSubjectExportFilename(exportData, delivery)

        downloadBlob(
          new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json;charset=utf-8',
          }),
          filename,
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed')
      } finally {
        setDownloading(null)
      }
    },
    [locale, pdfDownload, targetHsaId],
  )

  return {
    dialog: pdfDownload.dialog,
    download,
    downloading: downloading ?? (pdfDownload.downloading ? 'pdf' : null),
    error: error ?? pdfDownload.error,
  }
}
