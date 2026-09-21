'use client'

// THROWAWAY #1355: three structurally different question summaries on the
// existing stewardship route, plus the untouched original as a control.
import { Archive, CheckCircle2, Eye, PauseCircle } from 'lucide-react'
import { devMarker } from '@/lib/developer-mode-markers'

export type QuestionPrototypeVariant = 'original' | 'A' | 'B' | 'C'

interface SummaryProps {
  active: boolean
  answers: string
  archived: boolean
  area: string
  code: string
  conditional: boolean
  status: string
  text: string
  type: string
  visibility: string
}

function Status({ status, archived, active }: SummaryProps) {
  const Icon = archived ? Archive : active ? CheckCircle2 : PauseCircle
  return (
    <span className="prototype-status">
      <Icon aria-hidden="true" size={13} />
      {status}
    </span>
  )
}

function Metadata(props: SummaryProps) {
  return (
    <span
      className="prototype-metadata"
      {...devMarker({
        context: 'requirementSelectionQuestions',
        name: 'prototype question metadata',
      })}
    >
      <span>{props.type}</span>
      <Status {...props} />
      <span>{props.answers}</span>
      {props.conditional && (
        <span className="prototype-condition">
          <Eye aria-hidden="true" size={13} />
          {props.visibility}
        </span>
      )}
    </span>
  )
}

export function VariantA(props: SummaryProps) {
  return (
    <span className="prototype-summary prototype-summary-a">
      <span className="prototype-question-text">{props.text}</span>
      <span className="prototype-secondary-line">
        <span className="prototype-code">{props.code}</span>
        <Metadata {...props} />
        <span className="prototype-area">{props.area}</span>
      </span>
    </span>
  )
}

export function VariantB(props: SummaryProps) {
  return (
    <span className="prototype-summary prototype-summary-b">
      <span className="prototype-question-text">{props.text}</span>
      <span className="prototype-facts">
        <span className="prototype-secondary-line">
          <span className="prototype-code">{props.code}</span>
          <span className="prototype-area">{props.area}</span>
        </span>
        <Metadata {...props} />
      </span>
    </span>
  )
}

export function VariantC(props: SummaryProps) {
  return (
    <span className="prototype-summary prototype-summary-c">
      <span className="prototype-code">{props.code}</span>
      <span>
        <span className="prototype-question-text">{props.text}</span>
        <span className="prototype-area">{props.area}</span>
      </span>
      <Metadata {...props} />
    </span>
  )
}

export default function QuestionPrototypeSummary({
  variant,
  ...props
}: SummaryProps & { variant: Exclude<QuestionPrototypeVariant, 'original'> }) {
  if (variant === 'B') return <VariantB {...props} />
  if (variant === 'C') return <VariantC {...props} />
  return <VariantA {...props} />
}
