'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useDiscardChangesConfirmation } from '@/hooks/useDiscardChangesConfirmation'
import {
  GUARDED_NAVIGATION_EVENT,
  type GuardedNavigationRequest,
} from '@/lib/forms/navigation-guard'

/** Keep the live requirement editor mounted until navigation is confirmed. */
export function useUnsavedRequirementEdit(dirty: boolean) {
  const confirmDiscard = useDiscardChangesConfirmation()
  const navigationAllowed = useRef(false)
  const confirmedBack = useRef<AbortSignal | null>(null)
  const confirming = useRef(false)

  useEffect(() => {
    navigationAllowed.current = false
    confirmedBack.current = null
    if (!dirty) return

    const currentHref = window.location.href
    const navigation = window.navigation
    const confirmNavigation = async ({
      anchorEl,
      proceed,
    }: GuardedNavigationRequest) => {
      if (confirming.current) return
      confirming.current = true
      try {
        if (await confirmDiscard(anchorEl)) {
          navigationAllowed.current = true
          proceed()
        }
      } finally {
        confirming.current = false
      }
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (navigationAllowed.current) return
      if (confirmedBack.current && !confirmedBack.current.aborted) return
      event.preventDefault()
      event.returnValue = ''
    }
    const followLink = async (event: MouseEvent) => {
      if (
        navigationAllowed.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const link =
        event.target instanceof Element ? event.target.closest('a[href]') : null
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.hasAttribute('download') ||
        (link.target && link.target !== '_self')
      )
        return
      const destination = new URL(link.href, currentHref)
      const current = new URL(currentHref)
      if (
        !['http:', 'https:'].includes(destination.protocol) ||
        (destination.pathname === current.pathname &&
          destination.search === current.search &&
          destination.origin === current.origin)
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      await confirmNavigation({
        anchorEl: link,
        proceed: () => window.location.assign(destination.href),
      })
    }
    const traverseHistory = async (event: NavigateEvent) => {
      const backPending = confirmedBack.current
      confirmedBack.current = null
      if (event.hashChange) {
        navigationAllowed.current = false
        return
      }
      if (
        event.navigationType === 'traverse' &&
        backPending &&
        !backPending.aborted
      ) {
        return
      }
      if (
        navigationAllowed.current ||
        event.navigationType !== 'traverse' ||
        !event.cancelable
      )
        return
      event.preventDefault()
      const key = event.destination.key
      await confirmNavigation({
        proceed: () => {
          // A new user navigation may supersede this one while it completes.
          const traversal = navigation.traverseTo(key)
          void Promise.all([traversal.committed, traversal.finished]).catch(
            () => {
              navigationAllowed.current = false
            },
          )
        },
      })
    }
    const guardNavigation = async (event: Event) => {
      if (navigationAllowed.current) return
      event.preventDefault()
      await confirmNavigation(
        (event as CustomEvent<GuardedNavigationRequest>).detail,
      )
    }
    window.addEventListener(GUARDED_NAVIGATION_EVENT, guardNavigation)
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', followLink, true)
    navigation.addEventListener('navigate', traverseHistory)
    return () => {
      window.removeEventListener(GUARDED_NAVIGATION_EVENT, guardNavigation)
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', followLink, true)
      navigation.removeEventListener('navigate', traverseHistory)
    }
  }, [dirty, confirmDiscard])

  const allowNavigation = useCallback(() => {
    navigationAllowed.current = true
  }, [])
  const navigateBack = useCallback(
    (back: () => void) => {
      if (dirty) {
        const navigation = window.navigation
        // At index zero, all visible entries after the current one are forward.
        if (
          !navigation.canGoBack &&
          window.history.length <= navigation.entries().length
        )
          return
        // Cross-origin history is opaque. Allow the imminent traversal/unload
        // without releasing link or app guards if history.back() does nothing.
        confirmedBack.current = AbortSignal.timeout(1000)
      }
      back()
    },
    [dirty],
  )
  return { allowNavigation, navigateBack }
}
