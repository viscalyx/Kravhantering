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
  window.dispatchEvent(
    new CustomEvent<AuthReauthRequiredEventDetail>(AUTH_REAUTH_REQUIRED_EVENT, {
      detail: { reason },
    }),
  )
}
