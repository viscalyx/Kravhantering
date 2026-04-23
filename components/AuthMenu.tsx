'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { LogIn, LogOut, UserCircle2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'
import { usePathname } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'

type AuthMeAuthenticated = {
  authenticated: true
  sub: string
  givenName: string | null
  familyName: string | null
  name: string | null
  email: string | null
  roles: string[]
  expiresAt: number | null
}

type AuthMeUnauthenticated = {
  authenticated: false
  authDisabled?: boolean
}

type AuthMe = AuthMeAuthenticated | AuthMeUnauthenticated

const ROLE_KEY_BY_CANONICAL: Record<string, string> = {
  Reviewer: 'reviewer',
  Admin: 'admin',
}

function useAuthMe(): AuthMe | null {
  const [state, setState] = useState<AuthMe | null>(null)

  useEffect(() => {
    if (
      (process.env.NEXT_PUBLIC_AUTH_ENABLED ?? 'true').toLowerCase() === 'false'
    ) {
      setState({ authenticated: false, authDisabled: true })
      return
    }

    let cancelled = false
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(async response => {
        if (!response.ok) return null
        return (await response.json()) as AuthMe
      })
      .then(value => {
        if (cancelled || !value) return
        setState(value)
      })
      .catch(() => {
        if (cancelled) return
        setState({ authenticated: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export default function AuthMenu({
  variant,
}: {
  variant: 'desktop' | 'mobile'
}) {
  const t = useTranslations('nav')
  const tr = useTranslations('roles')
  const locale = useLocale()
  const pathname = usePathname()
  const me = useAuthMe()
  const popupId = useId()
  const [isPopupOpen, setIsPopupOpen] = useState(false)

  if (!me || ('authDisabled' in me && me.authDisabled)) {
    return null
  }

  if (!me.authenticated) {
    const localePrefixed = `/${locale}${pathname && pathname !== '/' ? pathname : ''}`
    const returnTo = encodeURIComponent(localePrefixed || `/${locale}`)
    return (
      <a
        className={
          variant === 'desktop'
            ? 'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium text-secondary-700 transition-all duration-200 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800'
            : 'flex items-center gap-2 px-3.5 py-3 rounded-xl text-sm font-medium text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800'
        }
        href={`/api/auth/login?returnTo=${returnTo}`}
        {...devMarker({ name: 'link', value: 'sign in' })}
      >
        <LogIn aria-hidden="true" className="h-4 w-4" />
        {t('signIn')}
      </a>
    )
  }

  const displayName = me.name || me.email || me.sub
  const localizedRole = (role: string): string =>
    ROLE_KEY_BY_CANONICAL[role] ? tr(ROLE_KEY_BY_CANONICAL[role]) : role
  // Admin overrides every other role (it carries every permission), so
  // show only the Admin chip in that case to keep the popup compact.
  const isAdmin = me.roles.includes('Admin')
  const visibleRoles = isAdmin ? ['Admin'] : me.roles
  const sessionExpiresLabel =
    me.expiresAt !== null
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(me.expiresAt * 1000))
      : null

  const userInfoRows: Array<{ label: string; value: string }> = [
    { label: t('userInfoName'), value: displayName },
  ]
  if (me.email) {
    userInfoRows.push({ label: t('userInfoEmail'), value: me.email })
  }
  userInfoRows.push({ label: t('userInfoSubject'), value: me.sub })
  if (sessionExpiresLabel) {
    userInfoRows.push({
      label: t('userInfoSessionExpires'),
      value: sessionExpiresLabel,
    })
  }

  const userIdentity = (
    <div
      className="flex items-center gap-1.5 text-sm text-secondary-700 dark:text-secondary-300"
      title={t('signedInAs', { name: displayName })}
    >
      <UserCircle2 aria-hidden="true" className="h-4 w-4" />
      <span
        className="max-w-40 truncate"
        {...devMarker({ name: 'text', value: 'signed-in display name' })}
      >
        {displayName}
      </span>
    </div>
  )

  if (variant === 'mobile') {
    // Mobile: no hover popup. Roles are not shown in the header; tap the
    // identity row in the desktop view to see them in the popup.
    return (
      <div
        className="flex flex-col gap-2 px-3.5 py-3"
        {...devMarker({
          name: 'auth menu',
          priority: 310,
          value: 'signed-in user',
        })}
      >
        {userIdentity}
        <a
          className="inline-flex items-center gap-1.5 self-start rounded-xl px-3 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800"
          href="/api/auth/logout"
          {...devMarker({ name: 'link', value: 'sign out' })}
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
          {t('signOut')}
        </a>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2"
      {...devMarker({
        name: 'auth menu',
        priority: 310,
        value: 'signed-in user',
      })}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover-only
          info popup; the popup content is informational and the sign-out
          link is a sibling element with proper keyboard focus. */}
      <div
        className="relative"
        onMouseEnter={() => setIsPopupOpen(true)}
        onMouseLeave={() => setIsPopupOpen(false)}
      >
        <button
          aria-describedby={isPopupOpen ? popupId : undefined}
          aria-expanded={isPopupOpen}
          aria-haspopup="dialog"
          aria-label={t('signedInAs', { name: displayName })}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-secondary-700 transition-all duration-200 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-primary-400/60 dark:focus-visible:ring-offset-secondary-950"
          onBlur={() => setIsPopupOpen(false)}
          onFocus={() => setIsPopupOpen(true)}
          title={t('signedInAs', { name: displayName })}
          type="button"
          {...devMarker({ name: 'button', value: 'user info trigger' })}
        >
          <UserCircle2 aria-hidden="true" className="h-5 w-5" />
        </button>
        <AnimatePresence>
          {isPopupOpen && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              aria-label={t('userInfoTitle')}
              className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-secondary-200 bg-white p-4 shadow-lg dark:border-secondary-700 dark:bg-secondary-900"
              exit={{ opacity: 0, y: -4 }}
              id={popupId}
              initial={{ opacity: 0, y: -4 }}
              role="dialog"
              transition={{ duration: 0.12 }}
              {...devMarker({
                name: 'popover',
                priority: 311,
                value: 'user info popup',
              })}
            >
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                {t('userInfoTitle')}
              </h2>
              <dl className="grid grid-cols-1 gap-y-2 text-sm">
                {userInfoRows.map(row => (
                  <div className="flex flex-col gap-0.5" key={row.label}>
                    <dt className="text-xs font-medium text-secondary-500 dark:text-secondary-400">
                      {row.label}
                    </dt>
                    <dd
                      className="wrap-break-word text-secondary-900 dark:text-secondary-100"
                      {...devMarker({
                        name: 'text',
                        value: `user info ${row.label}`,
                      })}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs font-medium text-secondary-500 dark:text-secondary-400">
                    {t('userInfoRoles')}
                  </dt>
                  <dd className="text-secondary-900 dark:text-secondary-100">
                    {visibleRoles.length === 0 ? (
                      <span className="italic text-secondary-500 dark:text-secondary-400">
                        {t('userInfoNoRoles')}
                      </span>
                    ) : (
                      <ul
                        className="flex flex-wrap gap-1"
                        {...devMarker({
                          name: 'list',
                          value: 'user info roles',
                        })}
                      >
                        {visibleRoles.map(role => (
                          <li
                            className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-950/80 dark:text-primary-300"
                            key={role}
                          >
                            {localizedRole(role)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
              </dl>
              <a
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-secondary-200 px-3 py-2 text-sm font-medium text-secondary-700 transition-all duration-200 hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-300 dark:hover:bg-secondary-800"
                href="/api/auth/logout"
                {...devMarker({ name: 'link', value: 'sign out' })}
              >
                <LogOut aria-hidden="true" className="h-4 w-4" />
                {t('signOut')}
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
