'use client'

import type { ReactNode } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export default function ActionAuditLogPanel({
  children,
}: {
  children?: ReactNode
}) {
  return (
    <section
      aria-labelledby="actionAuditLog-tab"
      className="space-y-6"
      id="actionAuditLog-panel"
      role="tabpanel"
      {...devMarker({
        context: 'admin center',
        name: 'tab panel',
        priority: 340,
        value: 'action log',
      })}
    >
      {children}
    </section>
  )
}
