'use client'

import { usePathname, useSearchParams } from 'next/navigation'

// Throwaway #1348: baseline plus three structural alternatives on the real route.
export const prototypeEnabled =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_DETAIL_PROTOTYPE === 'true'

export const variants = ['baseline', 'A', 'B', 'C'] as const
export type PrototypeVariant = (typeof variants)[number]

export function usePrototypeState() {
  const params = useSearchParams()
  const pathname = usePathname()
  const requested = params.get('variant')
  const variant = variants.find(value => value === requested) ?? 'baseline'
  return {
    enabled:
      prototypeEnabled &&
      /^\/(sv|en)\/(requirements|krav)(\/|$)/.test(pathname),
    variant,
    text: params.get('text') === 'long' ? 'long' : 'live',
    sections: ['empty', 'populated'].includes(params.get('sections') ?? '')
      ? (params.get('sections') ?? 'live')
      : 'live',
    layout: params.get('detailWidth') === 'split' ? 'split' : 'full',
  }
}
