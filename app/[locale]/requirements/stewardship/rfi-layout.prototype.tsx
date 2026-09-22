'use client'

// THROWAWAY #1357: original + three RFI layouts on the existing workspace.
// Question: which compact layout best preserves text, version, status and actions?
import { Archive, CheckCircle2 } from 'lucide-react'
import { devMarker } from '@/lib/developer-mode-markers'
import './rfi-layout.prototype.css'

export const RFI_PROTOTYPE_ENABLED =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_ISSUE_1357_PROTOTYPE === 'true'

export const RFI_PROTOTYPE_VARIANTS = [
  { key: 'original', name: 'Original cards' },
  { key: 'A', name: 'Split rows · #1355 reference' },
  { key: 'B', name: 'Aligned register' },
  { key: 'C', name: 'Question-first cards' },
]

export interface RfiPrototypeSummaryProps {
  archived: boolean
  area: string
  code: string
  status: string
  text: string | null
  version: number | null
}

function Status(props: RfiPrototypeSummaryProps) {
  const Icon = props.archived ? Archive : CheckCircle2
  return (
    <span className="rfi-prototype-status" data-archived={props.archived}>
      <Icon aria-hidden="true" size={14} />
      {props.status}
    </span>
  )
}

function Text({ text }: RfiPrototypeSummaryProps) {
  return (
    <span
      className="rfi-prototype-text"
      {...devMarker({
        context: 'rfiQuestions',
        name: 'prototype question text',
      })}
    >
      {text}
    </span>
  )
}

function Facts(props: RfiPrototypeSummaryProps) {
  return (
    <span
      className="rfi-prototype-facts"
      {...devMarker({
        context: 'rfiQuestions',
        name: 'prototype question metadata',
      })}
    >
      <span className="rfi-prototype-code">{props.code}</span>
      <span>v{props.version ?? '-'}</span>
      <Status {...props} />
      <span className="rfi-prototype-area">{props.area}</span>
    </span>
  )
}

export function VariantA(props: RfiPrototypeSummaryProps) {
  return (
    <span className="rfi-prototype-summary rfi-prototype-summary-a">
      <Text {...props} />
      <Facts {...props} />
    </span>
  )
}

export function VariantB(props: RfiPrototypeSummaryProps) {
  return (
    <span className="rfi-prototype-summary rfi-prototype-summary-b">
      <span className="rfi-prototype-code">{props.code}</span>
      <span>
        <Text {...props} />
        <span className="rfi-prototype-area">{props.area}</span>
      </span>
      <span className="rfi-prototype-facts">
        <span>v{props.version ?? '-'}</span>
        <Status {...props} />
      </span>
    </span>
  )
}

export function VariantC(props: RfiPrototypeSummaryProps) {
  return (
    <span className="rfi-prototype-summary rfi-prototype-summary-c">
      <Text {...props} />
      <Facts {...props} />
    </span>
  )
}

export default function RfiPrototypeSummary(
  props: RfiPrototypeSummaryProps & { variant: string },
) {
  if (props.variant === 'B') return <VariantB {...props} />
  if (props.variant === 'C') return <VariantC {...props} />
  return <VariantA {...props} />
}
