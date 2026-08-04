'use client'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import { getBadgeContrastColors } from '@/lib/color-contrast'
import { devMarker } from '@/lib/developer-mode-markers'

interface StatusBadgeThemePreviewCopy {
  contrastPassLabel: string
  contrastResultLabel: (ratio: string) => string
  darkThemeLabel: string
  guidance: string
  invalidColorWarning: string
  lightThemeLabel: string
  title: string
}

interface StatusBadgeThemePreviewProps {
  color: string
  copy: StatusBadgeThemePreviewCopy
  developerModeContext: string
  iconName?: string | null
  label: string
  warningId: string
}

export default function StatusBadgeThemePreview({
  color,
  copy,
  developerModeContext,
  iconName = null,
  label,
  warningId,
}: StatusBadgeThemePreviewProps) {
  const previewColors = getBadgeContrastColors(color)

  return (
    <section
      aria-label={copy.title}
      className="space-y-3 rounded-xl border border-secondary-200 p-4 dark:border-secondary-700"
      {...devMarker({
        context: developerModeContext,
        name: 'theme contrast preview',
        priority: 350,
        value: 'light-dark',
      })}
      role="status"
    >
      <div>
        <h3 className="text-sm font-semibold">{copy.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-secondary-600 dark:text-secondary-300">
          {copy.guidance}
        </p>
      </div>
      {previewColors ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(['light', 'dark'] as const).map(theme => {
            const themeColors = previewColors[theme]
            return (
              <div
                className={
                  theme === 'light'
                    ? 'rounded-lg border border-secondary-200 bg-white p-3 text-secondary-900'
                    : 'rounded-lg border border-secondary-700 bg-secondary-900 p-3 text-secondary-100'
                }
                key={theme}
              >
                <p className="mb-2 text-xs font-semibold">
                  {theme === 'light'
                    ? copy.lightThemeLabel
                    : copy.darkThemeLabel}
                </p>
                <StatusBadge
                  color={color}
                  iconName={iconName}
                  label={label}
                  theme={theme}
                />
                <p className="mt-2 flex items-center gap-1 text-xs">
                  <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                  {copy.contrastResultLabel(themeColors.ratio.toFixed(2))}{' '}
                  {copy.contrastPassLabel}
                </p>
              </div>
            )
          })}
        </div>
      ) : (
        <p
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
          id={warningId}
        >
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {copy.invalidColorWarning}
        </p>
      )}
    </section>
  )
}
