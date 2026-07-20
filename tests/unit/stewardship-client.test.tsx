import { render, waitFor } from '@testing-library/react'
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

describe('StewardshipClient', () => {
  beforeEach(() => {
    searchParamsState.value = new URLSearchParams()
    routerState.replace.mockClear()
    localStorage.clear()
  })

  it('routes a bare stewardship URL to packages by default', async () => {
    const { container } = render(<StewardshipClient />)

    expect(container).toBeEmptyDOMElement()
    await waitFor(() => {
      expect(routerState.replace).toHaveBeenCalledWith(
        '/requirements/stewardship?tab=packages',
        { scroll: false },
      )
    })
  })

  it('restores the remembered RFI workspace with its canonical URL token', async () => {
    localStorage.setItem('requirements.stewardship.tab', 'rfi')

    render(<StewardshipClient />)

    await waitFor(() => {
      expect(routerState.replace).toHaveBeenCalledWith(
        '/requirements/stewardship?tab=information-requests',
        { scroll: false },
      )
    })
  })

  it('remembers a canonical workspace without replacing its URL', async () => {
    searchParamsState.value = new URLSearchParams('tab=questions')

    render(<StewardshipClient />)

    await waitFor(() => {
      expect(localStorage.getItem('requirements.stewardship.tab')).toBe(
        'questions',
      )
    })
    expect(routerState.replace).not.toHaveBeenCalled()
  })

  it('remembers the RFI storage token for information requests', async () => {
    searchParamsState.value = new URLSearchParams('tab=information-requests')

    render(<StewardshipClient />)

    await waitFor(() => {
      expect(localStorage.getItem('requirements.stewardship.tab')).toBe('rfi')
    })
    expect(routerState.replace).not.toHaveBeenCalled()
  })

  it('removes retired variants from an otherwise canonical workspace URL', async () => {
    searchParamsState.value = new URLSearchParams(
      'tab=norms&variant=legacy&filter=active',
    )

    render(<StewardshipClient />)

    await waitFor(() => {
      expect(routerState.replace).toHaveBeenCalledWith(
        '/requirements/stewardship?tab=norms&filter=active',
        { scroll: false },
      )
    })
  })

  it('canonicalizes an unknown workspace to packages', async () => {
    searchParamsState.value = new URLSearchParams(
      'tab=unknown&variant=legacy&filter=active',
    )

    render(<StewardshipClient />)

    await waitFor(() => {
      expect(routerState.replace).toHaveBeenCalledWith(
        '/requirements/stewardship?tab=packages&filter=active',
        { scroll: false },
      )
    })
  })
})
