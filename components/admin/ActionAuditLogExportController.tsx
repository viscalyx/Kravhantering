'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGeneratedOutputDownload } from '@/components/generated-output/useGeneratedOutputDownload'
import { devMarker } from '@/lib/developer-mode-markers'
import type { ActionAuditLogExportButtonProps } from './ActionAuditLogExportButton'

export default function ActionAuditLogExportController({
  fallbackFilename,
  href,
  label,
}: ActionAuditLogExportButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const startedRef = useRef(false)
  const [starting, setStarting] = useState(true)
  const { dialog, download, downloading } = useGeneratedOutputDownload()

  const startDownload = useCallback(async () => {
    setStarting(true)
    try {
      await download({
        fallbackFilename,
        output: 'csv',
        restoreFocusTo: buttonRef.current,
        url: href,
      })
    } finally {
      setStarting(false)
    }
  }, [download, fallbackFilename, href])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void startDownload()
  }, [startDownload])

  return (
    <>
      <button
        className="btn-secondary"
        disabled={starting || downloading}
        onClick={() => void startDownload()}
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
      {dialog}
    </>
  )
}
