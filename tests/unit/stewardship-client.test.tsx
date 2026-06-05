import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StewardshipClient from '@/app/[locale]/requirements/stewardship/stewardship-client'

const searchParamsState = vi.hoisted(() => ({
  value: new URLSearchParams(),
}))

const routerState = vi.hoisted(() => ({
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsState.value,
}))

vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/requirements/stewardship',
  useRouter: () => routerState,
}))

vi.mock(
  '@/app/[locale]/requirement-packages/requirement-packages-client',
  () => ({
    default: () => <h1>Requirements packages</h1>,
  }),
)

vi.mock(
  '@/app/[locale]/requirements/stewardship/requirement-selection-questions-client',
  () => ({
    default: () => <h1>Requirement selection questions</h1>,
  }),
)

describe('StewardshipClient', () => {
  beforeEach(() => {
    searchParamsState.value = new URLSearchParams()
    routerState.replace.mockClear()
    localStorage.clear()
  })

  it('uses the package view title as the page heading by default', () => {
    render(<StewardshipClient />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Requirements packages' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: 'Requirements Library Stewardship',
      }),
    ).not.toBeInTheDocument()
  })

  it('uses the question view title as the page heading for the questions tab', () => {
    searchParamsState.value = new URLSearchParams('tab=questions')

    render(<StewardshipClient />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Requirement selection questions',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: 'Requirements Library Stewardship',
      }),
    ).not.toBeInTheDocument()
  })

  it('restores the remembered question tab without first rendering packages', async () => {
    localStorage.setItem('requirements.stewardship.tab', 'questions')

    render(<StewardshipClient />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Requirement selection questions',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: 'Requirements packages',
      }),
    ).not.toBeInTheDocument()

    await waitFor(() => {
      expect(routerState.replace).toHaveBeenCalledWith(
        '/requirements/stewardship?tab=questions',
        { scroll: false },
      )
    })
  })
})
