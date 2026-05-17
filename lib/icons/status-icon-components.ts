import type { LucideIcon } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { isStatusIconName } from '@/lib/icons/status-icon-allowlist'

const LUCIDE_ICON_EXPORTS = LucideIcons as Record<string, unknown>

export function getStatusIconComponent(value: unknown): LucideIcon | null {
  if (!isStatusIconName(value)) return null

  const Icon = LUCIDE_ICON_EXPORTS[value]
  return Icon && (typeof Icon === 'object' || typeof Icon === 'function')
    ? (Icon as LucideIcon)
    : null
}
