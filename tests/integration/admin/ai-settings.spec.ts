import {
  type APIRequestContext,
  expect,
  type Page,
  type Route,
  test,
} from '@playwright/test'
import { expectApiResponseOk } from '../api-response-assertions'

interface AiGenerationAvailability {
  disabledByEnvironment: boolean
  effectiveRequirementGenerationEnabled: boolean
  requirementGenerationEnabled: boolean
}

async function getAiSettings(
  request: APIRequestContext,
): Promise<AiGenerationAvailability> {
  const response = await request.get('/api/admin/ai-settings')
  await expectApiResponseOk(response, 'GET AI settings')
  return (await response.json()) as AiGenerationAvailability
}

async function putAiSettings(
  request: APIRequestContext,
  requirementGenerationEnabled: boolean,
): Promise<AiGenerationAvailability> {
  const response = await request.put('/api/admin/ai-settings', {
    data: { requirementGenerationEnabled },
  })
  await expectApiResponseOk(response, 'PUT AI settings')
  return (await response.json()) as AiGenerationAvailability
}

async function mockAiDialogReferenceData(page: Page) {
  await page.route('**/api/ai/models?*', async route => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
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
      },
    })
  })
  await page.route('**/api/ai/credits', async route => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        isFreeTier: false,
        limit: 50,
        limitRemaining: 49,
        managementKeyMissing: false,
        totalCredits: 50,
        usage: 1,
        usageDaily: 1,
      },
    })
  })
}

async function mockUnavailableGeneration(route: Route) {
  await route.fulfill({
    body: `event: error\ndata: ${JSON.stringify({
      message: 'AI-kravgenerering är avstängd i Administrationscenter.',
    })}\n\n`,
    contentType: 'text/event-stream',
    status: 503,
  })
}

test.describe('Admin AI settings', () => {
  test.use({ viewport: { height: 760, width: 1280 } })

  test('REQ-16: Admin Center disables AI requirement generation across requirements UI and open dialogs', async ({
    context,
    page,
    request,
  }) => {
    const original = await getAiSettings(request)

    try {
      await page.goto('/sv/admin?tab=ai')
      await expect(page.getByRole('tab', { name: 'AI' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      const generationToggle = page.locator(
        '#admin-ai-requirement-generation-enabled',
      )
      await expect(generationToggle).toHaveCount(1)

      if (original.disabledByEnvironment) {
        await expect(
          page.getByText(/Driftkonfigurationen stänger för närvarande av/),
        ).toHaveCount(1)
        await page.goto('/sv/requirements')
        await expect(
          page.getByRole('button', { name: 'AI-assistera' }).first(),
        ).toBeDisabled()
        return
      }

      await putAiSettings(request, true)

      const generatorPage = await context.newPage()
      await mockAiDialogReferenceData(generatorPage)
      await generatorPage.route(
        '**/api/ai/generate-requirement-import',
        mockUnavailableGeneration,
      )
      await generatorPage.goto('/sv/requirements')
      await generatorPage
        .getByRole('button', { name: 'AI-assistera' })
        .first()
        .click()
      const aiDialog = generatorPage.getByRole('dialog', {
        name: 'AI-assisterat författande',
      })
      await expect(aiDialog).toHaveCount(1)
      await aiDialog.getByLabel('Kravområde', { exact: true }).selectOption({
        index: 1,
      })
      await aiDialog
        .getByRole('textbox', { name: 'Behov och sammanhang' })
        .fill('Skapa ett krav om spårbar import och verifierbarhet.')

      await page.goto('/sv/admin?tab=ai')
      await page.locator('#admin-ai-requirement-generation-enabled').uncheck()
      await page.getByRole('button', { name: 'Spara' }).click()
      await expect(page.getByRole('status')).toHaveText('Sparat')

      await page.goto('/sv/requirements')
      const aiButton = page
        .getByRole('button', { name: 'AI-assistera' })
        .first()
      await expect(aiButton).toBeDisabled()
      await expect(aiButton).toHaveAttribute(
        'title',
        'AI-kravgenerering är avstängd i Administrationscenter.',
      )

      await aiDialog
        .getByRole('button', { name: 'Skapa kravkandidater' })
        .click()
      await expect(
        aiDialog.getByText(
          'AI-kravgenerering är avstängd i Administrationscenter.',
        ),
      ).toHaveCount(1)
      await generatorPage.close()
    } finally {
      await putAiSettings(request, original.requirementGenerationEnabled)
    }
  })
})
