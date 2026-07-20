'use client'

import type { ComponentProps } from 'react'
import type { ActionAuditLogInitialState } from '@/components/admin/ActionAuditLogView'
import AdminClient from './admin-client'
import AdminPanelRouter from './admin-panel-router'

interface AdminComposedClientProps
  extends Omit<ComponentProps<typeof AdminClient>, 'renderPanel'> {
  actionAuditLog?: ActionAuditLogInitialState
}

export default function AdminComposedClient({
  actionAuditLog,
  ...props
}: AdminComposedClientProps) {
  return (
    <AdminClient
      {...props}
      renderPanel={activeTab => (
        <AdminPanelRouter
          actionAuditLog={actionAuditLog}
          activeTab={activeTab}
        />
      )}
    />
  )
}
