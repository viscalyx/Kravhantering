'use client'

import { type ComponentType, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export interface ActionAuditLogExportButtonProps {
  fallbackFilename: string
  href: string
  label: string
}

export default function ActionAuditLogExportButton({
  fallbackFilename,
  href,
  label,
}: ActionAuditLogExportButtonProps) {
  const [Controller, setController] =
    useState<ComponentType<ActionAuditLogExportButtonProps>>()

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
    <button
      className="btn-secondary"
      onClick={event => {
        const button = event.currentTarget
        button.disabled = true
        void import('./ActionAuditLogExportController').then(
          module => setController(() => module.default),
          () => {
            button.disabled = false
          },
        )
      }}
      type="button"
      {...devMarker({
        context: 'action log',
        name: 'CSV export button',
        priority: 330,
      })}
    >
      {label}
    </button>
  )
}
