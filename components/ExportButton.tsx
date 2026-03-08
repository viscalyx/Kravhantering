'use client'

import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface ExportButtonProps {
  onClick: () => void
}

export default function ExportButton({ onClick }: ExportButtonProps) {
  const t = useTranslations('common')

  return (
    <button
      className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-sm font-medium text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800 shadow-sm hover:shadow-md transition-all duration-200"
      onClick={onClick}
      type="button"
    >
      <Download aria-hidden="true" className="h-4 w-4" />
      {t('export')}
    </button>
  )
}
