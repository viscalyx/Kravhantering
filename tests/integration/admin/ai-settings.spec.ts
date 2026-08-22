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
import {
  ADMIN_20_CONNECTION_NAME,
  ADMIN_20_MODEL_NAME,
  prepareAdmin20Fixture,
} from './ai-connection-test-fixture'

async function mockAiDialogReferenceData(page: Page) {
  await page.route('**/api/ai/authoring-profiles', async route => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        enabled: true,
        profiles: {
          generate_with_images: {
            available: true,
            connectionName: 'Godkänd AI-tjänst',
            dataPolicySummary: 'Behandling inom EU; ingen träning',
          },
          generate_without_images: {
            available: true,
            connectionName: 'Godkänd AI-tjänst',
            dataPolicySummary: 'Behandling inom EU; ingen träning',
          },
          repair_invalid_import_json: {
            available: true,
            connectionName: 'Godkänd AI-tjänst',
            dataPolicySummary: 'Behandling inom EU; ingen träning',
          },
        },
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

  test('ADMIN-15: Settings exposes limits and autosaves one application setting', async ({
    page,
    request,
  }) => {
    const original = await getApplicationSettings(request)
    const changedLimit =
      original.csvExportMaxItems < 5000
        ? original.csvExportMaxItems + 1
        : original.csvExportMaxItems - 1

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
      const importsHeading = panel.getByRole('heading', {
        exact: true,
        name: 'Importer',
      })
      await expect(importsHeading).toBeVisible()
      await expect(
        panel.getByRole('heading', { exact: true, name: 'Exporter' }),
      ).toBeVisible()
      await expect(
        panel.getByRole('heading', { exact: true, name: 'Rapporter' }),
      ).toBeVisible()
      const sectionOrder = await panel
        .locator(
          '#admin-settings-ai-section, [aria-labelledby="admin-settings-imports-title"], [aria-labelledby="admin-settings-exports-title"], [aria-labelledby="admin-settings-reports-title"]',
        )
        .evaluateAll(sections =>
          sections.map(
            section => section.getAttribute('aria-labelledby') ?? section.id,
          ),
        )
      expect(sectionOrder).toEqual([
        'admin-settings-ai-title',
        'admin-settings-imports-title',
        'admin-settings-exports-title',
        'admin-settings-reports-title',
      ])

      const inputs = panel.locator('input[id^="admin-application-setting-"]')
      await expect(inputs).toHaveCount(14)
      await expect(
        panel.locator('#admin-application-setting-requirementImportMaxRows'),
      ).toHaveValue(String(original.requirementImportMaxRows))
      await expect(
        panel.locator(
          '#admin-application-setting-requirementImportMaxNestedItems',
        ),
      ).toHaveValue(String(original.requirementImportMaxNestedItems))
      await expect(
        panel.locator(
          '#admin-application-setting-requirementImportMaxJsonDepth',
        ),
      ).toHaveValue(String(original.requirementImportMaxJsonDepth))
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
      const increaseCsvFileSize = panel.getByRole('button', {
        name: 'Öka Högsta CSV-filstorlek',
      })
      await expect(increaseCsvFileSize).toHaveAttribute(
        'title',
        'Öka Högsta CSV-filstorlek',
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
      const increasePdfFileSize = panel.getByRole('button', {
        name: 'Öka Högsta PDF-filstorlek',
      })
      await expect(increasePdfFileSize).toHaveAttribute(
        'title',
        'Öka Högsta PDF-filstorlek',
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
      const increaseWorkerMemory = panel.getByRole('button', {
        name: 'Öka Worker-minne per PDF-rendering',
      })
      await expect(increaseWorkerMemory).toHaveAttribute(
        'title',
        'Öka Worker-minne per PDF-rendering',
      )
      await panel
        .getByRole('button', {
          name: 'Hjälp: Worker-minne per PDF-rendering',
        })
        .click()
      await expect(
        panel.getByText(/Använd minus eller plus för att ändra med 128 MiB/),
      ).toBeVisible()
      await expect(
        panel.locator('#admin-application-setting-csvExportMaxItems-unit'),
      ).toHaveText('CSV-rader')
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
          name: 'Hjälp: Högsta antal rader per CSV-export',
        }),
      ).toBeVisible()

      const csvLimit = page.locator(
        '#admin-application-setting-csvExportMaxItems',
      )
      await csvLimit.fill(String(changedLimit))
      await csvLimit.press('Enter')
      await expect(csvLimit).toHaveValue(String(changedLimit))
      await expect
        .poll(
          async () => (await getApplicationSettings(request)).csvExportMaxItems,
        )
        .toBe(changedLimit)
      await expect(panel.getByText('Sparat', { exact: true })).toBeVisible()
    } finally {
      await patchApplicationSetting(request, {
        csvExportMaxItems: original.csvExportMaxItems,
      })
    }
  })

  test('REQ-16C: enforces every schema-derived import budget boundary', async ({
    request,
  }) => {
    const original = await getApplicationSettings(request)
    const originalAi = await getAiSettings(request)
    const changedBudget = {
      requirementImportMaxJsonDepth: 4,
      requirementImportMaxNestedItems: 2,
      requirementImportMaxProposedNeedsReferences: 2,
      requirementImportMaxProposedNormReferences: 2,
      requirementImportMaxRows: 2,
    } as const
    const areasResponse = await request.get('/api/requirement-areas')
    expect(areasResponse.ok()).toBe(true)
    const areasPayload = (await areasResponse.json()) as {
      areas: Array<{ id: number }>
    }
    const areaId = areasPayload.areas[0]?.id
    if (!areaId) throw new Error('REQ-16C requires one seeded requirement area')

    const proposedNormReferences = Array.from({ length: 2 }, (_, index) => ({
      issuer: 'Playwright',
      key: `REQ-16C-NORM-${index}`,
      name: `REQ-16C norm ${index}`,
      reference: `REQ-16C-${index}`,
      type: 'Test reference',
    }))
    const proposedNeedsReferences = Array.from({ length: 2 }, (_, index) => ({
      key: `REQ-16C-NEED-${index}`,
      text: `REQ-16C need ${index}`,
    }))
    const exactPayload = {
      proposedNeedsReferences,
      proposedNormReferences,
      requirements: Array.from({ length: 2 }, (_, index) => ({
        description: `REQ-16C exact requirement ${index}`,
        proposedNormReferenceKeys: proposedNormReferences.map(
          proposal => proposal.key,
        ),
      })),
      schemaVersion: 'requirement-import.v4',
    }
    const preview = (payload: unknown) =>
      request.post('/api/requirements/import/preview', {
        data: { areaId, locale: 'sv', payload },
      })

    try {
      for (const [field, value] of Object.entries(changedBudget)) {
        await patchApplicationSetting(request, { [field]: value })
      }

      const schemaResponse = await request.get(
        '/api/requirements/import/schema?locale=sv',
      )
      expect(schemaResponse.ok()).toBe(true)
      await expect(schemaResponse.json()).resolves.toMatchObject({
        'x-requirement-import-budget': {
          maxJsonDepth: changedBudget.requirementImportMaxJsonDepth,
          maxNestedItems: changedBudget.requirementImportMaxNestedItems,
          maxProposedNeedsReferences:
            changedBudget.requirementImportMaxProposedNeedsReferences,
          maxProposedNormReferences:
            changedBudget.requirementImportMaxProposedNormReferences,
          maxRows: changedBudget.requirementImportMaxRows,
        },
      })

      const exact = await preview(exactPayload)
      expect(exact.ok()).toBe(true)

      const oneOverCases: Array<[string, unknown, string]> = [
        [
          'rows',
          {
            ...exactPayload,
            requirements: [
              ...exactPayload.requirements,
              { description: 'REQ-16C row over limit' },
            ],
          },
          'import_row_count_cap_exceeded',
        ],
        [
          'proposed norm references',
          {
            ...exactPayload,
            proposedNormReferences: [
              ...proposedNormReferences,
              {
                issuer: 'Playwright',
                key: 'REQ-16C-NORM-OVER',
                name: 'REQ-16C norm over limit',
                reference: 'REQ-16C-OVER',
                type: 'Test reference',
              },
            ],
          },
          'import_proposed_norm_reference_count_cap_exceeded',
        ],
        [
          'proposed needs references',
          {
            ...exactPayload,
            proposedNeedsReferences: [
              ...proposedNeedsReferences,
              { key: 'REQ-16C-NEED-OVER', text: 'Need over limit' },
            ],
          },
          'import_proposed_needs_reference_count_cap_exceeded',
        ],
        [
          'nested items',
          {
            ...exactPayload,
            requirements: [
              {
                description: 'REQ-16C nested over limit',
                proposedNormReferenceKeys: ['one', 'two', 'three'],
              },
            ],
          },
          'import_nested_collection_cap_exceeded',
        ],
        [
          'JSON depth',
          {
            requirements: [
              {
                description: 'REQ-16C depth over limit',
                nested: { values: [] },
              },
            ],
            schemaVersion: 'requirement-import.v4',
          },
          'import_json_depth_cap_exceeded',
        ],
      ]
      for (const [name, payload, code] of oneOverCases) {
        await test.step(`rejects one over ${name}`, async () => {
          const response = await preview(payload)
          expect(response.status()).toBe(422)
          await expect(response.json()).resolves.toMatchObject({ code })
        })
      }
    } finally {
      for (const field of Object.keys(changedBudget) as Array<
        keyof typeof changedBudget
      >) {
        await patchApplicationSetting(request, { [field]: original[field] })
      }
      await putAiSettings(request, {
        aiSafetyRuleCacheTtlSeconds: originalAi.aiSafetyRuleCacheTtlSeconds,
        mcpImportMaxRows: originalAi.mcpImportMaxRows,
        mcpImportValidationTtlMinutes: originalAi.mcpImportValidationTtlMinutes,
        mcpMaxRequestBytes: originalAi.mcpMaxRequestBytes,
        requirementGenerationEnabled: originalAi.requirementGenerationEnabled,
      })
    }
  })

  test('ADMIN-17/REQ-16B: Admin Center controls MCP request and session limits', async ({
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
          aiPanel.getByRole('spinbutton', {
            name: 'Aktiva sessioner per principal',
          }),
        ).toHaveValue(String(original.mcpImportMaxActiveSessionsPerPrincipal))
        await expect(
          aiPanel.getByRole('spinbutton', {
            name: 'Aktiva sessioner per mål',
          }),
        ).toHaveValue(String(original.mcpImportMaxActiveSessionsPerDestination))
        await expect(
          aiPanel.getByRole('spinbutton', {
            name: 'Sessionsskapanden per 10 minuter',
          }),
        ).toHaveValue(String(original.mcpImportMaxCreationsPerWindow))
        await expect(
          aiPanel.getByRole('spinbutton', {
            name: 'Reserverad lagring för valideringssessioner',
          }),
        ).toHaveValue(String(original.mcpImportMaxReservedBytes / 1024 / 1024))
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
        expect(panelTextOrder.mcpInterface).toBeGreaterThan(
          panelTextOrder.aiSecurity,
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

      await test.step('direct-saves a principal session quota', async () => {
        const quotaInput = page.getByRole('spinbutton', {
          name: 'Aktiva sessioner per principal',
        })
        const nextQuota =
          original.mcpImportMaxActiveSessionsPerPrincipal === 100
            ? 99
            : original.mcpImportMaxActiveSessionsPerPrincipal + 1
        await quotaInput.fill(String(nextQuota))
        await quotaInput.blur()
        await expect
          .poll(
            async () =>
              (await getAiSettings(request))
                .mcpImportMaxActiveSessionsPerPrincipal,
          )
          .toBe(nextQuota)
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
          mcpImportMaxActiveSessionsPerPrincipal:
            original.mcpImportMaxActiveSessionsPerPrincipal,
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
          mcpImportMaxRows: original.mcpImportMaxRows,
          mcpImportValidationTtlMinutes: original.mcpImportValidationTtlMinutes,
          mcpMaxRequestBytes: original.mcpMaxRequestBytes,
          requirementGenerationEnabled: original.requirementGenerationEnabled,
        })
      }
    }
  })

  test('ADMIN-21: A failed AI action stays visible with action and server error', async ({
    page,
  }) => {
    await test.step('set up the failed catalog route', async () => {
      await page.route('**/api/admin/ai-connections/*/actions', async route => {
        const body = route.request().postDataJSON() as { action?: unknown }
        if (body.action === 'fetch_catalog') {
          await route.fulfill({
            contentType: 'application/json',
            json: {
              error: 'The AI connection trust policy blocked the request.',
            },
            status: 500,
          })
          return
        }
        await route.fallback()
      })
    })

    const alert = await test.step('trigger the catalog action', async () => {
      await page.goto('/sv/admin?tab=settings')
      const settings = page.locator('#settings-panel')
      await expect(
        settings.locator(':scope > div[aria-busy]').first(),
      ).toHaveAttribute('aria-busy', 'false')
      const connectionCard = settings
        .locator('article')
        .filter({ hasText: 'OpenRouter demo' })
        .first()
      await connectionCard
        .getByRole('button', { name: /^OpenRouter demo OpenRouter/ })
        .click()
      await connectionCard
        .getByRole('button', { name: 'Läs modellkatalog' })
        .click()
      return settings.getByRole('alert')
    })

    await test.step('validate the action alert', async () => {
      await expect(alert).toContainText(
        'Åtgärden "Läs modellkatalog" misslyckades. Fel: The AI connection trust policy blocked the request.',
      )
      await expect(alert).toBeInViewport()
      await expect(alert.locator('..')).toHaveCSS('position', 'fixed')
      await expect(alert).not.toContainText(
        'Failed to perform AI connection action.',
      )
    })

    await test.step('dismiss the action alert', async () => {
      await alert.getByRole('button', { name: 'Stäng' }).click()
      await expect(alert).toHaveCount(0)
    })
  })

  for (const viewport of [
    { height: 760, name: 'desktop', width: 1280 },
    { height: 812, name: 'mobile', width: 375 },
  ] as const) {
    test(`ADMIN-20 (${viewport.name}): Admin verifies a model and controls a stable AI profile`, async ({
      page,
    }) => {
      test.setTimeout(180_000)
      const cleanup = await prepareAdmin20Fixture()
      const administrationName = ADMIN_20_CONNECTION_NAME
      const modelName = ADMIN_20_MODEL_NAME

      try {
        await page.setViewportSize(viewport)
        await page.goto('/sv/admin?tab=settings')
        const settings = page.locator('#settings-panel')
        await expect(
          settings.locator(':scope > div[aria-busy]').first(),
        ).toHaveAttribute('aria-busy', 'false')

        const connectionCard =
          await test.step('connection creation', async () => {
            await settings
              .getByRole('button', { name: 'Lägg till AI-anslutning' })
              .click()
            const connectionDialog = page.getByRole('dialog', {
              name: 'Lägg till AI-anslutning',
            })
            await connectionDialog
              .getByLabel(/^Administrationsnamn/)
              .fill(administrationName)
            await connectionDialog
              .getByLabel(/^Publikt namn/)
              .fill(administrationName)
            await connectionDialog
              .getByLabel(/^Adapternyckel/)
              .fill('controlled_test')
            await connectionDialog.getByLabel(/^Adapterversion/).fill('1')
            await connectionDialog
              .getByLabel(/^Anslutningsadress/)
              .fill('https://localhost:4443')
            await connectionDialog
              .getByLabel(/^TLS-policy/)
              .fill('controlled_test')
            await connectionDialog
              .getByLabel(/^Egress-policy/)
              .fill('controlled_test')
            await connectionDialog
              .getByLabel(/^Autentisering/)
              .selectOption('static_secret')
            await connectionDialog
              .getByLabel(/^Sammanfattning av datapolicy/)
              .fill('Intern information, ingen persondata och ingen lagring.')
            await connectionDialog
              .getByRole('button', { name: 'Spara anslutning' })
              .click()
            await expect(connectionDialog).toHaveCount(0)

            const card = settings
              .locator('article')
              .filter({ hasText: administrationName })
              .first()
            await expect(card).toBeVisible()
            await card
              .getByRole('button', { name: new RegExp(administrationName) })
              .click()
            return card
          })

        await test.step('secret activation', async () => {
          await connectionCard
            .getByRole('button', { name: 'Hantera hemlighet' })
            .click()
          const secretDialog = page.getByRole('dialog', {
            name: 'Leverantörshemlighet',
          })
          await secretDialog
            .getByLabel(/^Ny leverantörshemlighet/)
            .fill('pw-admin-20-controlled-secret')
          await secretDialog
            .getByRole('button', { name: 'Spara ny hemlighet' })
            .click()
          await expect(
            secretDialog.getByText(
              'Den nya krypterade leverantörshemligheten är klar för verifiering och aktivering.',
            ),
          ).toBeVisible()
          await secretDialog
            .getByRole('button', {
              name: 'Verifiera och aktivera ny hemlighet',
            })
            .click()
          await expect(secretDialog).toHaveCount(0)
        })

        await test.step('attestation', async () => {
          await connectionCard
            .getByRole('button', { name: 'Hantera attest' })
            .click()
          const attestationDialog = page.getByRole('dialog', {
            name: 'Anslutningsattest',
          })
          await attestationDialog
            .getByLabel(/^Organisationsenhetens referens-id/)
            .fill(crypto.randomUUID())
          await attestationDialog
            .getByLabel(/^Leverantörsnamn/)
            .fill('Kontrollerad testadapter')
          await attestationDialog
            .getByLabel(/^Högsta informationsklass/)
            .fill('internal')
          await attestationDialog
            .getByLabel(/^Högsta lagringstid i dagar/)
            .fill('0')
          await attestationDialog.getByLabel(/^Behandlingsregioner/).fill('SE')
          await attestationDialog
            .getByLabel(/^Incidentprocessens referens-id/)
            .fill(crypto.randomUUID())
          await attestationDialog
            .getByLabel(/^Beslutsreferens/)
            .fill('PW-ADMIN-20')
          await attestationDialog
            .getByLabel(/^Granskad vid/)
            .fill('2026-08-22T00:00:00.000Z')
          await attestationDialog
            .getByLabel(/^Nästa granskning/)
            .fill('2099-08-22T00:00:00.000Z')
          await attestationDialog
            .getByLabel(/^Behandlar personuppgifter/)
            .selectOption('false')
          await attestationDialog
            .getByLabel(/^Leverantörsträning tillåten/)
            .selectOption('false')
          await attestationDialog
            .getByLabel(/^Godkänt syfte/)
            .fill('Verifiera stabila körprofiler.')
          await attestationDialog
            .getByRole('button', { name: 'Spara attestutkast' })
            .click()
          await attestationDialog
            .getByRole('button', { name: 'Godkänn sparad attest' })
            .click()
          await expect(attestationDialog).toHaveCount(0)
        })

        const { modelDialog, saveModelRevision } =
          await test.step('model verification and cancellation', async () => {
            await connectionCard
              .getByRole('button', { name: 'Lägg till modell' })
              .click()
            const dialog = page.getByRole('dialog', {
              name: 'Lägg till anslutningsmodell',
            })
            await dialog.getByLabel(/^Modellnamn/).fill(modelName)
            await dialog
              .getByLabel(/^Externt modell-id/)
              .fill('controlled/model')
            await dialog.getByLabel(/^Extern modellversion/).fill('2026-08-22')
            await expect(
              dialog.getByText('Inte testad', { exact: true }),
            ).toHaveCount(7)
            await expect(
              dialog.getByRole('button', { name: 'Spara modellrevision' }),
            ).toBeDisabled()

            const verificationRoute = '**/api/admin/ai-connections/*/actions'
            let releaseFirstVerification: () => void = () => undefined
            const firstVerificationRelease = new Promise<void>(resolve => {
              releaseFirstVerification = resolve
            })
            let markFirstVerificationStarted: () => void = () => undefined
            const firstVerificationStarted = new Promise<void>(resolve => {
              markFirstVerificationStarted = resolve
            })
            let holdFirstVerification = true
            const delayedVerification = async (route: Route) => {
              const body = route.request().postDataJSON() as { action?: string }
              if (
                holdFirstVerification &&
                body.action === 'verify_model_candidate'
              ) {
                holdFirstVerification = false
                markFirstVerificationStarted()
                await firstVerificationRelease
              }
              await route.continue().catch(() => undefined)
            }
            await page.route(verificationRoute, delayedVerification)
            try {
              await dialog.getByRole('button', { name: 'Verifiera' }).click()
              await firstVerificationStarted
              await expect(
                dialog.getByRole('button', { name: 'Avbryt verifiering' }),
              ).toBeVisible()
              await dialog
                .getByRole('button', { name: 'Avbryt verifiering' })
                .click()
            } finally {
              releaseFirstVerification()
              await page.unroute(verificationRoute, delayedVerification)
            }
            await expect(
              dialog.getByRole('button', { name: 'Verifiera' }),
            ).toBeVisible()

            await dialog.getByRole('button', { name: 'Verifiera' }).click()
            await expect(
              dialog.getByText(
                'Verifieringen är klar. Granska resultatet och spara modellrevisionen separat.',
              ),
            ).toBeVisible()
            await expect(
              dialog.getByText('Verifierad', { exact: true }),
            ).toHaveCount(9)
            await expect(
              dialog.getByText('Kravgenerering utan bilder: Stöds'),
            ).toBeVisible()
            await expect(
              dialog
                .getByRole('group', { name: 'Verifieringsförlopp' })
                .getByRole('listitem'),
            ).toHaveText([
              /Anslutning och autentisering — Verifierad/,
              /Grundläggande modellåtkomst — Verifierad/,
              /Förmåga: AI-analys — Verifierad/,
              /Förmåga: kostnad — Verifierad/,
              /Förmåga: bildindata — Verifierad/,
              /Förmåga: styrning med JSON-schema — Verifierad/,
              /Förmåga: strömning — Verifierad/,
              /Förmåga: tokenanvändning — Verifierad/,
              /Förmåga: validerbar JSON — Verifierad/,
              /Körprofil: generering utan bilder — Verifierad/,
              /Körprofil: generering med bilder — Verifierad/,
              /Körprofil: reparation av ogiltig JSON — Verifierad/,
              /Slutsammanfattning — Verifierad/,
            ])
            return {
              modelDialog: dialog,
              saveModelRevision: dialog.getByRole('button', {
                name: 'Spara modellrevision',
              }),
            }
          })
        await test.step('revision saving', async () => {
          await modelDialog
            .getByLabel(/^Modellnamn/)
            .fill(`${modelName} presentation`)
          await expect(saveModelRevision).toBeEnabled()
          await modelDialog.getByLabel(/^Modellnamn/).fill(modelName)
          await modelDialog
            .getByLabel(/^Extern modellversion/)
            .fill('2026-08-22-technical-change')
          await expect(saveModelRevision).toBeDisabled()
          await expect(
            modelDialog.getByText('Inte testad', { exact: true }),
          ).toHaveCount(7)
          await modelDialog
            .getByLabel(/^Extern modellversion/)
            .fill('2026-08-22')
          await modelDialog.getByRole('button', { name: 'Verifiera' }).click()
          await expect(saveModelRevision).toBeEnabled()
          await saveModelRevision.click()
          await expect(modelDialog).toHaveCount(0)
        })

        await test.step('connection activation', async () => {
          await connectionCard
            .getByRole('button', { name: 'Aktivera anslutning' })
            .click()
          await expect(
            connectionCard.getByText('Aktiv', { exact: true }),
          ).toBeVisible()
        })

        const profileCard = await test.step('profile editing', async () => {
          const card = settings
            .locator('article')
            .filter({ hasText: 'Kravgenerering utan bilder' })
            .last()
          await card.getByRole('button', { name: 'Redigera körprofil' }).click()
          const profileDialog = page.getByRole('dialog', {
            name: 'Körprofil',
          })
          const modelSelect = profileDialog.getByLabel(/^Modellrevision/)
          await expect(modelSelect.locator('option')).toHaveCount(2)
          await modelSelect.selectOption({ index: 1 })
          const modelOptionValue = await modelSelect.inputValue()
          await expect(
            modelSelect.locator(`option[value="${modelOptionValue}"]`),
          ).toContainText(`${modelName} · 1 — Rekommenderad`)
          await profileDialog.getByText('Avancerade driftbudgetar').click()
          await expect(
            profileDialog.getByLabel(/^Maximalt antal utdatatoken/),
          ).toBeVisible()
          const totalBudget = profileDialog.getByLabel(/^Total tidsbudget/)
          const originalTotalBudget = await totalBudget.inputValue()
          const saveProfile = profileDialog.getByRole('button', {
            name: 'Spara',
          })
          await totalBudget.fill('')
          await expect(saveProfile).toBeDisabled()
          await totalBudget.fill(originalTotalBudget)
          await expect(saveProfile).toBeEnabled()
          await saveProfile.click()
          await expect(profileDialog).toHaveCount(0)
          await expect(card.getByRole('status')).toHaveText('Aktiv')
          await card.getByRole('button', { name: 'Redigera körprofil' }).click()
          await expect(profileDialog).toContainText(
            'Sparade ändringar börjar gälla direkt för nya körningar. Pågående körningar behåller konfigurationen som togs när de startade.',
          )
          await profileDialog.getByRole('button', { name: 'Stäng' }).click()
          await expect(profileDialog).toHaveCount(0)
          return card
        })

        await test.step('pause and resume', async () => {
          await profileCard
            .getByRole('button', { name: 'Pausa körprofil' })
            .click()
          const pauseDialog = page.getByRole('alertdialog', {
            name: 'Pausa körprofil?',
          })
          await expect(pauseDialog).toContainText(
            'Pausning avbryter köade och pågående körningar för profilen. Avbrutna körningar startas inte om när profilen återupptas.',
          )
          await pauseDialog
            .getByRole('button', { name: 'Pausa körprofil' })
            .click()
          await expect(profileCard.getByRole('status')).toHaveText('Pausad')
          await profileCard.getByRole('button', { name: 'Återuppta' }).click()
          await expect(profileCard.getByRole('status')).toHaveText('Aktiv')
        })

        const modelCard = await test.step('dependency handling', async () => {
          const card = connectionCard
            .locator('section')
            .filter({ hasText: modelName })
            .first()
          const endRevisionButton = card.getByRole('button', {
            name: 'Avsluta revision',
          })
          await expect(endRevisionButton).toBeDisabled()
          await expect(endRevisionButton).toHaveAttribute(
            'title',
            'Modellen används av en körprofil. Ta bort den från profilen eller välj en annan modell först.',
          )
          await expect(
            connectionCard
              .getByRole('heading', { name: 'Påverkan på körprofiler' })
              .locator('..'),
          ).toContainText('Kravgenerering utan bilder')

          await profileCard
            .getByRole('button', { name: 'Redigera körprofil' })
            .click()
          const profileDialog = page.getByRole('dialog', { name: 'Körprofil' })
          await profileDialog
            .getByRole('button', { name: 'Koppla bort modell' })
            .click()
          await profileDialog.getByRole('button', { name: 'Spara' }).click()
          await expect(profileDialog).toHaveCount(0)
          await expect(profileCard.getByRole('status')).toHaveText(
            'Ej konfigurerad',
          )
          await expect(
            profileCard.getByRole('button', { name: 'Pausa körprofil' }),
          ).toHaveCount(0)
          return card
        })

        await test.step('revision ending', async () => {
          await modelCard
            .getByRole('button', { name: 'Avsluta revision' })
            .click()
          const endDialog = page.getByRole('alertdialog', {
            name: 'Avsluta modellrevision?',
          })
          await endDialog
            .getByRole('button', { name: 'Avsluta revision' })
            .click()
          await expect(
            modelCard.getByText('Avslutad', { exact: true }),
          ).toBeVisible()
        })

        await test.step('permanent deletion', async () => {
          await modelCard
            .getByRole('button', { name: 'Radera permanent' })
            .click()
          const deleteDialog = page.getByRole('alertdialog', {
            name: 'Radera modellrevision permanent?',
          })
          await expect(deleteDialog).toContainText(
            'Anslutningsmodellen raderas också eftersom inga revisioner återstår.',
          )
          await deleteDialog
            .getByRole('button', { name: 'Radera permanent' })
            .click()
          await expect(
            connectionCard.getByText(modelName, { exact: true }),
          ).toHaveCount(0)
        })
      } finally {
        await cleanup()
      }
    })
  }
})
