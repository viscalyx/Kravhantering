const TRANSITION_GUARD_ATTRIBUTE = 'data-theme-transition-guard'
const TRANSITION_GUARD_CSS = `
*, *::before, *::after {
  -webkit-transition: none !important;
  transition: none !important;
}
`

type PendingCleanup =
  | { handle: number; type: 'animation-frame' }
  | { handle: number; type: 'timeout' }

let activeGuardStyle: HTMLStyleElement | null = null
let pendingCleanup: PendingCleanup | null = null

function cancelPendingCleanup() {
  if (!pendingCleanup || typeof window === 'undefined') return

  if (
    pendingCleanup.type === 'animation-frame' &&
    typeof window.cancelAnimationFrame === 'function'
  ) {
    window.cancelAnimationFrame(pendingCleanup.handle)
  } else {
    window.clearTimeout(pendingCleanup.handle)
  }

  pendingCleanup = null
}

function removeActiveGuardStyle() {
  cancelPendingCleanup()
  activeGuardStyle?.remove()
  activeGuardStyle = null
}

function scheduleCleanup(callback: () => void) {
  if (
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function'
  ) {
    pendingCleanup = {
      type: 'animation-frame',
      handle: window.requestAnimationFrame(() => {
        pendingCleanup = null
        callback()
      }),
    }
    return
  }

  pendingCleanup = {
    type: 'timeout',
    handle: window.setTimeout(() => {
      pendingCleanup = null
      callback()
    }, 0),
  }
}

export function applyDocumentThemeChange(mutate: () => void) {
  if (typeof document === 'undefined') {
    mutate()
    return
  }

  const { head, body, documentElement } = document

  if (!head) {
    mutate()
    return
  }

  removeActiveGuardStyle()

  const guardStyle = document.createElement('style')
  guardStyle.setAttribute(TRANSITION_GUARD_ATTRIBUTE, '')
  guardStyle.textContent = TRANSITION_GUARD_CSS
  head.appendChild(guardStyle)
  activeGuardStyle = guardStyle

  try {
    mutate()
  } finally {
    void window.getComputedStyle(body ?? documentElement).opacity

    scheduleCleanup(() => {
      if (activeGuardStyle === guardStyle) {
        activeGuardStyle = null
      }
      guardStyle.remove()
    })
  }
}

export const themeTransitionGuardAttribute = TRANSITION_GUARD_ATTRIBUTE
