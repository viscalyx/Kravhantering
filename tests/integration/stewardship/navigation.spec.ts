import { expect, type Page, type Route, test } from '@playwright/test'

const pwtRfiArea = {
  id: 920001,
  name: 'PWT-MANUAL Playwright manual cases',
  permissions: {
    canAuthor: true,
    canManageAssignments: false,
  },
  prefix: 'PWM',
}

const pwtRfiQuestions = [
  {
    archivedAt: null,
    areaId: pwtRfiArea.id,
    areaName: pwtRfiArea.name,
    areaPrefix: pwtRfiArea.prefix,
    expectedAnswerFormat: 'PWT-MANUAL fritextsvar.',
    helpText: 'PWT-MANUAL RFI fixture for Playwright.',
    id: 920001,
    isArchived: false,
    questionCode: 'PWM-RFI001',
    questionText: 'PWT-MANUAL vilken information ska leverantören lämna?',
    sortOrder: 10,
    versionNumber: 1,
  },
  {
    archivedAt: null,
    areaId: pwtRfiArea.id,
    areaName: pwtRfiArea.name,
    areaPrefix: pwtRfiArea.prefix,
    expectedAnswerFormat: 'PWT-MANUAL fritextsvar.',
    helpText: 'PWT-MANUAL RFI fixture for Playwright.',
    id: 920002,
    isArchived: false,
    questionCode: 'PWM-RFI002',
    questionText: 'PWT-MANUAL hur ska området besvaras samlat?',
    sortOrder: 20,
    versionNumber: 1,
  },
]

function pwtRfiSuggestion(overrides: {
  content: string
  id: number
  isReviewRequested?: boolean
  questionCode?: string | null
  resolution?: number | null
  resolutionMotivation?: string | null
  rfiQuestionId?: number | null
}) {
  return {
    areaId: pwtRfiArea.id,
    areaName: pwtRfiArea.name,
    content: overrides.content,
    createdAt: '2026-04-24T09:00:00.000Z',
    createdByDisplayName: 'Petra specresp',
    createdByHsaId: 'SE5560000001-specresp1',
    id: overrides.id,
    isReviewRequested: overrides.isReviewRequested ?? false,
    questionCode: overrides.questionCode ?? null,
    resolution: overrides.resolution ?? null,
    resolutionMotivation: overrides.resolutionMotivation ?? null,
    resolvedAt:
      overrides.resolution == null ? null : '2026-04-24T10:00:00.000Z',
    resolvedByDisplayName:
      overrides.resolution == null ? null : 'Olle AreaOwner',
    resolvedByHsaId:
      overrides.resolution == null ? null : 'SE5560000001-areaowner1',
    reviewRequestedAt: overrides.isReviewRequested
      ? '2026-04-24T09:30:00.000Z'
      : null,
    rfiQuestionId: overrides.rfiQuestionId ?? null,
    sourceSpecificationName: 'PWT-MANUAL RFI workflow',
    sourceSpecificationCode: 'PWT-RFI-WORKFLOW-2026',
    specificationId: 920007,
    updatedAt: '2026-04-24T09:00:00.000Z',
  }
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    contentType: 'application/json',
    json: body,
    status,
  })
}

async function assertWorkspaceNavigation({
  navigate,
  page,
  title,
  url,
}: {
  navigate: () => Promise<unknown>
  page: Page
  title: string
  url: RegExp
}) {
  await navigate()
  await expect(page).toHaveURL(url)
  await expect(
    page.getByRole('heading', { level: 1, name: title }),
  ).toBeVisible()
}

test.describe('Stewardship navigation memory', () => {
  test.use({ viewport: { height: 720, width: 1280 } })

  test('REQ-14b: remembers and navigates stewardship workspaces', async ({
    page,
  }) => {
    await test.step('browse to the question stewardship tab', async () => {
      await page.goto('/sv/requirements')
      await page.evaluate(() =>
        localStorage.removeItem('requirements.stewardship.tab'),
      )

      await page.getByRole('link', { name: 'Kravurvalsfrågor' }).click()

      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
      ).toBeVisible()
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem('requirements.stewardship.tab'),
          ),
        )
        .toBe('questions')
    })

    await test.step('leave stewardship for requirements specifications', async () => {
      await page.getByRole('link', { name: 'Kravunderlag' }).click()

      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravunderlag' }),
      ).toBeVisible()
    })

    await test.step('return through the direct stewardship link', async () => {
      await assertWorkspaceNavigation({
        navigate: () =>
          page.getByRole('link', { name: 'Kravurvalsfrågor' }).click(),
        page,
        title: 'Kravurvalsfrågor',
        url: /\/sv\/requirements\/stewardship\?tab=questions/,
      })
    })

    await test.step('switch workspaces and traverse browser history without inactive headings', async () => {
      await assertWorkspaceNavigation({
        navigate: () => page.getByRole('link', { name: 'RFI-frågor' }).click(),
        page,
        title: 'RFI-frågor',
        url: /\/sv\/requirements\/stewardship\?tab=information-requests/,
      })
      await assertWorkspaceNavigation({
        navigate: () =>
          page.getByRole('link', { name: 'Normbibliotek' }).click(),
        page,
        title: 'Normbibliotek',
        url: /\/sv\/requirements\/stewardship\?tab=norms/,
      })
      await assertWorkspaceNavigation({
        navigate: () => page.goBack(),
        page,
        title: 'RFI-frågor',
        url: /\/sv\/requirements\/stewardship\?tab=information-requests/,
      })
      await assertWorkspaceNavigation({
        navigate: () => page.goBack(),
        page,
        title: 'Kravurvalsfrågor',
        url: /\/sv\/requirements\/stewardship\?tab=questions/,
      })
      await assertWorkspaceNavigation({
        navigate: () => page.goForward(),
        page,
        title: 'RFI-frågor',
        url: /\/sv\/requirements\/stewardship\?tab=information-requests/,
      })
      await assertWorkspaceNavigation({
        navigate: () => page.goForward(),
        page,
        title: 'Normbibliotek',
        url: /\/sv\/requirements\/stewardship\?tab=norms/,
      })
    })
  })

  test('ADMIN-05: opens the norm library stewardship tab', async ({ page }) => {
    await page.goto('/sv/requirements')
    await page.evaluate(() =>
      localStorage.removeItem('requirements.stewardship.tab'),
    )

    await page.getByRole('link', { name: 'Normbibliotek' }).click()

    await expect(page).toHaveURL(/\/sv\/requirements\/stewardship\?tab=norms/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Normbibliotek' }),
    ).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem('requirements.stewardship.tab'),
        ),
      )
      .toBe('norms')
  })

  test('SPEC-16c: processes RFI suggestion review and resolution from stewardship', async ({
    page,
  }) => {
    const reviewRequests: number[] = []
    const resolutionRequests: Array<{ body: unknown; id: number }> = []
    let suggestions = [
      pwtRfiSuggestion({
        content: 'PWT-MANUAL öppet frågeförslag.',
        id: 920001,
        questionCode: 'PWM-RFI001',
        rfiQuestionId: 920001,
      }),
      pwtRfiSuggestion({
        content: 'PWT-MANUAL öppet områdesförslag.',
        id: 920002,
      }),
      pwtRfiSuggestion({
        content: 'PWT-MANUAL hanterat RFI-förslag.',
        id: 920003,
        isReviewRequested: true,
        questionCode: 'PWM-RFI001',
        resolution: 1,
        resolutionMotivation: 'PWT-MANUAL redan hanterat.',
        rfiQuestionId: 920001,
      }),
    ]

    await page.route('**/api/requirement-areas', route =>
      fulfillJson(route, { areas: [pwtRfiArea] }),
    )
    await page.route('**/api/rfi-questions?includeArchived=true', route =>
      fulfillJson(route, { questions: pwtRfiQuestions }),
    )
    await page.route('**/api/rfi-question-suggestions', async route => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await fulfillJson(route, { suggestions })
    })
    await page.route(
      '**/api/rfi-question-suggestions/920001/request-review',
      async route => {
        reviewRequests.push(920001)
        suggestions = suggestions.map(suggestion =>
          suggestion.id === 920001
            ? {
                ...suggestion,
                isReviewRequested: true,
                reviewRequestedAt: '2026-04-24T10:10:00.000Z',
                updatedAt: '2026-04-24T10:10:00.000Z',
              }
            : suggestion,
        )
        await fulfillJson(route, { ok: true })
      },
    )
    await page.route(
      '**/api/rfi-question-suggestions/920002/request-review',
      async route => {
        reviewRequests.push(920002)
        suggestions = suggestions.map(suggestion =>
          suggestion.id === 920002
            ? {
                ...suggestion,
                isReviewRequested: true,
                reviewRequestedAt: '2026-04-24T10:15:00.000Z',
                updatedAt: '2026-04-24T10:15:00.000Z',
              }
            : suggestion,
        )
        await fulfillJson(route, { ok: true })
      },
    )
    await page.route(
      '**/api/rfi-question-suggestions/*/resolution',
      async route => {
        const id = Number(route.request().url().split('/').at(-2))
        const body = route.request().postDataJSON()
        resolutionRequests.push({ body, id })
        suggestions = suggestions.map(suggestion =>
          suggestion.id === id
            ? {
                ...suggestion,
                resolution: 1,
                resolutionMotivation:
                  typeof body === 'object' &&
                  body !== null &&
                  'resolutionMotivation' in body
                    ? String(body.resolutionMotivation)
                    : null,
                resolvedAt: '2026-04-24T10:20:00.000Z',
                resolvedByDisplayName: 'Olle AreaOwner',
                resolvedByHsaId: 'SE5560000001-areaowner1',
                updatedAt: '2026-04-24T10:20:00.000Z',
              }
            : suggestion,
        )
        await fulfillJson(route, { ok: true })
      },
    )

    await page.goto('/sv/requirements/stewardship?tab=information-requests')
    await expect(
      page.getByRole('heading', { level: 1, name: 'RFI-frågor' }),
    ).toBeVisible()

    const questionSuggestionButton = page.getByRole('button', {
      name: 'Behandla RFI-frågeförslag: PWM-RFI001',
    })
    await expect(questionSuggestionButton.getByText('1')).toBeVisible()
    await questionSuggestionButton.click()
    let suggestionsDialog = page.getByRole('dialog', {
      name: 'Behandla RFI-frågeförslag',
    })
    await expect(suggestionsDialog).toContainText('Nya')
    await expect(suggestionsDialog).toContainText('Behandlade (1)')
    await expect(suggestionsDialog).toContainText(
      'PWT-MANUAL öppet frågeförslag.',
    )
    await expect(
      suggestionsDialog.getByRole('textbox', {
        name: /Beslutsmotivering/u,
      }),
    ).toHaveCount(0)
    await expect(
      suggestionsDialog.getByRole('button', { name: 'Markera hanterad' }),
    ).toHaveCount(0)
    await suggestionsDialog
      .getByRole('button', { name: 'Begär granskning' })
      .click()

    await expect.poll(() => reviewRequests).toEqual([920001])
    await expect(suggestionsDialog).toContainText('I granskning')
    await expect(suggestionsDialog).toContainText('Behandlade (1)')
    await suggestionsDialog
      .getByRole('textbox', { name: /Beslutsmotivering/u })
      .fill('PWT SPEC-16c frågeförslag hanterat efter granskning.')
    await suggestionsDialog
      .getByRole('button', { name: 'Markera hanterad' })
      .click()
    await expect
      .poll(() => resolutionRequests)
      .toEqual([
        {
          body: {
            resolution: 'resolved',
            resolutionMotivation:
              'PWT SPEC-16c frågeförslag hanterat efter granskning.',
          },
          id: 920001,
        },
      ])
    await suggestionsDialog.getByRole('button', { name: 'Stäng' }).click()

    const areaSuggestionButton = page.getByRole('button', {
      name: 'Behandla RFI-frågeförslag: PWM PWT-MANUAL Playwright manual cases',
    })
    await expect(areaSuggestionButton.getByText('1')).toBeVisible()
    await areaSuggestionButton.click()
    suggestionsDialog = page.getByRole('dialog', {
      name: 'Behandla RFI-frågeförslag',
    })
    await expect(suggestionsDialog).toContainText('Nya')
    await expect(suggestionsDialog).toContainText(
      'PWT-MANUAL öppet områdesförslag.',
    )
    await expect(
      suggestionsDialog.getByRole('textbox', {
        name: /Beslutsmotivering/u,
      }),
    ).toHaveCount(0)
    await suggestionsDialog
      .getByRole('button', { name: 'Begär granskning' })
      .click()
    await expect.poll(() => reviewRequests).toEqual([920001, 920002])
    await suggestionsDialog
      .getByRole('textbox', { name: /Beslutsmotivering/u })
      .fill('PWT SPEC-16c hanterat i kravområdesförvaltningen.')
    await suggestionsDialog
      .getByRole('button', { name: 'Markera hanterad' })
      .click()

    await expect
      .poll(() => resolutionRequests)
      .toEqual([
        {
          body: {
            resolution: 'resolved',
            resolutionMotivation:
              'PWT SPEC-16c frågeförslag hanterat efter granskning.',
          },
          id: 920001,
        },
        {
          body: {
            resolution: 'resolved',
            resolutionMotivation:
              'PWT SPEC-16c hanterat i kravområdesförvaltningen.',
          },
          id: 920002,
        },
      ])
    await expect(suggestionsDialog).toContainText('Hanterad')
    await expect(suggestionsDialog).toContainText('Behandlade')
  })
})
