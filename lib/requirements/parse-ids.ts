export function parsePositiveIntegerIds(values: Iterable<unknown>): number[] {
  const ids: number[] = []
  const seen = new Set<number>()

  for (const value of values) {
    const parsed =
      typeof value === 'number' || typeof value === 'string'
        ? Number(value)
        : Number.NaN

    if (Number.isInteger(parsed) && parsed > 0 && !seen.has(parsed)) {
      seen.add(parsed)
      ids.push(parsed)
    }
  }

  return ids
}
