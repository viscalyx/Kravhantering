'use client'

import * as Dialog from '@radix-ui/react-dialog'
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react'

interface AppDialogProps {
  children: ReactNode
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

interface AppDialogTriggerProps {
  children: ReactElement
}

interface AppDialogPortalProps {
  children: ReactNode
}

interface AppDialogCloseProps {
  children: ReactElement
}

type AppDialogOverlayProps = ComponentPropsWithoutRef<typeof Dialog.Overlay>
type AppDialogContentProps = ComponentPropsWithoutRef<typeof Dialog.Content>
type AppDialogTitleProps = ComponentPropsWithoutRef<typeof Dialog.Title>

export function AppDialog({ children, onOpenChange, open }: AppDialogProps) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      {children}
    </Dialog.Root>
  )
}

export function AppDialogTrigger({ children }: AppDialogTriggerProps) {
  return <Dialog.Trigger asChild>{children}</Dialog.Trigger>
}

export function AppDialogPortal({ children }: AppDialogPortalProps) {
  return <Dialog.Portal>{children}</Dialog.Portal>
}

export function AppDialogOverlay(props: AppDialogOverlayProps) {
  return <Dialog.Overlay {...props} />
}

export function AppDialogContent(props: AppDialogContentProps) {
  return <Dialog.Content {...props} />
}

export function AppDialogTitle(props: AppDialogTitleProps) {
  return <Dialog.Title {...props} />
}

export function AppDialogClose({ children }: AppDialogCloseProps) {
  return <Dialog.Close asChild>{children}</Dialog.Close>
}
