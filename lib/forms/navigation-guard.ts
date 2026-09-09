export const GUARDED_NAVIGATION_EVENT = 'kravhantering:guarded-navigation'

export interface GuardedNavigationRequest {
  anchorEl?: HTMLElement
  proceed: () => void
}

/** Let a live editor confirm before a control navigates programmatically. */
export function requestGuardedNavigation(
  request: GuardedNavigationRequest,
): void {
  const event = new CustomEvent<GuardedNavigationRequest>(
    GUARDED_NAVIGATION_EVENT,
    {
      cancelable: true,
      detail: request,
    },
  )
  if (window.dispatchEvent(event)) request.proceed()
}
