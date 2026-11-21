'use client'

import { FileJson, FileText, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { useImportFileDownload } from '@/hooks/useImportFileDownload'
import { devMarker } from '@/lib/developer-mode-markers'
import type { AppLocale } from '@/lib/locale-preference'
import {
  type AiRequestFile,
  type AiRequestFileDestination,
  aiRequestFileName,
  aiRequestFileUrl,
} from '@/lib/requirements/ai-request-files'

interface AiRequestFileDownloadsProps {
  /** The destination to download files for; `null` disables both buttons. */
  destination: AiRequestFileDestination | null
  locale: AppLocale
  /** Developer Mode context of the surface that shows the buttons. */
  markerContext: string
  /** Called when a download starts, for example to clear an earlier error. */
  onDownloadStart?: () => void
  onError: (message: string) => void
}

const BUTTON_LAYOUT =
  'inline-flex min-h-10 w-full items-center justify-center gap-2 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50'

const BUTTON_CLASS: Record<AiRequestFile, string> = {
  referenceData: `btn-secondary ${BUTTON_LAYOUT}`,
  template: `btn-primary ${BUTTON_LAYOUT}`,
}

const FILES: readonly {
  file: AiRequestFile
  icon: typeof FileText
  labelKey: 'downloadReferenceData' | 'downloadTemplate'
  markerValue: string
}[] = [
  {
    file: 'template',
    icon: FileText,
    labelKey: 'downloadTemplate',
    markerValue: 'ai request template',
  },
  {
    file: 'referenceData',
    icon: FileJson,
    labelKey: 'downloadReferenceData',
    markerValue: 'reference data file',
  },
]

/**
 * The primary AI request template button and the secondary reference data
 * file button, each with its file name below it.
 */
export default function AiRequestFileDownloads({
  destination,
  locale,
  markerContext,
  onDownloadStart,
  onError,
}: AiRequestFileDownloadsProps) {
  const t = useTranslations('requirementsImportAiRequest')
  const idPrefix = useId()
  const { download, pendingFile } = useImportFileDownload(
    onError,
    onDownloadStart,
  )

  return (
    <div className="flex flex-col gap-1">
      {FILES.map(({ file, icon: Icon, labelKey, markerValue }) => {
        const fileNameId = `${idPrefix}-${file}-name`
        const fileName = destination
          ? aiRequestFileName(file, locale, destination)
          : null
        return (
          <div className="flex flex-col gap-1 pb-1" key={file}>
            <button
              aria-describedby={fileName ? fileNameId : undefined}
              className={BUTTON_CLASS[file]}
              disabled={!destination || pendingFile !== null}
              onClick={() => {
                if (destination && fileName) {
                  void download(
                    file,
                    aiRequestFileUrl(file, locale, destination),
                    fileName,
                  )
                }
              }}
              title={
                !destination
                  ? t('filesUnavailable')
                  : pendingFile !== null && pendingFile !== file
                    ? t('otherDownloadPending')
                    : undefined
              }
              type="button"
              {...devMarker({
                context: markerContext,
                name: 'download button',
                value: markerValue,
              })}
            >
              {pendingFile === file ? (
                <Loader2
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 animate-spin"
                />
              ) : (
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              )}
              {pendingFile === file ? t('downloading') : t(labelKey)}
            </button>
            {fileName ? (
              <span
                className="break-all font-mono text-[11px] text-secondary-600 dark:text-secondary-400"
                id={fileNameId}
              >
                {fileName}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
