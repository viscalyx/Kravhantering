'use client'

import { FileJson, FileText, ShieldCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useDataSubjectExportDownload } from '@/components/privacy/useDataSubjectExportDownload'
import { devMarker } from '@/lib/developer-mode-markers'

const PRIVACY_DATA_EXPORT_HELP: HelpContent = {
  sections: [
    {
      bodyKey: 'privacyDataExport.description.body',
      headingKey: 'privacyDataExport.description.heading',
      kind: 'text',
    },
    {
      bodyKey: 'privacyDataExport.formats.body',
      headingKey: 'privacyDataExport.formats.heading',
      kind: 'text',
    },
    {
      bodyKey: 'privacyDataExport.limits.body',
      headingKey: 'privacyDataExport.limits.heading',
      kind: 'text',
    },
  ],
  titleKey: 'privacyDataExport.title',
}

interface CurrentUser {
  email?: string
  hsaId: string
  name: string
}

interface ComponentProps {
  currentUser: CurrentUser | null
}

export default function PrivacyClient({ currentUser }: ComponentProps) {
  const t = useTranslations('privacyDataExport')
  const locale = useLocale()
  const dataSubjectExport = useDataSubjectExportDownload({ locale })
  useHelpContent(PRIVACY_DATA_EXPORT_HELP)

  return (
    <>
      <main className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom max-w-4xl">
          <section
            aria-labelledby="privacy-data-export-title"
            className="rounded-[2rem] border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
            {...devMarker({
              name: 'page',
              priority: 330,
              value: 'privacy data export',
            })}
          >
            <div className="flex flex-col gap-4 border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 dark:bg-primary-950/80 dark:text-primary-300">
                  <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                </div>
                <h1
                  className="text-2xl font-semibold text-secondary-950 dark:text-secondary-50"
                  id="privacy-data-export-title"
                >
                  {t('title')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-secondary-600 dark:text-secondary-300">
                  {t('description')}
                </p>
              </div>
            </div>

            {currentUser ? (
              <div className="mt-6 space-y-5">
                <dl className="grid gap-4 rounded-2xl border border-secondary-200/70 bg-secondary-50/70 p-4 text-sm dark:border-secondary-700/60 dark:bg-secondary-950/40 sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-secondary-500 dark:text-secondary-400">
                      {t('name')}
                    </dt>
                    <dd className="mt-1 text-secondary-950 dark:text-secondary-50">
                      {currentUser.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-secondary-500 dark:text-secondary-400">
                      {t('hsaId')}
                    </dt>
                    <dd className="mt-1 font-mono text-secondary-950 dark:text-secondary-50">
                      {currentUser.hsaId}
                    </dd>
                  </div>
                  {currentUser.email ? (
                    <div>
                      <dt className="font-medium text-secondary-500 dark:text-secondary-400">
                        {t('email')}
                      </dt>
                      <dd className="mt-1 text-secondary-950 dark:text-secondary-50">
                        {currentUser.email}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
                    disabled={dataSubjectExport.downloading !== null}
                    onClick={() =>
                      void dataSubjectExport.download({ delivery: 'json' })
                    }
                    type="button"
                  >
                    <FileJson aria-hidden="true" className="h-4 w-4" />
                    {dataSubjectExport.downloading === 'json'
                      ? t('exportingJson')
                      : t('exportJson')}
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-secondary-200 px-4 py-2 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-100 disabled:opacity-60 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                    disabled={dataSubjectExport.downloading !== null}
                    onClick={() =>
                      void dataSubjectExport.download({ delivery: 'pdf' })
                    }
                    type="button"
                  >
                    <FileText aria-hidden="true" className="h-4 w-4" />
                    {dataSubjectExport.downloading === 'pdf'
                      ? t('exportingPdf')
                      : t('exportPdf')}
                  </button>
                  {dataSubjectExport.error ? (
                    <span
                      className="text-sm font-medium text-red-700 dark:text-red-300"
                      role="alert"
                    >
                      {t('exportError', { detail: dataSubjectExport.error })}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <a
                  className="inline-flex min-h-11 items-center rounded-full bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800"
                  href={`/api/auth/login?returnTo=/${locale}/privacy`}
                >
                  {t('signIn')}
                </a>
              </div>
            )}
          </section>
        </div>
      </main>
      {dataSubjectExport.dialog}
    </>
  )
}
