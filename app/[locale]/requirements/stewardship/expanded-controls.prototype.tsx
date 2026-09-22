'use client'

// THROWAWAY #1356: Which expanded-control layout makes question and answer
// actions easiest to distinguish? Three layouts plus the existing baseline.
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'

export type ControlsPrototypeVariant = 'original' | 'A' | 'B' | 'C'
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
      ) : (
        children
      )}
    </div>
  )
}
