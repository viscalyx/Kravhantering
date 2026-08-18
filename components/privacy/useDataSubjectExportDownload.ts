'use client'

import { type ReactNode, useCallback, useState } from 'react'
import { useGeneratedOutputDownload } from '@/components/generated-output/useGeneratedOutputDownload'
import type { DataSubjectExportDelivery } from '@/lib/privacy/data-subject-export-types'

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
  const generatedDownload = useGeneratedOutputDownload()

  const download = useCallback(
    async ({ delivery }: DownloadOptions) => {
      setDownloading(delivery)

      try {
        const requestBody = {
          delivery,
          locale,
          ...(targetHsaId ? { target: { hsaId: targetHsaId } } : {}),
        }
        const fallbackStem =
          locale === 'sv'
            ? 'personuppgiftsutdrag'
            : 'data-subject-access-export'
        await generatedDownload.download({
          fallbackFilename: `${fallbackStem}.${delivery}`,
          init: {
            body: JSON.stringify(requestBody),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
          output: delivery,
          url: '/api/privacy/data-subject-export',
        })
      } finally {
        setDownloading(null)
      }
    },
    [generatedDownload, locale, targetHsaId],
  )

  return {
    dialog: generatedDownload.dialog,
    download,
    downloading,
    error: generatedDownload.error,
  }
}
