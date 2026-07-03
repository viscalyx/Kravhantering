import type { vi } from 'vitest'

export function parseChannelEvents(
  spy: ReturnType<typeof vi.spyOn>,
  channel: string,
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
        event !== null && event.channel === channel,
    )
}
