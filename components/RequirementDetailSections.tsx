import type { ReactNode } from 'react'
import RequirementPackagePurposeTooltip from '@/components/RequirementPackagePurposeTooltip'
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
  purposeAndScope?: string | null
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
  processSteps?: ReactNode
  references: RequirementDetailChipItem[]
  referencesLabel: string
  requirementPackages: RequirementDetailChipItem[]
  requirementPackagesLabel: string
  showRequirementPackages?: boolean
  verificationMethod: ReactNode
  verificationMethodLabel: string
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
  verificationMethod,
  verificationMethodLabel,
  processSteps,
  references,
  referencesLabel,
  requirementPackages,
  requirementPackagesLabel,
  showRequirementPackages = true,
}: RequirementDetailSectionsProps) {
  return (
    <>
      {[
        {
          value: 'requirement text',
          label: descriptionLabel,
          content: description,
        },
        {
          value: 'acceptance criteria',
          label: acceptanceCriteriaLabel,
          content: acceptanceCriteria,
        },
        {
          value: 'verification method',
          label: verificationMethodLabel,
          content: verificationMethod,
        },
      ].map((section, index) => (
        <div
          key={section.value}
          {...getMarkerProps(
            developerModeContext,
            'detail section',
            350,
            section.value,
          )}
        >
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <h3 className="text-xs font-semibold text-secondary-600 dark:text-secondary-400">
              {section.label}
            </h3>
            {index === 0 && processSteps ? (
              <div className="ml-auto min-w-0 max-w-full flex-[0_1_360px]">
                {processSteps}
              </div>
            ) : null}
          </div>
          <div className="whitespace-pre-wrap wrap-anywhere text-base leading-6 text-secondary-900 dark:text-secondary-100">
            {section.content}
          </div>
        </div>
      ))}

      <div className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-secondary-200 pt-3 @min-[360px]:grid-cols-2 @min-[600px]:grid-cols-3 dark:border-secondary-700">
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
            <h3 className="mb-0.5 text-xs font-semibold text-secondary-600 dark:text-secondary-400">
              {item.label}
            </h3>
            <div className="min-w-0 wrap-anywhere text-secondary-900 dark:text-secondary-100">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2 border-t border-secondary-200 pt-2.5 dark:border-secondary-700">
        <div
          className="flex min-w-0 flex-wrap items-baseline gap-1.5"
          {...getMarkerProps(
            developerModeContext,
            'detail section',
            355,
            'normReferences',
          )}
        >
          <h3 className="mb-0.5 text-xs font-semibold text-secondary-600 dark:text-secondary-400">
            {referencesLabel}
          </h3>
          {references.length > 0 ? (
            <ul className="flex min-w-0 flex-wrap gap-1.5">
              {references.map(reference => (
                <li
                  className="rounded-md bg-secondary-100 px-2 py-0.5 text-xs font-medium wrap-anywhere dark:bg-secondary-800"
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
                      className="inline-flex min-h-6 items-center underline hover:text-primary-600 focus-visible:outline-2 focus-visible:outline-primary-500 dark:hover:text-primary-400"
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

        {showRequirementPackages ? (
          <div
            className="flex min-w-0 flex-wrap items-baseline gap-1.5"
            {...getMarkerProps(
              developerModeContext,
              'detail section',
              350,
              'requirementPackages',
            )}
          >
            <h3 className="mb-0.5 text-xs font-semibold text-secondary-600 dark:text-secondary-400">
              {requirementPackagesLabel}
            </h3>
            {requirementPackages.length > 0 ? (
              <ul className="flex min-w-0 flex-wrap gap-1.5">
                {requirementPackages.map(requirementPackage => (
                  <li
                    key={requirementPackage.id}
                    {...getMarkerProps(
                      requirementPackage.markerContext ?? developerModeContext,
                      requirementPackage.markerName ??
                        'requirement package chip',
                      360,
                      requirementPackage.markerValue ??
                        String(requirementPackage.id),
                    )}
                  >
                    <RequirementPackagePurposeTooltip
                      maxWidth={320}
                      purposeAndScope={requirementPackage.purposeAndScope}
                      wrapperClassName="inline-flex min-w-0 max-w-full"
                    >
                      <span className="inline-flex min-h-6 items-center rounded-full border-2 border-secondary-300 bg-secondary-50 px-2 text-[10px] font-medium text-secondary-700 wrap-anywhere dark:border-secondary-600 dark:bg-secondary-800 dark:text-secondary-200">
                        {requirementPackage.label}
                      </span>
                    </RequirementPackagePurposeTooltip>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-secondary-500 dark:text-secondary-400">
                {emptyLabel}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </>
  )
}
