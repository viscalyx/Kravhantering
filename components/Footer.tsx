'use client'

import { useTranslations } from 'next-intl'

export default function Footer() {
  const t = useTranslations('footer')

  return (
    <footer className="border-t border-secondary-200/60 dark:border-secondary-700/40 py-8 px-4 sm:px-6 lg:px-8">
      <div className="container-custom text-center text-sm text-secondary-600 dark:text-secondary-400">
        <p>{t('copyright', { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  )
}
