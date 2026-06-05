export const REPORT_ITEM_LOAD_CONCURRENCY = 8

export async function mapReportItemsWithConcurrency<T, TResult>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(REPORT_ITEM_LOAD_CONCURRENCY, items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await mapper(
          items[currentIndex] as T,
          currentIndex,
        )
      }
    }),
  )

  return results
}
