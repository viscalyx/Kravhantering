import {
  type APIRequestContext,
  expect,
  type Page,
  type Route,
  test,
} from '@playwright/test'
import {
  addMcpMaxRequestBytesSteps,
  MCP_REQUEST_PAYLOAD_MAX_BYTES,
  MCP_REQUEST_PAYLOAD_MIN_BYTES,
} from '@/lib/ai/generation-availability'
import { expectApiResponseOk } from '../api-response-assertions'

interface AiGenerationAvailability {
  aiSafetyRuleCacheTtlSeconds: number
  disabledByEnvironment: boolean
  effectiveRequirementGenerationEnabled: boolean
  mcpImportMaxRows: number
  mcpImportValidationTtlMinutes: number
  mcpMaxRequestBytes: number
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
  settings: Pick<
    AiGenerationAvailability,
    | 'aiSafetyRuleCacheTtlSeconds'
    | 'mcpImportMaxRows'
    | 'mcpImportValidationTtlMinutes'
    | 'mcpMaxRequestBytes'
    | 'requirementGenerationEnabled'
  >,
): Promise<AiGenerationAvailability> {
  const response = await request.put('/api/admin/ai-settings', {
    data: settings,
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

  test('REQ-16B: Admin Center controls the MCP request payload limit', async ({
    page,
    request,
  }) => {
    const original = await getAiSettings(request)
    const initialLimit = MCP_REQUEST_PAYLOAD_MIN_BYTES
    const oneStepLimit = addMcpMaxRequestBytesSteps(initialLimit, 1)
    let shouldRestoreSettings = false

    try {
      await putAiSettings(request, {
        aiSafetyRuleCacheTtlSeconds: original.aiSafetyRuleCacheTtlSeconds,
        mcpImportMaxRows: original.mcpImportMaxRows,
        mcpImportValidationTtlMinutes: original.mcpImportValidationTtlMinutes,
        mcpMaxRequestBytes: initialLimit,
        requirementGenerationEnabled: original.requirementGenerationEnabled,
      })
      shouldRestoreSettings = true

      await test.step('shows requirement generation inside the AI assistance section before MCP controls', async () => {
        await page.goto('/sv/admin?tab=ai')
        await expect(page.getByRole('tab', { name: 'AI' })).toHaveAttribute(
          'aria-selected',
          'true',
        )
        await expect(
          page.getByRole('checkbox', { name: /Kravgenerering/ }),
        ).toBeVisible()
        await expect(
          page.getByRole('heading', { name: 'AI-assistering' }),
        ).toHaveCount(1)
        await expect(
          page.getByRole('heading', { name: 'MCP-gränssnitt' }),
        ).toHaveCount(1)
        await expect(
          page.getByRole('spinbutton', { name: 'MCP-anropsgräns' }),
        ).toBeVisible()
        await expect(
          page.getByText('Tillåtet intervall: 1 MiB till 10 MiB. Steg: 1 MiB.'),
        ).toHaveCount(1)

        const panelTextOrder = await page
          .locator('#ai-panel')
          .evaluate(panel => {
            const text = panel.textContent ?? ''
            return {
              aiAssistance: text.indexOf('AI-assistering'),
              limit: text.indexOf('MCP-anropsgräns'),
              mcpInterface: text.indexOf('MCP-gränssnitt'),
              requirementGeneration: text.indexOf('Kravgenerering'),
            }
          })
        expect(panelTextOrder.requirementGeneration).toBeGreaterThanOrEqual(0)
        expect(panelTextOrder.requirementGeneration).toBeGreaterThan(
          panelTextOrder.aiAssistance,
        )
        expect(panelTextOrder.mcpInterface).toBeGreaterThan(
          panelTextOrder.requirementGeneration,
        )
        expect(panelTextOrder.limit).toBeGreaterThan(
          panelTextOrder.mcpInterface,
        )
      })

      await test.step('keeps MCP guidance behind the field help button', async () => {
        await expect(
          page.getByText('Största tillåtna MCP POST-nyttolast och sparad'),
        ).toHaveCount(0)
        await page
          .getByRole('button', { name: 'Hjälp: MCP-anropsgräns' })
          .click()
        await expect(
          page.getByText('Största tillåtna MCP POST-nyttolast och sparad'),
        ).toHaveCount(1)
      })

      const mcpLimitInput = page.locator('#admin-ai-mcp-max-request-kib')
      const increaseButton = page.getByRole('button', {
        name: 'Höj MCP-anropsgränsen',
      })

      await test.step('commits a typed MCP limit on blur', async () => {
        await expect(mcpLimitInput).toHaveValue('1024')
        await mcpLimitInput.fill('1800')
        await expect(mcpLimitInput).toHaveValue('1800')
        await expect(page.getByRole('button', { name: 'Spara' })).toHaveCount(0)
        await mcpLimitInput.blur()
        await expect(mcpLimitInput).toHaveValue('2048')

        await expect
          .poll(async () => (await getAiSettings(request)).mcpMaxRequestBytes)
          .toBe(oneStepLimit)
      })

      await test.step('increases from 2 MiB reach exactly the 10 MiB cap', async () => {
        for (let index = 0; index < 8; index += 1) {
          await increaseButton.click()
        }
        await expect(mcpLimitInput).toHaveValue('10240')

        await expect
          .poll(async () => (await getAiSettings(request)).mcpMaxRequestBytes)
          .toBe(MCP_REQUEST_PAYLOAD_MAX_BYTES)
      })
    } finally {
      if (shouldRestoreSettings) {
        await putAiSettings(request, {
          aiSafetyRuleCacheTtlSeconds: original.aiSafetyRuleCacheTtlSeconds,
          mcpImportMaxRows: original.mcpImportMaxRows,
          mcpImportValidationTtlMinutes: original.mcpImportValidationTtlMinutes,
          mcpMaxRequestBytes: original.mcpMaxRequestBytes,
          requirementGenerationEnabled: original.requirementGenerationEnabled,
        })
      }
    }
  })

  test('REQ-16: Admin Center disables AI requirement generation across requirements UI and open dialogs', async ({
    context,
    page,
    request,
  }) => {
    const original = await getAiSettings(request)
    let shouldRestoreSettings = false

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

      await putAiSettings(request, {
        aiSafetyRuleCacheTtlSeconds: original.aiSafetyRuleCacheTtlSeconds,
        mcpImportMaxRows: original.mcpImportMaxRows,
        mcpImportValidationTtlMinutes: original.mcpImportValidationTtlMinutes,
        mcpMaxRequestBytes: original.mcpMaxRequestBytes,
        requirementGenerationEnabled: true,
      })
      shouldRestoreSettings = true

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
      await expect
        .poll(
          async () =>
            (await getAiSettings(request)).requirementGenerationEnabled,
        )
        .toBe(false)

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
      if (shouldRestoreSettings) {
        await putAiSettings(request, {
          aiSafetyRuleCacheTtlSeconds: original.aiSafetyRuleCacheTtlSeconds,
          mcpImportMaxRows: original.mcpImportMaxRows,
          mcpImportValidationTtlMinutes: original.mcpImportValidationTtlMinutes,
          mcpMaxRequestBytes: original.mcpMaxRequestBytes,
          requirementGenerationEnabled: original.requirementGenerationEnabled,
        })
      }
    }
  })
})
