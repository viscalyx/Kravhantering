import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import InformationRequestsPage from '@/app/[locale]/requirements/stewardship/workspaces/information-requests/page'
import NormsPage from '@/app/[locale]/requirements/stewardship/workspaces/norms/page'
import PackagesPage from '@/app/[locale]/requirements/stewardship/workspaces/packages/page'
import QuestionsPage from '@/app/[locale]/requirements/stewardship/workspaces/questions/page'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `nav.${key}`),
}))

vi.mock(
  '@/app/[locale]/requirements/stewardship/stewardship-workspace-page',
  () => ({
    default: ({
      children,
      labelKey,
    }: {
      children: ReactNode
      labelKey: string
    }) => (
      <>
        <h1>{`nav.${labelKey}`}</h1>
        {children}
      </>
    ),
  }),
)

vi.mock(
  '@/app/[locale]/requirement-packages/requirement-packages-client',
  () => ({
    default: () => <p>packages workspace</p>,
  }),
)

vi.mock(
  '@/app/[locale]/requirements/stewardship/requirement-selection-questions-client',
  () => ({
    default: () => <p>questions workspace</p>,
  }),
)

vi.mock('@/app/[locale]/requirements/stewardship/rfi-questions-client', () => ({
  default: () => <p>RFI workspace</p>,
}))

vi.mock('@/app/[locale]/norm-references/norm-references-client', () => ({
  default: () => <p>norms workspace</p>,
}))

describe.each([
  {
    Page: PackagesPage,
    content: 'packages workspace',
    heading: 'nav.requirementPackages',
  },
  {
    Page: QuestionsPage,
    content: 'questions workspace',
    heading: 'nav.requirementSelectionQuestions',
  },
  {
    Page: InformationRequestsPage,
    content: 'RFI workspace',
    heading: 'nav.rfiQuestions',
  },
  {
    Page: NormsPage,
    content: 'norms workspace',
    heading: 'nav.normLibrary',
  },
])('isolated stewardship workspace', ({ Page, content, heading }) => {
  it(`renders ${content} under its own loading boundary`, async () => {
    render(await Page())

    expect(
      screen.getByRole('heading', { level: 1, name: heading }),
    ).toBeVisible()
    expect(screen.getByText(content)).toBeVisible()
  })
})
