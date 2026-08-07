import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(
    async (namespace: string) => (key: string) => `${namespace}.${key}`,
  ),
}))

vi.mock(
  '@/app/[locale]/specification-item-statuses/specification-item-statuses-client',
  () => ({ default: () => <div>specification item statuses client</div> }),
)
vi.mock(
  '@/app/[locale]/specifications/governance-object-types/governance-object-types-client',
  () => ({ default: () => <div>governance object types client</div> }),
)
vi.mock(
  '@/app/[locale]/specifications/implementation-types/implementation-types-client',
  () => ({ default: () => <div>implementation types client</div> }),
)
vi.mock(
  '@/app/[locale]/specifications/lifecycle-statuses/lifecycle-statuses-client',
  () => ({ default: () => <div>lifecycle statuses client</div> }),
)

import SpecificationItemStatusesPage, {
  generateMetadata as specificationItemStatusesMetadata,
} from '@/app/[locale]/specification-item-statuses/page'
import GovernanceObjectTypesPage, {
  generateMetadata as governanceObjectTypesMetadata,
} from '@/app/[locale]/specifications/governance-object-types/page'
import ImplementationTypesPage, {
  generateMetadata as implementationTypesMetadata,
} from '@/app/[locale]/specifications/implementation-types/page'
import LifecycleStatusesPage, {
  generateMetadata as lifecycleStatusesMetadata,
} from '@/app/[locale]/specifications/lifecycle-statuses/page'

beforeEach(() => vi.clearAllMocks())

describe('specification reference-data page shells', () => {
  it.each([
    [specificationItemStatusesMetadata, 'nav.specificationItemStatuses'],
    [governanceObjectTypesMetadata, 'nav.governanceObjectTypes'],
    [implementationTypesMetadata, 'nav.implementationTypes'],
    [lifecycleStatusesMetadata, 'nav.lifecycleStatuses'],
  ])('generates its translated page title', async (generate, title) => {
    await expect(generate()).resolves.toEqual({ title })
  })

  it.each([
    [SpecificationItemStatusesPage, 'specification item statuses client'],
    [GovernanceObjectTypesPage, 'governance object types client'],
    [ImplementationTypesPage, 'implementation types client'],
    [LifecycleStatusesPage, 'lifecycle statuses client'],
  ])('renders its client island', (Page, content) => {
    render(<Page />)
    expect(screen.getByText(content)).toBeVisible()
  })
})
