'use client'

import { useTranslations } from 'next-intl'
import type { ButtonHTMLAttributes } from 'react'

interface DirtyStateButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  dirty: boolean
}

export default function DirtyStateButton({
  dirty,
  disabled = false,
  title,
  ...props
}: DirtyStateButtonProps) {
  const t = useTranslations('common')
  const disabledBecauseClean = !dirty && !disabled
  const resolvedTitle = disabledBecauseClean ? t('noChangesToSave') : title

  return (
    <button disabled={disabled || !dirty} title={resolvedTitle} {...props} />
  )
}
