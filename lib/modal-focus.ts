interface ModalOptions {
  closeDisabled?: boolean
  initialFocusRef?: { current: HTMLElement | null }
  onClose: () => void
  returnFocusRef?: { current: HTMLElement | null }
}

type ModalKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'shiftKey' | 'defaultPrevented' | 'preventDefault' | 'stopPropagation'
>

interface Modal {
  element: HTMLElement
  layer: HTMLElement
  options: () => ModalOptions
  previous: Element | null
}

const candidates =
  'a[href], area[href], input, textarea, button, select, summary, [tabindex], [contenteditable="true"]'
const stack: Modal[] = []
const isolated = new Map<
  HTMLElement,
  { inert: string | null; hidden: string | null }
>()
const layerStyles = new Map<HTMLElement, string>()
const exiting = new Set<HTMLElement>()
let observer: MutationObserver | undefined
let restoreScroll: (() => void) | undefined

function usable(element: HTMLElement): boolean {
  if (
    !element.isConnected ||
    element.matches(':disabled, input[type="hidden"]')
  )
    return false
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    if (
      node.hasAttribute('inert') ||
      node.hidden ||
      node.getAttribute('aria-hidden') === 'true'
    )
      return false
    const style = getComputedStyle(node)
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse'
    )
      return false
  }
  return true
}

function isTabStop(element: HTMLElement): boolean {
  return (
    element.tabIndex >= 0 &&
    // :indeterminate on a radio means its group has no checked member.
    !element.matches('input[type="radio"]:not(:checked, :indeterminate)') &&
    usable(element)
  )
}

function focus(element: HTMLElement | null | undefined): boolean {
  if (!element || !usable(element)) return false
  element.focus({ preventScroll: true })
  return document.activeElement === element
}

function focusModal(modal: Modal): void {
  const explicit = modal.options().initialFocusRef?.current
  if (explicit && modal.element.contains(explicit) && focus(explicit)) return
  const heading = modal.element.querySelector<HTMLElement>(
    'h1, h2, h3, [role="heading"]',
  )
  if (heading && usable(heading)) {
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
    if (focus(heading)) return
  }
  for (const candidate of modal.element.querySelectorAll<HTMLElement>(
    candidates,
  )) {
    if (isTabStop(candidate) && focus(candidate)) return
  }
  if (!modal.element.hasAttribute('tabindex')) modal.element.tabIndex = -1
  focus(modal.element)
}

function topModal(): Modal | undefined {
  return stack.findLast(modal => modal.element.isConnected)
}

function retainFocus(): void {
  const modal = topModal()
  if (!modal) return
  const active = document.activeElement
  if (
    !(active instanceof HTMLElement) ||
    !modal.element.contains(active) ||
    !usable(active)
  ) {
    focusModal(modal)
  }
}

// Isolate sibling branches, never an ancestor of the active layer. This also
// supports dialogs rendered inline inside another dialog instead of in a portal.
function updateIsolation(): void {
  const required = new Set<HTMLElement>()
  const modal = topModal()
  if (modal) {
    const descriptions = new Set(
      Array.from(modal.element.querySelectorAll('[aria-describedby]')).flatMap(
        element => element.getAttribute('aria-describedby')?.split(/\s+/) ?? [],
      ),
    )
    for (
      let node: HTMLElement | null = modal.layer;
      node?.parentElement;
      node = node.parentElement
    ) {
      for (const sibling of node.parentElement.children) {
        // A text tooltip portalled by an active control belongs to this layer.
        // Keep its hover retention and accessible description available.
        if (
          sibling.getAttribute('role') === 'tooltip' &&
          descriptions.has(sibling.id)
        )
          continue
        if (sibling instanceof HTMLElement && sibling !== node)
          required.add(sibling)
      }
      if (node.parentElement === document.body) break
    }
  }
  for (const element of exiting) {
    if (element.isConnected) required.add(element)
    else exiting.delete(element)
  }
  for (const [element, { inert, hidden }] of isolated) {
    if (required.has(element)) continue
    if (inert === null) element.removeAttribute('inert')
    else element.setAttribute('inert', inert)
    if (hidden === null) element.removeAttribute('aria-hidden')
    else element.setAttribute('aria-hidden', hidden)
    isolated.delete(element)
  }
  retainFocus()
  for (const element of required) {
    if (!isolated.has(element))
      isolated.set(element, {
        inert: element.getAttribute('inert'),
        hidden: element.getAttribute('aria-hidden'),
      })
    if (!element.hasAttribute('inert')) element.setAttribute('inert', '')
    if (element.getAttribute('aria-hidden') !== 'true')
      element.setAttribute('aria-hidden', 'true')
  }
  retainFocus()
  // Ignore our own writes; observe subsequent content and visibility changes.
  observer?.takeRecords()
  if (!stack.length && !exiting.size) observer?.disconnect()
}

function handleKeyDown(modal: Modal, event: ModalKeyEvent): void {
  if (modal !== topModal() || event.defaultPrevented) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (!modal.options().closeDisabled) modal.options().onClose()
  } else if (event.key === 'Tab') {
    const elements = Array.from(
      modal.element.querySelectorAll<HTMLElement>(candidates),
    )
    const active = document.activeElement
    const edge = event.shiftKey
      ? elements.find(isTabStop)
      : elements.findLast(isTabStop)
    if (
      active === edge ||
      !(active instanceof HTMLElement) ||
      !elements.includes(active) ||
      !isTabStop(active)
    ) {
      event.preventDefault()
      const target = event.shiftKey
        ? elements.findLast(isTabStop)
        : elements.find(isTabStop)
      if (!focus(target)) focusModal(modal)
    }
    // Prevent a React parent dialog from handling a portal child's Tab.
    event.stopPropagation()
  }
}

function onKeyDown(event: KeyboardEvent): void {
  const modal = topModal()
  if (modal) handleKeyDown(modal, event)
}

function start(): void {
  const styles = [document.body.style, document.documentElement.style]
  const saved = styles.map(style => ({
    overflow: style.overflow,
    overscrollBehavior: style.overscrollBehavior,
  }))
  for (const style of styles) {
    style.overflow = 'hidden'
    style.overscrollBehavior = 'contain'
  }
  restoreScroll = () => {
    styles.forEach((style, index) => {
      Object.assign(style, saved[index])
    })
  }
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('focusin', retainFocus)
  observer = new MutationObserver(updateIsolation)
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'disabled',
      'hidden',
      'inert',
      'aria-hidden',
      'aria-describedby',
      'style',
      'class',
      'tabindex',
    ],
  })
}

interface ModalRegistration {
  close: () => void
  element: HTMLElement
  handleKeyDown: (event: ModalKeyEvent) => void
  previous: Element | null
}

export function registerModal(
  element: HTMLElement,
  options: () => ModalOptions,
  previous: Element | null = document.activeElement,
): ModalRegistration {
  const layer = element.closest<HTMLElement>('[data-modal-layer]') ?? element
  const modal: Modal = {
    element,
    layer,
    options,
    previous,
  }
  if (!layerStyles.has(layer)) layerStyles.set(layer, layer.style.zIndex)
  exiting.delete(layer)
  if (!stack.length) {
    observer?.disconnect()
    start()
  }
  // Child effects run before parent effects when both mount in one commit.
  const childIndex = stack.findIndex(entry => element.contains(entry.element))
  if (childIndex === -1) stack.push(modal)
  else {
    modal.previous = stack[childIndex].previous
    stack.splice(childIndex, 0, modal)
  }
  stack.forEach((entry, index) => {
    entry.layer.style.zIndex = String(50 + index)
  })
  updateIsolation()
  const frame = requestAnimationFrame(() => {
    if (topModal() === modal) retainFocus()
  })

  return {
    element,
    get previous() {
      return modal.previous
    },
    handleKeyDown: (event: ModalKeyEvent) => handleKeyDown(modal, event),
    close() {
      cancelAnimationFrame(frame)
      const wasTop = stack.at(-1) === modal
      stack.splice(stack.indexOf(modal), 1)
      // A wrapper can unmount before its portalled child. Preserve the page
      // invoker instead of leaving that child with a disappearing parent target.
      for (const child of stack) {
        if (child.previous && element.contains(child.previous))
          child.previous = modal.previous
      }
      if (!stack.some(entry => entry.layer === layer)) {
        layer.style.zIndex = layerStyles.get(layer) ?? ''
        layerStyles.delete(layer)
      }
      // A fading-out surface must not remain interactive over its restored parent.
      if (layer.isConnected && !stack.some(entry => entry.layer === layer))
        exiting.add(layer)
      updateIsolation()
      if (!stack.length) {
        restoreScroll?.()
        document.removeEventListener('keydown', onKeyDown)
        document.removeEventListener('focusin', retainFocus)
      }
      if (wasTop) {
        const parent = topModal()
        const target = options().returnFocusRef?.current ?? modal.previous
        if (
          !(target instanceof HTMLElement) ||
          target === document.body ||
          (parent && !parent.element.contains(target)) ||
          !focus(target)
        ) {
          if (parent) focusModal(parent)
          else {
            const main = document.querySelector<HTMLElement>('main')
            const destination =
              main?.querySelector<HTMLElement>('h1') ?? main ?? document.body
            if (!destination.hasAttribute('tabindex')) destination.tabIndex = -1
            focus(destination)
          }
        }
      }
    },
  }
}
