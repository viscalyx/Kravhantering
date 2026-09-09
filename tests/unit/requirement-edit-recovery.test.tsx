import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EditRequirementClient from '@/app/[locale]/requirements/[id]/edit/edit-requirement-client'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import type {
  RequirementDetailResponse,
  RequirementVersionDetail,
} from '@/lib/requirements/types'
import messages from '@/messages/en.json'
import svMessages from '@/messages/sv.json'

const { push, back, replace } = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
}))
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push, back, replace }),
  usePathname: () => '/requirements/REQ-001/edit',
}))
vi.mock('@/components/HelpPanel', () => ({ useHelpContent: vi.fn() }))

const fetchMock = vi.fn()
let navigation: EventTarget & {
  canGoBack: boolean
  traverseTo: ReturnType<typeof vi.fn>
}
const initialToken = '11111111-1111-4111-8111-111111111111'
const latestToken = '22222222-2222-4222-8222-222222222222'

function detail(
  version: Partial<RequirementVersionDetail> = {},
): RequirementDetailResponse {
  return {
    area: {
      id: 1,
      name: 'Platform',
      prefix: 'REQ',
      ownerHsaId: 'owner',
      ownerName: 'Owner',
    },
    id: 1,
    uniqueId: 'REQ-001',
    isArchived: false,
    createdAt: '2026-09-01T00:00:00Z',
    specificationCount: 0,
    permissions: {
      canEdit: true,
      canArchive: false,
      canDeleteDraft: true,
      canManageSuggestions: true,
      canReactivate: false,
      canRestore: false,
      canViewHistory: true,
      allowedTransitionStatusIds: [2],
    },
    versions: [
      {
        id: 10,
        versionNumber: 1,
        revisionToken: initialToken,
        description: 'Starting text',
        acceptanceCriteria: 'Starting criterion',
        verifiable: true,
        verificationMethod: 'Starting method',
        status: 1,
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
        statusColor: '#123456',
        category: null,
        type: null,
        qualityCharacteristic: null,
        priorityLevel: null,
        archiveInitiatedAt: null,
        archivedAt: null,
        publishedAt: null,
        editedAt: null,
        createdAt: '2026-09-01T00:00:00Z',
        createdBy: 'owner',
        ownerName: 'Owner',
        versionNormReferences: [],
        versionRequirementPackages: [],
        ...version,
      },
    ],
  }
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const stale = () =>
  response(
    {
      code: 'conflict',
      details: {
        reason: 'stale_requirement_edit',
        latest: { uniqueId: 'REQ-001', versionNumber: 1 },
      },
    },
    409,
  )

let server: RequirementDetailResponse
let save: (body: Record<string, unknown>) => Response
let readsFail: boolean
let submitted: Record<string, unknown>[]

async function openEditor(locale: 'en' | 'sv' = 'en') {
  const user = userEvent.setup()
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'sv' ? svMessages : messages}
    >
      <ConfirmModalProvider>
        <a href="/en/requirements">Requirements library</a>
        <LanguageSwitcher />
        <EditRequirementClient requirementId="REQ-001" />
      </ConfirmModalProvider>
    </NextIntlClientProvider>,
  )
  await screen.findByRole('option', { name: 'Platform' })
  const text = screen.getByRole('textbox', {
    name: locale === 'sv' ? /^Kravtext/ : /^Requirement text/,
  })
  await user.clear(text)
  await user.type(text, 'Local text')
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: locale === 'sv' ? 'Spara' : 'Save',
      }),
    ).toBeEnabled(),
  )
  return user
}

async function compare(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await user.click(
    await screen.findByRole('button', { name: 'Compare with latest' }),
  )
  return screen.findByRole('dialog', { name: 'Reconcile changes' })
}

describe('Requirement edit recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    navigation = Object.assign(new EventTarget(), {
      canGoBack: true,
      traverseTo: vi.fn(() => ({ finished: Promise.resolve() })),
    })
    vi.stubGlobal('navigation', navigation)
    localStorage.clear()
    window.history.replaceState({}, '', '/en/requirements/REQ-001/edit')
    server = detail()
    submitted = []
    readsFail = false
    save = stale
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost')
      if (url.pathname === '/api/requirements/REQ-001') {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>
          submitted.push(body)
          return save(body)
        }
        return readsFail ? response({}, 503) : response(server)
      }
      const catalogs: Record<string, unknown> = {
        '/api/requirement-areas': {
          areas: [
            { id: 1, name: 'Platform', ownerHsaId: 'owner' },
            { id: 2, name: 'Operations', ownerHsaId: 'owner' },
          ],
        },
        '/api/requirement-categories': {
          categories: [
            { id: 1, nameEn: 'Business', nameSv: 'Verksamhet' },
            { id: 2, nameEn: 'Technical', nameSv: 'Teknik' },
          ],
        },
        '/api/requirement-types': {
          types: [
            { id: 1, nameEn: 'Functional', nameSv: 'Funktionell' },
            { id: 2, nameEn: 'Quality', nameSv: 'Kvalitet' },
          ],
        },
        '/api/quality-characteristics': {
          qualityCharacteristics: [
            {
              id: 99,
              nameEn: 'Quality group',
              nameSv: 'Kvalitetsgrupp',
              parentId: null,
            },
            { id: 1, nameEn: 'Security', nameSv: 'Säkerhet', parentId: 99 },
          ],
        },
        '/api/priority-levels': {
          priorityLevels: [1, 2].map(id => ({
            id,
            code: `P${id}`,
            nameEn: `Priority ${id}`,
            nameSv: `Prioritet ${id}`,
            descriptionEn: '',
            descriptionSv: '',
            assessmentCriteriaEn: '',
            assessmentCriteriaSv: '',
            color: '#123456',
            iconName: null,
          })),
        },
        '/api/norm-references': {
          normReferences: [1, 2, 3].map(id => ({
            id,
            name: `Norm ${id}`,
            normReferenceId: `NR-${id}`,
          })),
        },
        '/api/requirement-packages': {
          requirementPackages: [1, 2, 3].map(id => ({
            id,
            name: `Package ${id}`,
          })),
        },
      }
      return response(catalogs[url.pathname] ?? {})
    })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('retains independent text and criterion changes and saves with the compared revision', async () => {
    const user = await openEditor()
    server = detail({
      id: 11,
      revisionToken: latestToken,
      acceptanceCriteria: 'Server criterion',
    })
    const dialog = await compare(user)
    const textRow = within(dialog).getByRole('region', {
      name: 'Requirement text',
    })
    expect(dialog).toHaveAttribute(
      'data-developer-mode-value',
      'requirement edit reconciliation',
    )
    expect(textRow).toHaveAttribute('data-developer-mode-name', 'comparison')
    expect(textRow).toHaveTextContent('Starting text')
    expect(textRow).toHaveTextContent('Local text')
    expect(
      within(dialog).getByRole('region', { name: 'Acceptance criterion' }),
    ).toHaveTextContent('Server criterion')
    await user.click(
      within(dialog).getByRole('button', { name: 'Review result in form' }),
    )
    expect(
      screen.getByRole('textbox', { name: /^Requirement text/ }),
    ).toHaveValue('Local text')
    expect(
      screen.getByRole('textbox', { name: /^Acceptance criterion/ }),
    ).toHaveValue('Server criterion')
    save = () => response({ uniqueId: 'REQ-001' })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/requirements?selected=REQ-001'),
    )
    expect(submitted[1]).toMatchObject({
      description: 'Local text',
      acceptanceCriteria: 'Server criterion',
      baseVersionId: 11,
      baseRevisionToken: latestToken,
    })
  })
  it('explains successor-draft saving when the latest snapshot becomes published', async () => {
    const user = await openEditor()
    server = detail({ status: 3, revisionToken: latestToken })
    const dialog = await compare(user)
    await user.click(
      within(dialog).getByRole('button', { name: 'Review result in form' }),
    )
    expect(
      screen.getByText(messages.requirement.editPublishedVersionNotice),
    ).toBeInTheDocument()
  })

  it('blocks unresolved same-field saves and preserves all values until an explicit choice', async () => {
    const user = await openEditor()
    server = detail({ description: 'Server text', revisionToken: latestToken })
    const dialog = await compare(user)
    const row = within(dialog).getByRole('region', { name: 'Requirement text' })
    for (const text of ['Starting text', 'Local text', 'Server text'])
      expect(row).toHaveTextContent(text)
    const apply = within(dialog).getByRole('button', {
      name: 'Review result in form',
    })
    expect(apply).toBeDisabled()
    fireEvent.submit(
      screen
        .getByRole('textbox', { name: /^Requirement text/ })
        .closest('form') as HTMLFormElement,
    )
    expect(submitted).toHaveLength(1)
    await user.click(
      within(row).getByRole('button', { name: 'Keep latest value' }),
    )
    expect(
      within(row).getByRole('button', { name: 'Keep latest value' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(row).toHaveTextContent('Local text')
    await user.click(apply)
    const text = screen.getByRole('textbox', { name: /^Requirement text/ })
    expect(text).toHaveValue('Server text')
    await user.type(text, ' plus my clarification')
    save = () => response({ uniqueId: 'REQ-001' })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(submitted).toHaveLength(2))
    expect(submitted[1]).toMatchObject({
      description: 'Server text plus my clarification',
      baseRevisionToken: latestToken,
    })
  })

  it('retains the working result through another intervening update and a failed save', async () => {
    const user = await openEditor()
    server = detail({
      acceptanceCriteria: 'First server criterion',
      revisionToken: latestToken,
    })
    let dialog = await compare(user)
    await user.click(
      within(dialog).getByRole('button', { name: 'Review result in form' }),
    )
    const nextToken = '33333333-3333-4333-8333-333333333333'
    server = detail({
      description: 'Third author text',
      acceptanceCriteria: 'First server criterion',
      revisionToken: nextToken,
    })
    dialog = await compare(user)
    const row = within(dialog).getByRole('region', { name: 'Requirement text' })
    expect(row).toHaveTextContent('Starting text')
    expect(row).toHaveTextContent('Local text')
    expect(row).toHaveTextContent('Third author text')
    await user.click(
      within(row).getByRole('button', { name: 'Keep your value' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Review result in form' }),
    )
    save = () => response({ error: 'Temporarily unavailable' }, 503)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByText('Temporarily unavailable'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /^Requirement text/ }),
    ).toHaveValue('Local text')
    expect(
      screen.getByRole('textbox', { name: /^Acceptance criterion/ }),
    ).toHaveValue('First server criterion')
    expect(submitted[2]).toMatchObject({
      baseRevisionToken: nextToken,
      acceptanceCriteria: 'First server criterion',
      description: 'Local text',
    })
  })

  it('keeps local values after a failed fetch, cancelled comparison and declined discard', async () => {
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    readsFail = true
    await user.click(
      await screen.findByRole('button', { name: 'Compare with latest' }),
    )
    expect(await screen.findByText(messages.common.error)).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /^Requirement text/ }),
    ).toHaveValue('Local text')
    readsFail = false
    server = detail({ description: 'Server text', revisionToken: latestToken })
    await user.click(
      screen.getByRole('button', { name: 'Compare with latest' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Reconcile changes',
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'Keep latest value' }),
    )
    await user.keyboard('{Escape}')
    expect(
      screen.getByRole('button', { name: 'Compare with latest' }),
    ).toHaveFocus()
    expect(
      screen.getByRole('textbox', { name: /^Requirement text/ }),
    ).toHaveValue('Local text')
    await user.click(screen.getByRole('button', { name: 'View latest' }))
    const confirmation = await screen.findByRole('alertdialog')
    await user.click(
      within(confirmation).getByRole('button', { name: 'Cancel' }),
    )
    expect(push).not.toHaveBeenCalled()
    expect(
      screen.getByRole('textbox', { name: /^Requirement text/ }),
    ).toHaveValue('Local text')
  })

  it.each([
    ['Review', 2, 'editNotAllowedStatusReview'],
    ['Archived', 4, 'editNotAllowedStatusArchived'],
  ] as const)(
    'blocks saving when the latest version is %s and supports copy retry',
    async (_name, status, messageKey) => {
      const user = await openEditor()
      server = detail({ status, revisionToken: latestToken })
      await user.click(screen.getByRole('button', { name: 'Save' }))
      await user.click(
        await screen.findByRole('button', { name: 'Compare with latest' }),
      )
      expect(
        await screen.findByText(messages.requirement[messageKey]),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
      expect(
        screen.getByRole('textbox', { name: /^Requirement text/ }),
      ).toHaveValue('Local text')
      const copy = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockRejectedValueOnce(new Error('denied'))
        .mockResolvedValueOnce()
      await user.click(
        screen.getByRole('button', { name: 'Copy unsaved work' }),
      )
      expect(await screen.findByRole('status')).toHaveTextContent(
        messages.requirement.reconciliation.copyFailed,
      )
      await user.click(
        screen.getByRole('button', { name: 'Copy unsaved work' }),
      )
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Unsaved work copied.',
      )
      expect(copy).toHaveBeenLastCalledWith(
        expect.stringContaining('Requirement text: Local text'),
      )
      expect(copy).toHaveBeenLastCalledWith(
        expect.stringContaining('Verification method: Starting method'),
      )
      expect(
        screen.getByRole('textbox', { name: /^Requirement text/ }),
      ).toHaveValue('Local text')
    },
  )

  it.each(['en', 'sv'] as const)(
    'copies readable selections with %s labels',
    async locale => {
      server = detail({
        category: { id: 1, nameEn: 'Business', nameSv: 'Verksamhet' },
        type: { id: 1, nameEn: 'Functional', nameSv: 'Funktionell' },
        qualityCharacteristic: {
          id: 1,
          nameEn: 'Security',
          nameSv: 'Säkerhet',
        },
        priorityLevel: {
          id: 1,
          nameEn: 'Priority 1',
          nameSv: 'Prioritet 1',
          code: 'P1',
          sortOrder: 1,
          color: '#123456',
          iconName: null,
        },
        versionNormReferences: [
          {
            normReference: {
              id: 1,
              name: 'Norm 1',
              normReferenceId: 'NR-1',
              issuer: 'Issuer',
              reference: 'Reference',
              type: 'Standard',
              uri: null,
              version: null,
            },
          },
        ],
        versionRequirementPackages: [
          {
            requirementPackage: {
              id: 2,
              name: 'Package 2',
              purposeAndScope: null,
            },
          },
        ],
      })
      const user = await openEditor(locale)
      const localized = locale === 'sv' ? svMessages : messages
      const copy = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockResolvedValue()
      await user.click(
        screen.getByRole('button', {
          name: localized.common.save,
        }),
      )
      await user.click(
        await screen.findByRole('button', {
          name: localized.requirement.reconciliation.copy,
        }),
      )
      const copied = String(copy.mock.calls[0][0])
      for (const value of [
        'Platform (#1)',
        'Norm 1 (#1)',
        'Package 2 (#2)',
        ...(locale === 'sv'
          ? [
              'Verksamhet (#1)',
              'Funktionell (#1)',
              'Säkerhet (#1)',
              'Prioritet 1 (#1)',
            ]
          : [
              'Business (#1)',
              'Functional (#1)',
              'Security (#1)',
              'Priority 1 (#1)',
            ]),
      ]) {
        expect(copied).toContain(value)
      }
      expect(copied).toContain(
        `${localized.requirement.description}: Local text`,
      )
      expect(copied).toContain(
        `${localized.requirement.verifiable}: ${localized.common.yes}`,
      )
      expect(copied).toContain(
        `${localized.requirement.verificationMethod}: Starting method`,
      )
    },
  )

  it('retains work when edit permission is revoked and rechecks permissions on recovery', async () => {
    const user = await openEditor()
    save = () => response({ error: 'Forbidden' }, 403)
    server = {
      ...detail(),
      permissions: { ...detail().permissions, canEdit: false },
    }
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(
      await screen.findByRole('button', { name: 'Compare with latest' }),
    )
    expect(
      await screen.findByText(messages.requirement.reconciliation.restricted),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Copy unsaved work' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('textbox', { name: /^Requirement text/ }),
    ).toHaveValue('Local text')
  })

  it('requires a choice between competing association sets instead of silently combining them', async () => {
    const user = await openEditor()
    await user.click(screen.getByRole('checkbox', { name: /NR-1 Norm 1/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Package 1' }))
    server = detail({
      revisionToken: latestToken,
      versionNormReferences: [
        {
          normReference: {
            id: 2,
            issuer: 'Issuer',
            name: 'Norm 2',
            normReferenceId: 'NR-2',
            reference: 'Reference',
            type: 'Standard',
            uri: null,
            version: null,
          },
        },
      ],
      versionRequirementPackages: [
        {
          requirementPackage: {
            id: 2,
            name: 'Package 2',
            ownerId: null,
            purposeAndScope: null,
          },
        },
      ],
    })
    const dialog = await compare(user)
    const apply = within(dialog).getByRole('button', {
      name: 'Review result in form',
    })
    expect(apply).toBeDisabled()
    await user.click(
      within(
        within(dialog).getByRole('region', { name: 'Norm references' }),
      ).getByRole('button', { name: 'Keep your value' }),
    )
    expect(apply).toBeDisabled()
    await user.click(
      within(
        within(dialog).getByRole('region', { name: 'Requirements package' }),
      ).getByRole('button', { name: 'Keep latest value' }),
    )
    await user.click(apply)
    save = () => response({ uniqueId: 'REQ-001' })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(submitted).toHaveLength(2))
    expect(submitted[1]).toMatchObject({
      normReferenceIds: [1],
      requirementPackageIds: [2],
    })
  })

  it('treats reordered association IDs and identical edits as resolved', async () => {
    const packages = [1, 2].map(id => ({
      requirementPackage: {
        id,
        name: `Package ${id}`,
        ownerId: null,
        purposeAndScope: null,
      },
    }))
    server = detail({ versionRequirementPackages: packages })
    const user = await openEditor()
    server = detail({
      description: 'Local text',
      revisionToken: latestToken,
      versionRequirementPackages: [...packages].reverse(),
    })
    const dialog = await compare(user)
    expect(within(dialog).getAllByRole('region')).toHaveLength(1)
    const apply = within(dialog).getByRole('button', {
      name: 'Review result in form',
    })
    expect(apply).toBeEnabled()
    await user.click(apply)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Package 1' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Package 2' })).toBeChecked()
  })

  it('resolves verifiable and its competing verification method together', async () => {
    const user = await openEditor()
    await user.click(screen.getByRole('checkbox', { name: /^Verifiable/ }))
    server = detail({
      verificationMethod: 'Server method',
      revisionToken: latestToken,
    })
    const dialog = await compare(user)
    const row = within(dialog).getByRole('region', {
      name: 'Verifiable / Verification method',
    })
    expect(row).toHaveTextContent('Starting method')
    expect(row).toHaveTextContent('Server method')
    await user.click(
      within(row).getByRole('button', { name: 'Keep latest value' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Review result in form' }),
    )
    expect(screen.getByRole('checkbox', { name: /^Verifiable/ })).toBeChecked()
    expect(
      screen.getByRole('textbox', { name: /^Verification method/ }),
    ).toHaveValue('Server method')
  })

  it.each([
    ['Requirement area', 'areaId', 'Operations'],
    ['Category', 'categoryId', 'Technical'],
    ['Priority', 'priorityLevelId', 'P2 – Priority 2'],
  ])(
    'reconciles local %s selections with the server criterion',
    async (label, field, option) => {
      const user = await openEditor()
      await user.selectOptions(
        screen.getByRole('combobox', { name: new RegExp(`^${label}`) }),
        option,
      )
      server = detail({
        acceptanceCriteria: 'Server criterion',
        revisionToken: latestToken,
      })
      const dialog = await compare(user)
      expect(
        within(dialog).getByRole('region', { name: label }),
      ).toHaveTextContent(option.includes('Priority') ? 'Priority 2' : option)
      await user.click(
        within(dialog).getByRole('button', { name: 'Review result in form' }),
      )
      save = () => response({ uniqueId: 'REQ-001' })
      await user.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(submitted).toHaveLength(2))
      expect(submitted[1]).toMatchObject({
        [field]: 2,
        acceptanceCriteria: 'Server criterion',
      })
    },
  )

  it('keeps a type and quality characteristic together when authors change their classification', async () => {
    server = detail({
      type: { id: 1, nameEn: 'Functional', nameSv: 'Funktionell' },
    })
    const user = await openEditor()
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Quality characteristic' }),
      '1',
    )
    server = detail({
      type: { id: 2, nameEn: 'Quality', nameSv: 'Kvalitet' },
      revisionToken: latestToken,
    })
    const dialog = await compare(user)
    const row = within(dialog).getByRole('region', {
      name: 'Type / Quality characteristic',
    })
    expect(row).toHaveTextContent('Functional')
    expect(row).toHaveTextContent('Security')
    expect(row).toHaveTextContent('Quality')
    expect(
      within(dialog).getByRole('button', { name: 'Review result in form' }),
    ).toBeDisabled()
    await user.click(
      within(row).getByRole('button', { name: 'Keep your value' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Review result in form' }),
    )
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveValue('1')
    expect(
      screen.getByRole('combobox', { name: 'Quality characteristic' }),
    ).toHaveValue('1')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Type' }),
      '2',
    )
    expect(
      screen.getByRole('combobox', { name: 'Quality characteristic' }),
    ).toHaveValue('')
  })
  it('protects unsaved work from reload and declined global navigation', async () => {
    const user = await openEditor()
    const unload = new Event('beforeunload', { cancelable: true })
    fireEvent(window, unload)
    expect(unload.defaultPrevented).toBe(true)
    await user.click(screen.getByRole('link', { name: 'Requirements library' }))
    const confirmation = await screen.findByRole('alertdialog')
    await user.click(
      within(confirmation).getByRole('button', { name: 'Cancel' }),
    )
    expect(
      screen.getByRole('textbox', { name: /^Requirement text/ }),
    ).toHaveValue('Local text')
  })

  it.each([403, 404])(
    'keeps work recoverable when the latest detail read returns %s',
    async status => {
      const user = await openEditor()
      await user.click(screen.getByRole('button', { name: 'Save' }))
      const compareButton = await screen.findByRole('button', {
        name: 'Compare with latest',
      })
      fetchMock.mockResolvedValueOnce(response({}, status))
      await user.click(compareButton)
      expect(
        await screen.findByText(
          status === 403
            ? messages.requirement.reconciliation.restricted
            : messages.common.error,
        ),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('textbox', { name: /^Requirement text/ }),
      ).toHaveValue('Local text')
      expect(
        screen.getByRole('button', { name: 'Copy unsaved work' }),
      ).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    },
  )
  it('requires a discard decision before changing language', async () => {
    const user = await openEditor()
    await user.click(
      screen.getByRole('button', { name: messages.language.switchTo }),
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    )
    expect(replace).not.toHaveBeenCalled()
    expect(
      screen.getByRole('textbox', { name: /^Requirement text/ }),
    ).toHaveValue('Local text')
    await user.click(
      screen.getByRole('button', { name: messages.language.switchTo }),
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Confirm',
      }),
    )
    expect(replace).toHaveBeenCalledWith('/requirements/REQ-001/edit', {
      locale: 'sv',
    })
    const unload = new Event('beforeunload', { cancelable: true })
    fireEvent(window, unload)
    expect(unload.defaultPrevented).toBe(false)
  })

  it('preserves the mounted form on declined history traversal and allows confirmed traversal', async () => {
    const user = await openEditor()
    const backEvent = () =>
      Object.assign(new Event('navigate', { cancelable: true }), {
        navigationType: 'traverse',
        hashChange: false,
        destination: { key: 'previous-entry' },
      })
    const first = backEvent()
    act(() => {
      navigation.dispatchEvent(first)
    })
    expect(first.defaultPrevented).toBe(true)
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    )
    expect(
      screen.getByRole('textbox', { name: /^Requirement text/ }),
    ).toHaveValue('Local text')
    expect(navigation.traverseTo).not.toHaveBeenCalled()
    act(() => {
      navigation.dispatchEvent(backEvent())
    })
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Confirm',
      }),
    )
    expect(navigation.traverseTo).toHaveBeenCalledWith('previous-entry')
  })
  it('does not add an unreachable back destination at the first history entry', async () => {
    navigation.canGoBack = false
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Confirm',
      }),
    )
    expect(back).not.toHaveBeenCalled()
    const unload = new Event('beforeunload', { cancelable: true })
    fireEvent(window, unload)
    expect(unload.defaultPrevented).toBe(true)
  })

  it.each([
    { navigationType: 'push', hashChange: false, cancelable: true },
    { navigationType: 'traverse', hashChange: true, cancelable: true },
    { navigationType: 'traverse', hashChange: false, cancelable: false },
  ])(
    'leaves unrelated or non-cancellable browser navigation to its own handler: %j',
    async options => {
      await openEditor()
      const event = Object.assign(
        new Event('navigate', { cancelable: options.cancelable }),
        {
          navigationType: options.navigationType,
          hashChange: options.hashChange,
        },
      )
      act(() => {
        navigation.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(false)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    },
  )

  it('does not interrupt links that open another tab or move within the form', async () => {
    await openEditor()
    const { unmount } = render(
      <>
        <a href="/en/specifications" rel="noreferrer" target="_blank">
          Open another tab
        </a>
        <a href="#description">Jump to text</a>
        <a download href="/download">
          Download
        </a>
      </>,
    )
    for (const name of ['Open another tab', 'Jump to text', 'Download']) {
      const link = screen.getByRole('link', { name })
      link.addEventListener('click', event => event.preventDefault())
      fireEvent.click(link)
    }
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /^Requirement text/ }),
    ).toHaveValue('Local text')
    unmount()
  })
  it('leaves the editor after confirmed Cancel when a previous entry exists', async () => {
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Confirm',
      }),
    )
    expect(back).toHaveBeenCalledOnce()
  })

  it('keeps navigation guarded when an approved traversal is superseded', async () => {
    const user = await openEditor()
    navigation.traverseTo.mockImplementationOnce(() => ({
      committed: Promise.reject(new Error('Superseded')),
      finished: Promise.reject(new Error('Superseded')),
    }))
    const event = () =>
      Object.assign(new Event('navigate', { cancelable: true }), {
        navigationType: 'traverse',
        hashChange: false,
        destination: { key: 'previous-entry' },
      })
    act(() => {
      navigation.dispatchEvent(event())
    })
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Confirm',
      }),
    )
    act(() => {
      navigation.dispatchEvent(event())
    })
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /^Requirement text/ }),
    ).toHaveValue('Local text')
  })
})
