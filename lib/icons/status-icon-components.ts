import { icons, type LucideIcon } from 'lucide-react'
import * as statusIconAliases from '@/lib/icons/status-icon-aliases.generated'
import { isStatusIconName } from '@/lib/icons/status-icon-allowlist'

const LUCIDE_ICON_EXPORTS: Record<string, LucideIcon> = {
  ...icons,
  ...statusIconAliases,
}

export function getStatusIconComponent(value: unknown): LucideIcon | null {
  return isStatusIconName(value) ? LUCIDE_ICON_EXPORTS[value] : null
}
