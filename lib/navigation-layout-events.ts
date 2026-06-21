export const GLOBAL_NAVIGATION_LAYOUT_EVENT =
  'requirements:global-navigation-layout'
export const GLOBAL_NAVIGATION_LAYOUT_TRANSITION_MS = 200
export const GLOBAL_NAVIGATION_LAYOUT_SETTLE_MS =
  GLOBAL_NAVIGATION_LAYOUT_TRANSITION_MS + 40

export function dispatchGlobalNavigationLayoutEvent() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(GLOBAL_NAVIGATION_LAYOUT_EVENT))
}
