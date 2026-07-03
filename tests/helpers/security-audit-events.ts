import type { vi } from 'vitest'
import { parseChannelEvents } from '@/tests/helpers/channel-events'

export function parseSecurityAuditEvents(
  spy: ReturnType<typeof vi.spyOn>,
): Record<string, unknown>[] {
  return parseChannelEvents(spy, 'security-audit')
}
