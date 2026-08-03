import {
  clampForReadability,
  compositeHexColors,
  isStrictHexColor,
} from '@/lib/color-contrast'
import { isStatusIconName } from '@/lib/icons/status-icon-allowlist'
import { localizeReportValue } from '@/lib/reports/report-labels'
import type { ReportPriorityIdentity } from '@/lib/reports/types'

const PDF_PAGE_BACKGROUND = '#ffffff'
const PDF_NEUTRAL_BADGE_BACKGROUND = '#f1f5f9'
const PDF_NEUTRAL_FOREGROUND = '#475569'
const PDF_BADGE_TINT_OPACITY = 0.125

interface PriorityIdentityInput {
  code: string
  color?: string | null
  iconName?: string | null
  nameEn?: string | null
  nameSv?: string | null
}

interface PriorityIdentityItemInput {
  priorityLevelCode: string | null
  priorityLevelColor: string | null
  priorityLevelIconName: string | null
  priorityLevelNameEn: string | null
  priorityLevelNameSv: string | null
}

export interface PdfPriorityColors {
  background: string
  foreground: string
}

export function createReportPriorityIdentity(
  input: PriorityIdentityInput,
): ReportPriorityIdentity {
  const color = input.color?.trim() ?? ''
  return {
    code: input.code.trim(),
    color: isStrictHexColor(color) ? color.toLowerCase() : null,
    iconName: isStatusIconName(input.iconName) ? input.iconName : null,
    nameEn: input.nameEn?.trim() ?? '',
    nameSv: input.nameSv?.trim() ?? '',
  }
}

export function createReportPriorityIdentityFromItem(
  item: PriorityIdentityItemInput,
): ReportPriorityIdentity | null {
  if (!item.priorityLevelCode) return null
  return createReportPriorityIdentity({
    code: item.priorityLevelCode,
    color: item.priorityLevelColor,
    iconName: item.priorityLevelIconName,
    nameEn: item.priorityLevelNameEn,
    nameSv: item.priorityLevelNameSv,
  })
}

export function formatReportPriorityLabel(
  priority: ReportPriorityIdentity | null,
  locale: string,
): string | null {
  if (!priority) return null
  const name = localizeReportValue(locale, priority.nameSv, priority.nameEn)
  const parts = [priority.code, name].filter(Boolean)
  return parts.length > 0 ? parts.join(' – ') : null
}

export function getPdfPriorityColors(
  accent: string | null,
  backdrop: string,
  variant: 'badge' | 'inline',
): PdfPriorityColors {
  const safeBackdrop = isStrictHexColor(backdrop)
    ? backdrop.toLowerCase()
    : PDF_PAGE_BACKGROUND
  const safeAccent = accent && isStrictHexColor(accent) ? accent : null

  if (!safeAccent) {
    const background =
      variant === 'badge' && safeBackdrop === PDF_PAGE_BACKGROUND
        ? PDF_NEUTRAL_BADGE_BACKGROUND
        : safeBackdrop
    return {
      background,
      foreground: clampForReadability(PDF_NEUTRAL_FOREGROUND, background),
    }
  }

  const background =
    variant === 'badge'
      ? (compositeHexColors(safeAccent, safeBackdrop, PDF_BADGE_TINT_OPACITY) ??
        safeBackdrop)
      : safeBackdrop

  return {
    background,
    foreground: clampForReadability(safeAccent, background),
  }
}
