'use client'

import * as Collapsible from '@radix-ui/react-collapsible'
import type { ReactElement } from 'react'

interface AppCollapsibleProps {
  children: ReactElement
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

interface AppCollapsibleTriggerProps {
  children: ReactElement
}

export function AppCollapsible({
  children,
  onOpenChange,
  open,
}: AppCollapsibleProps) {
  return (
    <Collapsible.Root asChild onOpenChange={onOpenChange} open={open}>
      {children}
    </Collapsible.Root>
  )
}

export function AppCollapsibleTrigger({
  children,
}: AppCollapsibleTriggerProps) {
  return <Collapsible.Trigger asChild>{children}</Collapsible.Trigger>
}
