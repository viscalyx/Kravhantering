'use client'

interface StatusBadgeProps {
  className?: string
  color: string | null
  label: string
  size?: 'sm' | 'md'
}

/**
 * Renders a badge pill whose background/text color is derived from the hex color stored in DB.
 */
export default function StatusBadge({
  className = '',
  color,
  label,
  size = 'md',
}: StatusBadgeProps) {
  const hex = color ?? '#6b7280'
  const sizeClass =
    size === 'sm' ? 'text-[10px] leading-4 px-1.5 py-0' : 'text-xs px-2 py-0.5'

  return (
    <span
      className={`inline-block rounded-full font-medium ${sizeClass} ${className}`}
      style={{
        backgroundColor: `${hex}20`,
        color: hex,
      }}
    >
      {label}
    </span>
  )
}
