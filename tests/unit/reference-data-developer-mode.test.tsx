import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const confirmMock = vi.fn().mockResolvedValue(true)

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: confirmMock }),
}))

vi.mock('@/components/StatusBadge', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

interface MarkerSpec {
  context: string
  expectedMarkers: string[]
  factory: () => Promise<{ default: React.ComponentType }>
  fetchResponse: () => ReturnType<typeof okJson> | ReturnType<typeof okJson>[]
  label: string
}

const pages: MarkerSpec[] = [
  {
    label: 'OmradesagareClient (area owners)',
    context: 'area owners',
    factory: () =>
      import('@/app/[locale]/omradesagare/omradesagare-client') as Promise<{
        default: React.ComponentType
      }>,
    fetchResponse: () =>
      okJson({
        owners: [{ id: 1, firstName: 'A', lastName: 'B', email: 'a@b.com' }],
      }),
    expectedMarkers: ['create button', 'crud table', 'table action'],
  },
  {
    label: 'KravomradenClient (areas)',
    context: 'areas',
    factory: () =>
      import('@/app/[locale]/kravomraden/kravomraden-client') as Promise<{
        default: React.ComponentType
      }>,
    fetchResponse: () => [
      okJson({
        areas: [
          {
            id: 1,
            nameSv: 'A',
            nameEn: 'A',
            prefix: 'A',
            description: null,
            nextSequence: 1,
            ownerId: null,
            ownerName: null,
          },
        ],
      }),
      okJson({ owners: [] }),
    ],
    expectedMarkers: ['create button', 'crud table', 'table action'],
  },
  {
    label: 'KravscenarierClient (scenarios)',
    context: 'scenarios',
    factory: () =>
      import('@/app/[locale]/kravscenarier/kravscenarier-client') as Promise<{
        default: React.ComponentType
      }>,
    fetchResponse: () =>
      okJson({
        scenarios: [
          {
            id: 1,
            nameSv: 'S',
            nameEn: 'S',
            descriptionSv: null,
            descriptionEn: null,
            ownerId: null,
          },
        ],
      }),
    expectedMarkers: ['create button', 'crud table', 'table action'],
  },
  {
    label: 'KravstatusarClient (statuses)',
    context: 'statuses',
    factory: () =>
      import('@/app/[locale]/kravstatusar/kravstatusar-client') as Promise<{
        default: React.ComponentType
      }>,
    fetchResponse: () =>
      okJson({
        statuses: [
          {
            id: 1,
            nameSv: 'Draft',
            nameEn: 'Draft',
            color: '#3b82f6',
            sortOrder: 0,
            isSystem: false,
          },
        ],
      }),
    expectedMarkers: ['create button', 'crud table', 'table action'],
  },
  {
    label: 'KravpaketClient (packages)',
    context: 'packages',
    factory: () =>
      import('@/app/[locale]/kravpaket/kravpaket-client') as Promise<{
        default: React.ComponentType
      }>,
    fetchResponse: () => [
      okJson({
        packages: [
          {
            id: 1,
            nameSv: 'P',
            nameEn: 'P',
            packageResponsibilityAreaId: null,
            packageImplementationTypeId: null,
            responsibilityArea: null,
            implementationType: null,
          },
        ],
      }),
      okJson({ areas: [] }),
      okJson({ types: [] }),
    ],
    expectedMarkers: ['create button', 'crud table', 'table action'],
  },
  {
    label: 'AnsvarsomradenClient (responsibility areas)',
    context: 'responsibility areas',
    factory: () =>
      import(
        '@/app/[locale]/kravpaket/ansvarsomraden/ansvarsomraden-client'
      ) as Promise<{ default: React.ComponentType }>,
    fetchResponse: () =>
      okJson({
        areas: [{ id: 1, nameSv: 'R', nameEn: 'R' }],
      }),
    expectedMarkers: ['create button', 'crud table', 'table action'],
  },
  {
    label: 'GenomforandeformerClient (implementation types)',
    context: 'implementation types',
    factory: () =>
      import(
        '@/app/[locale]/kravpaket/genomforandeformer/genomforandeformer-client'
      ) as Promise<{ default: React.ComponentType }>,
    fetchResponse: () =>
      okJson({
        types: [{ id: 1, nameSv: 'I', nameEn: 'I' }],
      }),
    expectedMarkers: ['create button', 'crud table', 'table action'],
  },
]

describe.each(pages)('$label developer-mode markers', spec => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it(`renders markers with context "${spec.context}"`, async () => {
    const responses = spec.fetchResponse()
    const queue = Array.isArray(responses) ? [...responses] : [responses]
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => (queue.shift() ?? okJson({})) as Response)

    try {
      const mod = await spec.factory()
      const Component = mod.default
      const { container } = render(<Component />)

      await waitFor(() => {
        expect(
          container.querySelector(
            `[data-developer-mode-name="crud table"][data-developer-mode-context="${spec.context}"]`,
          ),
        ).toBeInTheDocument()
      })

      for (const marker of spec.expectedMarkers) {
        const el = container.querySelector(
          `[data-developer-mode-name="${marker}"][data-developer-mode-context="${spec.context}"]`,
        )
        expect(
          el,
          `expected marker "${marker}" with context "${spec.context}"`,
        ).toBeInTheDocument()
      }

      const createBtn = container.querySelector(
        `[data-developer-mode-name="create button"][data-developer-mode-context="${spec.context}"]`,
      )
      expect(createBtn).toHaveAttribute('data-developer-mode-priority', '350')

      const crudTable = container.querySelector(
        `[data-developer-mode-name="crud table"][data-developer-mode-context="${spec.context}"]`,
      )
      expect(crudTable).toHaveAttribute('data-developer-mode-priority', '340')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
