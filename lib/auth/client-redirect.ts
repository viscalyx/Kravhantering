function currentReturnTo(): string {
  if (typeof window === 'undefined') return '/'

  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`
  return path === '' ? '/' : path
}

export function buildReauthLoginHref(): string {
  return `/api/auth/login?returnTo=${encodeURIComponent(currentReturnTo())}`
}

export function redirectToReauthLogin(): void {
  if (typeof window === 'undefined') return
  window.location.assign(buildReauthLoginHref())
}
