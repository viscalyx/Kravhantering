'use client'

import type { ReactNode } from 'react'
import type {
  RequirementDetailChipItem,
  RequirementDetailSectionsProps,
} from '@/components/RequirementDetailSections'
import RequirementPackagePurposeTooltip from '@/components/RequirementPackagePurposeTooltip'
import { devMarker } from '@/lib/developer-mode-markers'

function marker(props: RequirementDetailSectionsProps, value: string) {
  return devMarker({
    context: props.developerModeContext ?? 'requirement detail prototype',
    name: 'detail section',
    value,
    priority: 350,
  })
}

function Chips({ items }: { items: RequirementDetailChipItem[] }) {
  return (
    <ul className="prototype-chips">
      {items.map(item => (
        <li
          key={item.id}
          title={item.title}
          {...devMarker({
            context: 'requirement detail prototype',
            name: item.markerName ?? 'reference chip',
            value: item.markerValue ?? String(item.id),
            priority: 354,
          })}
        >
          <RequirementPackagePurposeTooltip
            maxWidth={320}
            purposeAndScope={item.purposeAndScope}
          >
            {item.href ? (
              <a href={item.href} rel="noopener noreferrer" target="_blank">
                {item.label}
              </a>
            ) : (
              <span>{item.label}</span>
            )}
          </RequirementPackagePurposeTooltip>
        </li>
      ))}
    </ul>
  )
}

function References(props: RequirementDetailSectionsProps) {
  return (
    <div className="prototype-references">
      <section {...marker(props, 'normReferences')}>
        <h3>{props.referencesLabel}</h3>
        {props.references.length ? (
          <Chips items={props.references} />
        ) : (
          <span>{props.emptyLabel}</span>
        )}
      </section>
      {props.showRequirementPackages !== false && (
        <section {...marker(props, 'requirementPackages')}>
          <h3>{props.requirementPackagesLabel}</h3>
          {props.requirementPackages.length ? (
            <Chips items={props.requirementPackages} />
          ) : (
            <span>{props.emptyLabel}</span>
          )}
        </section>
      )}
    </div>
  )
}

function TextBlock({
  label,
  children,
  headerAside,
  ...attrs
}: {
  label: string
  children: ReactNode
  headerAside?: ReactNode
}) {
  return (
    <section {...attrs}>
      {headerAside ? (
        <div className="prototype-text-heading">
          <h3>{label}</h3>
          {headerAside}
        </div>
      ) : (
        <h3>{label}</h3>
      )}
      <div className="reading-width prototype-primary-text">{children}</div>
    </section>
  )
}

// A retains grouped metadata tiles inside a smaller card.
export function VariantA(props: RequirementDetailSectionsProps) {
  const verificationMethod = props.metadata.find(
    item => item.id === 'verification-method',
  )
  return (
    <div className="prototype-sections prototype-variant-a">
      <TextBlock
        headerAside={props.prototypeProcessSteps}
        label={props.descriptionLabel}
        {...marker(props, 'requirement text')}
      >
        {props.description}
      </TextBlock>
      <TextBlock
        label={props.acceptanceCriteriaLabel}
        {...marker(props, 'acceptance criteria')}
      >
        {props.acceptanceCriteria}
      </TextBlock>
      {verificationMethod && (
        <TextBlock
          label={verificationMethod.label}
          {...marker(props, 'verification method')}
        >
          {verificationMethod.value}
        </TextBlock>
      )}
      <dl className="prototype-metadata-grid">
        {props.metadata
          .filter(item => item.id !== 'verification-method')
          .map(item => (
            <div key={item.id} {...marker(props, item.markerValue ?? item.id)}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
      </dl>
      <References {...props} />
    </div>
  )
}

// B removes the card hierarchy: flowing inline metadata follows two text blocks.
export function VariantB(props: RequirementDetailSectionsProps) {
  return (
    <div className="prototype-sections prototype-variant-b">
      <TextBlock
        label={props.descriptionLabel}
        {...marker(props, 'requirement text')}
      >
        {props.description}
      </TextBlock>
      <TextBlock
        label={props.acceptanceCriteriaLabel}
        {...marker(props, 'acceptance criteria')}
      >
        {props.acceptanceCriteria}
      </TextBlock>
      <dl className="prototype-metadata-flow">
        {props.metadata.map(item => (
          <div key={item.id} {...marker(props, item.markerValue ?? item.id)}>
            <dt>{item.label}:</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <References {...props} />
    </div>
  )
}

// C is a document ledger: aligned label/content rows, then a ruled metadata table.
export function VariantC(props: RequirementDetailSectionsProps) {
  return (
    <div className="prototype-sections prototype-variant-c">
      <section
        className="prototype-ledger-text"
        {...marker(props, 'requirement text')}
      >
        <h3>{props.descriptionLabel}</h3>
        <div className="reading-width prototype-primary-text">
          {props.description}
        </div>
      </section>
      <section
        className="prototype-ledger-text"
        {...marker(props, 'acceptance criteria')}
      >
        <h3>{props.acceptanceCriteriaLabel}</h3>
        <div className="reading-width prototype-primary-text">
          {props.acceptanceCriteria}
        </div>
      </section>
      <dl className="prototype-metadata-ledger">
        {props.metadata.map(item => (
          <div key={item.id} {...marker(props, item.markerValue ?? item.id)}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <References {...props} />
    </div>
  )
}
