export interface DirtySnapshotOptions {
  unorderedArrayPaths?: readonly string[]
}

const EMPTY_VALUES = new Set<unknown>(['', null, undefined])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  )
}

function normalizeString(value: string) {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function shouldSortArray(path: string, options: DirtySnapshotOptions) {
  return options.unorderedArrayPaths?.includes(path) ?? false
}

function normalizeDirtyValue(
  value: unknown,
  path: string,
  options: DirtySnapshotOptions,
): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return normalizeString(value)
  if (EMPTY_VALUES.has(value)) return null

  if (Array.isArray(value)) {
    const normalizedArray = value
      .map((item, index) =>
        normalizeDirtyValue(item, `${path}[${index}]`, options),
      )
      .filter(item => item !== null)

    if (!shouldSortArray(path, options)) return normalizedArray

    return normalizedArray.sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    )
  }

  if (isPlainObject(value)) {
    const normalizedEntries = Object.keys(value)
      .sort()
      .map(key => {
        const normalizedValue = normalizeDirtyValue(
          value[key],
          path ? `${path}.${key}` : key,
          options,
        )
        return [key, normalizedValue] as const
      })
      .filter(([, normalizedValue]) => {
        if (normalizedValue === null) return false
        return !(Array.isArray(normalizedValue) && normalizedValue.length === 0)
      })

    return Object.fromEntries(normalizedEntries)
  }

  return value
}

export function createDirtySnapshot(
  value: unknown,
  options: DirtySnapshotOptions = {},
) {
  return JSON.stringify(normalizeDirtyValue(value, '', options))
}

export function hasDirtyPayload(
  baseline: unknown,
  current: unknown,
  options: DirtySnapshotOptions = {},
) {
  return (
    createDirtySnapshot(baseline, options) !==
    createDirtySnapshot(current, options)
  )
}
