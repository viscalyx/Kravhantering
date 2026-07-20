import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import StewardshipWorkspacePage from '@/app/[locale]/requirements/stewardship/stewardship-workspace-page'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `nav.${key}`),
}))

vi.mock(
  '@/app/[locale]/requirements/stewardship/stewardship-lazy-workspace',
  () => ({
    default: ({
      children,
      workspaceId,
      workspaceLabel,
    }: {
      children: ReactNode
      workspaceId: string
      workspaceLabel: string
    }) => (
      <section aria-label={workspaceLabel} data-workspace-id={workspaceId}>
        {children}
      </section>
    ),
  }),
)

describe('StewardshipWorkspacePage', () => {
  it('binds the selected workspace to its translated boundary', async () => {
    render(
      await StewardshipWorkspacePage({
        children: <p>workspace content</p>,
        labelKey: 'rfiQuestions',
        workspaceId: 'rfi',
      }),
    )

    const workspace = screen.getByRole('region', {
      name: 'nav.rfiQuestions',
    })
    expect(workspace).toHaveAttribute('data-workspace-id', 'rfi')
    expect(screen.getByText('workspace content')).toBeVisible()
  })
})
