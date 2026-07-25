export interface ActionAuditLogExportControllerProps {
  fallbackFilename: string
  href: string
  label: string
}

export const ACTION_LOG_EXPORT_DEV_MARKER = {
  context: 'action log',
  name: 'CSV export button',
  priority: 330,
} as const
