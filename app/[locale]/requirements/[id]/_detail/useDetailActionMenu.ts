import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  SetStateAction,
} from 'react'
import { useCallback, useEffect, useId, useRef } from 'react'

const MENU_ITEM_SELECTOR =
  '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])'

interface UseDetailActionMenuOptions {
  idPrefix: string
  isOpen: boolean
  setIsOpen: Dispatch<SetStateAction<boolean>>
}

interface CloseMenuOptions {
  restoreFocus?: boolean
}

export function useDetailActionMenu({
  idPrefix,
  isOpen,
  setIsOpen,
}: UseDetailActionMenuOptions) {
  const generatedId = useId().replace(/:/g, '')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerId = `${idPrefix}-${generatedId}-trigger`
  const menuId = `${idPrefix}-${generatedId}-menu`

  const getMenuItems = useCallback(
    () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ??
          [],
      ),
    [],
  )

  const focusItem = useCallback(
    (index: number) => {
      const items = getMenuItems()
      if (items.length === 0) return
      const wrappedIndex =
        ((index % items.length) + items.length) % items.length
      items[wrappedIndex]?.focus()
    },
    [getMenuItems],
  )

  const closeMenu = useCallback(
    ({ restoreFocus = false }: CloseMenuOptions = {}) => {
      setIsOpen(false)
      if (restoreFocus) {
        triggerRef.current?.focus()
      }
    },
    [setIsOpen],
  )

  useEffect(() => {
    if (!isOpen) return
    focusItem(0)
  }, [focusItem, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        closeMenu()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [closeMenu, isOpen])

  const handleMenuKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu({ restoreFocus: true })
        return
      }

      if (event.key === 'Tab') {
        closeMenu()
        return
      }

      const items = getMenuItems()
      if (items.length === 0) return

      const activeElement = document.activeElement
      const activeIndex =
        activeElement instanceof HTMLElement ? items.indexOf(activeElement) : -1
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          focusItem(activeIndex >= 0 ? activeIndex + 1 : 0)
          break
        case 'ArrowUp':
          event.preventDefault()
          focusItem(activeIndex >= 0 ? activeIndex - 1 : items.length - 1)
          break
        case 'Home':
          event.preventDefault()
          focusItem(0)
          break
        case 'End':
          event.preventDefault()
          focusItem(items.length - 1)
          break
      }
    },
    [closeMenu, focusItem, getMenuItems],
  )

  return {
    closeMenu,
    handleMenuKeyDown,
    menuId,
    menuRef,
    rootRef,
    triggerId,
    triggerRef,
  }
}
