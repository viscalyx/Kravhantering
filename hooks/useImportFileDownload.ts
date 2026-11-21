import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { downloadBlob } from '@/lib/browser-download'
import { readResponseMessage } from '@/lib/http/response-message'
import type { AiRequestFile } from '@/lib/requirements/ai-request-files'

type ImportFile = AiRequestFile | 'schema' | 'instruction'

export function useImportFileDownload(
  onError: (message: string) => void,
  onDownloadStart?: () => void,
) {
  const t = useTranslations('requirementsImportAiRequest')
  const [pendingFile, setPendingFile] = useState<ImportFile | null>(null)

  async function download(file: ImportFile, url: string, filename: string) {
    if (pendingFile !== null) return
    onDownloadStart?.()
    setPendingFile(file)
    try {
      const response = await fetch(url)
      if (!response.ok) {
        onError((await readResponseMessage(response)) ?? t('downloadFailed'))
        return
      }
      downloadBlob(await response.blob(), filename)
    } catch {
      onError(t('downloadFailed'))
    } finally {
      setPendingFile(null)
    }
  }

  return { download, pendingFile }
}
