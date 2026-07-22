'use client'

import { lazy } from 'react'
import type { ActionAuditLogInitialState } from '@/components/admin/ActionAuditLogView'
import type { AdminTab } from './admin-tabs'

const AccessReviewPanel = lazy(() => import('./panels/access-review-panel'))
const ActionAuditLogPanel = lazy(
  () => import('./panels/action-audit-log-panel'),
)
const SettingsPanel = lazy(() => import('./panels/settings-panel'))
const ArchivingPanel = lazy(() => import('./panels/archiving-panel'))
const ColumnsPanel = lazy(() => import('./panels/columns-panel'))
const IdentitySettingsPanel = lazy(() => import('./panels/identity-panel'))
const PrivacyErasurePanel = lazy(() => import('./panels/privacy-panel'))
const StatusesAndWorkflowsPanel = lazy(
  () => import('./panels/statuses-and-workflows-panel'),
)
const TaxonomyPanel = lazy(() => import('./panels/taxonomy-panel'))

interface AdminPanelRouterProps {
  actionAuditLog?: ActionAuditLogInitialState
  activeTab: AdminTab
}

export default function AdminPanelRouter({
  actionAuditLog,
  activeTab,
}: AdminPanelRouterProps) {
  switch (activeTab) {
    case 'columns':
      return <ColumnsPanel />
    case 'identity':
      return <IdentitySettingsPanel />
    case 'settings':
      return <SettingsPanel />
    case 'taxonomy':
      return <TaxonomyPanel />
    case 'statusesAndWorkflows':
      return <StatusesAndWorkflowsPanel />
    case 'accessReview':
      return <AccessReviewPanel canManage />
    case 'archiving':
      return <ArchivingPanel />
    case 'privacy':
      return <PrivacyErasurePanel />
    case 'actionAuditLog':
      return <ActionAuditLogPanel initialState={actionAuditLog} />
  }
}
