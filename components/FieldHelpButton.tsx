'use client'

import { HelpCircle } from 'lucide-react'
import { forwardRef } from 'react'

interface FieldHelpButtonProps {
  controls: string
  disabled?: boolean
  expanded: boolean
  label: string
  onClick: () => void
}

const FieldHelpButton = forwardRef<HTMLButtonElement, FieldHelpButtonProps>(
  function FieldHelpButton(
    { controls, disabled = false, expanded, label, onClick },
    ref,
  ) {
    return (
      <button
        aria-controls={controls}
        aria-describedby={expanded ? controls : undefined}
        aria-expanded={expanded}
        aria-label={label}
        className="inline-flex min-h-6 min-w-6 items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-secondary-400 dark:hover:text-primary-400 dark:disabled:hover:text-secondary-400"
        disabled={disabled}
        onClick={onClick}
        ref={ref}
        type="button"
      >
        <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    )
  },
)

export default FieldHelpButton
