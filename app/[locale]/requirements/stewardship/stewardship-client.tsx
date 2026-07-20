'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import type { StewardshipTabParam } from '@/components/Navigation'
import { usePathname, useRouter } from '@/i18n/routing'

type StewardshipTab = 'norms' | 'packages' | 'questions' | 'rfi'

const STORAGE_KEY = 'requirements.stewardship.tab'

function tabFromQueryValue(value: string | null): StewardshipTab | null {
  if (value === 'information-requests') return 'rfi'
  return value === 'questions' || value === 'packages' || value === 'norms'
    ? value
    : null
}

function tabFromStoredValue(value: string | null): StewardshipTab | null {
  return value === 'questions' ||
    value === 'packages' ||
    value === 'norms' ||
    value === 'rfi'
    ? value
    : null
}

function tabParamFromTab(tab: StewardshipTab): StewardshipTabParam {
  return tab === 'rfi' ? 'information-requests' : tab
}

function getStoredTab(): StewardshipTab | null {
  if (typeof window === 'undefined') return null
  return tabFromStoredValue(localStorage.getItem(STORAGE_KEY))
}

export default function StewardshipClient() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    const fromQuery = tabFromQueryValue(tabParam)
    if (fromQuery) {
      localStorage.setItem(STORAGE_KEY, fromQuery)
      const canonicalTabParam = tabParamFromTab(fromQuery)
      if (
        searchParams.has('variant') ||
        searchParams.get('tab') !== canonicalTabParam
      ) {
        const params = new URLSearchParams(searchParams.toString())
        params.delete('variant')
        params.set('tab', canonicalTabParam)
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      }
      return
    }

    const nextTab =
      tabParam == null ? (getStoredTab() ?? 'packages') : 'packages'
    const params = new URLSearchParams(searchParams.toString())
    params.delete('variant')
    params.set('tab', tabParamFromTab(nextTab))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  return null
}
