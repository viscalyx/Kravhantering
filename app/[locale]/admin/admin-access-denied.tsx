import { getTranslations } from 'next-intl/server'
import { devMarker } from '@/lib/developer-mode-markers'

export default async function AdminAccessDenied({
  locale,
}: {
  locale: string
}) {
  const t = await getTranslations({ locale, namespace: 'admin' })

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <section
        className="container-custom rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
        {...devMarker({
          context: 'admin center',
          name: 'access denied',
          priority: 360,
          value: 'missing Admin or PrivacyOfficer role',
        })}
      >
        <h1 className="text-3xl font-semibold tracking-tight text-secondary-950 dark:text-secondary-50">
          {t('accessDenied.title')}
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-secondary-600 dark:text-secondary-300">
          {t('accessDenied.description')}
        </p>
      </section>
    </div>
  )
}
