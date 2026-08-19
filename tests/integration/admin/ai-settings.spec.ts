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

  for (const viewport of [
    { height: 760, name: 'desktop', width: 1280 },
    { height: 812, name: 'mobile', width: 375 },
  ] as const) {
    test(`ADMIN-20 (${viewport.name}): Admin activates and safely recovers a controlled AI connection`, async ({
      page,
    }) => {
      const cleanup = await prepareAdmin20Fixture()
      const administrationName = ADMIN_20_CONNECTION_NAME
      const modelName = ADMIN_20_MODEL_NAME
      const reviewedAt = '2026-08-18T00:00:00.000Z'
      const reviewDueAt = '2099-08-19T00:00:00.000Z'

      try {
        await page.setViewportSize(viewport)
        await test.step('create a collapsed controlled-test connection', async () => {
          await page.goto('/sv/admin?tab=settings')
          const settings = page.locator('#settings-panel')
          await expect(settings.locator('[aria-busy]')).toHaveAttribute(
            'aria-busy',
            'false',
          )
          await expect(
            settings.getByText(
              'Anrop växlar aldrig automatiskt till en annan anslutning eller modell.',
              { exact: false },
            ),
          ).toHaveCount(1)
          await settings
            .getByRole('button', { name: 'Lägg till AI-anslutning' })
            .click()
          const dialog = page.getByRole('dialog', {
            name: 'Lägg till AI-anslutning',
          })
          await dialog
            .getByLabel(/^Administrationsnamn/)
            .fill(administrationName)
          await dialog.getByLabel(/^Publikt namn/).fill(administrationName)
          await dialog.getByLabel(/^Adapternyckel/).fill('controlled_test')
          await dialog.getByLabel(/^Adapterversion/).fill('1')
          await dialog
            .getByLabel(/^Anslutningsadress/)
            .fill('https://localhost:4443')
          await dialog.getByLabel(/^TLS-policy/).fill('controlled_test')
          await dialog.getByLabel(/^Egress-policy/).fill('controlled_test')
          await dialog
            .getByLabel(/^Autentisering/)
            .selectOption({ value: 'static_secret' })
          await dialog
            .getByLabel(/^Beskrivning/)
            .fill('Kontrollerad aktivering utan produktionsdata.')
          await dialog
            .getByLabel(/^Sammanfattning av datapolicy/)
            .fill('Intern information, ingen persondata och ingen lagring.')
          await dialog.getByRole('button', { name: 'Spara anslutning' }).click()
          await expect(dialog).toHaveCount(0)

          const row = settings.getByRole('button').filter({
            hasText: administrationName,
          })
          await expect(row).toHaveAttribute('aria-expanded', 'false')
          await row.click()
          await expect(row).toHaveAttribute('aria-expanded', 'true')
          const detailsId = await row.getAttribute('aria-controls')
          expect(detailsId).not.toBeNull()
          const details = page.locator(`#${detailsId}`)
          await expect(
            details.getByText('Detta är seedad demonstrationsdata', {
              exact: false,
            }),
          ).toHaveCount(0)
          await expect(
            details.getByText('begränsade anrop', { exact: false }),
          ).toHaveCount(1)
          await expect(
            details.getByText('Återställning är manuell', { exact: false }),
          ).toHaveCount(1)
        })

        const connectionRow = page.getByRole('button').filter({
          hasText: administrationName,
        })
        const detailsId = await connectionRow.getAttribute('aria-controls')
        expect(detailsId).not.toBeNull()
        const details = page.locator(`#${detailsId}`)

        await test.step('confirm secrets remain write-only', async () => {
          await details
            .getByRole('button', { name: 'Hantera hemlighet' })
            .click()
          const dialog = page.getByRole('dialog', {
            name: 'Leverantörshemlighet',
          })
          await expect(
            dialog.getByText('kan bara anges, inte läsas', { exact: false }),
          ).toHaveCount(1)
          const secret = dialog.getByLabel(/^Ny leverantörshemlighet/)
          await expect(secret).toHaveAttribute('type', 'password')
          await expect(secret).toHaveValue('')
          await secret.fill('synthetic-controlled-test-credential')
          await dialog
            .getByRole('button', { name: 'Spara hemlighetskandidat' })
            .click()
          await expect(secret).toHaveValue('')
          await expect(dialog).not.toContainText(
            'synthetic-controlled-test-credential',
          )
          await dialog
            .getByRole('button', { name: 'Aktivera kandidat' })
            .click()
          await dialog.getByRole('button', { name: 'Avbryt' }).click()
          await expect(dialog).toHaveCount(0)
        })

        await test.step('save and approve the connection attestation', async () => {
          await details.getByRole('button', { name: 'Hantera attest' }).click()
          const dialog = page.getByRole('dialog', { name: 'Anslutningsattest' })
          await dialog
            .getByLabel(/^Ansvarig organisationsenhets-id/)
            .fill(crypto.randomUUID())
          await dialog
            .getByLabel(/^Leverantörsnamn/)
            .fill('Kontrollerad testadapter')
          await dialog.getByLabel(/^Högsta informationsklass/).fill('internal')
          await dialog.getByLabel(/^Högsta lagringstid i dagar/).fill('0')
          await dialog.getByLabel(/^Behandlingsregioner/).fill('SE')
          await dialog
            .getByLabel(/^Referens-id för incidenthantering/)
            .fill(crypto.randomUUID())
          await dialog.getByLabel(/^Beslutsreferens/).fill('PW-ADMIN-20')
          await dialog.getByLabel(/^Granskad vid/).fill(reviewedAt)
          await dialog.getByLabel(/^Nästa granskning/).fill(reviewDueAt)
          await dialog
            .getByLabel(/^Behandlar personuppgifter/)
            .selectOption('false')
          await dialog
            .getByLabel(/^Leverantörsträning tillåten/)
            .selectOption('false')
          await dialog
            .getByLabel(/^Godkänt syfte/)
            .fill('Verifiera Admin Centers aktiveringsflöde.')
          await dialog
            .getByRole('button', { name: 'Spara attestutkast' })
            .click()
          await dialog
            .getByRole('button', { name: 'Godkänn sparad attest' })
            .click()
          await expect(dialog).toHaveCount(0)
        })

        await test.step('add and verify a controlled model revision', async () => {
          await details
            .getByRole('button', { name: 'Lägg till modell' })
            .click()
          const dialog = page.getByRole('dialog', {
            name: 'Lägg till anslutningsmodell',
          })
          await dialog.getByLabel(/^Modellnamn/).fill(modelName)
          await dialog.getByLabel(/^Externt modell-id/).fill('controlled/model')
          for (const capability of [
            'Styrning med JSON-schema',
            'Strömning',
            'Validerbar JSON',
          ]) {
            await dialog.getByRole('checkbox', { name: capability }).check()
          }
          await dialog
            .getByRole('button', { name: 'Spara modellutkast' })
            .click()
          await expect(dialog).toHaveCount(0)

          await details
            .getByRole('button', { name: 'Verifiera anslutning' })
            .click()
          await expect(
            page.getByText(
              'Den aktuella anslutningskonfigurationen verifierades.',
            ),
          ).toHaveCount(1)
          const modelCard = details
            .locator('article')
            .filter({ hasText: modelName })
          const verifyModel = modelCard.getByRole('button', {
            name: 'Verifiera modell',
          })
          await expect(verifyModel).toBeEnabled()
          await verifyModel.click()
          await expect(
            page.getByText('Anslutningsmodellrevisionen verifierades.'),
          ).toHaveCount(1)
          const healthProbe = modelCard.getByRole('button', {
            name: 'Kör hälsokontroll',
          })
          await expect(healthProbe).toBeEnabled()
          await healthProbe.click()
          await expect(
            page.getByText('Den begränsade hälsokontrollen slutfördes.'),
          ).toHaveCount(1)
        })

        await test.step('activate the connection and fixed run profile', async () => {
          const activateConnection = details.getByRole('button', {
            name: 'Aktivera anslutning',
          })
          await expect(activateConnection).toBeEnabled()
          await activateConnection.click()
          await expect(
            page.getByText('AI-anslutningen aktiverades.'),
          ).toHaveCount(1)
          await expect(connectionRow.getByText('Fungerar')).toHaveCount(1)

          const profileCard = page.locator('article').filter({
            has: page.getByRole('heading', {
              exact: true,
              name: 'Kravgenerering utan bilder',
            }),
          })
          await profileCard
            .getByRole('button', {
              name: /Skapa profilrevision|Redigera profilutkast/,
            })
            .click()
          const dialog = page.getByRole('dialog', { name: 'Körprofilrevision' })
          const modelSelect = dialog.getByLabel(/^Anslutningsmodellrevision/)
          const modelOption = modelSelect.locator('option').filter({
            hasText: `${administrationName} · ${modelName}`,
          })
          const modelRevisionId = await modelOption.getAttribute('value')
          expect(modelRevisionId).not.toBeNull()
          await modelSelect.selectOption(modelRevisionId ?? '')
          await dialog
            .getByRole('button', { name: 'Spara profilutkast' })
            .click()
          await expect(dialog).toHaveCount(0)
          const activateProfile = profileCard.getByRole('button', {
            name: 'Aktivera profilrevision',
          })
          await expect(activateProfile).toBeEnabled()
          await activateProfile.click()
          await expect(
            page.getByText('Körprofilrevisionen aktiverades.'),
          ).toHaveCount(1)
          await expect(
            profileCard.getByText('En aktiv revision är tilldelad'),
          ).toHaveCount(1)
        })

        await test.step('suspend and manually recover profile and connection', async () => {
          const profileCard = page.locator('article').filter({
            has: page.getByRole('heading', {
              exact: true,
              name: 'Kravgenerering utan bilder',
            }),
          })
          await profileCard
            .getByRole('button', { name: 'Suspendera profil' })
            .click()
          await expect(
            profileCard.getByRole('button', { name: 'Återställ profil' }),
          ).toHaveCount(1)
          await profileCard
            .getByRole('button', { name: 'Återställ profil' })
            .click()
          await expect(
            profileCard.getByRole('button', { name: 'Suspendera profil' }),
          ).toHaveCount(1)

          await details
            .getByRole('button', { name: 'Suspendera anslutning' })
            .click()
          await expect(
            details.getByRole('button', { name: 'Återställ anslutning' }),
          ).toBeEnabled()
          await expect(connectionRow.getByText('Suspenderad')).toHaveCount(1)
          await expect(connectionRow.getByText('Fungerar')).toHaveCount(1)
          await details
            .getByRole('button', { name: 'Återställ anslutning' })
            .click()
          await expect(
            details.getByRole('button', { name: 'Suspendera anslutning' }),
          ).toHaveCount(1)
          await expect(connectionRow.getByText('Aktiv')).toHaveCount(1)
        })
      } finally {
        await cleanup()
      }
    })
  }
})
