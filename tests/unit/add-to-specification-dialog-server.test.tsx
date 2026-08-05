// @vitest-environment node

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AddToSpecificationDialog from '@/app/[locale]/requirements/[id]/_detail/AddToSpecificationDialog'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('AddToSpecificationDialog server boundary', () => {
  it('renders no portal content when no browser window exists', () => {
    const markup = renderToStaticMarkup(
      createElement(AddToSpecificationDialog, {
        dialog: {
          state: { isOpen: true },
        } as never,
        onDocumentKeyDown: vi.fn(),
      }),
    )

    expect(markup).toBe('')
  })
})
