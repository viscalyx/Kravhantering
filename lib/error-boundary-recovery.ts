import {
  type AppLocale,
  isAppLocale,
  readStoredLocale,
} from '@/lib/locale-preference'

export type ErrorRecoveryDestination = 'admin' | 'requirements'

export interface ErrorBoundaryCopy {
  description: string
  eyebrow: string
  goToAdmin: string
  goToCatalog: string
  referenceLabel: string
  retry: string
  title: string
}

export interface ErrorRecoveryTarget {
  href: string
  kind: ErrorRecoveryDestination
}

interface ErrorRecoveryTargets {
  primary: ErrorRecoveryTarget
  secondary: ErrorRecoveryTarget
}

const DEFAULT_LOCALE: AppLocale = 'sv'

const ADMIN_RECOVERY_PREFIXES = [
  '/admin',
  '/requirement-areas',
  '/requirement-types',
  '/requirement-packages',
  '/requirement-statuses',
  '/quality-characteristics',
  '/risk-levels',
  '/specifications/governance-object-types',
  '/specifications/implementation-types',
  '/specifications/lifecycle-statuses',
  '/specification-item-statuses',
  '/owners',
  '/norm-references',
]

export const ERROR_BOUNDARY_FALLBACK_COPY: Record<
  AppLocale,
  ErrorBoundaryCopy
> = {
  en: {
    description:
      'The page could not be rendered. Try again or go back to a safe starting point.',
    eyebrow: 'Unexpected error',
    goToAdmin: 'Go to admin',
    goToCatalog: 'Go to requirements library',
    referenceLabel: 'Error reference',
    retry: 'Try again',
    title: 'Something went wrong',
  },
  sv: {
    description:
      'Sidan kunde inte visas. Försök igen eller gå tillbaka till en säker startsida.',
    eyebrow: 'Oväntat fel',
    goToAdmin: 'Gå till administration',
    goToCatalog: 'Gå till kravbiblioteket',
    referenceLabel: 'Felreferens',
    retry: 'Försök igen',
    title: 'Något gick fel',
  },
}

export function normalizeAppLocale(
  locale: string | null | undefined,
): AppLocale {
  return isAppLocale(locale) ? locale : DEFAULT_LOCALE
}

export function normalizePathname(pathname: string | null | undefined): string {
  if (!pathname) return '/'
  const pathOnly = pathname.split(/[?#]/, 1)[0]
  if (!pathOnly) return '/'
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`
}

export function getLocaleFromPathname(
  pathname: string | null | undefined,
): AppLocale | null {
  const firstSegment = normalizePathname(pathname).split('/')[1]
  return isAppLocale(firstSegment) ? firstSegment : null
}

export function getErrorRecoveryLocale(
  pathname: string | null | undefined,
  storage?: Pick<Storage, 'getItem'> | null,
): AppLocale {
  return (
    getLocaleFromPathname(pathname) ??
    readStoredLocale(storage) ??
    DEFAULT_LOCALE
  )
}

export function stripLocaleFromPathname(
  pathname: string | null | undefined,
): string {
  const normalized = normalizePathname(pathname)
  const segments = normalized.split('/').filter(Boolean)

  if (segments.length > 0 && isAppLocale(segments[0])) {
    const withoutLocale = segments.slice(1).join('/')
    return withoutLocale ? `/${withoutLocale}` : '/'
  }

  return normalized
}

export function isAdminRecoveryPath(
  pathname: string | null | undefined,
): boolean {
  const path = stripLocaleFromPathname(pathname)

  return ADMIN_RECOVERY_PREFIXES.some(
    prefix => path === prefix || path.startsWith(`${prefix}/`),
  )
}

export function getErrorRecoveryCopy(locale: AppLocale): ErrorBoundaryCopy {
  return ERROR_BOUNDARY_FALLBACK_COPY[locale]
}

export function buildErrorRecoveryHref(
  locale: AppLocale,
  destination: ErrorRecoveryDestination,
): string {
  return `/${locale}${destination === 'admin' ? '/admin' : '/requirements'}`
}

export function getErrorRecoveryTargets({
  locale,
  pathname,
}: {
  locale: AppLocale
  pathname: string | null | undefined
}): ErrorRecoveryTargets {
  const primaryKind: ErrorRecoveryDestination = isAdminRecoveryPath(pathname)
    ? 'admin'
    : 'requirements'
  const secondaryKind: ErrorRecoveryDestination =
    primaryKind === 'admin' ? 'requirements' : 'admin'

  return {
    primary: {
      href: buildErrorRecoveryHref(locale, primaryKind),
      kind: primaryKind,
    },
    secondary: {
      href: buildErrorRecoveryHref(locale, secondaryKind),
      kind: secondaryKind,
    },
  }
}
