/**
 * Seed ID for the "Included" / "Inkluderad" specification-item status.
 * Every newly added requirement application starts here.
 */
export const DEFAULT_SPECIFICATION_ITEM_STATUS_ID = 1

/**
 * Seed ID for the "Implemented" / "Implementerad" specification-item status.
 */
export const IMPLEMENTED_SPECIFICATION_ITEM_STATUS_ID = 3

/**
 * Seed ID for the "Verified" / "Verifierad" specification-item status.
 */
export const VERIFIED_SPECIFICATION_ITEM_STATUS_ID = 4

/**
 * Seed ID for the "Deviated" / "Avviken" specification-item status.
 * Only selectable when the requirement application has an approved deviation.
 */
export const DEVIATED_SPECIFICATION_ITEM_STATUS_ID = 5

/**
 * Seed ID for the "Not applicable" / "Ej tillämpbar" specification-item status.
 */
export const NOT_APPLICABLE_SPECIFICATION_ITEM_STATUS_ID = 6

/**
 * Seed IDs for the fixed usage-status catalog.
 * These rows are editable, but the catalog itself is not extensible.
 */
export const SYSTEM_SPECIFICATION_ITEM_STATUS_IDS = [
  DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
  2,
  IMPLEMENTED_SPECIFICATION_ITEM_STATUS_ID,
  VERIFIED_SPECIFICATION_ITEM_STATUS_ID,
  DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
  NOT_APPLICABLE_SPECIFICATION_ITEM_STATUS_ID,
] as const

export type SystemSpecificationItemStatusId =
  (typeof SYSTEM_SPECIFICATION_ITEM_STATUS_IDS)[number]

export function isSystemSpecificationItemStatusId(
  id: number,
): id is SystemSpecificationItemStatusId {
  return SYSTEM_SPECIFICATION_ITEM_STATUS_IDS.includes(
    id as SystemSpecificationItemStatusId,
  )
}
