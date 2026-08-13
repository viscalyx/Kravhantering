export interface NormalizedBatchGroup<T> {
  items: T[]
  startIndex: number
}

export function normalizedBatchGroups<T>(
  items: T[],
  requestedGroupSize = items.length,
): NormalizedBatchGroup<T>[] {
  const normalizedRequestedGroupSize = Number.isFinite(requestedGroupSize)
    ? Math.trunc(requestedGroupSize)
    : items.length
  const groupSize = Math.max(
    1,
    Math.min(items.length, normalizedRequestedGroupSize),
  )
  const groups: NormalizedBatchGroup<T>[] = []
  for (let startIndex = 0; startIndex < items.length; startIndex += groupSize) {
    groups.push({
      items: items.slice(startIndex, startIndex + groupSize),
      startIndex,
    })
  }
  return groups
}
