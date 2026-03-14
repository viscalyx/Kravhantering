export const DEVELOPER_MODE_SHORTCUT_KEY = 'h'
export const DEVELOPER_MODE_SHORTCUT_CODE = 'KeyH'
export const DEVELOPER_MODE_SHORTCUT_LABEL = 'Mod+Alt+Shift+H'

const OVERLAY_MARGIN = 8
const OVERLAY_MAX_LEFT = 192
const OVERLAY_MAX_TOP = 40

const EXPLICIT_PRIORITY = 400
const KNOWN_HOOK_PRIORITY = 260
const ROLE_PRIORITY = 180
const LABEL_PRIORITY = 140
const TEXT_PRIORITY = 120
const TEST_ID_PRIORITY = 80

const FALLBACK_SELECTOR = [
  '[data-developer-mode-name]',
  '[data-floating-action-rail]',
  '[data-floating-action-item]',
  '[data-column-picker-popover]',
  '[data-requirements-scroll-container]',
  '[data-requirement-header-control]',
  '[data-requirement-header-label]',
  '[data-expanded-detail-cell]',
  '[role]',
  '[aria-label]',
  '[data-testid]',
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'nav',
  'main',
  'table',
  'li',
].join(',')

const REQUIREMENT_COLUMN_LABELS: Record<string, string> = {
  area: 'area',
  category: 'category',
  description: 'requirement text',
  requiresTesting: 'verifiable',
  status: 'status',
  type: 'type',
  typeCategory: 'quality characteristic',
  uniqueId: 'requirement id',
  version: 'version',
}

export interface DeveloperModeBounds {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

export interface DeveloperModeDescriptor {
  context?: string
  name: string
  priority: number
  value?: string
}

export interface DeveloperModeTarget extends DeveloperModeDescriptor {
  anchorLeft: number
  anchorTop: number
  bounds: DeveloperModeBounds
  id: string
  label: string
  payload: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeDeveloperModeText(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : undefined
}

export function buildDeveloperModeCopyText({
  context,
  name,
  value,
}: Pick<DeveloperModeDescriptor, 'context' | 'name' | 'value'>): string {
  if (context && value) {
    return `${context} > ${name}: ${value}`
  }

  if (context) {
    return `${context} > ${name}`
  }

  if (value) {
    return `${name}: ${value}`
  }

  return name
}

export function buildDeveloperModeChipLabel({
  name,
  value,
}: Pick<DeveloperModeDescriptor, 'name' | 'value'>): string {
  return value ? `${name}: ${value}` : name
}

export function matchesDeveloperModeShortcut(
  event: Pick<
    KeyboardEvent,
    'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
  >,
): boolean {
  if (!event.altKey || !event.shiftKey || !(event.metaKey || event.ctrlKey)) {
    return false
  }

  if (event.code === DEVELOPER_MODE_SHORTCUT_CODE) {
    return true
  }

  return (
    typeof event.key === 'string' &&
    event.key.toLowerCase() === DEVELOPER_MODE_SHORTCUT_KEY
  )
}

export function getRequirementColumnDeveloperModeLabel(columnId: string): string {
  return (
    REQUIREMENT_COLUMN_LABELS[columnId] ?? humanizeIdentifier(columnId)
  )
}

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]'),
  )
}

function humanizeIdentifier(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
}

function readNodeText(element: HTMLElement) {
  return normalizeDeveloperModeText(
    element.innerText ?? element.textContent,
  )
}

function readTitleOrLabel(element: HTMLElement) {
  return (
    normalizeDeveloperModeText(element.getAttribute('aria-label')) ??
    normalizeDeveloperModeText(element.getAttribute('title')) ??
    readNodeText(element)
  )
}

function getLabelledByText(element: HTMLElement) {
  const labelIds = normalizeDeveloperModeText(element.getAttribute('aria-labelledby'))
  if (!labelIds) {
    return undefined
  }

  const labels = labelIds
    .split(' ')
    .map(id => normalizeDeveloperModeText(document.getElementById(id)?.textContent))
    .filter((label): label is string => Boolean(label))

  return labels.length > 0 ? labels.join(' ') : undefined
}

function getDialogValue(element: HTMLElement) {
  return (
    normalizeDeveloperModeText(element.dataset.developerModeValue) ??
    getLabelledByText(element) ??
    normalizeDeveloperModeText(
      element.querySelector('h1, h2, h3, h4, h5, h6')?.textContent ?? null,
    ) ??
    normalizeDeveloperModeText(element.getAttribute('aria-label'))
  )
}

function getTabContext(element: HTMLElement) {
  const tablist = element.closest<HTMLElement>('[role="tablist"]')
  return (
    normalizeDeveloperModeText(tablist?.dataset.developerModeValue) ??
    normalizeDeveloperModeText(tablist?.getAttribute('aria-label')) ??
    getLabelledByText(tablist ?? element)
  )
}

function getTabPanelContext(element: HTMLElement) {
  const labelledBy = normalizeDeveloperModeText(element.getAttribute('aria-labelledby'))
  if (!labelledBy) {
    return undefined
  }

  const labelNode = document.getElementById(labelledBy)
  const labelText = normalizeDeveloperModeText(labelNode?.textContent)
  return labelText ? `edge tab: ${labelText}` : undefined
}

function getFallbackContextFromAncestors(element: HTMLElement) {
  for (
    let current = element.parentElement;
    current;
    current = current.parentElement
  ) {
    if (current.closest('[data-developer-mode-overlay-root="true"]')) {
      return undefined
    }

    if (current.dataset.developerModeName) {
      const name = normalizeDeveloperModeText(current.dataset.developerModeName)
      if (!name) {
        continue
      }

      const ancestorContext = normalizeDeveloperModeText(current.dataset.developerModeContext)
      const label = buildDeveloperModeChipLabel({
        name,
        value: normalizeDeveloperModeText(current.dataset.developerModeValue),
      })

      return ancestorContext ? `${ancestorContext} > ${label}` : label
    }

    const role = normalizeDeveloperModeText(current.getAttribute('role'))
    if (role === 'tablist') {
      return (
        normalizeDeveloperModeText(current.getAttribute('aria-label')) ??
        getLabelledByText(current)
      )
    }

    if (current.tagName === 'NAV') {
      return (
        normalizeDeveloperModeText(current.getAttribute('aria-label')) ?? 'navigation'
      )
    }
  }

  return undefined
}

function buildExplicitDescriptor(element: HTMLElement): DeveloperModeDescriptor | null {
  const name = normalizeDeveloperModeText(element.dataset.developerModeName)
  if (!name) {
    return null
  }

  return {
    context:
      normalizeDeveloperModeText(element.dataset.developerModeContext) ??
      getFallbackContextFromAncestors(element),
    name,
    priority: toNumber(element.dataset.developerModePriority, EXPLICIT_PRIORITY),
    value: normalizeDeveloperModeText(element.dataset.developerModeValue),
  }
}

function buildKnownHookDescriptor(
  element: HTMLElement,
): DeveloperModeDescriptor | null {
  if (element.dataset.floatingActionRail !== undefined) {
    return {
      context: getFallbackContextFromAncestors(element),
      name: 'floating action rail',
      priority: KNOWN_HOOK_PRIORITY,
    }
  }

  if (element.dataset.floatingActionItem !== undefined) {
    return {
      context: getFallbackContextFromAncestors(element),
      name: 'floating pill',
      priority: KNOWN_HOOK_PRIORITY,
      value: readTitleOrLabel(element),
    }
  }

  if (element.dataset.columnPickerPopover !== undefined) {
    return {
      context: getFallbackContextFromAncestors(element) ?? 'requirements table',
      name: 'column picker',
      priority: KNOWN_HOOK_PRIORITY,
    }
  }

  if (element.dataset.requirementsScrollContainer !== undefined) {
    return {
      context: 'requirements table',
      name: 'table space',
      priority: KNOWN_HOOK_PRIORITY,
    }
  }

  if (
    element.dataset.requirementHeaderControl !== undefined ||
    element.dataset.requirementHeaderLabel !== undefined
  ) {
    const columnId =
      element.dataset.requirementHeaderControl ??
      element.dataset.requirementHeaderLabel

    return {
      context: 'requirements table',
      name: 'column header',
      priority: KNOWN_HOOK_PRIORITY,
      value: columnId ? getRequirementColumnDeveloperModeLabel(columnId) : undefined,
    }
  }

  if (element.dataset.expandedDetailCell !== undefined) {
    return {
      context: 'requirements table',
      name: 'inline detail pane',
      priority: KNOWN_HOOK_PRIORITY,
    }
  }

  return null
}

function buildRoleDescriptor(element: HTMLElement): DeveloperModeDescriptor | null {
  const role = normalizeDeveloperModeText(element.getAttribute('role'))
  switch (role) {
    case 'alertdialog':
    case 'dialog':
      return {
        context: getFallbackContextFromAncestors(element),
        name: 'dialog',
        priority: ROLE_PRIORITY,
        value: getDialogValue(element),
      }
    case 'tab':
      return {
        context: getTabContext(element),
        name: 'edge tab',
        priority: ROLE_PRIORITY,
        value: readTitleOrLabel(element),
      }
    case 'tabpanel':
      return {
        context: getFallbackContextFromAncestors(element),
        name: 'tab panel',
        priority: ROLE_PRIORITY,
        value: getTabPanelContext(element),
      }
    case 'navigation':
      return {
        name: 'navigation',
        priority: ROLE_PRIORITY,
        value: normalizeDeveloperModeText(element.getAttribute('aria-label')),
      }
    default:
      return null
  }
}

function buildLabelDescriptor(element: HTMLElement): DeveloperModeDescriptor | null {
  const ariaLabel = normalizeDeveloperModeText(element.getAttribute('aria-label'))
  if (!ariaLabel) {
    return null
  }

  if (element.tagName === 'BUTTON') {
    return {
      context: getFallbackContextFromAncestors(element),
      name: 'button',
      priority: LABEL_PRIORITY,
      value: ariaLabel,
    }
  }

  if (element.tagName === 'A') {
    return {
      context: getFallbackContextFromAncestors(element),
      name: 'link',
      priority: LABEL_PRIORITY,
      value: ariaLabel,
    }
  }

  return {
    context: getFallbackContextFromAncestors(element),
    name: humanizeIdentifier(element.tagName),
    priority: LABEL_PRIORITY,
    value: ariaLabel,
  }
}

function buildGenericDescriptor(element: HTMLElement): DeveloperModeDescriptor | null {
  const text = readNodeText(element)
  const tagName = element.tagName

  if (tagName === 'BUTTON') {
    return {
      context: getFallbackContextFromAncestors(element),
      name: 'button',
      priority: TEXT_PRIORITY,
      value: text,
    }
  }

  if (tagName === 'A' && element.getAttribute('href')) {
    return {
      context: getFallbackContextFromAncestors(element),
      name: 'link',
      priority: TEXT_PRIORITY,
      value: text,
    }
  }

  if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
    return {
      context: getFallbackContextFromAncestors(element),
      name: 'text field',
      priority: TEXT_PRIORITY,
      value:
        normalizeDeveloperModeText(element.getAttribute('placeholder')) ??
        normalizeDeveloperModeText(element.getAttribute('name')) ??
        normalizeDeveloperModeText(element.getAttribute('type')) ??
        text,
    }
  }

  if (tagName === 'SELECT') {
    return {
      context: getFallbackContextFromAncestors(element),
      name: 'combobox',
      priority: TEXT_PRIORITY,
      value: normalizeDeveloperModeText(element.getAttribute('name')) ?? text,
    }
  }

  if (tagName === 'TABLE') {
    return {
      context: getFallbackContextFromAncestors(element),
      name: 'table',
      priority: TEXT_PRIORITY,
    }
  }

  if (tagName === 'NAV') {
    return {
      name: 'navigation',
      priority: TEXT_PRIORITY,
      value: normalizeDeveloperModeText(element.getAttribute('aria-label')),
    }
  }

  if (tagName === 'LI') {
    return {
      context: getFallbackContextFromAncestors(element),
      name: 'list item',
      priority: TEXT_PRIORITY,
      value: text,
    }
  }

  return null
}

function buildTestIdDescriptor(element: HTMLElement): DeveloperModeDescriptor | null {
  const testId = normalizeDeveloperModeText(element.dataset.testid)
  if (!testId) {
    return null
  }

  return {
    context: getFallbackContextFromAncestors(element),
    name: 'test target',
    priority: TEST_ID_PRIORITY,
    value: testId,
  }
}

function extractDeveloperModeDescriptor(element: HTMLElement) {
  const explicitDescriptor = buildExplicitDescriptor(element)
  if (explicitDescriptor) {
    return explicitDescriptor
  }

  if (element.parentElement?.closest('[data-developer-mode-name]')) {
    return null
  }

  return (
    buildKnownHookDescriptor(element) ??
    buildRoleDescriptor(element) ??
    buildLabelDescriptor(element) ??
    buildGenericDescriptor(element) ??
    buildTestIdDescriptor(element)
  )
}

function getBounds(element: HTMLElement): DeveloperModeBounds {
  const rect = element.getBoundingClientRect()

  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  }
}

function isVisibleWithinViewport(
  element: HTMLElement,
  viewportHeight: number,
  viewportWidth: number,
) {
  if (
    element.closest(
      '[data-developer-mode-overlay-root="true"], [aria-hidden="true"], [hidden]',
    )
  ) {
    return false
  }

  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false
  }

  const bounds = getBounds(element)
  if (bounds.width <= 0 || bounds.height <= 0) {
    return false
  }

  return !(
    bounds.bottom <= 0 ||
    bounds.right <= 0 ||
    bounds.top >= viewportHeight ||
    bounds.left >= viewportWidth
  )
}

function buildTarget(
  element: HTMLElement,
  viewportHeight: number,
  viewportWidth: number,
): DeveloperModeTarget | null {
  if (!isVisibleWithinViewport(element, viewportHeight, viewportWidth)) {
    return null
  }

  const descriptor = extractDeveloperModeDescriptor(element)
  if (!descriptor) {
    return null
  }

  const name = normalizeDeveloperModeText(descriptor.name)
  if (!name) {
    return null
  }

  const bounds = getBounds(element)
  const context = normalizeDeveloperModeText(descriptor.context)
  const value = normalizeDeveloperModeText(descriptor.value)
  const payload = buildDeveloperModeCopyText({ context, name, value })
  const label = buildDeveloperModeChipLabel({ name, value })

  return {
    anchorLeft: clamp(
      bounds.left + OVERLAY_MARGIN,
      OVERLAY_MARGIN,
      Math.max(OVERLAY_MARGIN, viewportWidth - OVERLAY_MAX_LEFT),
    ),
    anchorTop: clamp(
      bounds.top + OVERLAY_MARGIN,
      OVERLAY_MARGIN,
      Math.max(OVERLAY_MARGIN, viewportHeight - OVERLAY_MAX_TOP),
    ),
    bounds,
    context,
    id: [
      name,
      context ?? '',
      value ?? '',
      Math.round(bounds.top),
      Math.round(bounds.left),
      Math.round(bounds.width),
      Math.round(bounds.height),
    ].join('|'),
    label,
    name,
    payload,
    priority: descriptor.priority,
    value,
  }
}

function shouldSkipCandidate(candidate: DeveloperModeTarget, accepted: DeveloperModeTarget[]) {
  return accepted.some(existing => {
    const samePayload = existing.payload === candidate.payload
    const nearSameBounds =
      Math.abs(existing.bounds.top - candidate.bounds.top) <= 8 &&
      Math.abs(existing.bounds.left - candidate.bounds.left) <= 8 &&
      Math.abs(existing.bounds.width - candidate.bounds.width) <= 8 &&
      Math.abs(existing.bounds.height - candidate.bounds.height) <= 8

    if (samePayload && nearSameBounds) {
      return true
    }

    return (
      existing.priority > candidate.priority &&
      Math.abs(existing.anchorTop - candidate.anchorTop) <= 10 &&
      Math.abs(existing.anchorLeft - candidate.anchorLeft) <= 10
    )
  })
}

export function scanVisibleDeveloperModeTargets(root: ParentNode = document.body as unknown as ParentNode) {
  const viewportHeight = Math.max(
    window.innerHeight,
    document.documentElement.clientHeight,
  )
  const viewportWidth = Math.max(
    window.innerWidth,
    document.documentElement.clientWidth,
  )
  const elements = Array.from(
    root.querySelectorAll<HTMLElement>(FALLBACK_SELECTOR),
  )
  const candidates = elements
    .map(element => buildTarget(element, viewportHeight, viewportWidth))
    .filter((candidate): candidate is DeveloperModeTarget => Boolean(candidate))
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        left.bounds.top - right.bounds.top ||
        left.bounds.left - right.bounds.left,
    )

  const accepted: DeveloperModeTarget[] = []
  for (const candidate of candidates) {
    if (shouldSkipCandidate(candidate, accepted)) {
      continue
    }

    accepted.push(candidate)
  }

  return accepted.sort(
    (left, right) =>
      left.bounds.top - right.bounds.top ||
      left.bounds.left - right.bounds.left,
  )
}
