'use client'

import {
  Briefcase,
  FolderTree,
  Gauge,
  Layers,
  type LucideIcon,
  ShieldCheck,
  Tags,
  Wrench,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'

export default function TaxonomyPanel() {
  const locale = useLocale()
  const ta = useTranslations('admin')
  const tn = useTranslations('nav')
  const items: Array<{
    description: string
    href: string
    icon: LucideIcon
    id: string
    label: string
  }> = [
    {
      description: ta('areasDescription'),
      href: '/requirement-areas',
      icon: FolderTree,
      id: 'areas',
      label: tn('areas'),
    },
    {
      description: ta('categoriesDescription'),
      href: '/requirement-categories',
      icon: Tags,
      id: 'categories',
      label: tn('categories'),
    },
    {
      description: ta('typesDescription'),
      href: '/requirement-types',
      icon: Layers,
      id: 'types',
      label: tn('types'),
    },
    {
      description: ta('qualityAttributesDescription'),
      href: '/quality-characteristics',
      icon: ShieldCheck,
      id: 'qualityCharacteristics',
      label: tn('qualityCharacteristics'),
    },
    {
      description: ta('priorityLevelsDescription'),
      href: '/priority-levels',
      icon: Gauge,
      id: 'priorityLevels',
      label: tn('priorityLevels'),
    },
    {
      description: ta('governanceObjectTypesDescription'),
      href: '/specifications/governance-object-types',
      icon: Briefcase,
      id: 'governanceObjectTypes',
      label: tn('governanceObjectTypes'),
    },
    {
      description: ta('implementationTypesDescription'),
      href: '/specifications/implementation-types',
      icon: Wrench,
      id: 'implementationTypes',
      label: tn('implementationTypes'),
    },
  ].sort((left, right) =>
    left.label.localeCompare(right.label, locale, { sensitivity: 'base' }),
  )

  return (
    <section
      aria-labelledby="taxonomy-tab"
      className="rounded-4xl border border-secondary-200/70 bg-white/90 p-6 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
      id="taxonomy-panel"
      role="tabpanel"
      {...devMarker({
        context: 'admin center',
        name: 'tab panel',
        priority: 340,
        value: 'taxonomy',
      })}
    >
      <div className="border-b border-secondary-200/70 pb-5 dark:border-secondary-700/60">
        <h2 className="text-xl font-semibold text-secondary-950 dark:text-secondary-50">
          {ta('taxonomy')}
        </h2>
        <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
          {ta('taxonomyDescription')}
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map(item => (
          <Link
            className="group rounded-3xl border border-secondary-200/70 bg-[linear-gradient(155deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] p-5 transition-transform hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg dark:border-secondary-700/60 dark:bg-[linear-gradient(155deg,rgba(15,23,42,0.88),rgba(30,41,59,0.88))]"
            data-testid={`taxonomy-card-${item.id}`}
            href={item.href}
            key={item.href}
          >
            <div className="flex items-start gap-4">
              <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary-200/80 bg-primary-50 text-primary-700 transition-colors group-hover:border-primary-300 group-hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-950/70 dark:text-primary-300 dark:group-hover:border-primary-700 dark:group-hover:bg-primary-950">
                <item.icon
                  aria-hidden="true"
                  className="h-5 w-5"
                  data-testid={`taxonomy-icon-${item.id}`}
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-secondary-950 transition-colors group-hover:text-primary-700 dark:text-secondary-50 dark:group-hover:text-primary-300">
                  {item.label}
                </h3>
                <p className="mt-2 text-sm text-secondary-600 dark:text-secondary-300">
                  {item.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
