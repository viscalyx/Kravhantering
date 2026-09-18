'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useEffect } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

interface Props {
  current: string
  label: string
  nextLabel: string
  onChange: (key: string) => void
  previousLabel: string
  variants: { key: string; name: string }[]
}

/** Throwaway prototype navigation; never mounted by a production build. */
export default function PrototypeVariantSwitcher({
  current,
  label,
  previousLabel,
  nextLabel,
  variants,
  onChange,
}: Props) {
  const index = variants.findIndex(variant => variant.key === current)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !(event.target instanceof Element) ||
        event.target.closest(
          'input, textarea, select, [contenteditable], [role="dialog"]',
        )
      )
        return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const step = event.key === 'ArrowLeft' ? -1 : 1
      onChange(variants[(index + step + variants.length) % variants.length].key)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, onChange, variants])

  if (process.env.NODE_ENV === 'production') return null

  return (
    <nav
      aria-label={label}
      className="prototype-1349-switcher"
      {...devMarker({ name: 'prototype variant switcher', value: current })}
    >
      <button
        aria-label={previousLabel}
        onClick={() =>
          onChange(
            variants[(index - 1 + variants.length) % variants.length].key,
          )
        }
        type="button"
      >
        <ArrowLeft aria-hidden="true" size={18} />
      </button>
      <label>
        <span className="sr-only">{label}</span>
        <select
          aria-label={label}
          onChange={event => onChange(event.target.value)}
          value={current}
        >
          {variants.map(variant => (
            <option key={variant.key} value={variant.key}>
              {variant.name}
            </option>
          ))}
        </select>
      </label>
      <button
        aria-label={nextLabel}
        onClick={() => onChange(variants[(index + 1) % variants.length].key)}
        type="button"
      >
        <ArrowRight aria-hidden="true" size={18} />
      </button>
    </nav>
  )
}
