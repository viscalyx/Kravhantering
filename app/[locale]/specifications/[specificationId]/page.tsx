import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import {
  loadRequirementsSpecificationDetailInitialData,
  resolveRequirementsSpecificationRouteParam,
} from '@/lib/specifications/preload'
import RequirementsSpecificationDetailClient from './requirements-specification-detail-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('specifications') }
}

type Params = Promise<{ locale: string; specificationId: string }>

function resolveLocale(requestedLocale: string): 'sv' | 'en' {
  return routing.locales.includes(requestedLocale as 'sv' | 'en')
    ? (requestedLocale as 'sv' | 'en')
    : routing.defaultLocale
}

export default async function RequirementsSpecificationDetailPage({
  params,
}: {
  params: Params
}) {
  const { locale: requestedLocale, specificationId: specificationIdParam } =
    await params
  const locale = resolveLocale(requestedLocale)
  const resolvedSpecification =
    await resolveRequirementsSpecificationRouteParam(specificationIdParam)
  if (!resolvedSpecification) {
    notFound()
  }
  if (
    resolvedSpecification.fromCode ||
    specificationIdParam !== String(resolvedSpecification.id)
  ) {
    redirect(`/${locale}/specifications/${resolvedSpecification.id}`)
  }
  const initialData = await loadRequirementsSpecificationDetailInitialData({
    locale,
    specificationId: resolvedSpecification.id,
  })
  if (initialData.notFound) {
    notFound()
  }
  if (initialData.forbidden) {
    const t = await getTranslations({
      locale,
      namespace: 'specification',
    })
    const responsibleName =
      formatActorDisplayNameForLocale(
        initialData.forbidden.responsible.displayName,
        locale,
      ) ??
      formatActorDisplayNameForLocale(
        initialData.forbidden.responsible.hsaId,
        locale,
      )
    return (
      <main className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom max-w-3xl">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="text-sm font-semibold uppercase tracking-[0.12em]">
              {t('forbiddenEyebrow')}
            </p>
            <h1 className="mt-2 text-2xl font-bold">{t('forbiddenTitle')}</h1>
            <p className="mt-3 text-sm leading-6">
              {t('forbiddenBody', {
                name: initialData.forbidden.specification.name,
                specificationCode:
                  initialData.forbidden.specification.specificationCode,
              })}
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium">{t('responsible')}</dt>
                <dd className="mt-1">{responsibleName}</dd>
              </div>
              <div>
                <dt className="font-medium">{t('responsibleEmail')}</dt>
                <dd className="mt-1">
                  {initialData.forbidden.responsible.email ??
                    t('responsibleEmailMissing')}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </main>
    )
  }
  return (
    <RequirementsSpecificationDetailClient
      initialData={initialData}
      specificationId={resolvedSpecification.id}
    />
  )
}
