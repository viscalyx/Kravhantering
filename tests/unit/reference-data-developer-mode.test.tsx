import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const confirmMock = vi.fn().mockResolvedValue(true)

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
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
  expectedFetchCalls?: number
  expectedMarkers: string[]
  factory: () => Promise<{ default: React.ComponentType }>
  fetchHandler?: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response> | Response
  fetchResponse: () => ReturnType<typeof okJson> | ReturnType<typeof okJson>[]
  label: string
}

const pages: MarkerSpec[] = [
  {
    label: 'OmradesagareClient (area owners)',
    context: 'area owners',
    factory: () =>
      import('@/app/[locale]/owners/owners-client') as Promise<{
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
      import(
        '@/app/[locale]/requirement-areas/requirement-areas-client'
      ) as Promise<{
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
    fetchHandler: input => {
      const url = String(input)
      if (url === '/api/requirement-areas') {
        return okJson({
          areas: [
            {
              description: null,
              id: 1,
              nameEn: 'A',
              nameSv: 'A',
              nextSequence: 1,
              ownerId: null,
              ownerName: null,
              prefix: 'A',
            },
          ],
        }) as Response
      }
      if (url === '/api/owners') return okJson({ owners: [] }) as Response
      return okJson({}) as Response
    },
    expectedMarkers: ['create button', 'crud table', 'table action'],
  },
  {
    label: 'KravscenarierClient (scenarios)',
    context: 'scenarios',
    factory: () =>
      import(
        '@/app/[locale]/usage-scenarios/usage-scenarios-client'
      ) as Promise<{
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
            linkedRequirementCount: 0,
            owner: null,
            ownerId: null,
          },
        ],
      }),
    fetchHandler: input => {
      const url = String(input)
      if (url === '/api/usage-scenarios') {
        return okJson({
          scenarios: [
            {
              descriptionEn: null,
              descriptionSv: null,
              id: 1,
              linkedRequirementCount: 0,
              nameEn: 'S',
              nameSv: 'S',
              owner: null,
              ownerId: null,
            },
          ],
        }) as Response
      }
      if (url === '/api/owners/all') return okJson({ owners: [] }) as Response
      return okJson({}) as Response
    },
    expectedMarkers: ['create button', 'crud table', 'table action'],
  },
  {
    label: 'KravstatusarClient (statuses)',
    context: 'statuses',
    factory: () =>
      import(
        '@/app/[locale]/requirement-statuses/requirement-statuses-client'
      ) as Promise<{
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
    label: 'KravunderlagClient (specifications)',
    context: 'specifications',
    factory: () =>
      import('@/app/[locale]/specifications/specifications-client') as Promise<{
        default: React.ComponentType
      }>,
    fetchResponse: () => [
      okJson({
        packages: [
          {
            id: 1,
            name: 'P',
            uniqueId: 'P',
            specificationResponsibilityAreaId: null,
            specificationImplementationTypeId: null,
            specificationLifecycleStatusId: null,
            responsibilityArea: null,
            implementationType: null,
            lifecycleStatus: null,
            itemCount: 0,
            requirementAreas: [],
            businessNeedsReference: null,
          },
        ],
      }),
      okJson({ areas: [] }),
      okJson({ types: [] }),
      okJson({ statuses: [] }),
    ],
    fetchHandler: input => {
      const url = String(input)

      if (url === '/api/specifications') {
        return okJson({
          packages: [
            {
              id: 1,
              name: 'P',
              uniqueId: 'P',
              specificationResponsibilityAreaId: null,
              specificationImplementationTypeId: null,
              specificationLifecycleStatusId: null,
              responsibilityArea: null,
              implementationType: null,
              lifecycleStatus: null,
              itemCount: 0,
              requirementAreas: [],
              businessNeedsReference: null,
            },
          ],
        }) as Response
      }

      if (url === '/api/specification-responsibility-areas') {
        return okJson({ areas: [] }) as Response
      }

      if (url === '/api/specification-implementation-types') {
        return okJson({ types: [] }) as Response
      }

      if (url === '/api/specification-lifecycle-statuses') {
        return okJson({ statuses: [] }) as Response
      }

      return okJson({}) as Response
    },
    expectedMarkers: [
      'create button',
      'crud table',
      'table action',
      'text field',
    ],
    expectedFetchCalls: 4,
  },
  {
    label: 'AnsvarsomradenClient (responsibility areas)',
    context: 'responsibility areas',
    factory: () =>
      import(
        '@/app/[locale]/specifications/responsibility-areas/responsibility-areas-client'
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
        '@/app/[locale]/specifications/implementation-types/implementation-types-client'
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
    let unmount: (() => void) | undefined
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async (input, init) =>
          (spec.fetchHandler
            ? await spec.fetchHandler(input, init)
            : (queue.shift() ?? okJson({}))) as Response,
      )

    try {
      const mod = await spec.factory()
      const Component = mod.default
      const renderResult = render(<Component />)
      const { container } = renderResult
      unmount = renderResult.unmount

      await waitFor(() => {
        expect(
          container.querySelector(
            `[data-developer-mode-name="crud table"][data-developer-mode-context="${spec.context}"]`,
          ),
        ).toBeInTheDocument()
      })

      for (const marker of spec.expectedMarkers) {
        await waitFor(() => {
          const el = container.querySelector(
            `[data-developer-mode-name="${marker}"][data-developer-mode-context="${spec.context}"]`,
          )
          expect(
            el,
            `expected marker "${marker}" with context "${spec.context}"`,
          ).toBeInTheDocument()
        })
      }

      const expectedFetchCalls = spec.expectedFetchCalls
      if (expectedFetchCalls !== undefined) {
        await waitFor(() => {
          expect(fetchSpy).toHaveBeenCalledTimes(expectedFetchCalls)
        })
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
      unmount?.()
      fetchSpy.mockRestore()
    }
  })
})

describe('KravscenarierClient error banner developer-mode marker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders error banner with developer-mode attributes on delete failure', async () => {
    confirmMock.mockResolvedValue(true)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as Request).url
        const method =
          init?.method ??
          (typeof input !== 'string' ? (input as Request).method : 'GET')
        if (method === 'DELETE') {
          return {
            ok: false,
            json: async () => ({ error: 'Has linked requirements' }),
          } as Response
        }
        if (url.endsWith('/api/usage-scenarios')) {
          return okJson({
            scenarios: [
              {
                id: 1,
                nameSv: 'S',
                nameEn: 'S',
                descriptionSv: null,
                descriptionEn: null,
                ownerId: null,
                linkedRequirementCount: 0,
                owner: null,
              },
            ],
          }) as Response
        }
        return okJson({}) as Response
      })

    try {
      const mod = await import(
        '@/app/[locale]/usage-scenarios/usage-scenarios-client'
      )
      const Component = mod.default
      const { container } = render(<Component />)

      await waitFor(() => {
        expect(
          container.querySelector('[data-developer-mode-name="crud table"]'),
        ).toBeInTheDocument()
      })

      // Click delete button
      const deleteBtn = container.querySelector(
        '[data-developer-mode-name="table action"][data-developer-mode-value="delete"]',
      ) as HTMLButtonElement
      expect(deleteBtn).toBeInTheDocument()
      deleteBtn.click()

      await waitFor(() => {
        const banner = container.querySelector(
          '[data-developer-mode-name="error banner"][data-developer-mode-context="scenarios"]',
        )
        expect(banner).toBeInTheDocument()
        expect(banner).toHaveAttribute(
          'data-developer-mode-value',
          'delete-error',
        )
        expect(banner).toHaveAttribute('data-developer-mode-priority', '340')
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
