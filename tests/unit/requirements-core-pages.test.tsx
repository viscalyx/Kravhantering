import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pageMocks = vi.hoisted(() => ({
  editClient: vi.fn(() => null),
  form: vi.fn(() => null),
  requirementDetailClient: vi.fn(() => null),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(async () => ({ name: 'Signed-in actor' })),
  isSignedIn: vi.fn(() => true),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('@/components/HelpPanel', () => ({
  useHelpContent: vi.fn(),
}))

vi.mock('@/components/RequirementForm', () => ({
  default: pageMocks.form,
}))

vi.mock('@/app/[locale]/requirements/[id]/requirement-detail-client', () => ({
  default: pageMocks.requirementDetailClient,
}))

vi.mock(
  '@/app/[locale]/requirements/[id]/edit/edit-requirement-client',
  () => ({ default: pageMocks.editClient }),
)

import RequirementVersionPage, {
  generateMetadata as generateVersionMetadata,
} from '@/app/[locale]/requirements/[id]/[version]/page'
import EditRequirementPage, {
  generateMetadata as generateEditMetadata,
} from '@/app/[locale]/requirements/[id]/edit/page'
import RequirementDetailPage, {
  generateMetadata as generateDetailMetadata,
} from '@/app/[locale]/requirements/[id]/page'
import NewRequirementClient from '@/app/[locale]/requirements/new/new-requirement-client'
import NewRequirementPage, {
  generateMetadata as generateNewMetadata,
} from '@/app/[locale]/requirements/new/page'

describe('requirements core pages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('provides localized titles for create, edit, detail, and version pages', async () => {
    await expect(generateNewMetadata()).resolves.toEqual({
      title: 'newRequirement',
    })
    await expect(generateEditMetadata()).resolves.toEqual({
      title: 'editRequirement',
    })
    await expect(generateDetailMetadata()).resolves.toEqual({
      title: 'catalog',
    })
    await expect(generateVersionMetadata()).resolves.toEqual({
      title: 'catalog',
    })
  })

  it('passes route identifiers to detail and edit clients', async () => {
    const detail = (await RequirementDetailPage({
      params: Promise.resolve({ id: 'REQ-42' }),
    })) as ReactElement<{ currentActorName: string; requirementId: string }>
    const edit = (await EditRequirementPage({
      params: Promise.resolve({ id: '42' }),
    })) as ReactElement<{ requirementId: string }>

    expect(detail.props.currentActorName).toBe('Signed-in actor')
    expect(detail.props.requirementId).toBe('REQ-42')
    expect(edit.props.requirementId).toBe('42')
  })

  it('passes valid versions and ignores malformed versions', async () => {
    const version = (await RequirementVersionPage({
      params: Promise.resolve({ id: '42', version: '3' }),
      searchParams: Promise.resolve({}),
    })) as ReactElement<{ defaultVersion?: number; requirementId: string }>
    const malformed = (await RequirementVersionPage({
      params: Promise.resolve({ id: '42', version: 'latest' }),
      searchParams: Promise.resolve({}),
    })) as ReactElement<{ defaultVersion?: number; requirementId: string }>

    expect(version.props).toEqual({
      currentActorName: 'Signed-in actor',
      defaultVersion: 3,
      expectedVersionId: undefined,
      requirementId: '42',
    })
    expect(malformed.props).toEqual({
      currentActorName: 'Signed-in actor',
      defaultVersion: undefined,
      expectedVersionId: undefined,
      requirementId: '42',
    })
  })

  it('does not project a name from an unsigned session into suggestion forms', async () => {
    const { isSignedIn } = await import('@/lib/auth/session')
    vi.mocked(isSignedIn).mockReturnValueOnce(false)
    const detail = (await RequirementDetailPage({
      params: Promise.resolve({ id: '42' }),
    })) as ReactElement<{ currentActorName: string | null }>
    expect(detail.props.currentActorName).toBeNull()
  })

  it('renders the create form from both create surfaces', () => {
    const page = NewRequirementPage() as ReactElement
    expect(page.type).toBe(NewRequirementClient)

    render(<NewRequirementClient />)

    expect(
      screen.getByRole('heading', { name: 'newRequirement' }),
    ).toBeVisible()
    expect(pageMocks.form).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'create' }),
      undefined,
    )
  })
})
