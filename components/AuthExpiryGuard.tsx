'use client'

import { useTranslations } from 'next-intl'
import { type MutableRefObject, useEffect, useRef } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import {
  AUTH_REAUTH_REQUIRED_EVENT,
  type AuthReauthRequiredEventDetail,
} from '@/lib/auth/client-events'
import { redirectToReauthLogin } from '@/lib/auth/client-redirect'

type AuthMeAuthenticated = {
  authenticated: true
  expiresAt: number
}

type AuthMeUnauthenticated = {
  authenticated: false
}

type AuthMe = AuthMeAuthenticated | AuthMeUnauthenticated

const AUTH_EXPIRY_WARNING_LEAD_MS = 2 * 60 * 1000
const AUTH_EXPIRED_REDIRECT_DELAY_MS = 5_000

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError'
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

function clearTimer(timerRef: MutableRefObject<number | null>): void {
  if (timerRef.current === null) return
  window.clearTimeout(timerRef.current)
  timerRef.current = null
}

export default function AuthExpiryGuard() {
  const t = useTranslations('nav')
  const { confirm } = useConfirmModal()
  const expiryTimerRef = useRef<number | null>(null)
  const expiredDialogShownRef = useRef(false)
  const expiredRedirectTimerRef = useRef<number | null>(null)
  const redirectingRef = useRef(false)
  const warningShownRef = useRef(false)
  const warningTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const clearExpiryTimers = () => {
      clearTimer(warningTimerRef)
      clearTimer(expiryTimerRef)
    }

    const redirect = () => {
      if (redirectingRef.current) return
      redirectingRef.current = true
      redirectToReauthLogin()
    }

    const showExpiredDialog = () => {
      if (redirectingRef.current) return
      clearExpiryTimers()
      if (!expiredDialogShownRef.current) {
        expiredDialogShownRef.current = true
        expiredRedirectTimerRef.current = window.setTimeout(
          redirect,
          AUTH_EXPIRED_REDIRECT_DELAY_MS,
        )
        void confirm({
          confirmText: t('reauthenticate'),
          icon: 'warning',
          message: t('sessionExpiredMessage'),
          showCancel: false,
          title: t('sessionExpiredTitle'),
        }).then(redirect)
      }
    }

    const showExpiryWarning = () => {
      if (redirectingRef.current || warningShownRef.current) return
      warningShownRef.current = true
      void confirm({
        cancelText: t('continueSession'),
        confirmText: t('reauthenticate'),
        icon: 'warning',
        message: t('sessionExpiringMessage'),
        title: t('sessionExpiringTitle'),
      }).then(shouldReauthenticate => {
        if (shouldReauthenticate) redirect()
      })
    }

    const scheduleExpiry = (expiresAt: number) => {
      clearExpiryTimers()
      const msUntilExpiry = expiresAt * 1000 - Date.now()
      if (!Number.isFinite(msUntilExpiry) || msUntilExpiry <= 0) {
        showExpiredDialog()
        return
      }

      const warningDelay = Math.max(
        0,
        msUntilExpiry - AUTH_EXPIRY_WARNING_LEAD_MS,
      )
      warningTimerRef.current = window.setTimeout(
        showExpiryWarning,
        warningDelay,
      )
      expiryTimerRef.current = window.setTimeout(redirect, msUntilExpiry)
    }

    const handleReauthRequired = (event: Event) => {
      const detail = (event as CustomEvent<AuthReauthRequiredEventDetail>)
        .detail
      if (!detail?.reason) return
      showExpiredDialog()
    }

    window.addEventListener(AUTH_REAUTH_REQUIRED_EVENT, handleReauthRequired)

    fetch('/api/auth/me', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) {
          showExpiredDialog()
          return
        }
        const me = (await response.json()) as AuthMe
        if (!me.authenticated) {
          showExpiredDialog()
          return
        }
        scheduleExpiry(me.expiresAt)
      })
      .catch(error => {
        if (isAbortError(error)) return
      })

    return () => {
      controller.abort()
      window.removeEventListener(
        AUTH_REAUTH_REQUIRED_EVENT,
        handleReauthRequired,
      )
      clearExpiryTimers()
      clearTimer(expiredRedirectTimerRef)
    }
  }, [confirm, t])

  return null
}
