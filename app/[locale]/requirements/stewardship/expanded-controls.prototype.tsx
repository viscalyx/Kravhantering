'use client'

// THROWAWAY #1356: Which expanded-control layout makes question and answer
// actions easiest to distinguish? Four layouts plus the existing baseline.
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export type ControlsPrototypeVariant = 'original' | 'A' | 'B' | 'C' | 'D'
type Props = { children: ReactNode }

export function VariantA({ children }: Props) {
  return <div className="controls-variant variant-a">{children}</div>
}

export function VariantB({ children }: Props) {
  return <div className="controls-variant variant-b">{children}</div>
}

export function VariantC({ children }: Props) {
  const t = useTranslations('expandedControlsPrototype')
  return (
    <div className="controls-variant variant-c">
      <div aria-hidden="true" className="prototype-ledger-heading">
        <span>{t('contentHeading')}</span>
        <span>{t('answerActions')}</span>
      </div>
      {children}
    </div>
  )
}

export function VariantD({ children }: Props) {
  const t = useTranslations('expandedControlsPrototype')
  return (
    <div className="controls-variant variant-d">
      <div
        className="prototype-board-heading"
        {...devMarker({
          context: 'requirementSelectionQuestions',
          name: 'prototype answer comparison board',
        })}
      >
        <h3>{t('boardHeading')}</h3>
        <p>{t('boardHelp')}</p>
      </div>
      {children}
    </div>
  )
}

export function PrototypeDAnswerHeader({
  position,
  text,
  status,
  onEdit,
  disabled,
}: {
  position: number
  text: string
  status: string
  onEdit?: () => void
  disabled: boolean
}) {
  const t = useTranslations('expandedControlsPrototype')
  return (
    <div
      className="prototype-card-heading"
      {...devMarker({
        context: 'requirementSelectionQuestions',
        name: 'prototype answer card heading',
      })}
    >
      <div className="prototype-card-topline">
        <span aria-hidden="true" className="prototype-card-number">
          {String(position).padStart(2, '0')}
        </span>
        <span className="prototype-card-status">{status}</span>
        {onEdit && (
          <button
            className="prototype-d-edit min-h-11 min-w-11"
            disabled={disabled}
            onClick={onEdit}
            type="button"
          >
            {t('editAnswer')}
          </button>
        )}
      </div>
      <h4>{text}</h4>
    </div>
  )
}

export default function ExpandedControlsPrototype({
  children,
  variant,
}: Props & { variant: ControlsPrototypeVariant }) {
  return (
    <div
      className="min-w-0"
      data-prototype-expanded
      {...devMarker({
        context: 'requirementSelectionQuestions',
        name: 'prototype expanded question',
        value: variant,
      })}
    >
      {variant === 'A' ? (
        <VariantA>{children}</VariantA>
      ) : variant === 'B' ? (
        <VariantB>{children}</VariantB>
      ) : variant === 'C' ? (
        <VariantC>{children}</VariantC>
      ) : variant === 'D' ? (
        <VariantD>{children}</VariantD>
      ) : (
        children
      )}
    </div>
  )
}
