'use client'

import { useRef } from 'react'
import { useGeneratedOutputDownload } from '@/components/generated-output/useGeneratedOutputDownload'
import { devMarker } from '@/lib/developer-mode-markers'

interface ActionAuditLogExportButtonProps {
  fallbackFilename: string
  href: string
  label: string
}

export default function ActionAuditLogExportButton({
  fallbackFilename,
  href,
  label,
}: ActionAuditLogExportButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const download = useGeneratedOutputDownload()

  return (
    <>
      <button
        className="btn-secondary"
        disabled={download.downloading}
        onClick={() => {
          void download.download({
            fallbackFilename,
            output: 'csv',
            restoreFocusTo: buttonRef.current,
            url: href,
          })
        }}
        ref={buttonRef}
        type="button"
        {...devMarker({
          context: 'action log',
          name: 'CSV export button',
          priority: 330,
        })}
      >
        {label}
      </button>
      {download.dialog}
    </>
  )
}
