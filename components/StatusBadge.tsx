'use client'

import type { CSSProperties } from 'react'
import { getReadableTextColors } from '@/lib/color-contrast'

interface StatusBadgeProps {
  className?: string
  color: string | null
  label: string
  size?: 'sm' | 'md'
}

/**
 * Renders a badge pill whose background/text color is derived from the hex color stored in DB.
 *
 * The foreground color is clamped via `getReadableTextColors` per theme so the label always
 * meets WCAG 1.4.3 (AA, 4.5:1) against the badge background in BOTH light and dark mode,
 * regardless of what hex an admin configured. Theme switching is done via CSS custom
 * properties read by the `.status-badge` rules in `app/globals.css`.
 */
export default function StatusBadge({
  className = '',
  color,
  label,
  size = 'md',
}: StatusBadgeProps) {
  const hex = color ?? '#6b7280'
  const { light, dark } = getReadableTextColors(hex)
  const sizeClass =
    size === 'sm' ? 'text-[10px] leading-4 px-1.5 py-0' : 'text-xs px-2 py-0.5'

  const style = {
    backgroundColor: `${hex}20`,
    '--sb-fg-light': light,
    '--sb-fg-dark': dark,
  } as CSSProperties

  return (
    <span
      className={`status-badge inline-block rounded-full font-medium ${sizeClass} ${className}`}
      style={style}
    >
      {label}
    </span>
  )
}
