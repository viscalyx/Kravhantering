import { expect, type Page, type Route, test } from '@playwright/test'

const specificationSlug = 'ETJANST-UPP-2026'
const generatedDescription =
  'Systemet ska låta behöriga lärare registrera betyg för en elev.'
const generatedPayload = {
  requirements: [
    {
      description: generatedDescription,
      priorityLevelId: null,
      requiresTesting: true,
      typeId: 1,
    },
  ],
  schemaVersion: 'requirement-import.v1',
}

function jsonResponse(body: unknown) {
  return {
    body: JSON.stringify(body),
    contentType: 'application/json',
  }
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill(jsonResponse(body))
}

function previewBody(token: string) {
  return {
    previewToken: token,
    proposals: [],
    rows: [
      {
        errors: [],
        infos: [],
        labels: {
          category: null,
          priorityLevel: null,
          qualityCharacteristic: null,
          type: 'Funktionellt',
        },
        proposedNormReferenceKeys: [],
        reviewRowId: `${token}-row-0`,
        selected: true,
        sourceIndex: 0,
        values: {
          acceptanceCriteria: null,
          categoryId: null,
          description: generatedDescription,
          needsReferenceId: null,
          normReferenceIds: [],
          priorityLevelId: null,
          qualityCharacteristicId: null,
          requirementPackageIds: [],
          requiresTesting: true,
          typeId: 1,
          verificationMethod: null,
        },
        warnings: [],
      },
    ],
    summary: { errorCount: 0, rowCount: 1, warningCount: 0 },
  }
}

async function mockAiAuthoring(page: Page) {
  await page.route('**/api/ai/models?*', async route => {
    await fulfillJson(route, {
      models: [
        {
          contextLength: 200000,
          id: 'anthropic/claude-sonnet-4',
          name: 'Claude Sonnet 4',
          pricing: {
            completion: '0.000015',
            prompt: '0.000003',
            reasoning: '0.000015',
          },
          provider: 'anthropic',
          supportedParameters: ['reasoning', 'stream', 'response_format'],
        },
      ],
    })
  })
  await page.route('**/api/ai/credits', async route => {
    await fulfillJson(route, {
      isFreeTier: false,
      limit: 50,
      limitRemaining: 49,
      managementKeyMissing: false,
      totalCredits: 50,
      usage: 1,
      usageDaily: 1,
    })
  })
  await page.route('**/api/ai/generate-requirement-import', async route => {
    const body = {
      payload: generatedPayload,
      rawContent: JSON.stringify(generatedPayload),
      stats: {
        completionTokens: 12,
        cost: 0,
        promptTokens: 10,
        reasoningTokens: 2,
        totalTokens: 24,
      },
      thinking: 'AI-analys för betygskrav.',
    }
    await route.fulfill({
      body: `event: done\ndata: ${JSON.stringify(body)}\n\n`,
      contentType: 'text/event-stream',
    })
  })
}

async function mockImportPreview(
  page: Page,
  endpoint: string,
  tokenPrefix: string,
) {
  let callCount = 0
  const bodies: unknown[] = []
  await page.route(endpoint, async route => {
    callCount += 1
    bodies.push(route.request().postDataJSON())
    await fulfillJson(route, previewBody(`${tokenPrefix}-${callCount}`))
  })
  return {
    bodies,
    get callCount() {
      return callCount
    },
  }
}

async function generateCandidate(page: Page) {
  const dialog = page.getByRole('dialog', {
    name: 'AI-assisterat författande',
  })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Claude Sonnet 4')).toBeVisible()
  await dialog
    .getByRole('textbox', { name: 'Behov och sammanhang' })
    .fill(
      'Behöver krav för system som betygsätter elever, både funktionella och icke-funktionella krav.',
    )
  await expect(
    dialog.getByRole('button', { name: 'Skapa kravkandidater' }),
  ).toBeEnabled()
  await dialog.getByRole('button', { name: 'Skapa kravkandidater' }).click()
  await expect(page.getByText(generatedDescription)).toBeVisible()
}

test('REQ-15: AI-assisted authoring hands library candidates to requirement import review', async ({
  page,
}) => {
  await mockAiAuthoring(page)
  const preview = await mockImportPreview(
    page,
    '**/api/requirements/import/preview',
    'library-preview',
  )

  await page.goto('/sv/requirements')
  await page.getByRole('button', { name: 'AI-assistera' }).first().click()
  await page
    .getByRole('dialog', { name: 'AI-assisterat författande' })
    .getByLabel('Kravområde', { exact: true })
    .selectOption({ index: 1 })

  await generateCandidate(page)

  await page
    .getByRole('dialog', { name: 'AI-assisterat författande' })
    .getByRole('button', { name: 'Förhandsgranska krav i import' })
    .click()

  await expect(page.getByLabel(/Import-JSON/)).toBeHidden()
  await expect(page.getByText(generatedDescription)).toBeVisible()
  expect(preview.callCount).toBe(1)
  expect(preview.bodies[preview.bodies.length - 1]).toMatchObject({
    payload: generatedPayload,
  })
})

test('SPEC-17: AI-assisted authoring hands kravunderlag candidates to local import review', async ({
  page,
}) => {
  await mockAiAuthoring(page)
  const preview = await mockImportPreview(
    page,
    '**/api/specification-local-requirements/import/preview',
    'spec-preview',
  )

  await page.goto(`/sv/specifications/${specificationSlug}`)
  await page.getByRole('button', { name: 'Lägg till unika krav' }).click()
  await page
    .getByRole('menuitem', { name: 'AI-assisterat författande' })
    .click()

  await generateCandidate(page)

  await page
    .getByRole('dialog', { name: 'AI-assisterat författande' })
    .getByRole('button', { name: 'Förhandsgranska krav i import' })
    .click()

  await expect(page.getByLabel(/Import-JSON/)).toBeHidden()
  await expect(page.getByText(generatedDescription)).toBeVisible()
  expect(preview.callCount).toBe(1)
  expect(preview.bodies[preview.bodies.length - 1]).toMatchObject({
    payload: generatedPayload,
    specificationIdOrSlug: specificationSlug,
  })
})
