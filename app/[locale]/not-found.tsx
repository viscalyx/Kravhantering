import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'

export default function NotFound() {
  const t = useTranslations('notFound')

  return (
    <main className="section-padding min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gradient">{t('title')}</h1>
        <p className="mt-4 text-lg text-secondary-700 dark:text-secondary-300">
          {t('description')}
        </p>
        <Link className="btn-primary mt-8 inline-block" href="/requirements">
          {t('goHome')}
        </Link>
      </div>
    </main>
  )
}
