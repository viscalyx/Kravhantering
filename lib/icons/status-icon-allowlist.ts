import type { IconNode } from 'lucide-react'
import dynamicIconImports from 'lucide-react/dynamicIconImports'

type DynamicIconName = keyof typeof dynamicIconImports & string

export type StatusIconName = string
export type StatusIconNodeTag = IconNode[number][0]
export type StatusIconNode = readonly [
  StatusIconNodeTag,
  Readonly<Record<string, string>>,
]

function toPascalIconName(iconName: string) {
  return iconName
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

const STATUS_ICON_DYNAMIC_NAMES = Object.freeze(
  Object.keys(dynamicIconImports)
    .map(dynamicName => {
      const iconName = toPascalIconName(dynamicName)
      return [iconName, dynamicName as DynamicIconName] as const
    })
    .sort(([aName, aDynamicName], [bName, bDynamicName]) => {
      const nameCompare = aName.localeCompare(bName)
      return nameCompare === 0
        ? aDynamicName.localeCompare(bDynamicName)
        : nameCompare
    })
    .reduce<Record<string, DynamicIconName>>((acc, [iconName, dynamicName]) => {
      acc[iconName] ??= dynamicName
      return acc
    }, {}),
)

export const STATUS_ICON_NAMES = Object.freeze(
  Object.keys(STATUS_ICON_DYNAMIC_NAMES),
) as readonly StatusIconName[]

const STATUS_ICON_NAME_SET = new Set<string>(STATUS_ICON_NAMES)
const STATUS_ICON_NODE_CACHE = new Map<
  StatusIconName,
  readonly StatusIconNode[]
>()

function normalizeIconNodes(iconNode: IconNode): readonly StatusIconNode[] {
  return iconNode.map(([tag, attrs]) => {
    const { key: _key, ...cleanAttrs } = attrs
    return [tag, cleanAttrs] as const
  })
}

export function isStatusIconName(value: unknown): value is StatusIconName {
  return typeof value === 'string' && STATUS_ICON_NAME_SET.has(value)
}

export function getStatusIconDynamicName(
  value: unknown,
): DynamicIconName | null {
  return isStatusIconName(value) ? STATUS_ICON_DYNAMIC_NAMES[value] : null
}

export function getStatusIconNodes(
  value: unknown,
): readonly StatusIconNode[] | null {
  if (!isStatusIconName(value)) return null
  return STATUS_ICON_NODE_CACHE.get(value) ?? null
}

export async function loadStatusIconNodes(
  value: unknown,
): Promise<readonly StatusIconNode[] | null> {
  const dynamicName = getStatusIconDynamicName(value)
  if (!dynamicName || !isStatusIconName(value)) return null

  const cachedNodes = STATUS_ICON_NODE_CACHE.get(value)
  if (cachedNodes) return cachedNodes

  const iconModule = await dynamicIconImports[dynamicName]()
  const nodes = normalizeIconNodes(iconModule.__iconNode)
  STATUS_ICON_NODE_CACHE.set(value, nodes)
  return nodes
}

export async function preloadStatusIconNodes(values: Iterable<unknown>) {
  await Promise.all(Array.from(new Set(values)).map(loadStatusIconNodes))
}

export function collectStatusIconNames(value: unknown): StatusIconName[] {
  const iconNames = new Set<StatusIconName>()
  const seen = new WeakSet<object>()

  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') return
    if (seen.has(candidate)) return
    seen.add(candidate)

    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item)
      return
    }

    for (const [key, nestedValue] of Object.entries(candidate)) {
      if (
        (key === 'iconName' || key.endsWith('IconName')) &&
        isStatusIconName(nestedValue)
      ) {
        iconNames.add(nestedValue)
      }
      visit(nestedValue)
    }
  }

  visit(value)
  return Array.from(iconNames)
}
