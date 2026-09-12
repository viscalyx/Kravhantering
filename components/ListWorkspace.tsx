'use client'

import type { ComponentProps } from 'react'
import { usePrototype1345 } from '@/components/Prototype1345'
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
  const prototype = usePrototype1345()
  const active =
    prototype.active &&
    [
      'requirements table',
      'requirementPackages',
      'normReferences',
      'specifications',
      'areas',
    ].includes(context)
  return (
    <div
      {...props}
      data-prototype-1345={active ? prototype.variant : undefined}
      {...(process.env.NODE_ENV !== 'production' &&
        devMarker({ context, name: 'list workspace', value: 'fluid' }))}
      className={`list-workspace${reserveActions && !active ? ' list-workspace-with-actions' : ''} ${className}`}
    />
  )
}
