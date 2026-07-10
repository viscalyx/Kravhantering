'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ReactElement,
  ReactNode,
} from 'react'
import { cloneElement, createContext, useContext, useId } from 'react'

interface AppMenuContextValue {
  contentId: string
}

const AppMenuContext = createContext<AppMenuContextValue | null>(null)

interface AppMenuProps {
  children: ReactNode
  modal?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

interface AppMenuTriggerProps {
  children: ReactElement<{ 'aria-controls'?: string }>
}

interface AppMenuContentProps
  extends Omit<
    ComponentPropsWithoutRef<typeof DropdownMenu.Content>,
    'asChild' | 'children' | 'id' | 'onSelect' | 'style'
  > {
  children: ReactNode
  matchTriggerWidth?: boolean
  style?: CSSProperties
}

interface AppMenuItemProps
  extends Omit<
    ComponentPropsWithoutRef<typeof DropdownMenu.Item>,
    'asChild' | 'children' | 'onSelect'
  > {
  children: ReactNode
  onAction?: () => void
}

interface AppMenuLinkItemProps
  extends Omit<
    ComponentPropsWithoutRef<typeof DropdownMenu.Item>,
    'asChild' | 'children' | 'onSelect'
  > {
  children: ReactElement
}

type AppMenuSeparatorProps = ComponentPropsWithoutRef<
  typeof DropdownMenu.Separator
>

export function AppMenu({
  children,
  modal = false,
  onOpenChange,
  open,
}: AppMenuProps) {
  const contentId = useId()

  return (
    <AppMenuContext.Provider value={{ contentId }}>
      <DropdownMenu.Root modal={modal} onOpenChange={onOpenChange} open={open}>
        {children}
      </DropdownMenu.Root>
    </AppMenuContext.Provider>
  )
}

export function AppMenuTrigger({ children }: AppMenuTriggerProps) {
  const context = useContext(AppMenuContext)
  if (!context) {
    throw new Error('AppMenuTrigger must be rendered inside AppMenu')
  }

  return (
    <DropdownMenu.Trigger asChild>
      {cloneElement(children, { 'aria-controls': context.contentId })}
    </DropdownMenu.Trigger>
  )
}

export function AppMenuContent({
  children,
  loop = true,
  matchTriggerWidth = false,
  style,
  ...props
}: AppMenuContentProps) {
  const context = useContext(AppMenuContext)
  if (!context) {
    throw new Error('AppMenuContent must be rendered inside AppMenu')
  }

  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        id={context.contentId}
        loop={loop}
        style={
          matchTriggerWidth
            ? {
                width: 'var(--radix-dropdown-menu-trigger-width)',
                ...style,
              }
            : style
        }
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  )
}

export function AppMenuItem({
  children,
  onAction,
  ...props
}: AppMenuItemProps) {
  return (
    <DropdownMenu.Item onSelect={onAction} {...props}>
      {children}
    </DropdownMenu.Item>
  )
}

export function AppMenuLinkItem({ children, ...props }: AppMenuLinkItemProps) {
  return (
    <DropdownMenu.Item asChild {...props}>
      {children}
    </DropdownMenu.Item>
  )
}

export function AppMenuSeparator(props: AppMenuSeparatorProps) {
  return <DropdownMenu.Separator {...props} />
}
