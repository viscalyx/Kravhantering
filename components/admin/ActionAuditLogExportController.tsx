'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGeneratedOutputDownload } from '@/components/generated-output/useGeneratedOutputDownload'
import { devMarker } from '@/lib/developer-mode-markers'
import {
  ACTION_LOG_EXPORT_DEV_MARKER,
  type ActionAuditLogExportControllerProps,
} from './ActionAuditLogExport.shared'

export default function ActionAuditLogExportController({
  fallbackFilename,
  href,
  label,
}: ActionAuditLogExportControllerProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const downloadStartedRef = useRef(false)
  const startedRef = useRef(false)
  const [starting, setStarting] = useState(true)
  const { dialog, download, downloading, error } = useGeneratedOutputDownload()

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
    const timer = window.setTimeout(() => {
      startedRef.current = true
      void startDownload()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [startDownload])

  useEffect(() => {
    if (downloading) {
      downloadStartedRef.current = true
      return
    }
    if (downloadStartedRef.current && !error) {
      downloadStartedRef.current = false
      buttonRef.current?.focus()
    }
  }, [downloading, error])

  return (
    <>
      <button
        className="btn-secondary"
        disabled={starting || downloading}
        onClick={() => void startDownload()}
        ref={buttonRef}
        type="button"
        {...devMarker(ACTION_LOG_EXPORT_DEV_MARKER)}
      >
        {label}
      </button>
      {dialog}
    </>
  )
}
