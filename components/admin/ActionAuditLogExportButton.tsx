'use client'

import { type ComponentType, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import {
  ACTION_LOG_EXPORT_DEV_MARKER,
  type ActionAuditLogExportControllerProps,
} from './ActionAuditLogExport.shared'

export interface ActionAuditLogExportButtonProps
  extends ActionAuditLogExportControllerProps {
  loadErrorLabel: string
}

export const actionAuditLogExportControllerLoader = {
  load: () => import('./ActionAuditLogExportController'),
}

export default function ActionAuditLogExportButton({
  fallbackFilename,
  href,
  label,
  loadErrorLabel,
}: ActionAuditLogExportButtonProps) {
  const [Controller, setController] =
    useState<ComponentType<ActionAuditLogExportControllerProps>>()
  const [loadError, setLoadError] = useState(false)

  if (Controller) {
    return (
      <Controller
        fallbackFilename={fallbackFilename}
        href={href}
        label={label}
      />
    )
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        className="btn-secondary"
        onClick={event => {
          const button = event.currentTarget
          button.disabled = true
          setLoadError(false)
          void actionAuditLogExportControllerLoader.load().then(
            module => {
              setLoadError(false)
              setController(() => module.default)
            },
            () => {
              setLoadError(true)
              button.disabled = false
            },
          )
        }}
        type="button"
        {...devMarker(ACTION_LOG_EXPORT_DEV_MARKER)}
      >
        {label}
      </button>
      {loadError ? (
        <p
          className="text-sm text-danger-700 dark:text-danger-300"
          role="alert"
          {...devMarker({
            context: 'action log',
            name: 'text',
            value: 'CSV export load error',
          })}
        >
          {loadErrorLabel}
        </p>
      ) : null}
    </div>
  )
}
