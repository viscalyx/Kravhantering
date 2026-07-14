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

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace !== 'nav') return `${namespace}.${key}`
    const labels: Record<string, string> = {
      normLibrary: 'Norm library',
      requirementPackages: 'Requirements packages',
      requirementSelectionQuestions: 'Requirement selection questions',
      rfiQuestions: 'RFI questions',
    }
    return labels[key] ?? key
  },
}))

vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/requirements/stewardship',
  useRouter: () => routerState,
}))

vi.mock(
  '@/app/[locale]/requirement-packages/requirement-packages-client',
  () => ({
    default: () => (
      <>
        <h1>Requirements packages</h1>
        <p>Package workspace loaded</p>
      </>
    ),
  }),
)

vi.mock(
  '@/app/[locale]/requirements/stewardship/requirement-selection-questions-client',
  () => ({
    default: () => (
      <>
        <h1>Requirement selection questions</h1>
        <p>Question workspace loaded</p>
      </>
    ),
  }),
)

vi.mock('@/app/[locale]/requirements/stewardship/rfi-questions-client', () => ({
  default: () => (
    <>
      <h1>RFI questions</h1>
      <p>RFI workspace loaded</p>
    </>
  ),
}))

vi.mock('@/app/[locale]/norm-references/norm-references-client', () => ({
  default: () => (
    <>
      <h1>Norm library</h1>
      <p>Norm workspace loaded</p>
    </>
  ),
}))

describe('StewardshipClient', () => {
  beforeEach(() => {
    searchParamsState.value = new URLSearchParams()
    routerState.replace.mockClear()
    localStorage.clear()
  })

  it('uses the package view title as the page heading by default', async () => {
    render(<StewardshipClient />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Requirements packages' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: 'Requirements Library Stewardship',
      }),
    ).not.toBeInTheDocument()
    expect(await screen.findByText('Package workspace loaded')).toBeVisible()
  })

  it('uses the question view title as the page heading for the questions tab', async () => {
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
    expect(await screen.findByText('Question workspace loaded')).toBeVisible()
  })

  it('uses the norm library view title for the norms tab', async () => {
    searchParamsState.value = new URLSearchParams('tab=norms')

    render(<StewardshipClient />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Norm library',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: 'Requirements Library Stewardship',
      }),
    ).not.toBeInTheDocument()
    expect(await screen.findByText('Norm workspace loaded')).toBeVisible()
  })

  it('uses the RFI question view for the information requests tab', async () => {
    searchParamsState.value = new URLSearchParams('tab=information-requests')

    render(<StewardshipClient />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'RFI questions',
      }),
    ).toBeInTheDocument()
    expect(await screen.findByText('RFI workspace loaded')).toBeVisible()
  })

  it('restores the remembered RFI tab with the canonical URL token', async () => {
    localStorage.setItem('requirements.stewardship.tab', 'rfi')

    render(<StewardshipClient />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'RFI questions',
      }),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(routerState.replace).toHaveBeenCalledWith(
        '/requirements/stewardship?tab=information-requests',
        { scroll: false },
      )
    })
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

  it('canonicalizes an unknown tab to packages', async () => {
    searchParamsState.value = new URLSearchParams('tab=unknown&variant=legacy')

    render(<StewardshipClient />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Requirements packages',
      }),
    ).toBeVisible()
    await waitFor(() => {
      expect(routerState.replace).toHaveBeenCalledWith(
        '/requirements/stewardship?tab=packages',
        { scroll: false },
      )
    })
  })

  it('replaces the mounted workspace when the query changes', async () => {
    searchParamsState.value = new URLSearchParams('tab=packages')
    const { rerender } = render(<StewardshipClient />)
    expect(await screen.findByText('Package workspace loaded')).toBeVisible()

    searchParamsState.value = new URLSearchParams('tab=norms')
    rerender(<StewardshipClient />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Norm library' }),
    ).toBeVisible()
    expect(
      screen.queryByText('Package workspace loaded'),
    ).not.toBeInTheDocument()
    expect(await screen.findByText('Norm workspace loaded')).toBeVisible()
  })
})
