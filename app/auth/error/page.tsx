import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { Metadata } from 'next'
import { devMarker } from '@/lib/developer-mode-markers'

type SearchParams = Promise<Record<string, string | string[] | undefined>>
type AuthErrorLocale = 'en' | 'sv'

const KNOWN_ERROR_CODES = new Set([
  'hsa_id_invalid',
  'hsa_id_missing',
  'invalid_callback_request',
  'login_state_cookie_missing',
  'oidc_error',
  'required_name_claim_missing',
  'sub_claim_missing',
  'token_exchange_failed',
])

const COPY: Record<
  AuthErrorLocale,
  {
    eyebrow: string
    genericDescription: string
    loginStateDescription: string
    referenceLabel: string
    retry: string
    title: string
  }
> = {
  en: {
    genericDescription:
      'The sign-in callback could not be completed. Try signing in again. If the problem persists, contact operations and provide the error code below.',
    loginStateDescription:
      'The short-lived login cookie was missing when the identity provider returned to the app. Try signing in again. The cause may be incorrect TLS, Secure cookie handling, or callback host configuration.',
    eyebrow: 'Authentication error',
    referenceLabel: 'Error code',
    retry: 'Try signing in again',
    title: 'Sign-in could not be completed',
  },
  sv: {
    genericDescription:
      'Inloggningens callback kunde inte slutföras. Försök logga in igen. Kontakta drift och ange felkoden nedan om problemet kvarstår.',
    loginStateDescription:
      'Den kortlivade inloggningscookien saknades när identitetsintygsutfärdaren skickade tillbaka dig till appen. Försök logga in igen. Felorsaken kan vara felaktig TLS, Secure-cookie hantering eller konfigurerad callback-host.',
    eyebrow: 'Autentiseringsfel',
    referenceLabel: 'Felkod',
    retry: 'Försök logga in igen',
    title: 'Inloggningen kunde inte slutföras',
  },
}

export const metadata: Metadata = {
  title: 'Inloggningen kunde inte slutföras | Kravhantering',
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function resolveLocale(value: string | undefined): AuthErrorLocale {
  return value === 'en' ? 'en' : 'sv'
}

function resolveCode(value: string | undefined): string {
  if (value && KNOWN_ERROR_CODES.has(value)) return value
  return 'authentication_callback_failed'
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const query = await searchParams
  const locale = resolveLocale(firstValue(query.locale))
  const code = resolveCode(firstValue(query.code))
  const copy = COPY[locale]
  const description =
    code === 'login_state_cookie_missing'
      ? copy.loginStateDescription
      : copy.genericDescription
  const retryHref = `/api/auth/login?returnTo=${encodeURIComponent(
    `/${locale}/requirements`,
  )}`

  return (
    <main className="section-padding min-h-screen bg-white text-secondary-900 dark:bg-secondary-950 dark:text-secondary-100">
      <section
        aria-labelledby="auth-error-title"
        className="flex min-h-[calc(100vh-6rem)] items-center justify-center"
        role="alert"
        {...devMarker({
          context: 'authentication',
          name: 'auth callback error',
          priority: 345,
          value: code,
        })}
      >
        <div className="w-full max-w-2xl rounded-lg border border-red-200/80 bg-white p-6 shadow-sm dark:border-red-900/60 dark:bg-secondary-900 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700 dark:bg-red-950/70 dark:text-red-300">
              <AlertTriangle aria-hidden="true" className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                {copy.eyebrow}
              </p>
              <h1
                className="mt-2 text-2xl font-semibold text-secondary-950 dark:text-secondary-50 sm:text-3xl"
                id="auth-error-title"
              >
                {copy.title}
              </h1>
              <p className="mt-3 text-base leading-7 text-secondary-700 dark:text-secondary-300">
                {description}
              </p>

              <p className="mt-4 text-sm text-secondary-600 dark:text-secondary-400">
                {copy.referenceLabel}:{' '}
                <code className="rounded-md bg-secondary-100 px-2 py-1 font-mono text-xs text-secondary-800 dark:bg-secondary-800 dark:text-secondary-200">
                  {code}
                </code>
              </p>

              <div className="mt-7">
                <a
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus-visible:ring-offset-secondary-900"
                  href={retryHref}
                  {...devMarker({
                    context: 'authentication',
                    name: 'link',
                    value: 'retry sign in',
                  })}
                >
                  <RefreshCw aria-hidden="true" className="h-4 w-4" />
                  {copy.retry}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
