// @vitest-environment node

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import DeviationDecisionModal from '@/components/DeviationDecisionModal'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/hooks/useDiscardChangesConfirmation', () => ({
  useDiscardChangesConfirmation: () => vi.fn(),
}))

describe('DeviationDecisionModal server boundary', () => {
  it('renders no portal content when no browser window exists', () => {
    const markup = renderToStaticMarkup(
      createElement(DeviationDecisionModal, {
        onClose: vi.fn(),
        onSubmit: vi.fn(),
        open: true,
      }),
    )

    expect(markup).toBe('')
  })
})
