import type { ComponentProps } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

interface ListWorkspaceProps extends ComponentProps<'div'> {
  context: string
  reserveActions?: boolean
}

/** Fluid table workspace; the surrounding section owns the page gutters. */
export default function ListWorkspace({
  className = '',
  context,
  reserveActions,
  ...props
}: ListWorkspaceProps) {
  return (
    <div
      {...props}
      {...(process.env.NODE_ENV !== 'production' &&
        devMarker({ context, name: 'list workspace', value: 'fluid' }))}
      className={`list-workspace${reserveActions ? ' list-workspace-with-actions' : ''} ${className}`}
    />
  )
}
