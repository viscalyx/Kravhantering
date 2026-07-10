'use client'

import * as Popover from '@radix-ui/react-popover'
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react'
import { cloneElement, createContext, useContext, useId } from 'react'

interface AppPopoverContextValue {
  contentId: string
}

const AppPopoverContext = createContext<AppPopoverContextValue | null>(null)

interface AppPopoverProps {
  children: ReactNode
  modal?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

interface AppPopoverTriggerProps {
  children: ReactElement<{ 'aria-controls'?: string }>
}

interface AppPopoverContentProps
  extends Omit<
    ComponentPropsWithoutRef<typeof Popover.Content>,
    'asChild' | 'children' | 'id'
  > {
  children: ReactNode
}

export function AppPopover({
  children,
  modal = false,
  onOpenChange,
  open,
}: AppPopoverProps) {
  const contentId = useId()

  return (
    <AppPopoverContext.Provider value={{ contentId }}>
      <Popover.Root modal={modal} onOpenChange={onOpenChange} open={open}>
        {children}
      </Popover.Root>
    </AppPopoverContext.Provider>
  )
}

export function AppPopoverTrigger({ children }: AppPopoverTriggerProps) {
  const context = useContext(AppPopoverContext)
  if (!context) {
    throw new Error('AppPopoverTrigger must be rendered inside AppPopover')
  }

  return (
    <Popover.Trigger asChild>
      {cloneElement(children, { 'aria-controls': context.contentId })}
    </Popover.Trigger>
  )
}

export function AppPopoverContent({
  children,
  ...props
}: AppPopoverContentProps) {
  const context = useContext(AppPopoverContext)
  if (!context) {
    throw new Error('AppPopoverContent must be rendered inside AppPopover')
  }

  return (
    <Popover.Portal>
      <Popover.Content id={context.contentId} {...props}>
        {children}
      </Popover.Content>
    </Popover.Portal>
  )
}
