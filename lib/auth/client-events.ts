export const AUTH_REAUTH_REQUIRED_EVENT = 'kravhantering:auth-reauth-required'

export type AuthReauthRequiredReason =
  | 'api_unauthorized'
  | 'session_expired'
  | 'session_missing'

export interface AuthReauthRequiredEventDetail {
  reason: AuthReauthRequiredReason
}

export function dispatchAuthReauthRequired(
  reason: AuthReauthRequiredReason,
): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent<AuthReauthRequiredEventDetail>(
        AUTH_REAUTH_REQUIRED_EVENT,
        {
          detail: { reason },
        },
      ),
    )
  } catch (error) {
    try {
      console.error(
        '[auth] failed to dispatch auth-required event',
        error instanceof Error ? error.message : String(error),
      )
    } catch {
      /* swallow: auth-required notification must not break callers */
    }
  }
}
