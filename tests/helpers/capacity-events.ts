import type { vi } from 'vitest'
import { parseChannelEvents } from '@/tests/helpers/channel-events'

export function parseCapacityEvents(
  spy: ReturnType<typeof vi.spyOn>,
): Record<string, unknown>[] {
  return parseChannelEvents(spy, 'capacity-observability')
}
