'use client'

import type { ReactNode } from 'react'
import RequiredFieldsHint from '@/components/RequiredFieldsHint'

interface FormActionRowProps {
  actionsClassName?: string
  children: ReactNode
  className?: string
  hint?: ReactNode | null
}

export default function FormActionRow({
  actionsClassName = '',
  children,
  className = '',
  hint,
}: FormActionRowProps) {
  const resolvedHint =
    hint === undefined ? (
      <RequiredFieldsHint className="min-w-0 flex-1 wrap-break-word leading-5" />
    ) : (
      hint
    )
  const rowClassName = [
    'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const actionClassName = [
    'flex flex-wrap items-center gap-3 sm:ml-auto sm:justify-end',
    actionsClassName,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rowClassName} data-form-action-row="true">
      {resolvedHint}
      <div className={actionClassName}>{children}</div>
    </div>
  )
}
