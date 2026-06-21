'use client'

import { useTranslations } from 'next-intl'

interface RequiredFieldsHintProps {
  className?: string
}

export default function RequiredFieldsHint({
  className = '',
}: RequiredFieldsHintProps) {
  const t = useTranslations('common')
  const classNames = [
    'text-xs text-secondary-500 dark:text-secondary-400',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <p className={classNames}>{t('requiredFieldsHint')}</p>
}
