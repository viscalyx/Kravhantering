'use client'

import { useTranslations } from 'next-intl'
import { type ReactNode, useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import FieldHelpButton from '@/components/FieldHelpButton'
import RequiredFieldMarker from '@/components/RequiredFieldMarker'

interface ComponentProps {
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
}: ComponentProps) {
  const tc = useTranslations('common')
  const [isOpen, setIsOpen] = useState(false)
  const helpId = `${htmlFor}-help`

  return (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-sm font-medium" htmlFor={htmlFor}>
          {label}
          {required ? <RequiredFieldMarker /> : null}
        </label>
        <FieldHelpButton
          controls={helpId}
          expanded={isOpen}
          label={`${tc('help')}: ${label}`}
          onClick={() => setIsOpen(open => !open)}
        />
      </div>
      <AnimatedHelpPanel id={helpId} isOpen={isOpen}>
        {help}
      </AnimatedHelpPanel>
    </>
  )
}
