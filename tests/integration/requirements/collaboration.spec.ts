import {
  expect,
  type Locator,
  type Page,
  type Route,
  test,
} from '@playwright/test'
import type { SuggestionData } from '@/app/[locale]/requirements/[id]/_detail/types'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'
import { expectApiResponseOk } from '../api-response-assertions'
import { newRoleContext } from '../authorization/authorization-test-helpers'
import {
  getRequirementRowButton,
  resolveRequirementDetailPane,
} from './requirement-detail-test-helpers'

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
  const identityResponse = await page.request.get('/api/auth/me')
  await expectApiResponseOk(identityResponse, 'load signed-in suggestion actor')
  const actor = (await identityResponse.json()) as { name: string }
  let nextId = Math.max(0, ...initialSuggestions.map(item => item.id)) + 1
  let suggestions = [...initialSuggestions]
  const requests: unknown[] = []

  await page.route('**/api/requirement-suggestions/**', async route => {
    const request = route.request()
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as {
        content: string
        requirementVersionId?: number | null
      }
      const created = suggestion(nextId, {
        content: body.content,
        createdBy: actor.name,
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
      }
      suggestions = suggestions.map(item =>
        item.id === id
          ? {
              ...item,
              resolution: body.resolution,
              resolutionMotivation: body.resolutionMotivation,
              resolvedAt: '2026-06-01T11:00:00.000Z',
              resolvedBy: actor.name,
            }
          : item,
      )
      requests.push({ body, id, type: 'resolution' })
      await fulfillJson(route, {
        suggestion: suggestions.find(item => item.id === id),
      })
    },
  )

  await page.route('**/api/improvement-suggestions/*', async route => {
    if (route.request().method() !== 'PUT') {
      await route.fallback()
      return
    }
    const id = Number(route.request().url().split('/').pop())
    const body = route.request().postDataJSON() as { content: string }
    suggestions = suggestions.map(item =>
      item.id === id ? { ...item, content: body.content } : item,
    )
    requests.push({ body, id, type: 'edit' })
    await fulfillJson(route, {
      suggestion: suggestions.find(item => item.id === id),
    })
  })

  return {
    actorName: actor.name,
    replaceSuggestions: (items: SuggestionData[]) => {
      suggestions = items
    },
    get requests() {
      return requests
    },
  }
}

test.describe('Requirement collaboration', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('COL-01: adds a requirement to a selected kravunderlag', async ({
    page,
  }, testInfo) => {
    const specificationResponsible = await newRoleContext(
      testInfo,
      'specificationResponsible',
    )
    const uniqueSuffix = `${Date.now()}`
    const specificationCode = `PWT-COL-01-${uniqueSuffix}`
    const specificationName = `PWT COL-01 testunderlag ${uniqueSuffix}`
    let createdSpecification: { id: number; specificationCode: string } | null =
      null

    try {
      const createResponse = await specificationResponsible.post(
        '/api/requirements-specifications',
        {
          data: {
            businessNeedsReference:
              'Playwright COL-01 verifierar tillagt krav i kravunderlag.',
            name: specificationName,
            specificationLifecycleStatusId: 1,
            specificationCode,
          },
        },
      )
      await expectApiResponseOk(createResponse, 'create COL-01 kravunderlag')
      createdSpecification = (await createResponse.json()) as {
        id: number
        specificationCode: string
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

      await page.goto(`/sv/specifications/${specification.id}`)
      await expect(
        page.getByRole('heading', { level: 1, name: specificationName }),
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        page.getByRole('button', { name: /^INT0001\b/u }),
      ).toBeVisible({ timeout: 30_000 })
    } finally {
      if (createdSpecification) {
        await specificationResponsible
          .delete(`/api/requirements-specifications/${createdSpecification.id}`)
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
    await expect(
      dialog.getByRole('status', { name: 'Inskickad av' }),
    ).toHaveText(suggestionMock.actorName)
    await expect(
      dialog.locator('[data-developer-mode-value="suggestion-recorded-actor"]'),
    ).toHaveAttribute('data-developer-mode-name', 'section')
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
    await expect(
      detailPane.getByRole('button', { name: 'Åtgärdad ↗' }),
    ).toHaveCount(0)
    await expect(
      detailPane
        .getByRole('status')
        .filter({ hasText: 'Playwright föreslår tydligare verifiering.' }),
    ).toContainText(suggestionMock.actorName)
    expect(suggestionMock.requests).toContainEqual({
      type: 'create',
      body: {
        content: 'Playwright föreslår tydligare verifiering.',
        requirementVersionId: SELECTED_INT0001_VERSION_ID,
      },
    })
  })

  test('COL-02a: edits content while retaining the original submitter', async ({
    page,
  }) => {
    const suggestionMock = await mockSuggestions(page, [
      suggestion(14, { createdBy: 'Original submitter' }),
    ])
    const detailPane = await openRequirementDetail(page)
    await test.step('edit the content and retain the recorded submitter', async () => {
      await detailPane.getByRole('button', { name: 'Redigera förslag' }).click()
      const dialog = page.getByRole('dialog', { name: 'Redigera förslag' })
      await expect(
        dialog.getByRole('status', { name: 'Inskickad av' }),
      ).toHaveText('Original submitter')
      await expect(dialog.getByRole('button', { name: 'Spara' })).toBeDisabled()
      await dialog.getByLabel('Innehåll *').fill('Förtydligat förslag')
      await dialog.getByRole('button', { name: 'Spara' }).click()
      await expect(
        detailPane
          .getByRole('status')
          .filter({ hasText: 'Förtydligat förslag' }),
      ).toContainText('Original submitter')
      expect(suggestionMock.requests).toContainEqual({
        type: 'edit',
        id: 14,
        body: { content: 'Förtydligat förslag' },
      })
    })
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
    await expect(suggestionStatus).toContainText('Väntande')
    await expect(
      detailPane.getByRole('button', { name: 'Åtgärdad ↗' }),
    ).toBeVisible()
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
    await expect(
      dialog.getByRole('button', { name: 'Registrera åtgärd' }),
    ).toBeDisabled()
    await dialog.getByLabel('Motivering *').fill('Åtgärdas i kravtexten.')
    await expect(
      dialog.getByRole('status', { name: 'Granskad av' }),
    ).toHaveText(suggestionMock.actorName)
    await dialog.getByRole('button', { name: 'Registrera åtgärd' }).click()

    await expect(
      detailPane
        .getByRole('status')
        .filter({ hasText: 'Playwright förslag att åtgärda' }),
    ).toContainText('Åtgärdad')
    await expect(detailPane.getByText('Åtgärdas i kravtexten.')).toHaveCount(1)
    await expect(
      detailPane.getByRole('button', { name: 'Åtgärdad ↗' }),
    ).toHaveCount(0)
    await expect(
      detailPane.getByRole('button', { name: 'Granskning ↗' }),
    ).toHaveCount(0)
    await expect(
      detailPane
        .getByRole('status')
        .filter({ hasText: 'Playwright förslag att åtgärda' }),
    ).toContainText(suggestionMock.actorName)
    const reloadedPane = await openRequirementDetail(page)
    await expect(
      reloadedPane
        .getByRole('status')
        .filter({ hasText: 'Playwright förslag att åtgärda' }),
    ).toContainText(suggestionMock.actorName)
    expect(suggestionMock.requests).toContainEqual(
      expect.objectContaining({
        body: expect.objectContaining({ resolution: 1 }),
        id: 12,
        type: 'resolution',
      }),
    )
  })

  test('COL-04a: attaches implementation without changing the decision and hides unavailable version links', async ({
    page,
  }) => {
    const detailResponse = await page.request.get('/api/requirements/1')
    await expectApiResponseOk(detailResponse, 'load implementation fixture')
    const detail = await detailResponse.json()
    const feedback = detail.versions.find(
      (version: { id: number }) => version.id === SELECTED_INT0001_VERSION_ID,
    )
    const implementing = detail.versions.find(
      (version: { id: number }) => version.id !== SELECTED_INT0001_VERSION_ID,
    )
    expect(feedback).toBeDefined()
    expect(implementing).toBeDefined()
    feedback.versionNumber = 2
    implementing.versionNumber = 3
    implementing.status = 3
    implementing.statusNameSv = 'Publicerad'
    implementing.statusNameEn = 'Published'
    feedback.status = 4
    detail.permissions.canManageSuggestions = true
    await page.route('**/api/requirements/1', route =>
      fulfillJson(route, detail),
    )
    const original = suggestion(14, {
      isReviewRequested: 1,
      resolution: 1,
      resolutionMotivation: 'Motiverat beslut',
      resolvedAt: '2026-06-01T11:00:00.000Z',
      resolvedBy: 'Beslutsfattaren',
    })
    const mock = await mockSuggestions(page, [original])
    let attachedBody: unknown
    await page.route(
      '**/api/improvement-suggestions/14/implementation',
      async route => {
        attachedBody = route.request().postDataJSON()
        mock.replaceSuggestions([
          {
            ...original,
            implementation: {
              recordedAt: '2026-06-02T11:00:00.000Z',
              version: {
                id: implementing.id,
                requirementId: 1,
                versionNumber: 3,
                statusId: 3,
                statusNameEn: 'Published',
                statusNameSv: 'Publicerad',
              },
            },
          },
        ])
        await fulfillJson(route, { ok: true })
      },
    )
    await test.step('attach an implementing version and preserve the decision', async () => {
      await page.goto('/sv/requirements/1/2')
      await page
        .getByRole('button', { name: 'Koppla genomförandeversion' })
        .click()
      const dialog = page.getByRole('dialog', {
        name: 'Koppla genomförandeversion',
      })
      const versionSelect = dialog.getByLabel('Genomförandeversion *', {
        exact: true,
      })
      await expect(versionSelect).toBeFocused()
      await versionSelect.selectOption(String(implementing.id))
      const attachedResponse = page.waitForResponse(
        response =>
          response
            .url()
            .endsWith('/api/improvement-suggestions/14/implementation') &&
          response.request().method() === 'POST',
      )
      await dialog
        .getByRole('button', { name: 'Koppla genomförandeversion' })
        .click()
      await attachedResponse
      expect(attachedBody).toEqual({
        implementingRequirementVersionId: implementing.id,
      })
      const card = page.getByRole('status', { name: 'Förslag:' })
      await expect(card).toContainText('Motiverat beslut')
      await expect(card).toContainText('Beslutsfattaren')
      await expect(card).toContainText('Publicerad')
    })

    await test.step('navigate to the implementing version by its immutable identity', async () => {
      await page
        .getByRole('status', { name: 'Förslag:' })
        .getByRole('link', { name: 'Version 3', exact: true })
        .click()
      await expect(page).toHaveURL(
        new RegExp(`/sv/requirements/1/3\\?versionId=${implementing.id}$`),
      )
    })

    await test.step('show unavailable evidence when the version number is reused', async () => {
      const implementingId = implementing.id
      implementing.id += 1000
      await page.reload()
      await expect(
        page.getByRole('alert').filter({
          hasText: 'Versionen är otillgänglig eller du saknar läsbehörighet',
        }),
      ).toBeVisible()
      implementing.id = implementingId
      await page.goto('/sv/requirements/1/2')
      await expect(
        page.getByRole('button', { name: 'Koppla genomförandeversion' }),
      ).toHaveCount(0)
    })

    await test.step('hide version navigation and attachment for an unauthorized reader', async () => {
      mock.replaceSuggestions([
        {
          ...original,
          implementation: {
            recordedAt: '2026-06-02T11:00:00.000Z',
            version: null,
          },
        },
      ])
      detail.permissions.canManageSuggestions = false
      await page.reload()
      await expect(
        page.getByText(
          /Versionen är otillgänglig eller du saknar läsbehörighet/,
        ),
      ).toHaveCount(1)
      await expect(
        page.getByRole('link', { name: 'Version 3', exact: true }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Koppla genomförandeversion' }),
      ).toHaveCount(0)
    })
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
    await expect(
      dialog.getByRole('button', { name: 'Registrera åtgärd' }),
    ).toBeDisabled()
    await dialog.getByLabel('Motivering *').fill('Förslaget avvisas.')
    await expect(
      dialog.getByRole('status', { name: 'Granskad av' }),
    ).toHaveText(suggestionMock.actorName)
    await dialog.getByRole('button', { name: 'Registrera åtgärd' }).click()

    await expect(
      detailPane
        .getByRole('status')
        .filter({ hasText: 'Playwright förslag att avvisa' }),
    ).toContainText('Avvisad')
    await expect(detailPane.getByText('Förslaget avvisas.')).toHaveCount(1)
    await expect(
      detailPane.getByRole('button', { name: 'Åtgärdad ↗' }),
    ).toHaveCount(0)
    await expect(
      detailPane.getByRole('button', { name: 'Granskning ↗' }),
    ).toHaveCount(0)
    await expect(
      detailPane
        .getByRole('status')
        .filter({ hasText: 'Playwright förslag att avvisa' }),
    ).toContainText(suggestionMock.actorName)
    const reloadedPane = await openRequirementDetail(page)
    await expect(
      reloadedPane
        .getByRole('status')
        .filter({ hasText: 'Playwright förslag att avvisa' }),
    ).toContainText(suggestionMock.actorName)
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
