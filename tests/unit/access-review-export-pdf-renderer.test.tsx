import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import AccessReviewExportPdfRenderer from '@/components/access-review/AccessReviewExportPdfRenderer'
import { accessReviewExportFixture } from './helpers/access-review-export-fixture'

vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: ReactNode }) => (
    <article>{children}</article>
  ),
  Page: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
  StyleSheet: { create: (styles: unknown) => styles },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

describe('AccessReviewExportPdfRenderer', () => {
  it.each(['en', 'sv'])(
    'renders complete access-review evidence in %s',
    locale => {
      render(
        <AccessReviewExportPdfRenderer
          exportData={accessReviewExportFixture()}
          locale={locale}
        />,
      )
      expect(
        screen.getByText(/access review export|export av behörighetsöversyn/i),
      ).toBeVisible()
      expect(screen.getByText('Reviewed')).toBeVisible()
      expect(screen.getAllByText(/Anonymous|Anonym/).length).toBeGreaterThan(0)
    },
  )
})
