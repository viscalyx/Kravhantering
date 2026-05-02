'use client'

import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ReactNode, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'

interface FieldLabelWithHelpProps {
  help: ReactNode
  htmlFor: string
  label: string
  required?: boolean
}

export default function FieldLabelWithHelp({
  help,
  htmlFor,
  label,
  required = false,
}: FieldLabelWithHelpProps) {
  const tc = useTranslations('common')
  const [isOpen, setIsOpen] = useState(false)
  const helpId = `${htmlFor}-help`

  return (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-sm font-medium" htmlFor={htmlFor}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
        <button
          aria-controls={helpId}
          aria-describedby={helpId}
          aria-expanded={isOpen}
          aria-label={`${tc('help')}: ${label}`}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          onClick={() => setIsOpen(open => !open)}
          type="button"
        >
          <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      <AnimatedHelpPanel id={helpId} isOpen={isOpen}>
        {help}
      </AnimatedHelpPanel>
    </>
  )
}
