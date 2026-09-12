import {
  clampRequirementColumnWidth,
  getRequirementColumnDefinition,
  type RequirementColumnId,
} from '@/lib/requirements/list-view'
// THROWAWAY #1347: three header structures plus the unmodified visual baseline.
export const prototype1347Enabled =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_PROTOTYPE_1347 === 'true'

export const variants = ['before', 'A', 'B', 'C'] as const
export type Prototype1347Variant = (typeof variants)[number]
export function getPrototype1347Variant(
  value: string | null,
): Prototype1347Variant {
  return variants.find(variant => variant === value) ?? 'A'
}

export const prototypeWidths = {
  A: {
    uniqueId: 118,
    description: 730,
    area: 148,
    category: 124,
    type: 131,
    qualityCharacteristic: 189,
    status: 144,
    verifiable: 124,
    version: 85,
    normReferences: 200,
  },
  B: { uniqueId: 112, area: 112, category: 104, type: 104, status: 144 },
  C: { uniqueId: 112, area: 112, category: 104, type: 104, status: 144 },
} as const

// Proposed defaults need matching temporary bounds so a drag cannot widen peers.
export function clampPrototype1347Width(
  id: RequirementColumnId,
  width: number,
) {
  const minimums: Partial<Record<RequirementColumnId, number>> = {
    uniqueId: 112,
    area: 112,
    category: 104,
    type: 104,
    status: 144,
  }
  const column = getRequirementColumnDefinition(id)
  if (!column || !Number.isFinite(width))
    return clampRequirementColumnWidth(id, width)
  return Math.min(
    id === 'description'
      ? Number.POSITIVE_INFINITY
      : (column.maxWidthPx ?? Number.POSITIVE_INFINITY),
    Math.max(minimums[id] ?? column.minWidthPx, Math.round(width)),
  )
}
