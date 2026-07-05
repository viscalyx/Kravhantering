import type { vi } from 'vitest'
import { parseChannelEvents } from '@/tests/helpers/channel-events'

export function parseSecurityForensicsEvents(
  spy: ReturnType<typeof vi.spyOn>,
): Record<string, unknown>[] {
  return parseChannelEvents(spy, 'security-forensics')
}
