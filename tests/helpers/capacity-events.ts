import type { vi } from 'vitest'

export function parseCapacityEvents(
  spy: ReturnType<typeof vi.spyOn>,
): Record<string, unknown>[] {
  return spy.mock.calls
    .map((call: unknown[]) => {
      try {
        return JSON.parse(String(call[0])) as Record<string, unknown>
      } catch {
        return null
      }
    })
    .filter(
      (
        event: Record<string, unknown> | null,
      ): event is Record<string, unknown> =>
        event !== null && event.channel === 'capacity-observability',
    )
}
