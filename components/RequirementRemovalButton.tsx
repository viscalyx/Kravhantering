'use client'

import { type ButtonHTMLAttributes, useId, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

interface ComponentProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  reason?: string | null
}

/** Keep unavailable removal actions keyboard reachable with their explanation. */
export default function RequirementRemovalButton({
  reason,
  children,
  onClick,
  ...props
}: ComponentProps) {
  const descriptionId = useId()
  const [dismissed, setDismissed] = useState(false)
  return (
    <span className="group/removal relative flex flex-col">
      <button
        {...props}
        aria-describedby={reason ? descriptionId : undefined}
        aria-disabled={reason ? true : undefined}
        onBlur={() => setDismissed(false)}
        onClick={event => {
          if (!reason) onClick?.(event)
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') setDismissed(true)
        }}
        onMouseLeave={() => setDismissed(false)}
        style={
          reason
            ? { ...props.style, opacity: 0.4, cursor: 'not-allowed' }
            : props.style
        }
        type="button"
      >
        {children}
      </button>
      {reason && (
        <span
          className={`absolute right-0 top-full z-50 w-56 rounded-lg border border-gray-300 bg-white p-2 text-left text-xs text-gray-700 shadow-lg dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 ${dismissed ? 'invisible' : 'invisible group-focus-within/removal:visible group-hover/removal:visible'}`}
          id={descriptionId}
          role="tooltip"
          {...devMarker({
            context: 'requirements specification detail',
            name: 'action explanation',
            value: 'requirement removal unavailable',
            priority: 350,
          })}
        >
          {reason}
        </span>
      )}
    </span>
  )
}
