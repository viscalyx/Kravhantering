/**
 * Seed ID for the "Included" / "Inkluderad" specification-item status.
 * Every newly added requirement application starts here.
 */
export const DEFAULT_SPECIFICATION_ITEM_STATUS_ID = 1

/**
 * Seed ID for the "Deviated" / "Avviken" specification-item status.
 * Only selectable when the requirement application has an approved deviation.
 */
export const DEVIATED_SPECIFICATION_ITEM_STATUS_ID = 5

/**
 * Seed IDs for the fixed usage-status catalog.
 * These rows are editable, but the catalog itself is not extensible.
 */
export const SYSTEM_SPECIFICATION_ITEM_STATUS_IDS = [1, 2, 3, 4, 5, 6] as const

export type SystemSpecificationItemStatusId =
  (typeof SYSTEM_SPECIFICATION_ITEM_STATUS_IDS)[number]

export function isSystemSpecificationItemStatusId(
  id: number,
): id is SystemSpecificationItemStatusId {
  return SYSTEM_SPECIFICATION_ITEM_STATUS_IDS.includes(
    id as SystemSpecificationItemStatusId,
  )
}
