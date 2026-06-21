import { cleanup, render } from '@testing-library/react'
import { useReducedMotion } from 'framer-motion'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import DeviationDecisionModal from '@/components/DeviationDecisionModal'
import SuggestionFormModal from '@/components/SuggestionFormModal'
import SuggestionResolutionModal from '@/components/SuggestionResolutionModal'
import {
  collapsiblePanelMotion,
  dialogPanelMotion,
  fadeMotion,
} from '@/lib/reduced-motion'

vi.mock('@/lib/reduced-motion', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reduced-motion')>()

  return {
    ...actual,
    collapsiblePanelMotion: vi.fn(actual.collapsiblePanelMotion),
    dialogPanelMotion: vi.fn(actual.dialogPanelMotion),
    fadeMotion: vi.fn(actual.fadeMotion),
  }
})

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/useDiscardChangesConfirmation', () => ({
  useDiscardChangesConfirmation: () => vi.fn(async () => true),
}))

const noop = () => {}

const modalCases = [
  {
    name: 'SuggestionFormModal',
    render: () => <SuggestionFormModal onClose={noop} onSubmit={noop} open />,
  },
  {
    name: 'SuggestionResolutionModal',
    render: () => (
      <SuggestionResolutionModal onClose={noop} onSubmit={noop} open />
    ),
  },
  {
    name: 'DeviationDecisionModal',
    render: () => (
      <DeviationDecisionModal onClose={noop} onSubmit={noop} open />
    ),
  },
]

describe('reduced-motion component wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useReducedMotion).mockReturnValue(false)
  })

  afterEach(() => {
    cleanup()
  })

  it('passes the normal motion preference to AnimatedHelpPanel', () => {
    render(
      <AnimatedHelpPanel id="animated-help" isOpen>
        Help text
      </AnimatedHelpPanel>,
    )

    expect(collapsiblePanelMotion).toHaveBeenCalledWith(false)
  })

  it('passes the reduced motion preference to AnimatedHelpPanel when opened', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)

    const { rerender } = render(
      <AnimatedHelpPanel id="animated-help" isOpen={false}>
        Help text
      </AnimatedHelpPanel>,
    )

    expect(collapsiblePanelMotion).not.toHaveBeenCalled()

    rerender(
      <AnimatedHelpPanel id="animated-help" isOpen>
        Help text
      </AnimatedHelpPanel>,
    )

    expect(collapsiblePanelMotion).toHaveBeenCalledWith(true)
  })

  it.each(modalCases)('passes normal motion preference to $name', ({
    render: renderModal,
  }) => {
    render(renderModal())

    expect(fadeMotion).toHaveBeenCalledWith(false)
    expect(dialogPanelMotion).toHaveBeenCalledWith(false)
  })

  it.each(modalCases)('passes reduced motion preference to $name', ({
    render: renderModal,
  }) => {
    vi.mocked(useReducedMotion).mockReturnValue(true)

    render(renderModal())

    expect(fadeMotion).toHaveBeenCalledWith(true)
    expect(dialogPanelMotion).toHaveBeenCalledWith(true)
  })
})
