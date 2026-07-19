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
import type { AdminApplicationSettings } from '@/lib/application-settings'
import { getAiSettings, putAiSettings } from '../ai-settings-test-helpers'

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

async function getApplicationSettings(
  request: APIRequestContext,
): Promise<AdminApplicationSettings> {
  const response = await request.get('/api/admin/application-settings')
  expect(response.ok()).toBe(true)
  return (await response.json()) as AdminApplicationSettings
}

async function patchApplicationSetting(
  request: APIRequestContext,
  body: Record<string, number>,
) {
  const response = await request.patch('/api/admin/application-settings', {
    data: body,
  })
  expect(response.ok()).toBe(true)
}

test.describe('Admin settings', () => {
  test.use({ viewport: { height: 760, width: 1280 } })

  test('ADMIN-15: Settings keeps AI, Exports, and Reports ordered and autosaves one application setting', async ({
    page,
    request,
  }) => {
    const original = await getApplicationSettings(request)
    const changedLimit =
      original.csvExportMaxRequirements < 5000
        ? original.csvExportMaxRequirements + 1
        : original.csvExportMaxRequirements - 1

    try {
      await page.goto('/sv/admin?tab=settings')
      await expect(
        page.getByRole('tab', { name: 'Inställningar' }),
      ).toHaveAttribute('aria-selected', 'true')

      const panel = page.locator('#settings-panel')
      await expect(panel.locator('[aria-busy]')).toHaveAttribute(
        'aria-busy',
        'false',
      )
      await expect(page.locator('#admin-settings-ai-section')).toBeVisible()
      await expect(
        panel.getByRole('heading', { exact: true, name: 'Exporter' }),
      ).toBeVisible()
      await expect(
        panel.getByRole('heading', { exact: true, name: 'Rapporter' }),
      ).toBeVisible()

      const sectionOrder = await panel.evaluate(element => {
        const text = element.textContent ?? ''
        return {
          ai: text.indexOf('AI-assistering'),
          exports: text.indexOf('Exporter'),
          reports: text.indexOf('Rapporter'),
        }
      })
      expect(sectionOrder.ai).toBeGreaterThanOrEqual(0)
      expect(sectionOrder.exports).toBeGreaterThan(sectionOrder.ai)
      expect(sectionOrder.reports).toBeGreaterThan(sectionOrder.exports)

      const inputs = panel.locator('input[id^="admin-application-setting-"]')
      await expect(inputs).toHaveCount(9)
      const controlWidths = await inputs.evaluateAll(elements =>
        elements
          .filter(
            element =>
              element.id !==
                'admin-application-setting-csvExportMaxFileBytes' &&
              element.id !==
                'admin-application-setting-pdfReportMaxFileBytes' &&
              element.id !== 'admin-application-setting-pdfWorkerMemoryMib',
          )
          .map(element => element.parentElement?.getBoundingClientRect().width),
      )
      expect(new Set(controlWidths)).toEqual(new Set([176]))
      const mcpControlWidth = await panel
        .locator('#admin-ai-mcp-max-request-kib')
        .evaluate(
          element => element.parentElement?.getBoundingClientRect().width ?? 0,
        )
      for (const field of [
        'csvExportMaxFileBytes',
        'pdfReportMaxFileBytes',
        'pdfWorkerMemoryMib',
      ]) {
        const width = await panel
          .locator(`#admin-application-setting-${field}`)
          .evaluate(
            element =>
              element.parentElement?.getBoundingClientRect().width ?? 0,
          )
        expect(Math.abs(width - mcpControlWidth)).toBeLessThanOrEqual(4)
      }
      await expect(
        panel.locator('#admin-application-setting-csvExportMaxFileBytes'),
      ).toHaveValue(String(original.csvExportMaxFileBytes / (1024 * 1024)))
      await expect(
        panel.locator('#admin-application-setting-pdfWorkerMemoryMib'),
      ).toHaveValue(String(original.pdfWorkerMemoryMib))
      await expect(
        panel.locator('#admin-application-setting-pdfReportMaxFileBytes'),
      ).toHaveValue(String(original.pdfReportMaxFileBytes / (1024 * 1024)))
      const decreaseCsvFileSize = panel.getByRole('button', {
        name: 'Minska Högsta CSV-filstorlek',
      })
      await expect(decreaseCsvFileSize).toHaveAttribute(
        'title',
        'Minska Högsta CSV-filstorlek',
      )
      await expect(
        decreaseCsvFileSize.locator('.lucide-minus'),
      ).toHaveAttribute('aria-hidden', 'true')
      const increaseCsvFileSize = panel.getByRole('button', {
        name: 'Öka Högsta CSV-filstorlek',
      })
      await expect(increaseCsvFileSize).toHaveAttribute(
        'title',
        'Öka Högsta CSV-filstorlek',
      )
      await expect(increaseCsvFileSize.locator('.lucide-plus')).toHaveAttribute(
        'aria-hidden',
        'true',
      )
      await panel
        .getByRole('button', {
          name: 'Hjälp: Högsta CSV-filstorlek',
        })
        .click()
      await expect(
        panel.locator('#admin-application-setting-csvExportMaxFileBytes-help'),
      ).toContainText(/Använd minus eller plus för att ändra med 1 MiB/)
      const decreasePdfFileSize = panel.getByRole('button', {
        name: 'Minska Högsta PDF-filstorlek',
      })
      await expect(decreasePdfFileSize).toHaveAttribute(
        'title',
        'Minska Högsta PDF-filstorlek',
      )
      await expect(
        decreasePdfFileSize.locator('.lucide-minus'),
      ).toHaveAttribute('aria-hidden', 'true')
      const increasePdfFileSize = panel.getByRole('button', {
        name: 'Öka Högsta PDF-filstorlek',
      })
      await expect(increasePdfFileSize).toHaveAttribute(
        'title',
        'Öka Högsta PDF-filstorlek',
      )
      await expect(increasePdfFileSize.locator('.lucide-plus')).toHaveAttribute(
        'aria-hidden',
        'true',
      )
      await panel
        .getByRole('button', {
          name: 'Hjälp: Högsta PDF-filstorlek',
        })
        .click()
      await expect(
        panel.locator('#admin-application-setting-pdfReportMaxFileBytes-help'),
      ).toContainText(/Använd minus eller plus för att ändra med 1 MiB/)
      const decreaseWorkerMemory = panel.getByRole('button', {
        name: 'Minska Worker-minne per PDF-rendering',
      })
      await expect(decreaseWorkerMemory).toHaveAttribute(
        'title',
        'Minska Worker-minne per PDF-rendering',
      )
      await expect(
        decreaseWorkerMemory.locator('.lucide-minus'),
      ).toHaveAttribute('aria-hidden', 'true')
      const increaseWorkerMemory = panel.getByRole('button', {
        name: 'Öka Worker-minne per PDF-rendering',
      })
      await expect(increaseWorkerMemory).toHaveAttribute(
        'title',
        'Öka Worker-minne per PDF-rendering',
      )
      await expect(
        increaseWorkerMemory.locator('.lucide-plus'),
      ).toHaveAttribute('aria-hidden', 'true')
      await expect(
        panel
          .getByRole('button', { name: 'Sänk MCP-anropsgränsen' })
          .locator('.lucide-minus'),
      ).toHaveAttribute('aria-hidden', 'true')
      await expect(
        panel
          .getByRole('button', { name: 'Höj MCP-anropsgränsen' })
          .locator('.lucide-plus'),
      ).toHaveAttribute('aria-hidden', 'true')
      await panel
        .getByRole('button', {
          name: 'Hjälp: Worker-minne per PDF-rendering',
        })
        .click()
      await expect(
        panel.getByText(/Använd minus eller plus för att ändra med 128 MiB/),
      ).toBeVisible()
      await expect(
        panel.locator(
          '#admin-application-setting-csvExportMaxRequirements-unit',
        ),
      ).toHaveText('krav')
      await expect(
        panel.locator('#admin-application-setting-csvExportMaxFileBytes-unit'),
      ).toHaveText('MiB')
      await expect(
        panel.locator(
          '#admin-application-setting-csvExportConcurrencyPerNode-unit',
        ),
      ).toHaveText('exporter')
      await expect(
        panel.locator(
          '#admin-application-setting-csvExportTimeoutSeconds-unit',
        ),
      ).toHaveText('sekunder')
      await expect(
        panel.locator(
          '#admin-application-setting-pdfReportConcurrencyPerNode-unit',
        ),
      ).toHaveText('renderingar')
      await expect(
        panel.getByRole('button', {
          name: 'Hjälp: Högsta antal krav per CSV-export',
        }),
      ).toBeVisible()

      const csvLimit = page.locator(
        '#admin-application-setting-csvExportMaxRequirements',
      )
      await csvLimit.fill(String(changedLimit))
      await csvLimit.press('Enter')
      await expect(csvLimit).toHaveValue(String(changedLimit))
      await expect
        .poll(
          async () =>
            (await getApplicationSettings(request)).csvExportMaxRequirements,
        )
        .toBe(changedLimit)
      await expect(panel.getByText('Sparat', { exact: true })).toBeVisible()
    } finally {
      await patchApplicationSetting(request, {
        csvExportMaxRequirements: original.csvExportMaxRequirements,
      })
    }
  })

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
        aiSafetyForensicLoggingEnabled: original.aiSafetyForensicLoggingEnabled,
        mcpImportMaxRows: original.mcpImportMaxRows,
        mcpImportValidationTtlMinutes: original.mcpImportValidationTtlMinutes,
        mcpMaxRequestBytes: initialLimit,
        requirementGenerationEnabled: original.requirementGenerationEnabled,
      })
      shouldRestoreSettings = true

      await test.step('shows AI security between AI assistance and MCP controls', async () => {
        await page.goto('/sv/admin?tab=settings')
        const aiPanel = page.locator('#admin-settings-ai-section')
        await expect(aiPanel).toHaveCount(1)
        await expect(
          page.getByRole('tab', { name: 'Inställningar' }),
        ).toHaveAttribute('aria-selected', 'true')
        await expect(
          aiPanel.getByRole('checkbox', { name: /Kravgenerering/ }),
        ).toBeVisible()
        await expect(
          aiPanel.getByRole('heading', {
            exact: true,
            name: 'AI-assistering',
          }),
        ).toHaveCount(1)
        await expect(
          aiPanel.getByRole('heading', { exact: true, name: 'AI-säkerhet' }),
        ).toHaveCount(1)
        await expect(
          aiPanel.getByRole('checkbox', {
            name: /Logga forensisk AI-säkerhetsdata/,
          }),
        ).toBeVisible()
        await expect(
          aiPanel.getByRole('heading', {
            exact: true,
            name: 'AI-säkerhetsregler',
          }),
        ).toHaveCount(1)
        await expect(
          aiPanel.getByRole('heading', {
            exact: true,
            name: 'MCP-gränssnitt',
          }),
        ).toHaveCount(1)
        await expect(
          aiPanel.getByRole('spinbutton', { name: 'MCP-anropsgräns' }),
        ).toHaveCount(1)
        await expect(
          aiPanel.getByText(
            'Tillåtet intervall: 1 MiB till 10 MiB. Steg: 1 MiB.',
          ),
        ).toHaveCount(1)

        const panelTextOrder = await aiPanel.evaluate(panel => {
          const text = panel.textContent ?? ''
          return {
            aiAssistance: text.indexOf('AI-assistering'),
            aiSecurity: text.indexOf('AI-säkerhet'),
            forensicLogging: text.indexOf('Logga forensisk AI-säkerhetsdata'),
            limit: text.indexOf('MCP-anropsgräns'),
            mcpInterface: text.indexOf('MCP-gränssnitt'),
            requirementGeneration: text.indexOf('Kravgenerering'),
          }
        })
        expect(panelTextOrder.requirementGeneration).toBeGreaterThanOrEqual(0)
        expect(panelTextOrder.requirementGeneration).toBeGreaterThan(
          panelTextOrder.aiAssistance,
        )
        expect(panelTextOrder.aiSecurity).toBeGreaterThan(
          panelTextOrder.requirementGeneration,
        )
        expect(panelTextOrder.forensicLogging).toBeGreaterThan(
          panelTextOrder.aiSecurity,
        )
        expect(panelTextOrder.mcpInterface).toBeGreaterThan(
          panelTextOrder.forensicLogging,
        )
        expect(panelTextOrder.limit).toBeGreaterThan(
          panelTextOrder.mcpInterface,
        )
      })

      await test.step('keeps term-selection checkbox target circles separate', async () => {
        const aiPanel = page.locator('#admin-settings-ai-section')
        const ruleButton = aiPanel.getByRole('button', {
          name: 'Promptinjektion: instruktionsövertagande',
        })
        await ruleButton.click()
        const termCheckboxes = aiPanel.getByRole('checkbox', {
          name: /^Markera /,
        })
        expect(await termCheckboxes.count()).toBeGreaterThanOrEqual(2)

        const boxes = await termCheckboxes.all()
        for (let index = 1; index < boxes.length; index += 1) {
          const [previousBox, currentBox] = await Promise.all([
            boxes[index - 1].boundingBox(),
            boxes[index].boundingBox(),
          ])
          expect(previousBox).not.toBeNull()
          expect(currentBox).not.toBeNull()
          expect(
            Math.abs((currentBox?.y ?? 0) - (previousBox?.y ?? 0)),
          ).toBeGreaterThanOrEqual(24)
        }
      })

      await test.step('confirms before restoring safety-rule defaults', async () => {
        const aiPanel = page.locator('#admin-settings-ai-section')
        await aiPanel
          .getByRole('button', { name: 'Återställ standard' })
          .click()

        const dialog = page.getByRole('alertdialog', {
          name: 'Återställa standardord?',
        })
        await expect(dialog).toContainText(
          'Standardord aktiveras och återställs till sina standardriktningar.',
        )
        await dialog.getByRole('button', { name: 'Avbryt' }).click()
        await expect(dialog).toHaveCount(0)
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
          aiSafetyForensicLoggingEnabled:
            original.aiSafetyForensicLoggingEnabled,
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
      await page.goto('/sv/admin?tab=settings')
      await expect(
        page.getByRole('tab', { name: 'Inställningar' }),
      ).toHaveAttribute('aria-selected', 'true')
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
        aiSafetyForensicLoggingEnabled: original.aiSafetyForensicLoggingEnabled,
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

      await page.goto('/sv/admin?tab=settings')
      const refreshedGenerationToggle = page.locator(
        '#admin-ai-requirement-generation-enabled',
      )
      await expect(refreshedGenerationToggle).toBeEnabled()
      await expect(refreshedGenerationToggle).toBeChecked()
      await refreshedGenerationToggle.uncheck()
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
      const generationError = aiDialog
        .getByRole('heading', { name: 'Genereringen misslyckades' })
        .locator('..')
      await expect(
        generationError.getByText(
          'AI-kravgenerering är avstängd i Administrationscenter.',
        ),
      ).toBeVisible()
      await generatorPage.close()
    } finally {
      if (shouldRestoreSettings) {
        await putAiSettings(request, {
          aiSafetyRuleCacheTtlSeconds: original.aiSafetyRuleCacheTtlSeconds,
          aiSafetyForensicLoggingEnabled:
            original.aiSafetyForensicLoggingEnabled,
          mcpImportMaxRows: original.mcpImportMaxRows,
          mcpImportValidationTtlMinutes: original.mcpImportValidationTtlMinutes,
          mcpMaxRequestBytes: original.mcpMaxRequestBytes,
          requirementGenerationEnabled: original.requirementGenerationEnabled,
        })
      }
    }
  })
})
