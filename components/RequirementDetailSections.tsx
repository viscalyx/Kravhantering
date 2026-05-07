import type { ReactNode } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export interface RequirementDetailMetadataItem {
  id: string
  label: string
  markerValue?: string
  value: ReactNode
}

export interface RequirementDetailChipItem {
  href?: string | null
  id: number | string
  label: ReactNode
  markerContext?: string
  markerName?: string
  markerValue?: string
  title?: string
}

interface RequirementDetailSectionsProps {
  acceptanceCriteria: ReactNode
  acceptanceCriteriaLabel: string
  description: ReactNode
  descriptionLabel: string
  developerModeContext?: string
  emptyLabel: string
  metadata: RequirementDetailMetadataItem[]
  references: RequirementDetailChipItem[]
  referencesLabel: string
  requirementPackages: RequirementDetailChipItem[]
  requirementPackagesLabel: string
}

function getMarkerProps(
  context: string | undefined,
  name: string,
  priority: number,
  value: string,
) {
  return context
    ? devMarker({
        context,
        name,
        priority,
        value,
      })
    : {}
}

export default function RequirementDetailSections({
  acceptanceCriteria,
  acceptanceCriteriaLabel,
  description,
  descriptionLabel,
  developerModeContext,
  emptyLabel,
  metadata,
  references,
  referencesLabel,
  requirementPackages,
  requirementPackagesLabel,
}: RequirementDetailSectionsProps) {
  return (
    <>
      <div
        {...getMarkerProps(
          developerModeContext,
          'detail section',
          350,
          'requirement text',
        )}
      >
        <h3 className="mb-1 text-sm font-medium text-secondary-600 dark:text-secondary-400">
          {descriptionLabel}
        </h3>
        <div className="whitespace-pre-wrap text-secondary-900 dark:text-secondary-100">
          {description}
        </div>
      </div>

      <div
        {...getMarkerProps(
          developerModeContext,
          'detail section',
          350,
          'acceptance criteria',
        )}
      >
        <h3 className="mb-1 text-sm font-medium text-secondary-600 dark:text-secondary-400">
          {acceptanceCriteriaLabel}
        </h3>
        <div className="whitespace-pre-wrap text-secondary-900 dark:text-secondary-100">
          {acceptanceCriteria}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
        {metadata.map(item => (
          <div
            key={item.id}
            {...getMarkerProps(
              developerModeContext,
              'detail section',
              350,
              item.markerValue ?? item.id,
            )}
          >
            <h3 className="mb-1 text-sm font-medium text-secondary-600 dark:text-secondary-400">
              {item.label}
            </h3>
            <div className="text-secondary-900 dark:text-secondary-100">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div
        {...getMarkerProps(
          developerModeContext,
          'detail section',
          355,
          'normReferences',
        )}
      >
        <h3 className="mb-1 text-sm font-medium text-secondary-600 dark:text-secondary-400">
          {referencesLabel}
        </h3>
        {references.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {references.map(reference => (
              <li
                className="rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-medium dark:bg-secondary-800"
                key={reference.id}
                title={reference.title}
                {...getMarkerProps(
                  reference.markerContext ?? developerModeContext,
                  reference.markerName ?? 'normref-chip',
                  354,
                  reference.markerValue ?? String(reference.id),
                )}
              >
                {reference.href ? (
                  <a
                    className="underline hover:text-primary-600 dark:hover:text-primary-400"
                    href={reference.href}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {reference.label}
                  </a>
                ) : (
                  reference.label
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-secondary-500 dark:text-secondary-400">
            {emptyLabel}
          </p>
        )}
      </div>

      <div
        {...getMarkerProps(
          developerModeContext,
          'detail section',
          350,
          'requirementPackages',
        )}
      >
        <h3 className="mb-1 text-sm font-medium text-secondary-600 dark:text-secondary-400">
          {requirementPackagesLabel}
        </h3>
        {requirementPackages.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {requirementPackages.map(requirementPackage => (
              <li
                className="rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-medium dark:bg-secondary-800"
                key={requirementPackage.id}
                {...getMarkerProps(
                  requirementPackage.markerContext ?? developerModeContext,
                  requirementPackage.markerName ?? 'requirement package chip',
                  360,
                  requirementPackage.markerValue ??
                    String(requirementPackage.id),
                )}
              >
                {requirementPackage.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-secondary-500 dark:text-secondary-400">
            {emptyLabel}
          </p>
        )}
      </div>
    </>
  )
}
