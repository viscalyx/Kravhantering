'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { LogIn, LogOut, UserCircle2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import { usePathname } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'

type AuthMeAuthenticated = {
  authenticated: true
  sub: string
  hsaId: string
  givenName: string
  familyName: string
  name: string
  email?: string
  roles: string[]
  expiresAt: number
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

interface AuthLogoutButtonProps {
  className: string
  formClassName?: string
  label: string
  loadingLabel: string
}

function isFocusVisibleTarget(target: HTMLElement): boolean {
  try {
    return target.matches(':focus-visible')
  } catch {
    return false
  }
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
        if (!response.ok) {
          return { authenticated: false } satisfies AuthMeUnauthenticated
        }
        return (await response.json()) as AuthMe
      })
      .then(value => {
        if (cancelled) return
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

function AuthLogoutButton({
  className,
  formClassName,
  label,
  loadingLabel,
}: AuthLogoutButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const buttonLabel = isSubmitting ? loadingLabel : label
  const buttonTitle = isSubmitting ? loadingLabel : undefined
  const buttonClassName = [
    className,
    'min-h-[44px] min-w-[44px] focus-visible:outline-none',
    'focus-visible:ring-2 focus-visible:ring-primary-400/60',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-white',
    'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none',
    'dark:focus-visible:ring-offset-secondary-950',
  ].join(' ')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/auth/logout', {
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error(`Logout failed with status ${response.status}`)
      }

      const body = (await response.json().catch(() => null)) as {
        redirectTo?: unknown
      } | null
      const redirectTo =
        body && typeof body.redirectTo === 'string' ? body.redirectTo : null
      window.location.assign(redirectTo ?? '/')
    } catch (error) {
      console.error('Logout failed', error)
      setIsSubmitting(false)
    }
  }

  return (
    <form className={formClassName} onSubmit={handleSubmit}>
      <button
        aria-busy={isSubmitting}
        aria-label={buttonLabel}
        className={buttonClassName}
        disabled={isSubmitting}
        title={buttonTitle}
        type="submit"
        {...devMarker({ name: 'button', value: 'sign out' })}
      >
        <LogOut aria-hidden="true" className="h-4 w-4" />
        {buttonLabel}
      </button>
    </form>
  )
}

interface ComponentProps {
  variant: 'desktop' | 'mobile'
}

type UserInfoRowMarker = 'name' | 'email' | 'subject' | 'session expires'

interface UserInfoRow {
  devMarker: UserInfoRowMarker
  label: string
  value: string
}

export default function AuthMenu({ variant }: ComponentProps) {
  const t = useTranslations('nav')
  const tr = useTranslations('roles')
  const locale = useLocale()
  const pathname = usePathname()
  const me = useAuthMe()
  const popupId = useId()
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const popupRootRef = useRef<HTMLDivElement | null>(null)
  const suppressNextFocusOpenRef = useRef(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!isPopupOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (popupRootRef.current?.contains(target)) return
      setIsPopupOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isPopupOpen])

  if (!me || ('authDisabled' in me && me.authDisabled)) {
    return null
  }

  if (!me.authenticated) {
    const localePrefixed = `/${locale}${pathname && pathname !== '/' ? pathname : ''}`
    const searchAndHash =
      typeof window === 'undefined'
        ? ''
        : `${window.location.search}${window.location.hash}`
    const returnTo = encodeURIComponent(`${localePrefixed}${searchAndHash}`)
    return (
      <a
        aria-label={t('signIn')}
        className={
          variant === 'desktop'
            ? 'inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium text-secondary-700 transition-all duration-200 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-offset-secondary-950'
            : 'flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-xl px-3.5 py-3 text-sm font-medium text-secondary-700 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-offset-secondary-950'
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
  const sessionExpiresLabel = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(me.expiresAt * 1000))

  const userInfoRows: UserInfoRow[] = [
    { devMarker: 'name', label: t('userInfoName'), value: displayName },
  ]
  if (me.email) {
    userInfoRows.push({
      devMarker: 'email',
      label: t('userInfoEmail'),
      value: me.email,
    })
  }
  userInfoRows.push({
    devMarker: 'subject',
    label: t('userInfoSubject'),
    value: me.sub,
  })
  if (sessionExpiresLabel) {
    userInfoRows.push({
      devMarker: 'session expires',
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
        <AuthLogoutButton
          className="inline-flex items-center gap-1.5 self-start rounded-xl px-3 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800"
          formClassName="self-start"
          label={t('signOut')}
          loadingLabel={t('signingOut')}
        />
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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover and focus
          state are coordinated on this wrapper so the keyboard-reachable user
          info popover stays mounted while focus moves within it. */}
      <div
        className="relative"
        onBlur={event => {
          const nextTarget = event.relatedTarget
          if (
            nextTarget instanceof Node &&
            event.currentTarget.contains(nextTarget)
          ) {
            return
          }
          setIsPopupOpen(false)
        }}
        onMouseEnter={() => setIsPopupOpen(true)}
        onMouseLeave={() => {
          const activeElement = document.activeElement
          if (
            activeElement instanceof Node &&
            popupRootRef.current?.contains(activeElement)
          ) {
            return
          }
          setIsPopupOpen(false)
        }}
        ref={popupRootRef}
      >
        <button
          aria-describedby={isPopupOpen ? popupId : undefined}
          aria-expanded={isPopupOpen}
          aria-haspopup="dialog"
          aria-label={t('signedInAs', { name: displayName })}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-secondary-700 transition-all duration-200 hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-secondary-300 dark:hover:bg-secondary-800 dark:focus-visible:ring-primary-400/60 dark:focus-visible:ring-offset-secondary-950"
          onClick={() => setIsPopupOpen(open => !open)}
          onFocus={event => {
            if (suppressNextFocusOpenRef.current) {
              suppressNextFocusOpenRef.current = false
              return
            }
            if (isFocusVisibleTarget(event.currentTarget)) {
              setIsPopupOpen(true)
            }
          }}
          ref={triggerRef}
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
              className="absolute right-0 top-full z-50 mt-2 w-[min(calc(100vw-2rem),24rem)] max-w-sm rounded-xl border border-secondary-200 bg-white p-4 shadow-lg dark:border-secondary-700 dark:bg-secondary-900"
              exit={{ opacity: 0, y: -4 }}
              id={popupId}
              initial={{ opacity: 0, y: -4 }}
              onKeyDown={event => {
                if (event.key !== 'Escape') return
                event.preventDefault()
                suppressNextFocusOpenRef.current = true
                setIsPopupOpen(false)
                triggerRef.current?.focus()
              }}
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
                  <div className="flex flex-col gap-0.5" key={row.devMarker}>
                    <dt className="text-xs font-medium text-secondary-500 dark:text-secondary-400">
                      {row.label}
                    </dt>
                    <dd
                      className="wrap-break-word text-secondary-900 dark:text-secondary-100"
                      {...devMarker({
                        name: 'text',
                        value: `user info ${row.devMarker}`,
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
              <AuthLogoutButton
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-secondary-200 px-3 py-2 text-sm font-medium text-secondary-700 transition-all duration-200 hover:bg-secondary-100 dark:border-secondary-700 dark:text-secondary-300 dark:hover:bg-secondary-800"
                formClassName="mt-4"
                label={t('signOut')}
                loadingLabel={t('signingOut')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
