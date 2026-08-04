'use client'

import type { CSSProperties } from 'react'
import StatusIcon from '@/components/StatusIcon'
import { getBadgeContrastColors } from '@/lib/color-contrast'

interface StatusBadgeProps {
  className?: string
  color: string | null
  iconName?: string | null
  label: string
  size?: 'sm' | 'md'
  theme?: 'auto' | 'dark' | 'light'
}

/**
 * Renders a badge pill whose background/text color is derived from the hex color stored in DB.
 *
 * Both theme backgrounds are opaque composites derived from the configured
 * accent. The foreground is clamped against that exact rendered background so
 * the label meets WCAG 1.4.3 (AA, 4.5:1) in both themes.
 */
export default function StatusBadge({
  className = '',
  color,
  iconName = null,
  label,
  size = 'md',
  theme = 'auto',
}: StatusBadgeProps) {
  // A status may use an accent only when the same presentation also includes
  // its configured icon and explicit label. Missing icons therefore degrade to
  // the neutral badge instead of turning color into the only state cue.
  const colors = color && iconName ? getBadgeContrastColors(color) : null
  const sizeClass =
    size === 'sm' ? 'text-[10px] leading-4 px-1.5 py-0' : 'text-xs px-2 py-0.5'
  const themeClass = theme === 'auto' ? '' : `status-badge--${theme}`
  const neutralClass = colors
    ? ''
    : 'bg-secondary-100 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200'

  const style = colors
    ? ({
        '--sb-bg-dark': colors.dark.background,
        '--sb-bg-light': colors.light.background,
        '--sb-fg-dark': colors.dark.foreground,
        '--sb-fg-light': colors.light.foreground,
      } as CSSProperties)
    : undefined

  return (
    <span
      className={`status-badge inline-flex items-center gap-1 rounded-full font-medium ${sizeClass} ${themeClass} ${neutralClass} ${className}`}
      data-accent-color={colors?.accent}
      style={style}
    >
      <StatusIcon className="h-3 w-3 shrink-0" name={iconName} />
      {label}
    </span>
  )
}
