import type { ReactNode } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import './requirements-panel-header.css'

interface ComponentProps {
  actions?: ReactNode
  className?: string
  filter?: ReactNode
  title: ReactNode
}

export default function RequirementsPanelHeader({
  actions,
  className = '',
  filter,
  title,
}: ComponentProps) {
  return (
    <div
      className={`requirements-panel-header bg-white dark:bg-secondary-900 ${className}`}
      data-requirements-sticky-top-bar="true"
    >
      <div className="min-w-0 border-b px-2 py-0.75">{title}</div>
      <div
        className="requirements-panel-toolbar flex min-h-9.25 min-w-0 flex-wrap items-center border-b"
        data-requirement-package-chooser-anchor="true"
        {...devMarker({
          context: 'requirements specification detail',
          name: 'panel toolbar',
          value: 'filters and tab actions',
        })}
      >
        {filter ? (
          <div className="min-w-0 flex-1 basis-62.5">{filter}</div>
        ) : null}
        <div
          className={`requirements-panel-actions ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1 px-2 py-0.75 ${filter ? '' : 'w-full'}`}
        >
          {actions}
        </div>
      </div>
    </div>
  )
}
