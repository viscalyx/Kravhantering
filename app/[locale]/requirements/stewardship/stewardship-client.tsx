'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { lazy, useEffect, useState } from 'react'
import type { StewardshipTabParam } from '@/components/Navigation'
import { usePathname, useRouter } from '@/i18n/routing'
import StewardshipLazyWorkspace, {
  type StewardshipWorkspaceId,
} from './stewardship-lazy-workspace'

const RequirementPackagesClient = lazy(
  () => import('../../requirement-packages/requirement-packages-client'),
)
const RequirementSelectionQuestionsClient = lazy(
  () => import('./requirement-selection-questions-client'),
)
const RfiQuestionsClient = lazy(() => import('./rfi-questions-client'))
const NormReferencesClient = lazy(
  () => import('../../norm-references/norm-references-client'),
)

type StewardshipTab = StewardshipWorkspaceId

const WORKSPACE_LABEL_KEYS: Record<StewardshipWorkspaceId, string> = {
  norms: 'normLibrary',
  packages: 'requirementPackages',
  questions: 'requirementSelectionQuestions',
  rfi: 'rfiQuestions',
}

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

function getInitialTab(searchParams: URLSearchParams): StewardshipTab | null {
  const tabParam = searchParams.get('tab')
  const fromQuery = tabFromQueryValue(tabParam)
  if (fromQuery) return fromQuery
  if (tabParam != null) return 'packages'
  if (typeof window === 'undefined') return null
  return getStoredTab() ?? 'packages'
}

export default function StewardshipClient() {
  const tNav = useTranslations('nav')
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [fallbackTab, setFallbackTab] = useState<StewardshipTab | null>(() =>
    getInitialTab(searchParams),
  )
  const tabParam = searchParams.get('tab')
  const queryTab = tabFromQueryValue(tabParam)
  const activeTab = tabParam == null ? fallbackTab : (queryTab ?? 'packages')

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    const fromQuery = tabFromQueryValue(tabParam)
    if (fromQuery) {
      setFallbackTab(fromQuery)
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
    setFallbackTab(nextTab)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('variant')
    params.set('tab', tabParamFromTab(nextTab))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  if (activeTab == null) return null

  const workspace = (() => {
    if (activeTab === 'packages') return <RequirementPackagesClient />
    if (activeTab === 'questions') {
      return <RequirementSelectionQuestionsClient />
    }
    if (activeTab === 'rfi') return <RfiQuestionsClient />
    return <NormReferencesClient />
  })()

  return (
    <StewardshipLazyWorkspace
      workspaceId={activeTab}
      workspaceLabel={tNav(WORKSPACE_LABEL_KEYS[activeTab])}
    >
      {workspace}
    </StewardshipLazyWorkspace>
  )
}
