'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from '@/i18n/routing'
import RequirementPackagesClient from '../../requirement-packages/requirement-packages-client'
import RequirementSelectionQuestionsClient from './requirement-selection-questions-client'

type StewardshipTab = 'packages' | 'questions'

const STORAGE_KEY = 'requirements.stewardship.tab'

function tabFromValue(value: string | null): StewardshipTab | null {
  return value === 'questions' || value === 'packages' ? value : null
}

export default function StewardshipClient() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<StewardshipTab>(
    () => tabFromValue(searchParams.get('tab')) ?? 'packages',
  )

  useEffect(() => {
    const fromQuery = tabFromValue(searchParams.get('tab'))
    if (fromQuery) {
      setActiveTab(fromQuery)
      localStorage.setItem(STORAGE_KEY, fromQuery)
      if (searchParams.has('variant')) {
        const params = new URLSearchParams(searchParams.toString())
        params.delete('variant')
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      }
      return
    }

    const nextTab =
      tabFromValue(localStorage.getItem(STORAGE_KEY)) ?? 'packages'
    setActiveTab(nextTab)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('variant')
    params.set('tab', nextTab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  return activeTab === 'packages' ? (
    <RequirementPackagesClient />
  ) : (
    <RequirementSelectionQuestionsClient />
  )
}
