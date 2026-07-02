import {
  expect,
  type Locator,
  type Page,
  type Route,
  test,
} from '@playwright/test'
import { newRoleContext } from '../authorization/authorization-test-helpers'
import {
  getRequirementRowButton,
  resolveRequirementDetailPane,
} from './requirement-detail-test-helpers'

interface SuggestionData {
  content: string
  createdAt: string
  createdBy: string | null
  id: number
  isReviewRequested: number
  requirementVersionId: number | null
  resolution: number | null
  resolutionMotivation: string | null
  resolvedAt: string | null
  resolvedBy: string | null
}

const SELECTED_INT0001_VERSION_ID = 1

function suggestion(
  id: number,
  overrides: Partial<SuggestionData> = {},
): SuggestionData {
  return {
    content: `Playwright förbättringsförslag ${id}`,
    createdAt: '2026-06-01T10:00:00.000Z',
    createdBy: 'Playwright',
    id,
    isReviewRequested: 0,
    requirementVersionId: SELECTED_INT0001_VERSION_ID,
    resolution: null,
    resolutionMotivation: null,
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  }
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    contentType: 'application/json',
    json: body,
    status,
  })
}

async function expectOk(response: APIResponseLike, context: string) {
  if (response.ok()) return
  throw new Error(
    `${context} failed with ${response.status()}: ${await response.text()}`,
  )
}

interface APIResponseLike {
  ok(): boolean
  status(): number
  text(): Promise<string>
}

async function openRequirementDetail(
  page: Page,
  uniqueId = 'INT0001',
): Promise<Locator> {
  await page.goto(`/sv/requirements?selected=${encodeURIComponent(uniqueId)}`)

  const rowButton = getRequirementRowButton(page, uniqueId)
  await expect(rowButton).toHaveCount(1)

  const detailPane = await resolveRequirementDetailPane(
    page,
    rowButton,
    uniqueId,
  )
  await expect(detailPane).toHaveCount(1)
  return detailPane
}

async function mockSuggestions(
  page: Page,
  initialSuggestions: SuggestionData[],
) {
  let nextId = Math.max(0, ...initialSuggestions.map(item => item.id)) + 1
  let suggestions = [...initialSuggestions]
  const requests: unknown[] = []

  await page.route('**/api/requirement-suggestions/**', async route => {
    const request = route.request()
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as {
        content: string
        createdBy?: string | null
        requirementVersionId?: number | null
      }
      const created = suggestion(nextId, {
        content: body.content,
        createdBy: body.createdBy ?? null,
        requirementVersionId: body.requirementVersionId ?? null,
      })
      nextId += 1
      suggestions = [created, ...suggestions]
      requests.push({ body, type: 'create' })
      await fulfillJson(route, { suggestion: created }, 201)
      return
    }

    await fulfillJson(route, { suggestions })
  })

  await page.route(
    '**/api/improvement-suggestions/*/request-review',
    async route => {
      const id = Number(
        route
          .request()
          .url()
          .match(/suggestions\/(\d+)/)?.[1],
      )
      suggestions = suggestions.map(item =>
        item.id === id ? { ...item, isReviewRequested: 1 } : item,
      )
      requests.push({ id, type: 'request-review' })
      await fulfillJson(route, {
        suggestion: suggestions.find(item => item.id === id),
      })
    },
  )

  await page.route(
    '**/api/improvement-suggestions/*/resolution',
    async route => {
      const id = Number(
        route
          .request()
          .url()
          .match(/suggestions\/(\d+)/)?.[1],
      )
      const body = route.request().postDataJSON() as {
        resolution: number
        resolutionMotivation: string
        resolvedBy: string
      }
      suggestions = suggestions.map(item =>
        item.id === id
          ? {
              ...item,
              resolution: body.resolution,
              resolutionMotivation: body.resolutionMotivation,
              resolvedAt: '2026-06-01T11:00:00.000Z',
              resolvedBy: body.resolvedBy,
            }
          : item,
      )
      requests.push({ body, id, type: 'resolution' })
      await fulfillJson(route, {
        suggestion: suggestions.find(item => item.id === id),
      })
    },
  )

  return {
    get requests() {
      return requests
    },
  }
}

test.describe('Requirement collaboration', () => {
  test.use({ viewport: { height: 760, width: 1280 } })

  test('COL-01: adds a requirement to a selected kravunderlag', async ({
    page,
  }, testInfo) => {
    const specificationResponsible = await newRoleContext(
      testInfo,
      'specificationResponsible',
    )
    const uniqueSuffix = `${Date.now()}`
    const specificationSlug = `PWT-COL-01-${uniqueSuffix}`
    const specificationName = `PWT COL-01 testunderlag ${uniqueSuffix}`
    let createdSpecification: { id: number; uniqueId: string } | null = null

    try {
      const createResponse = await specificationResponsible.post(
        '/api/requirements-specifications',
        {
          data: {
            businessNeedsReference:
              'Playwright COL-01 verifierar tillagt krav i kravunderlag.',
            name: specificationName,
            specificationLifecycleStatusId: 1,
            uniqueId: specificationSlug,
          },
        },
      )
      await expectOk(createResponse, 'create COL-01 kravunderlag')
      createdSpecification = (await createResponse.json()) as {
        id: number
        uniqueId: string
      }
      const specification = createdSpecification

      await page.route(
        `**/api/requirements-specifications/${specification.id}/needs-references`,
        route =>
          fulfillJson(route, {
            needsReferences: [],
          }),
      )
      await page.route(
        `**/api/requirements-specifications/${specification.id}/items`,
        async route => {
          const proxiedResponse = await specificationResponsible.post(
            `/api/requirements-specifications/${specification.id}/items`,
            {
              data: route.request().postDataJSON(),
            },
          )
          await route.fulfill({
            body: await proxiedResponse.text(),
            contentType:
              proxiedResponse.headers()['content-type'] ?? 'application/json',
            status: proxiedResponse.status(),
          })
        },
      )

      const detailPane = await openRequirementDetail(page)
      await detailPane
        .getByRole('button', { name: 'Lägg till i kravunderlag' })
        .click()
      const dialog = page.getByRole('dialog', {
        name: 'Lägg till i kravunderlag',
      })
      await expect(dialog).toHaveCount(1)
      await dialog
        .getByLabel('Välj kravunderlag *')
        .selectOption(String(specification.id))
      await dialog
        .getByRole('button', { name: 'Lägg till i kravunderlag' })
        .click()

      await expect(
        dialog.getByText('Kravet har lagts till i kravunderlaget.'),
      ).toHaveCount(1)

      await page.goto(`/sv/specifications/${specification.uniqueId}`)
      await expect(
        page.getByRole('heading', { level: 1, name: specificationName }),
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        page.getByRole('button', { name: /^INT0001\b/u }),
      ).toBeVisible({ timeout: 30_000 })
    } finally {
      if (createdSpecification) {
        await specificationResponsible
          .delete(
            `/api/requirements-specifications/${createdSpecification.uniqueId}`,
          )
          .catch(() => undefined)
      }
      await specificationResponsible.dispose()
    }
  })

  test('COL-02: registers a new improvement suggestion from requirement detail', async ({
    page,
  }) => {
    const suggestionMock = await mockSuggestions(page, [])
    const detailPane = await openRequirementDetail(page)

    await detailPane.getByRole('button', { name: 'Registrera förslag' }).click()
    const dialog = page.getByRole('dialog', { name: 'Registrera förslag' })
    await dialog
      .getByLabel('Innehåll *')
      .fill('Playwright föreslår tydligare verifiering.')
    await dialog
      .getByRole('textbox', { name: 'Inskickad av' })
      .fill('Playwright')
    await dialog.getByRole('button', { name: 'Spara' }).click()

    await expect(
      detailPane.getByText('Playwright föreslår tydligare verifiering.'),
    ).toHaveCount(1)
    await expect(
      detailPane
        .getByRole('status')
        .filter({ hasText: 'Playwright föreslår tydligare verifiering.' })
        .getByText('Utkast'),
    ).toHaveCount(1)
    expect(suggestionMock.requests).toContainEqual(
      expect.objectContaining({ type: 'create' }),
    )
  })

  test('COL-03: requests review for a draft improvement suggestion', async ({
    page,
  }) => {
    const suggestionMock = await mockSuggestions(page, [
      suggestion(11, { content: 'Playwright förslag till granskning' }),
    ])
    const detailPane = await openRequirementDetail(page)

    await detailPane.getByRole('button', { name: 'Granskning ↗' }).click()

    const suggestionStatus = detailPane
      .getByRole('status')
      .filter({ hasText: 'Playwright förslag till granskning' })
    await expect(suggestionStatus).toHaveAttribute(
      'data-developer-mode-value',
      'review_requested',
    )
    await expect(suggestionStatus).toContainText('Väntande')
    expect(suggestionMock.requests).toContainEqual({
      id: 11,
      type: 'request-review',
    })
  })

  test('COL-04: resolves a reviewable improvement suggestion with motivation', async ({
    page,
  }) => {
    const suggestionMock = await mockSuggestions(page, [
      suggestion(12, {
        content: 'Playwright förslag att åtgärda',
        isReviewRequested: 1,
      }),
    ])
    const detailPane = await openRequirementDetail(page)

    await detailPane.getByRole('button', { name: 'Åtgärdad ↗' }).click()
    const dialog = page.getByRole('dialog', { name: 'Registrera åtgärd' })
    await dialog.getByLabel('Motivering *').fill('Åtgärdas i kravtexten.')
    await dialog.getByLabel('Granskad av *').fill('Playwright reviewer')
    await dialog.getByRole('button', { name: 'Registrera åtgärd' }).click()

    await expect(
      detailPane
        .getByRole('status')
        .filter({ hasText: 'Playwright förslag att åtgärda' }),
    ).toContainText('Åtgärdad')
    await expect(detailPane.getByText('Åtgärdas i kravtexten.')).toHaveCount(1)
    expect(suggestionMock.requests).toContainEqual(
      expect.objectContaining({
        body: expect.objectContaining({ resolution: 1 }),
        id: 12,
        type: 'resolution',
      }),
    )
  })

  test('COL-05: dismisses an improvement suggestion with motivation', async ({
    page,
  }) => {
    const suggestionMock = await mockSuggestions(page, [
      suggestion(13, {
        content: 'Playwright förslag att avvisa',
        isReviewRequested: 1,
      }),
    ])
    const detailPane = await openRequirementDetail(page)

    await detailPane.getByRole('button', { name: 'Åtgärdad ↗' }).click()
    const dialog = page.getByRole('dialog', { name: 'Registrera åtgärd' })
    await dialog.getByLabel('Avvisa').check()
    await dialog.getByLabel('Motivering *').fill('Förslaget avvisas.')
    await dialog.getByLabel('Granskad av *').fill('Playwright reviewer')
    await dialog.getByRole('button', { name: 'Registrera åtgärd' }).click()

    await expect(
      detailPane
        .getByRole('status')
        .filter({ hasText: 'Playwright förslag att avvisa' }),
    ).toContainText('Avvisad')
    await expect(detailPane.getByText('Förslaget avvisas.')).toHaveCount(1)
    expect(suggestionMock.requests).toContainEqual(
      expect.objectContaining({
        body: expect.objectContaining({ resolution: 2 }),
        id: 13,
        type: 'resolution',
      }),
    )
  })

  test('COL-07: requirement detail metadata shows owner, taxonomy, packages, and references', async ({
    page,
  }) => {
    const detailPane = await openRequirementDetail(page)

    await expect(detailPane.getByText('Kravområdesägare:')).toHaveCount(1)
    await expect(detailPane.getByText('Kategori')).toHaveCount(1)
    await expect(detailPane.getByText('Typ')).toHaveCount(1)
    await expect(detailPane.getByText('Kvalitetsegenskap')).toHaveCount(1)
    await expect(detailPane.getByText('Kravpaket')).toHaveCount(1)
    await expect(detailPane.getByText('Normreferenser')).toHaveCount(1)
  })
})
