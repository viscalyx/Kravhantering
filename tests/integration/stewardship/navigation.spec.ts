import { expect, type Route, test } from '@playwright/test'

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

test.describe('Stewardship navigation memory', () => {
  test.use({ viewport: { height: 720, width: 1280 } })

  test('REQ-14b: returns directly to the remembered question tab from specifications', async ({
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

    await test.step('return through the direct stewardship link without a package flash', async () => {
      await page.evaluate(() => {
        const win = window as typeof window & {
          __stewardshipHeadingLog?: string[]
          __stewardshipHeadingObserver?: MutationObserver
        }
        win.__stewardshipHeadingLog = []
        const recordHeadings = () => {
          const headings = Array.from(document.querySelectorAll('h1'))
            .map(heading => heading.textContent?.trim())
            .filter((text): text is string => Boolean(text))
          win.__stewardshipHeadingLog?.push(...headings)
        }
        recordHeadings()
        win.__stewardshipHeadingObserver = new MutationObserver(recordHeadings)
        win.__stewardshipHeadingObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        })
      })

      await page.getByRole('link', { name: 'Kravurvalsfrågor' }).click()

      await expect(page).toHaveURL(
        /\/sv\/requirements\/stewardship\?tab=questions/,
      )
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravurvalsfrågor' }),
      ).toBeVisible()

      const headingLog = await page.evaluate(() => {
        const win = window as typeof window & {
          __stewardshipHeadingLog?: string[]
          __stewardshipHeadingObserver?: MutationObserver
        }
        win.__stewardshipHeadingObserver?.disconnect()
        return win.__stewardshipHeadingLog ?? []
      })

      expect(headingLog).not.toContain('Kravpaket')
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
    const resolutionRequests: unknown[] = []
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
      '**/api/rfi-question-suggestions/920002/resolution',
      async route => {
        const body = route.request().postDataJSON()
        resolutionRequests.push(body)
        suggestions = suggestions.map(suggestion =>
          suggestion.id === 920002
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
    await expect(questionSuggestionButton.locator('svg')).toBeVisible()
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
    await suggestionsDialog
      .getByRole('textbox', { name: /Beslutsmotivering/u })
      .fill('PWT SPEC-16c skickad till granskning.')
    await expect(
      suggestionsDialog
        .getByRole('button', { name: 'Begär granskning' })
        .locator('svg'),
    ).toBeVisible()
    await suggestionsDialog
      .getByRole('button', { name: 'Begär granskning' })
      .click()

    await expect.poll(() => reviewRequests).toEqual([920001])
    await expect(suggestionsDialog).toContainText('I granskning')
    await expect(suggestionsDialog).toContainText('Behandlade (1)')
    await expect(
      suggestionsDialog
        .getByRole('button', { name: 'Markera hanterad' })
        .locator('svg'),
    ).toBeVisible()
    await suggestionsDialog.getByRole('button', { name: 'Stäng' }).click()

    const areaSuggestionButton = page.getByRole('button', {
      name: 'Behandla RFI-frågeförslag: PWM PWT-MANUAL Playwright manual cases',
    })
    await expect(areaSuggestionButton.locator('svg')).toBeVisible()
    await expect(areaSuggestionButton.getByText('1')).toBeVisible()
    await areaSuggestionButton.click()
    suggestionsDialog = page.getByRole('dialog', {
      name: 'Behandla RFI-frågeförslag',
    })
    await expect(suggestionsDialog).toContainText('Nya')
    await expect(suggestionsDialog).toContainText(
      'PWT-MANUAL öppet områdesförslag.',
    )
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
          resolution: 'resolved',
          resolutionMotivation:
            'PWT SPEC-16c hanterat i kravområdesförvaltningen.',
        },
      ])
    await expect(suggestionsDialog).toContainText('Hanterad')
    await expect(suggestionsDialog).toContainText('Behandlade')
  })
})
