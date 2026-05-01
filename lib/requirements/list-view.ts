export interface FilterValues {
  areaIds?: number[]
  categoryIds?: number[]
  descriptionSearch?: string
  needsReferenceIds?: number[]
  normReferenceIds?: number[]
  packageItemStatusIds?: number[]
  qualityCharacteristicIds?: number[]
  requiresTesting?: string[]
  riskLevelIds?: number[]
  statuses?: number[]
  typeIds?: number[]
  uniqueIdSearch?: string
  usageScenarioIds?: number[]
}

export interface FilterOption {
  id: number
  nameEn: string
  nameSv: string
}

export interface AreaOption {
  id: number
  name: string
}

export interface QualityCharacteristicOption {
  id: number
  nameEn: string
  nameSv: string
  parentId: number | null
}

export interface StatusOption {
  color: string | null
  id: number
  nameEn: string
  nameSv: string
  sortOrder?: number
}

export interface RiskLevelOption {
  color: string
  id: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

export interface PackageItemStatusOption {
  color: string
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  isDeviationStatus?: boolean
  nameEn: string
  nameSv: string
  sortOrder: number
}

export interface RequirementRow {
  area: {
    name: string
  } | null
  deviationCount?: number
  hasApprovedDeviation?: boolean
  hasPendingDeviation?: boolean
  hasPendingVersion?: boolean
  id: number
  isArchived: boolean
  isPackageLocal?: boolean
  itemRef?: string
  kind?: 'library' | 'packageLocal'
  needsReference?: string | null
  needsReferenceId?: number | null
  normReferenceIds?: string[]
  packageItemId?: number
  packageItemStatusColor?: string | null
  packageItemStatusDescriptionEn?: string | null
  packageItemStatusDescriptionSv?: string | null
  packageItemStatusId?: number | null
  packageItemStatusNameEn?: string | null
  packageItemStatusNameSv?: string | null
  packageLocalRequirementId?: number
  pendingVersionStatusColor?: string | null
  pendingVersionStatusId?: number | null
  suggestionCount?: number
  uniqueId: string
  usageScenarioIds?: number[]
  version: {
    archiveInitiatedAt?: string | null
    categoryNameEn: string | null
    categoryNameSv: string | null
    description: string | null
    requiresTesting: boolean
    revisionToken?: string
    riskLevelId: number | null
    riskLevelNameEn: string | null
    riskLevelNameSv: string | null
    riskLevelColor: string | null
    riskLevelSortOrder: number | null
    status: number
    statusColor: string | null
    statusNameEn: string | null
    statusNameSv: string | null
    qualityCharacteristicNameEn: string | null
    qualityCharacteristicNameSv: string | null
    typeNameEn: string | null
    typeNameSv: string | null
    versionNumber: number
  } | null
}

export const DEFAULT_PUBLISHED_STATUS_ID = 3

export const DEFAULT_FILTERS: FilterValues = {
  statuses: [DEFAULT_PUBLISHED_STATUS_ID],
}

export function hasActiveFilters(values: FilterValues): boolean {
  const defaultStatuses = DEFAULT_FILTERS.statuses ?? []
  const currentStatuses = values.statuses ?? []
  const statusesDiffer =
    currentStatuses.length !== defaultStatuses.length ||
    !currentStatuses.every(status => defaultStatuses.includes(status))

  return !!(
    (values.areaIds && values.areaIds.length > 0) ||
    (values.categoryIds && values.categoryIds.length > 0) ||
    (values.requiresTesting && values.requiresTesting.length > 0) ||
    (values.typeIds && values.typeIds.length > 0) ||
    (values.qualityCharacteristicIds &&
      values.qualityCharacteristicIds.length > 0) ||
    (values.riskLevelIds && values.riskLevelIds.length > 0) ||
    (values.packageItemStatusIds && values.packageItemStatusIds.length > 0) ||
    (values.needsReferenceIds && values.needsReferenceIds.length > 0) ||
    (values.normReferenceIds && values.normReferenceIds.length > 0) ||
    values.uniqueIdSearch ||
    values.descriptionSearch ||
    (values.usageScenarioIds && values.usageScenarioIds.length > 0) ||
    statusesDiffer
  )
}

export const REQUIREMENT_COLUMN_ORDER = [
  'uniqueId',
  'description',
  'area',
  'category',
  'type',
  'qualityCharacteristic',
  'riskLevel',
  'status',
  'requiresTesting',
  'version',
  'needsReference',
  'packageItemStatus',
  'normReferences',
  'suggestionCount',
] as const

export type RequirementColumnId = (typeof REQUIREMENT_COLUMN_ORDER)[number]

export const REQUIREMENT_SORT_FIELDS = [
  'uniqueId',
  'description',
  'area',
  'category',
  'type',
  'qualityCharacteristic',
  'riskLevel',
  'status',
  'version',
] as const

export type RequirementSortField = (typeof REQUIREMENT_SORT_FIELDS)[number]
export type RequirementSortDirection = 'asc' | 'desc'

export interface RequirementSortState {
  by: RequirementSortField
  direction: RequirementSortDirection
}

export interface RequirementColumnDefinition {
  align: 'center' | 'left'
  canHide: boolean
  canSort: boolean
  defaultVisible: boolean
  defaultWidthPx: number
  grows?: boolean
  id: RequirementColumnId
  labelKey: string
  labelNamespace: 'common' | 'improvementSuggestion' | 'requirement'
  maxWidthPx?: number
  minWidthPx: number
  resizable: boolean
}

export interface RequirementListColumnDefault {
  columnId: RequirementColumnId
  defaultVisible: boolean
  sortOrder: number
}

export type RequirementColumnWidths = Partial<
  Record<RequirementColumnId, number>
>

export const DEFAULT_REQUIREMENT_SORT: RequirementSortState = {
  by: 'uniqueId',
  direction: 'asc',
}

export const REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY =
  'requirements.visibleColumns.v4'
export const REQUIREMENT_COLUMN_WIDTHS_STORAGE_KEY_PREFIX =
  'requirements.columnWidths.v4'

export const REQUIREMENT_LIST_COLUMNS: RequirementColumnDefinition[] = [
  {
    align: 'left',
    canHide: false,
    canSort: true,
    defaultVisible: true,
    defaultWidthPx: 150,
    id: 'uniqueId',
    labelKey: 'uniqueId',
    labelNamespace: 'requirement',
    maxWidthPx: 240,
    minWidthPx: 132,
    resizable: true,
  },
  {
    align: 'left',
    canHide: false,
    canSort: true,
    defaultVisible: true,
    defaultWidthPx: 360,
    grows: true,
    id: 'description',
    labelKey: 'description',
    labelNamespace: 'requirement',
    maxWidthPx: 960,
    minWidthPx: 280,
    resizable: true,
  },
  {
    align: 'left',
    canHide: true,
    canSort: true,
    defaultVisible: true,
    defaultWidthPx: 136,
    id: 'area',
    labelKey: 'area',
    labelNamespace: 'requirement',
    maxWidthPx: 240,
    minWidthPx: 120,
    resizable: true,
  },
  {
    align: 'left',
    canHide: true,
    canSort: true,
    defaultVisible: true,
    defaultWidthPx: 152,
    id: 'category',
    labelKey: 'category',
    labelNamespace: 'requirement',
    maxWidthPx: 260,
    minWidthPx: 132,
    resizable: true,
  },
  {
    align: 'left',
    canHide: true,
    canSort: true,
    defaultVisible: true,
    defaultWidthPx: 148,
    id: 'type',
    labelKey: 'type',
    labelNamespace: 'requirement',
    maxWidthPx: 260,
    minWidthPx: 132,
    resizable: true,
  },
  {
    align: 'left',
    canHide: true,
    canSort: true,
    defaultVisible: false,
    defaultWidthPx: 152,
    id: 'qualityCharacteristic',
    labelKey: 'qualityCharacteristic',
    labelNamespace: 'requirement',
    maxWidthPx: 280,
    minWidthPx: 132,
    resizable: true,
  },
  {
    align: 'left',
    canHide: true,
    canSort: true,
    defaultVisible: false,
    defaultWidthPx: 136,
    id: 'riskLevel',
    labelKey: 'riskLevel',
    labelNamespace: 'requirement',
    maxWidthPx: 200,
    minWidthPx: 100,
    resizable: true,
  },
  {
    align: 'left',
    canHide: true,
    canSort: true,
    defaultVisible: true,
    defaultWidthPx: 176,
    id: 'status',
    labelKey: 'status',
    labelNamespace: 'requirement',
    maxWidthPx: 280,
    minWidthPx: 160,
    resizable: true,
  },
  {
    align: 'center',
    canHide: true,
    canSort: false,
    defaultVisible: false,
    defaultWidthPx: 88,
    id: 'requiresTesting',
    labelKey: 'requiresTesting',
    labelNamespace: 'requirement',
    maxWidthPx: 160,
    minWidthPx: 72,
    resizable: true,
  },
  {
    align: 'center',
    canHide: true,
    canSort: true,
    defaultVisible: false,
    defaultWidthPx: 84,
    id: 'version',
    labelKey: 'version',
    labelNamespace: 'common',
    maxWidthPx: 160,
    minWidthPx: 72,
    resizable: true,
  },
  {
    align: 'left',
    canHide: true,
    canSort: false,
    defaultVisible: false,
    defaultWidthPx: 200,
    id: 'needsReference',
    labelKey: 'needsReference',
    labelNamespace: 'requirement',
    maxWidthPx: 400,
    minWidthPx: 140,
    resizable: true,
  },
  {
    align: 'left',
    canHide: true,
    canSort: false,
    defaultVisible: false,
    defaultWidthPx: 180,
    id: 'packageItemStatus',
    labelKey: 'packageItemStatus',
    labelNamespace: 'requirement',
    maxWidthPx: 260,
    minWidthPx: 110,
    resizable: true,
  },
  {
    align: 'left',
    canHide: true,
    canSort: false,
    defaultVisible: false,
    defaultWidthPx: 200,
    id: 'normReferences',
    labelKey: 'normReferences',
    labelNamespace: 'requirement',
    maxWidthPx: 400,
    minWidthPx: 140,
    resizable: true,
  },
  {
    align: 'center',
    canHide: true,
    canSort: false,
    defaultVisible: false,
    defaultWidthPx: 100,
    id: 'suggestionCount',
    labelKey: 'title',
    labelNamespace: 'improvementSuggestion',
    maxWidthPx: 160,
    minWidthPx: 72,
    resizable: true,
  },
] as const

const REQUIREMENT_COLUMN_BY_ID = Object.fromEntries(
  REQUIREMENT_LIST_COLUMNS.map(column => [column.id, column]),
) as Record<RequirementColumnId, RequirementColumnDefinition>

export const LOCKED_REQUIREMENT_COLUMNS = REQUIREMENT_LIST_COLUMNS.filter(
  column => !column.canHide,
).map(column => column.id)

export const DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS =
  REQUIREMENT_LIST_COLUMNS.map((column, index) => ({
    columnId: column.id,
    defaultVisible: column.defaultVisible,
    sortOrder: index,
  })) as RequirementListColumnDefault[]

export function normalizeRequirementListColumnDefaults(
  values: readonly Partial<RequirementListColumnDefault>[] | null | undefined,
): RequirementListColumnDefault[] {
  const byId = new Map<RequirementColumnId, RequirementListColumnDefault>(
    DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS.map(column => [
      column.columnId,
      { ...column },
    ]),
  )

  const seenColumnIds = new Set<RequirementColumnId>()
  const seenSortOrders = new Set<number>()

  for (const value of values ?? []) {
    if (
      !value.columnId ||
      !isRequirementColumnId(value.columnId) ||
      typeof value.sortOrder !== 'number' ||
      !Number.isInteger(value.sortOrder) ||
      value.sortOrder < 0 ||
      typeof value.defaultVisible !== 'boolean'
    ) {
      continue
    }

    if (
      seenColumnIds.has(value.columnId) ||
      seenSortOrders.has(value.sortOrder)
    ) {
      return DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS.map(column => ({
        ...column,
      }))
    }

    seenColumnIds.add(value.columnId)
    seenSortOrders.add(value.sortOrder)
    byId.set(value.columnId, {
      columnId: value.columnId,
      defaultVisible:
        value.defaultVisible ||
        LOCKED_REQUIREMENT_COLUMNS.includes(value.columnId),
      sortOrder: value.sortOrder,
    })
  }

  const normalized = Array.from(byId.values()).sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )

  if (normalized.length !== REQUIREMENT_COLUMN_ORDER.length) {
    return DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS.map(column => ({
      ...column,
    }))
  }

  return normalized.map((column, index) => ({
    columnId: column.columnId,
    defaultVisible:
      column.defaultVisible ||
      LOCKED_REQUIREMENT_COLUMNS.includes(column.columnId),
    sortOrder: index,
  }))
}

export function getRequirementColumnOrder(
  values?: readonly Partial<RequirementListColumnDefault>[] | null,
) {
  return normalizeRequirementListColumnDefaults(values).map(
    column => column.columnId,
  )
}

export function getDefaultVisibleRequirementColumns(
  values?: readonly Partial<RequirementListColumnDefault>[] | null,
) {
  return normalizeRequirementListColumnDefaults(values)
    .filter(column => column.defaultVisible)
    .map(column => column.columnId)
}

export const DEFAULT_VISIBLE_REQUIREMENT_COLUMNS =
  getDefaultVisibleRequirementColumns()

export function getOrderedRequirementListColumns(
  values?: readonly Partial<RequirementListColumnDefault>[] | null,
) {
  return getRequirementColumnOrder(values).map(
    columnId => REQUIREMENT_COLUMN_BY_ID[columnId],
  )
}

export const DEFAULT_REQUIREMENT_COLUMN_WIDTHS = Object.fromEntries(
  REQUIREMENT_LIST_COLUMNS.map(column => [column.id, column.defaultWidthPx]),
) as Record<RequirementColumnId, number>

export function getRequirementColumnDefinition(
  columnId: RequirementColumnId,
): RequirementColumnDefinition | undefined {
  return REQUIREMENT_COLUMN_BY_ID[columnId]
}

export function isRequirementColumnId(
  value: string,
): value is RequirementColumnId {
  return REQUIREMENT_COLUMN_ORDER.includes(value as RequirementColumnId)
}

export function isRequirementSortDirection(
  value: string,
): value is RequirementSortDirection {
  return value === 'asc' || value === 'desc'
}

export function isRequirementSortField(
  value: string,
): value is RequirementSortField {
  return REQUIREMENT_SORT_FIELDS.includes(value as RequirementSortField)
}

export function normalizeRequirementVisibleColumns(
  columns: readonly string[] | null | undefined,
  options?: {
    columnDefaults?: readonly Partial<RequirementListColumnDefault>[] | null
  },
): RequirementColumnId[] {
  const orderedColumns = getRequirementColumnOrder(options?.columnDefaults)

  if (!columns || columns.length === 0) {
    return getDefaultVisibleRequirementColumns(options?.columnDefaults)
  }

  const requested = new Set(
    columns.filter((column): column is RequirementColumnId =>
      isRequirementColumnId(column),
    ),
  )

  for (const lockedColumn of LOCKED_REQUIREMENT_COLUMNS) {
    requested.add(lockedColumn)
  }

  return orderedColumns.filter(column => requested.has(column))
}

export function orderRequirementVisibleColumns(
  columns: readonly string[] | null | undefined,
  options?: {
    columnDefaults?: readonly Partial<RequirementListColumnDefault>[] | null
  },
) {
  const orderedColumns = getRequirementColumnOrder(options?.columnDefaults)
  const requested = new Set(
    (columns ?? []).filter((column): column is RequirementColumnId =>
      isRequirementColumnId(column),
    ),
  )

  for (const lockedColumn of LOCKED_REQUIREMENT_COLUMNS) {
    requested.add(lockedColumn)
  }

  return orderedColumns.filter(column => requested.has(column))
}

export function parseRequirementVisibleColumns(
  raw: string | null | undefined,
  options?: {
    columnDefaults?: readonly Partial<RequirementListColumnDefault>[] | null
  },
): RequirementColumnId[] {
  if (!raw) {
    return getDefaultVisibleRequirementColumns(options?.columnDefaults)
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return getDefaultVisibleRequirementColumns(options?.columnDefaults)
    }

    return normalizeRequirementVisibleColumns(
      parsed.filter((value): value is string => typeof value === 'string'),
      options,
    )
  } catch {
    return getDefaultVisibleRequirementColumns(options?.columnDefaults)
  }
}

export function serializeRequirementVisibleColumns(
  columns: readonly RequirementColumnId[],
  options?: {
    columnDefaults?: readonly Partial<RequirementListColumnDefault>[] | null
  },
): string {
  return JSON.stringify(orderRequirementVisibleColumns(columns, options))
}

export function clearRequirementFiltersForHiddenColumns(
  values: FilterValues,
  visibleColumns: readonly RequirementColumnId[],
  options?: {
    columnDefaults?: readonly Partial<RequirementListColumnDefault>[] | null
  },
): FilterValues {
  const visibleColumnSet = new Set(
    orderRequirementVisibleColumns(visibleColumns, options),
  )
  let nextValues = values

  const clearIfHidden = <K extends keyof FilterValues>(
    columnId: RequirementColumnId,
    key: K,
  ) => {
    if (visibleColumnSet.has(columnId) || values[key] === undefined) {
      return
    }

    if (nextValues === values) {
      nextValues = { ...values }
    }

    nextValues[key] = undefined
  }

  clearIfHidden('area', 'areaIds')
  clearIfHidden('category', 'categoryIds')
  clearIfHidden('type', 'typeIds')
  clearIfHidden('qualityCharacteristic', 'qualityCharacteristicIds')
  clearIfHidden('riskLevel', 'riskLevelIds')
  clearIfHidden('packageItemStatus', 'packageItemStatusIds')
  clearIfHidden('status', 'statuses')
  clearIfHidden('requiresTesting', 'requiresTesting')
  clearIfHidden('needsReference', 'needsReferenceIds')
  clearIfHidden('normReferences', 'normReferenceIds')

  return nextValues
}

export function getRequirementColumnWidthsStorageKey(locale: string): string {
  return `${REQUIREMENT_COLUMN_WIDTHS_STORAGE_KEY_PREFIX}.${locale}`
}

export function clampRequirementColumnWidth(
  columnId: RequirementColumnId,
  width: number,
): number {
  const column = getRequirementColumnDefinition(columnId)

  if (!column || !Number.isFinite(width)) {
    return DEFAULT_REQUIREMENT_COLUMN_WIDTHS[columnId]
  }

  const min = column.minWidthPx
  const max = column.maxWidthPx ?? Number.POSITIVE_INFINITY

  return Math.min(max, Math.max(min, Math.round(width)))
}

export function getRequirementColumnWidth(
  columnId: RequirementColumnId,
  widths: RequirementColumnWidths | null | undefined,
): number {
  const rawWidth = widths?.[columnId]

  if (typeof rawWidth !== 'number' || !Number.isFinite(rawWidth)) {
    return DEFAULT_REQUIREMENT_COLUMN_WIDTHS[columnId]
  }

  return clampRequirementColumnWidth(columnId, rawWidth)
}

export function normalizeRequirementColumnWidths(
  widths: Record<string, unknown> | null | undefined,
): RequirementColumnWidths {
  if (!widths) {
    return {} as RequirementColumnWidths
  }

  const normalized: RequirementColumnWidths = {}

  for (const column of REQUIREMENT_LIST_COLUMNS) {
    const rawWidth = widths[column.id]

    if (typeof rawWidth !== 'number' || !Number.isFinite(rawWidth)) {
      continue
    }

    const nextWidth = clampRequirementColumnWidth(column.id, rawWidth)

    if (nextWidth !== column.defaultWidthPx) {
      normalized[column.id] = nextWidth
    }
  }

  return normalized
}

export function parseRequirementColumnWidths(
  raw: string | null | undefined,
): RequirementColumnWidths {
  if (!raw) {
    return {} as RequirementColumnWidths
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {} as RequirementColumnWidths
    }

    return normalizeRequirementColumnWidths(parsed as Record<string, unknown>)
  } catch {
    return {} as RequirementColumnWidths
  }
}

export function serializeRequirementColumnWidths(
  widths: RequirementColumnWidths,
): string {
  return JSON.stringify(
    normalizeRequirementColumnWidths(widths as Record<string, unknown>),
  )
}

export function buildRequirementListParams({
  filters,
  format,
  limit,
  locale,
  offset,
  sort,
}: {
  filters: FilterValues
  format?: 'csv'
  limit?: number
  locale: string
  offset?: number
  sort: RequirementSortState
}): URLSearchParams {
  const params = new URLSearchParams()
  if (limit != null) {
    params.set('limit', String(limit))
  }
  params.set('locale', locale)
  params.set('sortBy', sort.by)
  params.set('sortDirection', sort.direction)

  if (offset != null) {
    params.set('offset', String(offset))
  }
  if (format) {
    params.set('format', format)
  }
  if (filters.uniqueIdSearch) {
    params.set('uniqueIdSearch', filters.uniqueIdSearch)
  }
  if (filters.descriptionSearch) {
    params.set('descriptionSearch', filters.descriptionSearch)
  }
  if (filters.areaIds) {
    for (const id of filters.areaIds) {
      params.append('areaIds', String(id))
    }
  }
  if (filters.categoryIds) {
    for (const id of filters.categoryIds) {
      params.append('categoryIds', String(id))
    }
  }
  if (filters.typeIds) {
    for (const id of filters.typeIds) {
      params.append('typeIds', String(id))
    }
  }
  if (filters.qualityCharacteristicIds) {
    for (const id of filters.qualityCharacteristicIds) {
      params.append('qualityCharacteristicIds', String(id))
    }
  }
  if (filters.riskLevelIds) {
    for (const id of filters.riskLevelIds) {
      params.append('riskLevelIds', String(id))
    }
  }
  if (filters.requiresTesting) {
    for (const value of filters.requiresTesting) {
      params.append('requiresTesting', value)
    }
  }
  if (filters.statuses) {
    for (const status of filters.statuses) {
      params.append('statuses', String(status))
    }
  }
  if (filters.needsReferenceIds) {
    for (const id of filters.needsReferenceIds) {
      params.append('needsReferenceIds', String(id))
    }
  }
  if (filters.normReferenceIds) {
    for (const id of filters.normReferenceIds) {
      params.append('normReferenceIds', String(id))
    }
  }
  if (filters.usageScenarioIds) {
    for (const id of filters.usageScenarioIds) {
      params.append('usageScenarioIds', String(id))
    }
  }
  if (filters.packageItemStatusIds) {
    for (const id of filters.packageItemStatusIds) {
      params.append('packageItemStatusIds', String(id))
    }
  }

  return params
}

function compareNullableText(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: RequirementSortDirection,
  locale: string | string[] | undefined,
): number {
  const leftValue = left?.trim() ?? ''
  const rightValue = right?.trim() ?? ''

  if (!leftValue && !rightValue) {
    return 0
  }
  if (!leftValue) {
    return 1
  }
  if (!rightValue) {
    return -1
  }

  const result = leftValue.localeCompare(rightValue, locale, {
    sensitivity: 'base',
  })
  return direction === 'asc' ? result : -result
}

function compareNumber(
  left: number | null | undefined,
  right: number | null | undefined,
  direction: RequirementSortDirection,
): number {
  const leftValue = left ?? Number.POSITIVE_INFINITY
  const rightValue = right ?? Number.POSITIVE_INFINITY
  const result = leftValue - rightValue

  return direction === 'asc' ? result : -result
}

function getStatusOrder(
  row: RequirementRow,
  statusOptions: readonly Pick<StatusOption, 'id' | 'sortOrder'>[],
): number | null {
  const statusId = row.version?.status ?? null
  return (
    statusOptions.find(option => option.id === statusId)?.sortOrder ?? statusId
  )
}

export function compareRequirementRows(
  left: RequirementRow,
  right: RequirementRow,
  {
    locale,
    sort,
    statusOptions,
  }: {
    locale: string
    sort: RequirementSortState
    statusOptions: readonly Pick<StatusOption, 'id' | 'sortOrder'>[]
  },
): number {
  const compareByUniqueId = () =>
    compareNullableText(left.uniqueId, right.uniqueId, 'asc', locale)

  let result = 0

  switch (sort.by) {
    case 'uniqueId':
      result = compareNullableText(
        left.uniqueId,
        right.uniqueId,
        sort.direction,
        locale,
      )
      break
    case 'description':
      result = compareNullableText(
        left.version?.description,
        right.version?.description,
        sort.direction,
        locale,
      )
      break
    case 'area':
      result = compareNullableText(
        left.area?.name,
        right.area?.name,
        sort.direction,
        locale,
      )
      break
    case 'category':
      result = compareNullableText(
        locale === 'sv'
          ? left.version?.categoryNameSv
          : left.version?.categoryNameEn,
        locale === 'sv'
          ? right.version?.categoryNameSv
          : right.version?.categoryNameEn,
        sort.direction,
        locale,
      )
      break
    case 'type':
      result = compareNullableText(
        locale === 'sv' ? left.version?.typeNameSv : left.version?.typeNameEn,
        locale === 'sv' ? right.version?.typeNameSv : right.version?.typeNameEn,
        sort.direction,
        locale,
      )
      break
    case 'qualityCharacteristic':
      result = compareNullableText(
        locale === 'sv'
          ? left.version?.qualityCharacteristicNameSv
          : left.version?.qualityCharacteristicNameEn,
        locale === 'sv'
          ? right.version?.qualityCharacteristicNameSv
          : right.version?.qualityCharacteristicNameEn,
        sort.direction,
        locale,
      )
      break
    case 'status':
      result = compareNumber(
        getStatusOrder(left, statusOptions),
        getStatusOrder(right, statusOptions),
        sort.direction,
      )
      break
    case 'version':
      result = compareNumber(
        left.version?.versionNumber,
        right.version?.versionNumber,
        sort.direction,
      )
      break
    case 'riskLevel':
      result = compareNumber(
        left.version?.riskLevelSortOrder,
        right.version?.riskLevelSortOrder,
        sort.direction,
      )
      break
  }

  return result !== 0 ? result : compareByUniqueId()
}
