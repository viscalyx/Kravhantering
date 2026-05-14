export const MAX_REPORT_ITEM_COUNT = 50

export function assertReportItemCount(count: number): void {
  if (count > MAX_REPORT_ITEM_COUNT) {
    throw new Error(
      `Report item count ${count} exceeds the limit ${MAX_REPORT_ITEM_COUNT}`,
    )
  }
}
